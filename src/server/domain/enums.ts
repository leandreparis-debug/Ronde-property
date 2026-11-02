import type { Enums } from "@/server/db";

export type UserRole = Enums<"user_role">;
export type VisitType = Enums<"visit_type">;
export type VisitReason = Enums<"visit_reason">;
export type VisitStatus = Enums<"visit_status">;
export type ReservePriority = Enums<"reserve_priority">;
export type ReserveStatus = Enums<"reserve_status">;
export type ResponsibleKind = Enums<"responsible_kind">;
export type PhotoKind = Enums<"photo_kind">;
export type ReserveEventType = Enums<"reserve_event_type">;
export type ImportMode = Enums<"import_mode">;

export const USER_ROLES = ["rt", "direction", "admin"] as const satisfies readonly UserRole[];
export const VISIT_TYPES = ["technical", "meeting"] as const satisfies readonly VisitType[];
export const VISIT_REASONS = [
  "periodic",
  "lease_negotiation",
  "post_claim",
  "tenant_entry",
  "tenant_exit",
  "meeting",
] as const satisfies readonly VisitReason[];
export const VISIT_STATUSES = [
  "in_progress",
  "completed",
] as const satisfies readonly VisitStatus[];
export const RESERVE_PRIORITIES = [
  "low",
  "normal",
  "high",
  "urgent",
] as const satisfies readonly ReservePriority[];
export const RESERVE_STATUSES = [
  "open",
  "in_progress",
  "done",
] as const satisfies readonly ReserveStatus[];
export const RESPONSIBLE_KINDS = [
  "internal",
  "external",
] as const satisfies readonly ResponsibleKind[];
export const PHOTO_KINDS = ["defect", "proof"] as const satisfies readonly PhotoKind[];

/** French labels of every enumerated value shown in the interface. */
export const USER_ROLE_LABELS: Record<UserRole, string> = {
  rt: "Responsable technique",
  direction: "Direction",
  admin: "Administrateur",
};

export const VISIT_TYPE_LABELS: Record<VisitType, string> = {
  technical: "Visite technique",
  meeting: "Réunion",
};

export const VISIT_REASON_LABELS: Record<VisitReason, string> = {
  periodic: "Visite périodique",
  lease_negotiation: "Négociation de bail",
  post_claim: "Après sinistre",
  tenant_entry: "Entrée de locataire",
  tenant_exit: "Sortie de locataire",
  meeting: "Réunion",
};

export const VISIT_STATUS_LABELS: Record<VisitStatus, string> = {
  in_progress: "En cours",
  completed: "Terminée",
};

export const RESERVE_PRIORITY_LABELS: Record<ReservePriority, string> = {
  low: "Basse",
  normal: "Normale",
  high: "Haute",
  urgent: "Urgente",
};

export const RESERVE_STATUS_LABELS: Record<ReserveStatus, string> = {
  open: "Ouverte",
  in_progress: "En cours",
  done: "Levée",
};

export const RESPONSIBLE_KIND_LABELS: Record<ResponsibleKind, string> = {
  internal: "Interne",
  external: "Externe",
};

export const PHOTO_KIND_LABELS: Record<PhotoKind, string> = {
  defect: "Défaut",
  proof: "Preuve de levée",
};

export const RESERVE_EVENT_TYPE_LABELS: Record<ReserveEventType, string> = {
  created: "Création",
  updated: "Modification",
  status_changed: "Changement de statut",
  deleted: "Suppression",
};
