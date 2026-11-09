import "server-only";

import { sql } from "kysely";

import { type UserRef, withUser } from "@/server/db/context";
import type { Participant, ParticipantInput } from "@/server/domain";
import { ConflictError, NotFoundError } from "@/server/errors";

import { assertVisitVersion, type VisitVersion } from "./visit-repository";

/**
 * Participants of a visit. Every write checks the visit version first (optimistic
 * concurrency) and bumps it through the database trigger.
 */
export interface ParticipantRepository {
  list(visitId: string): Promise<Participant[]>;
  add(
    visitId: string,
    version: number,
    input: ParticipantInput,
    options?: { id?: string },
  ): Promise<VisitVersion & { id: string }>;
  update(
    visitId: string,
    version: number,
    id: string,
    patch: Partial<ParticipantInput>,
  ): Promise<VisitVersion>;
  remove(visitId: string, version: number, id: string): Promise<VisitVersion>;
  reorder(visitId: string, version: number, orderedIds: string[]): Promise<VisitVersion>;
}

const COLUMNS = [
  "id",
  "visit_id",
  "profile_id",
  "full_name",
  "company",
  "job_title",
  "email",
  "is_present",
  "sort_order",
] as const;

const DUPLICATE_MESSAGE = "Ce collègue participe déjà à la visite.";

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof ConflictError &&
    (error.cause as { code?: string } | undefined)?.code === "23505"
  );
}

/** Kysely implementation of `ParticipantRepository`. */
export function createParticipantRepository(user: UserRef): ParticipantRepository {
  async function freshVersion(
    trx: Parameters<Parameters<typeof withUser>[1]>[0],
    visitId: string,
  ): Promise<VisitVersion> {
    const row = await trx
      .selectFrom("visits")
      .select(["version", "updated_at"])
      .where("id", "=", visitId)
      .executeTakeFirstOrThrow();
    return { version: row.version, updatedAt: row.updated_at };
  }

  return {
    async list(visitId) {
      const rows = await withUser(user, (trx) =>
        trx
          .selectFrom("visit_participants")
          .select(COLUMNS)
          .where("visit_id", "=", visitId)
          .orderBy("sort_order")
          .orderBy("created_at")
          .execute(),
      );
      return rows.map((row) => ({
        id: row.id,
        visitId: row.visit_id,
        profileId: row.profile_id,
        fullName: row.full_name,
        company: row.company,
        jobTitle: row.job_title,
        email: row.email,
        isPresent: row.is_present,
        sortOrder: row.sort_order,
      }));
    },

    async add(visitId, version, input, options) {
      try {
        return await withUser(user, async (trx) => {
          await assertVisitVersion(trx, visitId, version);
          const max = await trx
            .selectFrom("visit_participants")
            .select((eb) => eb.fn.max("sort_order").as("max"))
            .where("visit_id", "=", visitId)
            .executeTakeFirst();
          const row = await trx
            .insertInto("visit_participants")
            .values({
              ...(options?.id ? { id: options.id } : {}),
              visit_id: visitId,
              profile_id: input.profileId,
              full_name: input.fullName,
              company: input.company,
              job_title: input.jobTitle,
              email: input.email,
              is_present: input.isPresent,
              sort_order: (max?.max ?? -1) + 1,
            })
            .returning("id")
            .executeTakeFirstOrThrow();
          return { id: row.id, ...(await freshVersion(trx, visitId)) };
        });
      } catch (error) {
        if (isUniqueViolation(error)) throw new ConflictError(DUPLICATE_MESSAGE, { cause: error });
        throw error;
      }
    },

    async update(visitId, version, id, patch) {
      return withUser(user, async (trx) => {
        await assertVisitVersion(trx, visitId, version);
        const result = await trx
          .updateTable("visit_participants")
          .set({
            ...(patch.fullName !== undefined ? { full_name: patch.fullName } : {}),
            ...(patch.company !== undefined ? { company: patch.company } : {}),
            ...(patch.jobTitle !== undefined ? { job_title: patch.jobTitle } : {}),
            ...(patch.email !== undefined ? { email: patch.email } : {}),
            ...(patch.isPresent !== undefined ? { is_present: patch.isPresent } : {}),
          })
          .where("id", "=", id)
          .where("visit_id", "=", visitId)
          .executeTakeFirst();
        if (Number(result.numUpdatedRows) === 0)
          throw new NotFoundError("Participant introuvable.");
        return freshVersion(trx, visitId);
      });
    },

    async remove(visitId, version, id) {
      return withUser(user, async (trx) => {
        await assertVisitVersion(trx, visitId, version);
        const result = await trx
          .deleteFrom("visit_participants")
          .where("id", "=", id)
          .where("visit_id", "=", visitId)
          .executeTakeFirst();
        if (Number(result.numDeletedRows) === 0)
          throw new NotFoundError("Participant introuvable.");
        return freshVersion(trx, visitId);
      });
    },

    async reorder(visitId, version, orderedIds) {
      return withUser(user, async (trx) => {
        await assertVisitVersion(trx, visitId, version);
        // One statement for every row; the version trigger still fires per changed row.
        if (orderedIds.length > 0) {
          await trx
            .updateTable("visit_participants")
            .set({
              sort_order: sql<number>`array_position(${sql.val(orderedIds)}::uuid[], id)::int - 1`,
            })
            .where("visit_id", "=", visitId)
            .where("id", "in", orderedIds)
            .execute();
        }
        return freshVersion(trx, visitId);
      });
    },
  };
}
