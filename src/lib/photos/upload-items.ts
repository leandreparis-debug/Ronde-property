/**
 * A photo of the upload panel. Since step 12 the uploads live in the outbox of the device
 * (IndexedDB): an item is either being prepared in the browser (compression), waiting in the
 * outbox (create, `PUT`, confirm), finished during this session, or refused.
 */
export type UploadStatus =
  | "queued"
  | "processing"
  | "preparing"
  | "uploading"
  | "confirming"
  | "done"
  | "failed"
  | "rejected";

export interface UploadItem {
  /** Outbox operation id, or a local id while the file is being prepared. */
  localId: string;
  name: string;
  zoneKey: string | null;
  status: UploadStatus;
  /** 0 to 100 while uploading. */
  progress: number;
  /** Object URL of the local thumbnail, once processed. */
  previewUrl: string | null;
  /** Message of a `failed` or `rejected` item, or the reason of a wait. */
  error: string | null;
  photoId: string | null;
  attempts: number;
}

/** French label of a status for the upload panel. */
export function uploadStatusLabel(item: UploadItem): string {
  switch (item.status) {
    case "queued":
    case "processing":
    case "preparing":
      return item.error ?? "Préparation";
    case "uploading":
      return item.error ?? `Envoi ${item.progress} %`;
    case "confirming":
      return item.error ?? "Vérification";
    case "done":
      return "Terminé";
    case "failed":
      return `Échec : ${item.error ?? "erreur inconnue"}`;
    case "rejected":
      return item.error ?? "Fichier refusé";
  }
}
