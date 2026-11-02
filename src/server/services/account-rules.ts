import type { UserRole } from "@/server/domain/enums";
import { ForbiddenError, ValidationError } from "@/server/errors";

/** Snapshot of an account for the administration rules. */
export interface AccountSnapshot {
  id: string;
  role: UserRole;
  isActive: boolean;
}

export interface AccountChange {
  role?: UserRole;
  isActive?: boolean;
}

/**
 * Pure rules of account administration, shared by the service and the unit tests:
 * - an admin cannot deactivate themselves nor drop their own admin role;
 * - the last active admin cannot be deactivated nor demoted.
 *
 * @throws {ForbiddenError} when the change breaks a rule.
 */
export function assertAccountChangeAllowed(
  actorId: string,
  target: AccountSnapshot,
  change: AccountChange,
  activeAdminCount: number,
): void {
  const willBeActive = change.isActive ?? target.isActive;
  const willBeRole = change.role ?? target.role;
  const losesAdmin =
    target.role === "admin" && target.isActive && (!willBeActive || willBeRole !== "admin");

  if (target.id === actorId) {
    if (!willBeActive)
      throw new ForbiddenError("Vous ne pouvez pas désactiver votre propre compte.");
    if (target.role === "admin" && willBeRole !== "admin") {
      throw new ForbiddenError("Vous ne pouvez pas retirer votre propre rôle d'administrateur.");
    }
  }
  if (losesAdmin && activeAdminCount <= 1) {
    throw new ForbiddenError("Impossible : ce compte est le dernier administrateur actif.");
  }
}

/** Validates a full name for an account. */
export function assertFullName(fullName: string): string {
  const trimmed = fullName.trim();
  if (trimmed.length < 1 || trimmed.length > 200) {
    throw new ValidationError("Le nom doit contenir entre 1 et 200 caractères.");
  }
  return trimmed;
}
