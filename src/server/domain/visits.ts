import type { VisitReason, VisitType } from "./enums";
import { VISIT_REASON_LABELS } from "./enums";
import { uncaptionedLabel } from "./photos";
import { markersWithoutPhotoLabel } from "./plans";

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
  key:
    | "writer"
    | "participants"
    | "subject"
    | "notes"
    | "photos"
    | "markers"
    | "reserves-responsible"
    | "reserves-due"
    | "reserves-photo"
    | "to-sort";
  label: string;
  /** Id of the field to focus. */
  anchor: string;
  /** Link used instead of the anchor when the point lives in another tab. */
  href?: string;
}

/** Points to complete before the report, listed without blocking anything. */
export function incompletePoints(input: {
  writerId: string | null;
  subject: string | null;
  participantsCount: number;
  /** Zones with a non-blank note; omit when the notes are not loaded. */
  filledZonesCount?: number;
  /** Ready photos without a caption; omit when the photos are not loaded. */
  uncaptionedPhotosCount?: number;
  /**
   * Plan markers of the visit without a photo (notes on the plan excluded); omit when the
   * markers are not loaded.
   */
  markersWithoutPhotoCount?: number;
  /** Photos of « À ranger » (shutter of the plan screen, step 12 b); omit when not loaded. */
  toSortPhotosCount?: number;
  /** Reserves not done of the visit; omit when the reserves are not loaded. */
  reserves?: { withoutResponsible: number; withoutDueDate: number; urgentWithoutPhoto: number };
}): IncompletePoint[] {
  const points: IncompletePoint[] = [];
  if (!input.writerId)
    points.push({ key: "writer", label: "Rédacteur manquant", anchor: "visit-writer" });
  if (input.participantsCount === 0)
    points.push({ key: "participants", label: "Aucun participant", anchor: "participants" });
  if (!input.subject || input.subject.trim() === "")
    points.push({ key: "subject", label: "Objet vide", anchor: "visit-subject" });
  if (input.filledZonesCount === 0)
    points.push({
      key: "notes",
      label: "Aucune observation saisie",
      anchor: "notes",
      href: "?onglet=notes",
    });
  if (input.uncaptionedPhotosCount)
    points.push({
      key: "photos",
      label: uncaptionedLabel(input.uncaptionedPhotosCount),
      anchor: "photos",
      href: "?onglet=photos&legende=sans",
    });
  if (input.markersWithoutPhotoCount)
    points.push({
      key: "markers",
      label: markersWithoutPhotoLabel(input.markersWithoutPhotoCount),
      anchor: "plans",
      href: "?onglet=plans",
    });
  if (input.toSortPhotosCount)
    points.push({
      key: "to-sort",
      label:
        input.toSortPhotosCount > 1
          ? `${input.toSortPhotosCount} photos à ranger`
          : "1 photo à ranger",
      anchor: "plans",
      href: "?onglet=plans&a-ranger=1",
    });
  const reserves = input.reserves;
  if (reserves?.withoutResponsible)
    points.push({
      key: "reserves-responsible",
      label: reservesLabel(reserves.withoutResponsible, "sans responsable"),
      anchor: "reserves",
      href: "?onglet=reserves",
    });
  if (reserves?.withoutDueDate)
    points.push({
      key: "reserves-due",
      label: reservesLabel(reserves.withoutDueDate, "sans échéance"),
      anchor: "reserves",
      href: "?onglet=reserves",
    });
  if (reserves?.urgentWithoutPhoto)
    points.push({
      key: "reserves-photo",
      label:
        reserves.urgentWithoutPhoto > 1
          ? `${reserves.urgentWithoutPhoto} réserves urgentes sans photo`
          : "1 réserve urgente sans photo",
      anchor: "reserves",
      href: "?onglet=reserves&priorite=urgent",
    });
  return points;
}

/** « 1 réserve sans responsable », « 3 réserves sans échéance ». */
function reservesLabel(count: number, suffix: string): string {
  return `${count} réserve${count > 1 ? "s" : ""} ${suffix}`;
}
