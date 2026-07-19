import { getFormatter, getTranslations } from "next-intl/server";

import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function AdminAuditPage() {
  const t = await getTranslations("AdminAudit");
  const format = await getFormatter();

  const logs = await prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  const actorIds = [...new Set(logs.map((l) => l.actorId))];
  const actors = actorIds.length
    ? await prisma.user.findMany({
        where: { id: { in: actorIds } },
        select: { id: true, name: true, email: true },
      })
    : [];
  const actorById = new Map(
    actors.map((a) => [a.id, a.name ?? a.email ?? a.id]),
  );

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground text-sm">{t("desc")}</p>
      </div>

      {logs.length === 0 ? (
        <div className="text-muted-foreground rounded-lg border border-dashed py-14 text-center text-sm">
          {t("empty")}
        </div>
      ) : (
        <>
          <ul className="space-y-3 md:hidden">
            {logs.map((l) => (
              <li key={l.id} className="rounded-lg border p-3">
                <div className="flex items-start justify-between gap-2">
                  <span className="font-mono text-xs font-medium break-all">
                    {l.action}
                  </span>
                  <span className="text-muted-foreground shrink-0 text-xs whitespace-nowrap">
                    {format.dateTime(l.createdAt, {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </span>
                </div>
                <dl className="mt-2 space-y-1 text-sm">
                  <div className="flex gap-2">
                    <dt className="text-muted-foreground text-xs">
                      {t("actor")}:
                    </dt>
                    <dd className="text-xs">
                      {actorById.get(l.actorId) ?? l.actorId}
                    </dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="text-muted-foreground text-xs">
                      {t("entity")}:
                    </dt>
                    <dd className="font-mono text-xs">
                      {l.entity}#{l.entityId.slice(-6)}
                    </dd>
                  </div>
                  {l.meta ? (
                    <dd className="text-muted-foreground font-mono text-[11px] break-all">
                      {JSON.stringify(l.meta)}
                    </dd>
                  ) : null}
                </dl>
              </li>
            ))}
          </ul>
          <div className="hidden overflow-x-auto rounded-lg border md:block">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="bg-muted/50">
                  <th className="px-3 py-2 text-start font-medium">
                    {t("when")}
                  </th>
                  <th className="px-3 py-2 text-start font-medium">
                    {t("actor")}
                  </th>
                  <th className="px-3 py-2 text-start font-medium">
                    {t("action")}
                  </th>
                  <th className="px-3 py-2 text-start font-medium">
                    {t("entity")}
                  </th>
                  <th className="px-3 py-2 text-start font-medium">
                    {t("details")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {logs.map((l) => (
                  <tr key={l.id} className="border-t align-top">
                    <td className="px-3 py-2 whitespace-nowrap">
                      {format.dateTime(l.createdAt, {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </td>
                    <td className="px-3 py-2">
                      {actorById.get(l.actorId) ?? l.actorId}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{l.action}</td>
                    <td className="text-muted-foreground px-3 py-2 font-mono text-xs">
                      {l.entity}#{l.entityId.slice(-6)}
                    </td>
                    <td className="text-muted-foreground max-w-xs px-3 py-2 font-mono text-[11px] break-all">
                      {l.meta ? JSON.stringify(l.meta) : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
