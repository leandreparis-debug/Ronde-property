import type { SyncKind } from "./ops";

/** Context the label of an operation needs: names the device knows when it writes. */
export interface LabelContext {
  zoneLabel?: string | null;
  photoName?: string | null;
  reserveCode?: string | null;
  reserveAction?: string | null;
  participantName?: string | null;
  markerNumber?: number | null;
}

function reserve(context: LabelContext): string {
  const code = context.reserveCode ?? "R-?";
  const action = context.reserveAction ? ` : ${truncate(context.reserveAction, 60)}` : "";
  return `Réserve ${code}${action}`;
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function marker(context: LabelContext): string {
  return context.markerNumber ? `Repère n° ${context.markerNumber}` : "Repère •";
}

/**
 * Plain-language description of an operation for the synchronisation panel, fixed when the
 * operation is created (« Note : Toiture », « Photo IMG-0042 », « Réserve R-? : fuite quai 3 »).
 */
export function describeOperation(kind: SyncKind, context: LabelContext = {}): string {
  switch (kind) {
    case "visit.update":
      return "Informations de la visite";
    case "participant.add":
      return `Participant ajouté : ${context.participantName ?? "—"}`;
    case "participant.update":
      return `Participant : ${context.participantName ?? "—"}`;
    case "participant.remove":
      return `Participant retiré : ${context.participantName ?? "—"}`;
    case "participant.reorder":
      return "Ordre des participants";
    case "note.update":
      return `Note : ${context.zoneLabel ?? "zone"}`;
    case "zone.add":
      return `Zone ajoutée : ${context.zoneLabel ?? "—"}`;
    case "zone.addTemplate":
      return `Zone remise : ${context.zoneLabel ?? "—"}`;
    case "zone.insertTemplate":
      return "Trame des zones";
    case "zone.rename":
      return `Zone renommée : ${context.zoneLabel ?? "—"}`;
    case "zone.reorder":
      return "Ordre des zones";
    case "zone.remove":
      return `Zone retirée : ${context.zoneLabel ?? "—"}`;
    case "photo.create":
    case "photo.confirm":
      return `Photo ${context.photoName ?? ""}`.trim();
    case "photo.update":
      return `Légende ou zone de la photo ${context.photoName ?? ""}`.trim();
    case "photo.setCover":
      return `Photo de garde : ${context.photoName ?? "photo"}`;
    case "photo.move":
      return `Ordre des photos`;
    case "photo.delete":
      return `Photo supprimée ${context.photoName ?? ""}`.trim();
    case "marker.create":
      return `${marker(context)} placé`;
    case "marker.move":
      return `${marker(context)} déplacé`;
    case "marker.update":
      return `${marker(context)} : libellé ou photo`;
    case "marker.delete":
      return `${marker(context)} supprimé`;
    case "reserve.create":
      return reserve(context);
    case "reserve.update":
      return `${reserve(context)} modifiée`;
    case "reserve.setStatus":
      return `${reserve(context)} : statut`;
    case "reserve.delete":
      return `${reserve(context)} supprimée`;
    case "reserve.place":
      return `${reserve(context)} placée sur le plan`;
    case "reserve.unplace":
      return `${reserve(context)} retirée du plan`;
    case "reserve.attachMarker":
      return `${reserve(context)} liée au repère`;
  }
}
