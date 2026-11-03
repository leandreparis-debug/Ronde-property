/** Messages shared by the server (repository) and the client (zone management dialog). */
export const REMOVE_NOT_EMPTY_MESSAGE = "Videz la zone avant de la retirer.";

/** Refusal to remove a zone that still has photos linked to it. */
export function removeHasPhotosMessage(count: number): string {
  return count === 1
    ? "Déplacez ou retirez d'abord la photo liée."
    : `Déplacez ou retirez d'abord les ${count} photos liées.`;
}
