/** Key of the last signed-in user of this browser (no secret: id, name and role only). */
export const DEVICE_USER_KEY = "ronde.offline.user";

/** The user whose local copy the offline shell opens. */
export interface DeviceUser {
  id: string;
  name: string;
  role: "rt" | "direction" | "admin";
}

/** Reads the last signed-in user, or null (storage blocked, nothing stored, invalid value). */
export function readDeviceUser(): DeviceUser | null {
  try {
    const raw = window.localStorage.getItem(DEVICE_USER_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<DeviceUser>;
    if (typeof value.id !== "string" || typeof value.name !== "string") return null;
    const role = value.role === "direction" || value.role === "admin" ? value.role : "rt";
    return { id: value.id, name: value.name, role };
  } catch {
    return null;
  }
}

/** Records the signed-in user (called by the application shell). */
export function writeDeviceUser(user: DeviceUser): void {
  try {
    window.localStorage.setItem(DEVICE_USER_KEY, JSON.stringify(user));
  } catch {
    // Storage blocked: the offline shell will simply not find the copy.
  }
}

/** Forgets the user (sign-out, revocation). */
export function clearDeviceUser(): void {
  try {
    window.localStorage.removeItem(DEVICE_USER_KEY);
  } catch {
    // Nothing to forget.
  }
}

/** Key of a wipe asked at sign-out and not confirmed yet (the id of the user to erase). */
export const PENDING_WIPE_KEY = "ronde.offline.wipe";

/** Records that the copy of this user must be erased (finished on the sign-in page if needed). */
export function markPendingWipe(userId: string): void {
  try {
    window.localStorage.setItem(PENDING_WIPE_KEY, userId);
  } catch {
    // Storage blocked: the erase is attempted right away anyway.
  }
}

/** The user whose copy still has to be erased, or null. */
export function readPendingWipe(): string | null {
  try {
    return window.localStorage.getItem(PENDING_WIPE_KEY);
  } catch {
    return null;
  }
}

/** The erase is done. */
export function clearPendingWipe(): void {
  try {
    window.localStorage.removeItem(PENDING_WIPE_KEY);
  } catch {
    // Nothing to clear.
  }
}
