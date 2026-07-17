"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  storeSettingsSchema,
  type StorePolicies,
} from "@/lib/validations/store";
import { fieldErrors } from "@/lib/validations/auth";

// Message values are i18n KEYS under the `SellerSettings` namespace.
export type FormState = {
  errors?: Record<string, string>;
  formError?: string;
  ok?: boolean;
};

export async function updateStoreSettings(
  _prev: FormState | undefined,
  formData: FormData,
): Promise<FormState> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { formError: "notSignedIn" };

  // Authoritative ownership check: the store being edited is always the
  // caller's own store — no id comes from the client.
  const profile = await prisma.sellerProfile.findUnique({
    where: { userId },
    select: { store: { select: { id: true, slug: true } } },
  });
  const store = profile?.store;
  if (!store) return { formError: "notSeller" };

  const parsed = storeSettingsSchema.safeParse({
    name: formData.get("name"),
    slug: formData.get("slug"),
    description: formData.get("description") || undefined,
    returnPolicy: formData.get("returnPolicy") || undefined,
    shippingPolicy: formData.get("shippingPolicy") || undefined,
    contact: formData.get("contact") || undefined,
  });
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  const { name, slug, description, returnPolicy, shippingPolicy, contact } =
    parsed.data;

  // Slug uniqueness (only when it changes).
  if (slug !== store.slug) {
    const taken = await prisma.store.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (taken) return { errors: { slug: "slugTaken" } };
  }

  // Only keep non-empty policy fields; the column stays a compact object.
  const policies: StorePolicies = {};
  if (returnPolicy) policies.returnPolicy = returnPolicy;
  if (shippingPolicy) policies.shippingPolicy = shippingPolicy;
  if (contact) policies.contact = contact;

  try {
    await prisma.store.update({
      where: { id: store.id },
      data: { name, slug, description: description || null, policies },
    });
  } catch {
    // Unique-constraint race on slug between check and write.
    return { errors: { slug: "slugTaken" } };
  }

  const locale = await getLocale();
  revalidatePath(`/${locale}/seller/settings`);
  revalidatePath(`/${locale}/store/${store.slug}`);
  if (slug !== store.slug) revalidatePath(`/${locale}/store/${slug}`);
  return { ok: true };
}
