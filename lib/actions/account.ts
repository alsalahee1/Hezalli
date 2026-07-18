"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";

import { auth, signOut } from "@/auth";
import { hashPassword, verifyPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import { isOwnStorageUrl } from "@/lib/storage";
import {
  addressSchema,
  passwordChangeSchema,
  profileSchema,
} from "@/lib/validations/account";
import { fieldErrors } from "@/lib/validations/auth";

// Message values are i18n KEYS under the `Account` namespace (translated by the
// client forms), matching the auth-actions pattern.
export type FormState = {
  errors?: Record<string, string>;
  formError?: string;
  ok?: boolean;
};

async function currentUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}

async function accountPath(sub = ""): Promise<string> {
  const locale = await getLocale();
  return `/${locale}/account${sub}`;
}

// --- Profile -------------------------------------------------------------

export async function updateProfile(
  _prev: FormState | undefined,
  formData: FormData,
): Promise<FormState> {
  const userId = await currentUserId();
  if (!userId) return { formError: "notSignedIn" };

  const parsed = profileSchema.safeParse({
    name: formData.get("name"),
    phone: formData.get("phone"),
  });
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  const phone = parsed.data.phone?.trim();
  try {
    await prisma.user.update({
      where: { id: userId },
      data: { name: parsed.data.name, phone: phone ? phone : null },
    });
  } catch {
    // The only unique constraint here is phone.
    return { errors: { phone: "phoneTaken" } };
  }

  revalidatePath(await accountPath());
  return { ok: true };
}

// --- Profile: avatar -----------------------------------------------------

// Persists an avatar URL produced by /api/upload. Only our own storage URLs
// are accepted so the field can't be pointed at an arbitrary external image.
export async function updateAvatar(url: string): Promise<FormState> {
  const userId = await currentUserId();
  if (!userId) return { formError: "notSignedIn" };
  if (!isOwnStorageUrl(url)) return { formError: "invalidImage" };

  await prisma.user.update({ where: { id: userId }, data: { image: url } });

  revalidatePath(await accountPath());
  const locale = await getLocale();
  revalidatePath(`/${locale}`, "layout"); // header avatar
  return { ok: true };
}

export async function removeAvatar(): Promise<void> {
  const userId = await currentUserId();
  if (!userId) return;
  await prisma.user.update({ where: { id: userId }, data: { image: null } });
  revalidatePath(await accountPath());
  const locale = await getLocale();
  revalidatePath(`/${locale}`, "layout");
}

// --- Security: change password ------------------------------------------

export async function changePassword(
  _prev: FormState | undefined,
  formData: FormData,
): Promise<FormState> {
  const userId = await currentUserId();
  if (!userId) return { formError: "notSignedIn" };

  const parsed = passwordChangeSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user?.passwordHash) return { formError: "noPasswordSet" };

  const ok = await verifyPassword(
    parsed.data.currentPassword,
    user.passwordHash,
  );
  if (!ok) return { errors: { currentPassword: "currentPasswordWrong" } };

  const passwordHash = await hashPassword(parsed.data.newPassword);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash } });
  return { ok: true };
}

// --- Security: delete account (soft-delete) ------------------------------

export async function deleteAccount(
  _prev: FormState | undefined,
  formData: FormData,
): Promise<FormState> {
  const userId = await currentUserId();
  if (!userId) return { formError: "notSignedIn" };

  if (String(formData.get("confirm") ?? "").trim() !== "DELETE") {
    return { errors: { confirm: "confirmDelete" } };
  }

  await prisma.user.update({
    where: { id: userId },
    data: { deletedAt: new Date(), isSuspended: true },
  });

  // Clears the session cookie and redirects home.
  await signOut({ redirectTo: "/" });
  return { ok: true };
}

// --- Address book --------------------------------------------------------

export async function saveAddress(
  _prev: FormState | undefined,
  formData: FormData,
): Promise<FormState> {
  const userId = await currentUserId();
  if (!userId) return { formError: "notSignedIn" };

  const id = String(formData.get("id") ?? "").trim();
  const parsed = addressSchema.safeParse({
    fullName: formData.get("fullName"),
    phone: formData.get("phone"),
    governorate: formData.get("governorate"),
    city: formData.get("city"),
    line1: formData.get("line1"),
    line2: formData.get("line2") || undefined,
    notes: formData.get("notes") || undefined,
    isDefault: formData.get("isDefault") === "on",
  });
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  const { isDefault, line2, notes, ...rest } = parsed.data;
  // Empty optional fields must become null so edits can clear them (Prisma
  // treats `undefined` as "leave unchanged").
  const fields = {
    ...rest,
    line2: line2?.trim() ? line2.trim() : null,
    notes: notes?.trim() ? notes.trim() : null,
  };

  if (id) {
    // Edit — verify ownership first (prevents IDOR).
    const existing = await prisma.address.findFirst({ where: { id, userId } });
    if (!existing) return { formError: "addressNotFound" };
    const makeDefault = isDefault ?? false;
    await prisma.$transaction(async (tx) => {
      if (makeDefault) {
        await tx.address.updateMany({
          where: { userId, NOT: { id } },
          data: { isDefault: false },
        });
      }
      await tx.address.update({
        where: { id },
        data: { ...fields, isDefault: makeDefault || existing.isDefault },
      });
    });
  } else {
    // Create — first address is always the default.
    const count = await prisma.address.count({ where: { userId } });
    const makeDefault = (isDefault ?? false) || count === 0;
    await prisma.$transaction(async (tx) => {
      if (makeDefault) {
        await tx.address.updateMany({
          where: { userId },
          data: { isDefault: false },
        });
      }
      await tx.address.create({
        data: { userId, ...fields, isDefault: makeDefault },
      });
    });
  }

  revalidatePath(await accountPath("/addresses"));
  return { ok: true };
}

export async function deleteAddress(formData: FormData): Promise<void> {
  const userId = await currentUserId();
  if (!userId) return;
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;

  const addr = await prisma.address.findFirst({ where: { id, userId } });
  if (!addr) return;

  await prisma.address.delete({ where: { id } });

  // If we removed the default, promote the most recent remaining address.
  if (addr.isDefault) {
    const next = await prisma.address.findFirst({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
    if (next) {
      await prisma.address.update({
        where: { id: next.id },
        data: { isDefault: true },
      });
    }
  }

  revalidatePath(await accountPath("/addresses"));
}

export async function setDefaultAddress(formData: FormData): Promise<void> {
  const userId = await currentUserId();
  if (!userId) return;
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;

  const addr = await prisma.address.findFirst({ where: { id, userId } });
  if (!addr) return;

  await prisma.$transaction([
    prisma.address.updateMany({
      where: { userId },
      data: { isDefault: false },
    }),
    prisma.address.update({ where: { id }, data: { isDefault: true } }),
  ]);

  revalidatePath(await accountPath("/addresses"));
}
