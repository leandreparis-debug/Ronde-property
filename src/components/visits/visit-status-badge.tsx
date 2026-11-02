import { Badge } from "@/components/ui/badge";
import type { VisitStatus } from "@/server/domain/enums";
import { VISIT_STATUS_LABELS } from "@/server/domain/labels";

/** « En cours » as a brand badge, « Terminée » as a neutral one. Always with its label. */
export function VisitStatusBadge({ status }: { status: VisitStatus }) {
  return (
    <Badge variant={status === "in_progress" ? "brand" : "neutral"}>
      {VISIT_STATUS_LABELS[status]}
    </Badge>
  );
}
