import "server-only";

import { requireRoleForAction, requireUserForAction } from "@/server/auth/session";
import type { Participant, ParticipantInput, VisitInput, VisitUpdate } from "@/server/domain";
import { createParticipantRepository } from "@/server/repositories/participant-repository";
import {
  type AssignableProfile,
  listAssignableProfiles,
} from "@/server/repositories/profile-repository";
import {
  createVisitRepository,
  type VisitDetail,
  type VisitListFilters,
  type VisitListPage,
  type VisitVersion,
} from "@/server/repositories/visit-repository";

const WRITERS = ["rt", "admin"] as const;

/** Visits visible to the current user, filtered and paged. */
export async function listVisits(filters: VisitListFilters): Promise<VisitListPage> {
  const user = await requireUserForAction();
  return createVisitRepository(user).list(filters);
}

/** A visit with permissions, or null when unknown or not visible. */
export async function getVisit(id: string): Promise<VisitDetail | null> {
  const user = await requireUserForAction();
  return createVisitRepository(user).getById(id);
}

/** Participants of a visit. */
export async function listParticipants(visitId: string): Promise<Participant[]> {
  const user = await requireUserForAction();
  return createParticipantRepository(user).list(visitId);
}

/** Profiles that can be chosen as writer or internal participant. */
export async function listAssignable(): Promise<AssignableProfile[]> {
  const user = await requireUserForAction();
  return listAssignableProfiles(user);
}

/** rt / admin: creates a visit. */
export async function createVisit(input: VisitInput): Promise<{ id: string }> {
  const user = await requireRoleForAction(WRITERS);
  return createVisitRepository(user).create(input);
}

/** rt / admin: optimistic update of the information fields. */
export async function updateVisit(
  id: string,
  version: number,
  patch: VisitUpdate,
): Promise<VisitVersion> {
  const user = await requireRoleForAction(WRITERS);
  return createVisitRepository(user).update(id, version, patch);
}

/** rt / admin: duplicates a visit for the next one. */
export async function duplicateVisit(id: string): Promise<{ id: string }> {
  const user = await requireRoleForAction(WRITERS);
  return createVisitRepository(user).duplicate(id);
}

export async function completeVisit(id: string): Promise<void> {
  const user = await requireRoleForAction(WRITERS);
  await createVisitRepository(user).complete(id);
}

export async function reopenVisit(id: string): Promise<void> {
  const user = await requireRoleForAction(WRITERS);
  await createVisitRepository(user).reopen(id);
}

export async function deleteVisit(id: string): Promise<void> {
  const user = await requireRoleForAction(WRITERS);
  await createVisitRepository(user).softDelete(id);
}

export async function addParticipant(visitId: string, version: number, input: ParticipantInput) {
  const user = await requireRoleForAction(WRITERS);
  return createParticipantRepository(user).add(visitId, version, input);
}

export async function updateParticipant(
  visitId: string,
  version: number,
  id: string,
  patch: Partial<ParticipantInput>,
) {
  const user = await requireRoleForAction(WRITERS);
  return createParticipantRepository(user).update(visitId, version, id, patch);
}

export async function removeParticipant(visitId: string, version: number, id: string) {
  const user = await requireRoleForAction(WRITERS);
  return createParticipantRepository(user).remove(visitId, version, id);
}

export async function reorderParticipants(visitId: string, version: number, orderedIds: string[]) {
  const user = await requireRoleForAction(WRITERS);
  return createParticipantRepository(user).reorder(visitId, version, orderedIds);
}
