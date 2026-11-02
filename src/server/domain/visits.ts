import type { VisitReason, VisitType } from "./enums";
import { VISIT_REASON_LABELS } from "./enums";

/** Reasons allowed for each visit type: a meeting has the « meeting » reason only. */
export const REASONS_FOR_TYPE: Record<VisitType, readonly VisitReason[]> = {
  technical: ["periodic", "lease_negotiation", "post_claim", "tenant_entry", "tenant_exit"],
  meeting: ["meeting"],
};

/** Whether the reason is consistent with the type. */
export function isReasonAllowed(type: VisitType, reason: VisitReason): boolean {
  return REASONS_FOR_TYPE[type].includes(reason);
}

/** Default reason when the type changes. */
export function defaultReasonFor(type: VisitType): VisitReason {
  return type === "meeting" ? "meeting" : "periodic";
}

/** Proposed title: « {Motif} — {nom du site} ». */
export function suggestVisitTitle(
  reason: VisitReason,
  siteName: string | null | undefined,
): string {
  const label = VISIT_REASON_LABELS[reason];
  const site = (siteName ?? "").trim();
  return site ? `${label} — ${site}`.slice(0, 200) : label;
}

/** Days between two ISO dates (absolute). */
function daysBetween(a: string, b: string): number {
  const first = Date.parse(`${a}T00:00:00Z`);
  const second = Date.parse(`${b}T00:00:00Z`);
  return Math.abs(Math.round((first - second) / 86_400_000));
}

/** Non-blocking warning for a visit date more than one year away from today. */
export function visitDateWarning(visitDate: string, today: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(visitDate) || Number.isNaN(Date.parse(`${visitDate}T00:00:00Z`)))
    return null;
  if (daysBetween(visitDate, today) <= 366) return null;
  return visitDate < today
    ? "Cette date est à plus d'un an dans le passé. Vérifiez-la."
    : "Cette date est à plus d'un an dans le futur. Vérifiez-la.";
}

export interface IncompletePoint {
  key: "writer" | "participants" | "subject";
  label: string;
  /** Id of the field to focus. */
  anchor: string;
}

/** Points to complete before the report, listed without blocking anything. */
export function incompletePoints(input: {
  writerId: string | null;
  subject: string | null;
  participantsCount: number;
}): IncompletePoint[] {
  const points: IncompletePoint[] = [];
  if (!input.writerId)
    points.push({ key: "writer", label: "Rédacteur manquant", anchor: "visit-writer" });
  if (input.participantsCount === 0)
    points.push({ key: "participants", label: "Aucun participant", anchor: "participants" });
  if (!input.subject || input.subject.trim() === "")
    points.push({ key: "subject", label: "Objet vide", anchor: "visit-subject" });
  return points;
}
