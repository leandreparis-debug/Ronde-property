import "server-only";

import { randomBytes } from "node:crypto";

import { sql } from "kysely";

import { isZoneFilled } from "@/lib/notes/format";
import {
  DUPLICATE_ZONE_LABEL_MESSAGE,
  EMPTY_ZONE_LABEL_MESSAGE,
  LONG_ZONE_LABEL_MESSAGE,
  REMOVE_NOT_EMPTY_MESSAGE,
  removeHasPhotosMessage,
} from "@/lib/notes/messages";
import { type Trx, type UserRef, withUser } from "@/server/db/context";
import {
  customZoneKey,
  normalizeZoneLabel,
  templateForVisitType,
  type VisitZoneTemplate,
  ZONE_LABEL_MAX_LENGTH,
  ZONE_TEMPLATES,
  type ZoneTemplateKey,
} from "@/server/domain/templates";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/server/errors";
import { countPhotosOfZone } from "@/server/photos/repository";

import { assertVisitVersion, type VisitVersion } from "./visit-repository";

/** A zone note as read from the database, with the name of its last author. */
export interface ZoneNoteRecord {
  id: string;
  visitId: string;
  zoneKey: string;
  zoneLabel: string;
  sortOrder: number;
  content: string;
  /** Version of the note itself (content changes only). */
  version: number;
  updatedAt: Date;
  updatedBy: string | null;
  updatedByName: string | null;
}

/** Current state of a note, carried by `ZoneNoteConflictError`. */
export interface ZoneNoteCurrent {
  content: string;
  version: number;
  updatedAt: Date;
  updatedByName: string | null;
}

/** The note changed meanwhile: the caller shows both texts and lets the user choose. */
export class ZoneNoteConflictError extends ConflictError {
  readonly current: ZoneNoteCurrent;

  constructor(current: ZoneNoteCurrent) {
    const who = current.updatedByName ?? "un autre utilisateur";
    super(`${who} a modifié cette zone entre-temps.`);
    this.current = current;
  }
}

/** Version of the visit after a structure change, plus the refreshed list. */
export interface ZoneStructureResult extends VisitVersion {
  notes: ZoneNoteRecord[];
}

/**
 * Notes by zone of a visit, through `withUser` (RLS: readable with the visit, writable when
 * `can_edit_visit`). Two concurrency levels:
 * - the **content** of a note is protected by the note's own `version`;
 * - the **structure** (add, remove, rename, reorder) is protected by the visit `version`,
 *   like the participants, and bumps it through the database triggers.
 */
export interface ZoneNoteRepository {
  list(visitId: string): Promise<ZoneNoteRecord[]>;
  /** Inserts the zones of the template that are missing, without duplicate nor overwrite. */
  insertTemplate(
    visitId: string,
    visitVersion: number,
    templateKey: ZoneTemplateKey,
  ): Promise<ZoneStructureResult>;
  /** Saves the content; `ZoneNoteConflictError` (with the current state) when stale. */
  updateContent(noteId: string, version: number, content: string): Promise<VisitVersion>;
  /** Adds a custom zone (`custom-{slug}-{suffix}`) at the end. */
  addZone(
    visitId: string,
    visitVersion: number,
    input: { label: string; id?: string },
  ): Promise<ZoneStructureResult & { id: string }>;
  /** Puts back a zone of the template that had been removed. */
  addTemplateZone(
    visitId: string,
    visitVersion: number,
    zoneKey: string,
    id?: string,
  ): Promise<ZoneStructureResult & { id: string }>;
  /** Renames a zone (template zones too); the key never changes. */
  rename(noteId: string, visitVersion: number, label: string): Promise<ZoneStructureResult>;
  reorder(
    visitId: string,
    visitVersion: number,
    orderedIds: string[],
  ): Promise<ZoneStructureResult>;
  /** Removes a zone, only when its content is empty. */
  remove(noteId: string, visitVersion: number): Promise<ZoneStructureResult>;
}

const EMPTY_LABEL = EMPTY_ZONE_LABEL_MESSAGE;
const LONG_LABEL = LONG_ZONE_LABEL_MESSAGE;
const DUPLICATE_LABEL = DUPLICATE_ZONE_LABEL_MESSAGE;
export const REMOVE_NOT_EMPTY = REMOVE_NOT_EMPTY_MESSAGE;

function cleanLabel(label: string): string {
  const trimmed = label.replace(/\s+/g, " ").trim();
  if (trimmed === "") throw new ValidationError(EMPTY_LABEL);
  if (trimmed.length > ZONE_LABEL_MAX_LENGTH) throw new ValidationError(LONG_LABEL);
  return trimmed;
}

/** Four lowercase base-36 characters: enough to keep keys unique within one visit. */
function shortSuffix(): string {
  return randomBytes(3).readUIntBE(0, 3).toString(36).padStart(4, "0").slice(-4);
}

async function listNotes(trx: Trx, visitId: string): Promise<ZoneNoteRecord[]> {
  const rows = await trx
    .selectFrom("visit_zone_notes as n")
    .leftJoin("profiles as p", "p.id", "n.updated_by")
    .select([
      "n.id",
      "n.visit_id",
      "n.zone_key",
      "n.zone_label",
      "n.sort_order",
      "n.content",
      "n.version",
      "n.updated_at",
      "n.updated_by",
      "p.full_name as updated_by_name",
    ])
    .where("n.visit_id", "=", visitId)
    .orderBy("n.sort_order")
    .orderBy("n.created_at")
    .execute();
  return rows.map((row) => ({
    id: row.id,
    visitId: row.visit_id,
    zoneKey: row.zone_key,
    zoneLabel: row.zone_label,
    sortOrder: row.sort_order,
    content: row.content,
    version: row.version,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
    updatedByName: row.updated_by_name ?? null,
  }));
}

async function freshVersion(trx: Trx, visitId: string): Promise<VisitVersion> {
  const row = await trx
    .selectFrom("visits")
    .select(["version", "updated_at"])
    .where("id", "=", visitId)
    .executeTakeFirstOrThrow();
  return { version: row.version, updatedAt: row.updated_at };
}

async function structureResult(trx: Trx, visitId: string): Promise<ZoneStructureResult> {
  return { ...(await freshVersion(trx, visitId)), notes: await listNotes(trx, visitId) };
}

async function nextSortOrder(trx: Trx, visitId: string): Promise<number> {
  const max = await trx
    .selectFrom("visit_zone_notes")
    .select((eb) => eb.fn.max("sort_order").as("max"))
    .where("visit_id", "=", visitId)
    .executeTakeFirst();
  return (max?.max ?? -1) + 1;
}

async function assertLabelFree(
  trx: Trx,
  visitId: string,
  label: string,
  exceptId?: string,
): Promise<void> {
  const siblings = await trx
    .selectFrom("visit_zone_notes")
    .select(["id", "zone_label"])
    .where("visit_id", "=", visitId)
    .execute();
  const wanted = normalizeZoneLabel(label);
  if (siblings.some((s) => s.id !== exceptId && normalizeZoneLabel(s.zone_label) === wanted))
    throw new ValidationError(DUPLICATE_LABEL);
}

/**
 * Inserts the zones of `template` that the visit does not have yet, in one statement
 * (one visit version bump), after the existing ones. Shared with visit creation, which runs
 * it in the same transaction as the insert of the visit.
 */
export async function insertTemplateZones(
  trx: Trx,
  visitId: string,
  template: VisitZoneTemplate,
): Promise<number> {
  const existing = await trx
    .selectFrom("visit_zone_notes")
    .select("zone_key")
    .where("visit_id", "=", visitId)
    .execute();
  const present = new Set(existing.map((row) => row.zone_key));
  const missing = template.zones.filter((zone) => !present.has(zone.key));
  if (missing.length === 0) return 0;
  const start = await nextSortOrder(trx, visitId);
  await trx
    .insertInto("visit_zone_notes")
    .values(
      missing.map((zone, index) => ({
        visit_id: visitId,
        zone_key: zone.key,
        zone_label: zone.label,
        sort_order: start + index,
      })),
    )
    .execute();
  return missing.length;
}

/**
 * Copies the zone structure of a visit into another one: same keys, labels and order, empty
 * content. Used by the duplication.
 */
export async function copyZoneStructure(trx: Trx, fromId: string, toId: string): Promise<number> {
  const zones = await trx
    .selectFrom("visit_zone_notes")
    .select(["zone_key", "zone_label", "sort_order"])
    .where("visit_id", "=", fromId)
    .orderBy("sort_order")
    .orderBy("created_at")
    .execute();
  if (zones.length === 0) return 0;
  await trx
    .insertInto("visit_zone_notes")
    .values(
      zones.map((zone, index) => ({
        visit_id: toId,
        zone_key: zone.zone_key,
        zone_label: zone.zone_label,
        sort_order: index,
      })),
    )
    .execute();
  return zones.length;
}

/** Kysely implementation of `ZoneNoteRepository`. */
export function createZoneNoteRepository(user: UserRef): ZoneNoteRepository {
  async function visitOf(
    trx: Trx,
    noteId: string,
  ): Promise<{ visitId: string; content: string; zoneKey: string }> {
    const row = await trx
      .selectFrom("visit_zone_notes")
      .select(["visit_id", "content", "zone_key"])
      .where("id", "=", noteId)
      .executeTakeFirst();
    if (!row) throw new NotFoundError("Zone introuvable.");
    return { visitId: row.visit_id, content: row.content, zoneKey: row.zone_key };
  }

  return {
    list(visitId) {
      return withUser(user, (trx) => listNotes(trx, visitId));
    },

    insertTemplate(visitId, visitVersion, templateKey) {
      return withUser(user, async (trx) => {
        await assertVisitVersion(trx, visitId, visitVersion);
        await insertTemplateZones(trx, visitId, ZONE_TEMPLATES[templateKey]);
        return structureResult(trx, visitId);
      });
    },

    updateContent(noteId, version, content) {
      return withUser(user, async (trx) => {
        const saved = await trx
          .updateTable("visit_zone_notes")
          .set({ content })
          .where("id", "=", noteId)
          .where("version", "=", version)
          .returning(["version", "updated_at"])
          .executeTakeFirst();
        if (saved) return { version: saved.version, updatedAt: saved.updated_at };
        const current = await trx
          .selectFrom("visit_zone_notes as n")
          .leftJoin("profiles as p", "p.id", "n.updated_by")
          .select(["n.content", "n.version", "n.updated_at", "p.full_name"])
          .where("n.id", "=", noteId)
          .executeTakeFirst();
        if (!current) throw new NotFoundError("Zone introuvable.");
        if (current.version !== version)
          throw new ZoneNoteConflictError({
            content: current.content,
            version: current.version,
            updatedAt: current.updated_at,
            updatedByName: current.full_name ?? null,
          });
        // Same version yet nothing updated: the user may not edit this visit (RLS).
        throw new ForbiddenError("Cette visite n'est pas modifiable.");
      });
    },

    addZone(visitId, visitVersion, input) {
      return withUser(user, async (trx) => {
        const label = cleanLabel(input.label);
        await assertVisitVersion(trx, visitId, visitVersion);
        await assertLabelFree(trx, visitId, label);
        const row = await trx
          .insertInto("visit_zone_notes")
          .values({
            ...(input.id ? { id: input.id } : {}),
            visit_id: visitId,
            zone_key: customZoneKey(label, shortSuffix()),
            zone_label: label,
            sort_order: await nextSortOrder(trx, visitId),
          })
          .returning("id")
          .executeTakeFirstOrThrow();
        return { id: row.id, ...(await structureResult(trx, visitId)) };
      });
    },

    addTemplateZone(visitId, visitVersion, zoneKey, id) {
      return withUser(user, async (trx) => {
        await assertVisitVersion(trx, visitId, visitVersion);
        const visit = await trx
          .selectFrom("visits")
          .select("type")
          .where("id", "=", visitId)
          .executeTakeFirstOrThrow();
        const zone = templateForVisitType(visit.type).zones.find((z) => z.key === zoneKey);
        if (!zone) throw new ValidationError("Cette zone ne fait pas partie de la trame.");
        const existing = await trx
          .selectFrom("visit_zone_notes")
          .select("id")
          .where("visit_id", "=", visitId)
          .where("zone_key", "=", zoneKey)
          .executeTakeFirst();
        if (existing) throw new ValidationError("Cette zone est déjà présente.");
        const row = await trx
          .insertInto("visit_zone_notes")
          .values({
            ...(id ? { id } : {}),
            visit_id: visitId,
            zone_key: zone.key,
            zone_label: zone.label,
            sort_order: await nextSortOrder(trx, visitId),
          })
          .returning("id")
          .executeTakeFirstOrThrow();
        return { id: row.id, ...(await structureResult(trx, visitId)) };
      });
    },

    rename(noteId, visitVersion, label) {
      return withUser(user, async (trx) => {
        const clean = cleanLabel(label);
        const { visitId } = await visitOf(trx, noteId);
        await assertVisitVersion(trx, visitId, visitVersion);
        await assertLabelFree(trx, visitId, clean, noteId);
        const result = await trx
          .updateTable("visit_zone_notes")
          .set({ zone_label: clean })
          .where("id", "=", noteId)
          .executeTakeFirst();
        if (Number(result.numUpdatedRows) === 0)
          throw new ForbiddenError("Cette visite n'est pas modifiable.");
        return structureResult(trx, visitId);
      });
    },

    reorder(visitId, visitVersion, orderedIds) {
      return withUser(user, async (trx) => {
        await assertVisitVersion(trx, visitId, visitVersion);
        if (orderedIds.length > 0) {
          await trx
            .updateTable("visit_zone_notes")
            .set({
              sort_order: sql<number>`array_position(${sql.val(orderedIds)}::uuid[], id)::int - 1`,
            })
            .where("visit_id", "=", visitId)
            .where("id", "in", orderedIds)
            .execute();
        }
        return structureResult(trx, visitId);
      });
    },

    remove(noteId, visitVersion) {
      return withUser(user, async (trx) => {
        const { visitId, content, zoneKey } = await visitOf(trx, noteId);
        await assertVisitVersion(trx, visitId, visitVersion);
        if (isZoneFilled(content)) throw new ValidationError(REMOVE_NOT_EMPTY);
        const photos = await countPhotosOfZone(trx, visitId, zoneKey);
        if (photos > 0) throw new ValidationError(removeHasPhotosMessage(photos));
        // Extension point (step 9): refuse while a reserve is linked to this zone_key too.
        const result = await trx
          .deleteFrom("visit_zone_notes")
          .where("id", "=", noteId)
          .executeTakeFirst();
        if (Number(result.numDeletedRows) === 0)
          throw new ForbiddenError("Cette visite n'est pas modifiable.");
        return structureResult(trx, visitId);
      });
    },
  };
}
