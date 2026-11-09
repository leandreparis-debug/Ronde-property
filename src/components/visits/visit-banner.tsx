import { Info } from "lucide-react";

import { formatDateTime } from "@/lib/format";
import type { VisitView } from "@/lib/offline/snapshot";
import type { UserRole } from "@/server/domain/enums";

/** Read-only banner above the tabs, with the real reason. */
export function VisitBanner({ visit, user }: { visit: VisitView; user: { role: UserRole } }) {
  let message: string | null = null;
  if (visit.deletedAt) {
    message = `Visite supprimée le ${formatDateTime(visit.deletedAt)} par ${visit.deletedByName ?? "—"}.`;
  } else if (visit.status === "completed") {
    message = `Visite terminée le ${formatDateTime(visit.completedAt)} par ${visit.completedByName ?? "—"} : rouvrez-la pour la modifier.`;
  } else if (!visit.permissions.canEdit) {
    message =
      user.role === "direction"
        ? "Vous consultez cette visite en lecture seule."
        : "Vous consultez cette visite en lecture seule : seuls son créateur, son rédacteur, ses participants et un administrateur peuvent la modifier.";
  }
  if (!message) return null;
  return (
    <div
      role="status"
      className="mb-4 flex items-start gap-3 rounded-md border border-rule bg-brand-tint px-4 py-3 text-ui text-ink"
      data-testid="visit-banner"
    >
      <Info className="mt-0.5 size-5 shrink-0 text-brand-deep" aria-hidden="true" />
      <span>{message}</span>
    </div>
  );
}
