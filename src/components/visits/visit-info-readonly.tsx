import { formatDate } from "@/lib/format";
import { VISIT_REASON_LABELS, VISIT_TYPE_LABELS } from "@/server/domain/labels";
import type { VisitDetail } from "@/server/repositories/visit-repository";

/** Information fields as plain text, for readers. */
export function VisitInfoReadonly({ visit }: { visit: VisitDetail }) {
  return (
    <dl
      className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-3 text-ui"
      data-testid="visit-info-readonly"
    >
      <dt className="text-ink-2">Titre</dt>
      <dd className="font-semibold">{visit.title}</dd>
      <dt className="text-ink-2">Type</dt>
      <dd>
        {VISIT_TYPE_LABELS[visit.type]} · {VISIT_REASON_LABELS[visit.reason]}
      </dd>
      <dt className="text-ink-2">Date</dt>
      <dd>{formatDate(visit.visitDate, "full")}</dd>
      <dt className="text-ink-2">Rédacteur</dt>
      <dd>{visit.writerName ?? "—"}</dd>
      <dt className="text-ink-2">Objet</dt>
      <dd className="whitespace-pre-wrap">{visit.subject ?? "—"}</dd>
    </dl>
  );
}
