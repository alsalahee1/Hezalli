import { Search } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";

import { prisma } from "@/lib/prisma";
import { cn } from "@/lib/utils";
import { UserActions } from "@/components/admin/user-actions";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const t = await getTranslations("AdminUsers");
  const format = await getFormatter();
  const { q } = await searchParams;
  const query = (q ?? "").trim();

  const users = await prisma.user.findMany({
    where: query
      ? {
          OR: [
            { name: { contains: query, mode: "insensitive" } },
            { email: { contains: query, mode: "insensitive" } },
          ],
        }
      : {},
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      name: true,
      email: true,
      roles: true,
      isSuspended: true,
      deletedAt: true,
      createdAt: true,
      _count: { select: { orders: true } },
    },
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {t("title")}
          </h1>
          <p className="text-muted-foreground text-sm">{t("desc")}</p>
        </div>
        <form className="relative">
          <Search className="text-muted-foreground pointer-events-none absolute inset-y-0 my-auto ms-3 size-4" />
          <input
            type="search"
            name="q"
            defaultValue={query}
            placeholder={t("searchPlaceholder")}
            className="bg-muted/40 h-9 w-64 rounded-md border ps-9 pe-3 text-sm outline-none"
          />
        </form>
      </div>

      {users.length === 0 ? (
        <div className="text-muted-foreground rounded-lg border border-dashed py-14 text-center text-sm">
          {t("empty")}
        </div>
      ) : (
        <ul className="space-y-2">
          {users.map((u) => (
            <li
              key={u.id}
              className={cn(
                "flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4",
                (u.isSuspended || u.deletedAt) && "bg-muted/40",
              )}
            >
              <div className="min-w-0">
                <p className="flex items-center gap-2 font-medium">
                  {u.name ?? "—"}
                  {u.isSuspended ? (
                    <span className="bg-destructive/10 text-destructive rounded px-1.5 py-0.5 text-xs font-medium">
                      {t("suspended")}
                    </span>
                  ) : null}
                  {u.roles.map((r) => (
                    <span
                      key={r}
                      className="bg-muted rounded px-1.5 py-0.5 text-xs font-medium"
                    >
                      {r}
                    </span>
                  ))}
                </p>
                <p className="text-muted-foreground text-sm">
                  {u.email} · {t("ordersCount", { count: u._count.orders })} ·{" "}
                  {format.dateTime(u.createdAt, { dateStyle: "medium" })}
                </p>
              </div>
              <UserActions
                userId={u.id}
                suspended={u.isSuspended}
                deleted={Boolean(u.deletedAt)}
                roles={u.roles}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
