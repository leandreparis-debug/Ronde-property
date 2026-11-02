import type { Metadata } from "next";
import { z } from "zod";

import { AuditTable } from "@/components/admin/audit-table";
import { requireRole } from "@/server/auth/session";
import { listAuditLog } from "@/server/services/audit-log";

export const metadata: Metadata = {
  title: "Journal d'audit",
};

const querySchema = z.object({
  action: z
    .string()
    .regex(/^[a-z_]+\.[a-z_]+$/)
    .optional(),
  actor: z.uuid().optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  page: z.coerce.number().int().min(1).optional(),
});

type RawParams = Record<string, string | string[] | undefined>;

function single(params: RawParams, key: string): string | undefined {
  const value = params[key];
  const raw = Array.isArray(value) ? value[0] : value;
  return raw ? raw : undefined;
}

/** Read-only audit log with filters and pagination. */
export default async function AuditLogPage({ searchParams }: { searchParams: Promise<RawParams> }) {
  await requireRole(["admin"]);
  const params = await searchParams;
  const parsed = querySchema.safeParse({
    action: single(params, "action"),
    actor: single(params, "actor"),
    from: single(params, "from"),
    to: single(params, "to"),
    page: single(params, "page"),
  });
  const query = parsed.success ? parsed.data : {};
  const filters = { action: query.action, actorId: query.actor, from: query.from, to: query.to };
  const data = await listAuditLog(filters, query.page ?? 1);

  return (
    <>
      <h2 className="sr-only">Journal d&apos;audit</h2>
      <AuditTable data={data} filters={filters} />
    </>
  );
}
