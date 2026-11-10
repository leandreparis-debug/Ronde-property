import type { LocalBlob, LocalVisit, RondeLocalDb } from "./db";
import { appliedAtKey, META_KEYS, planPageKey, readMeta } from "./db";
import { DELETING_KINDS } from "./outbox";
import type { VisitSnapshot } from "./snapshot";

/**
 * Merges a server snapshot into the local store **without overwriting what waits in the
 * outbox**: an entity with a pending operation keeps its local state (its server row is
 * skipped, and a local row the server no longer has is kept while an operation cites it).
 * Everything else takes the server state; rows the server no longer has disappear.
 */
export async function mergeSnapshot(
  db: RondeLocalDb,
  snapshot: VisitSnapshot,
  options: { keep?: boolean } = {},
): Promise<"merged" | "stale"> {
  const visitId = snapshot.visit.id;
  return db.transaction(
    "rw",
    [
      db.visits,
      db.participants,
      db.notes,
      db.photos,
      db.plans,
      db.planPages,
      db.markers,
      db.reserves,
      db.reports,
      db.buildings,
      db.views,
      db.outbox,
      db.meta,
    ],
    async () => {
      // A snapshot read before the last applied answer would bring older rows back. Checked
      // inside the transaction: an answer applied between the check and the writes would
      // otherwise empty the outbox and let this older snapshot delete what it created.
      const appliedAt = await readMeta<string>(db, appliedAtKey(visitId));
      if (appliedAt && Date.parse(snapshot.fetchedAt) < Date.parse(appliedAt)) {
        if (options.keep) await db.visits.update(visitId, { kept: true });
        return "stale" as const;
      }
      const pending = await db.outbox.where("visitId").equals(visitId).toArray();
      const busy = new Set(pending.map((entry) => entry.entityId));
      const deleted = new Set(
        pending.filter((entry) => DELETING_KINDS.includes(entry.kind)).map((e) => e.entityId),
      );
      const visitBusy = pending.some(
        (entry) => entry.kind === "visit.update" || entry.kind.startsWith("participant."),
      );
      const participantsBusy = pending.some((entry) => entry.kind.startsWith("participant."));
      const zonesBusy = pending.some((entry) => entry.kind.startsWith("zone."));

      const previous = await db.visits.get(visitId);
      const visit: LocalVisit = {
        ...snapshot.visit,
        // A pending information update keeps the local fields; status and rights follow the server.
        ...(visitBusy && previous
          ? {
              title: previous.title,
              type: previous.type,
              reason: previous.reason,
              visitDate: previous.visitDate,
              subject: previous.subject,
              writerId: previous.writerId,
              writerName: previous.writerName,
            }
          : {}),
        kept: options.keep ?? previous?.kept ?? false,
        keptAt: options.keep
          ? (previous?.keptAt ?? snapshot.fetchedAt)
          : (previous?.keptAt ?? null),
        snapshotAt: snapshot.fetchedAt,
        writers: snapshot.writers,
        reportOptions: snapshot.reportOptions,
        canCreate: snapshot.canCreate,
        userRole: snapshot.user.role,
      };
      await db.visits.put(visit);

      if (!participantsBusy) {
        await db.participants.where("visitId").equals(visitId).delete();
        await db.participants.bulkPut(snapshot.participants.map((p) => ({ ...p, visitId })));
      }

      // Notes: structure from the server unless a zone operation waits; content kept per note.
      const localNotes = await db.notes.where("visitId").equals(visitId).toArray();
      const localById = new Map(localNotes.map((note) => [note.id, note]));
      const serverNoteIds = new Set(snapshot.notes.map((note) => note.id));
      for (const note of snapshot.notes) {
        const local = localById.get(note.id);
        if (local && busy.has(note.id)) {
          await db.notes.put({ ...note, visitId, content: local.content, version: local.version });
        } else {
          await db.notes.put({ ...note, visitId });
        }
      }
      for (const note of localNotes) {
        if (!serverNoteIds.has(note.id) && !busy.has(note.id) && !zonesBusy) {
          await db.notes.delete(note.id);
        }
      }

      // Photos: ready photos from the server; pending ones stay as the outbox left them.
      const localPhotos = await db.photos.where("visitId").equals(visitId).toArray();
      const serverPhotoIds = new Set(snapshot.photos.map((photo) => photo.id));
      for (const photo of snapshot.photos) {
        if (busy.has(photo.id) || deleted.has(photo.id)) continue;
        await db.photos.put({ ...photo, uploadStatus: "ready" });
      }
      for (const photo of localPhotos) {
        if (!serverPhotoIds.has(photo.id) && !busy.has(photo.id)) await db.photos.delete(photo.id);
      }

      await db.plans.where("visitId").equals(visitId).delete();
      await db.plans.bulkPut(
        snapshot.plans.map((plan) => ({
          ...plan,
          visitId,
          originalUrl: snapshot.planOriginals[plan.id] ?? null,
        })),
      );
      for (const plan of snapshot.plans) {
        await db.planPages.where("planId").equals(plan.id).delete();
        await db.planPages.bulkPut(
          (snapshot.planPages[plan.id] ?? []).map((page) => ({
            ...page,
            key: planPageKey(plan.id, page.pageNumber),
            planId: plan.id,
          })),
        );
      }

      const localMarkers = await db.markers.where("visitId").equals(visitId).toArray();
      const serverMarkerIds = new Set(snapshot.markers.map((marker) => marker.id));
      for (const marker of snapshot.markers) {
        if (busy.has(marker.id) || deleted.has(marker.id)) continue;
        await db.markers.put(marker);
      }
      for (const marker of localMarkers) {
        if (!serverMarkerIds.has(marker.id) && !busy.has(marker.id)) {
          await db.markers.delete(marker.id);
        }
      }

      const localReserves = await db.reserves.where("visitId").equals(visitId).toArray();
      const serverReserveIds = new Set(snapshot.reserves.map((reserve) => reserve.id));
      for (const reserve of snapshot.reserves) {
        if (busy.has(reserve.id) || deleted.has(reserve.id)) continue;
        await db.reserves.put(reserve);
      }
      for (const reserve of localReserves) {
        if (!serverReserveIds.has(reserve.id) && !busy.has(reserve.id)) {
          await db.reserves.delete(reserve.id);
        }
      }

      await db.reports.where("visitId").equals(visitId).delete();
      await db.reports.bulkPut(snapshot.reports.map((report) => ({ ...report, visitId })));

      // Buildings and views (step 12 b): configured online, copied as they are.
      await db.buildings.where("visitId").equals(visitId).delete();
      await db.buildings.bulkPut((snapshot.buildings ?? []).map((b) => ({ ...b, visitId })));
      await db.views.where("visitId").equals(visitId).delete();
      await db.views.bulkPut((snapshot.views ?? []).map((v) => ({ ...v, visitId })));

      await db.meta.put({ key: META_KEYS.lastServerContactAt, value: snapshot.fetchedAt });
      return "merged" as const;
    },
  );
}

/** Removes a visit and everything about it from the store (blobs included). */
export async function removeVisitLocally(db: RondeLocalDb, visitId: string): Promise<void> {
  await db.transaction(
    "rw",
    [
      db.visits,
      db.participants,
      db.notes,
      db.photos,
      db.plans,
      db.planPages,
      db.markers,
      db.reserves,
      db.reports,
      db.buildings,
      db.views,
      db.blobs,
      db.conflicts,
    ],
    async () => {
      const planIds = (await db.plans.where("visitId").equals(visitId).toArray()).map((p) => p.id);
      for (const planId of planIds) await db.planPages.where("planId").equals(planId).delete();
      await Promise.all([
        db.visits.delete(visitId),
        db.participants.where("visitId").equals(visitId).delete(),
        db.notes.where("visitId").equals(visitId).delete(),
        db.photos.where("visitId").equals(visitId).delete(),
        db.plans.where("visitId").equals(visitId).delete(),
        db.markers.where("visitId").equals(visitId).delete(),
        db.reserves.where("visitId").equals(visitId).delete(),
        db.reports.where("visitId").equals(visitId).delete(),
        db.buildings.where("visitId").equals(visitId).delete(),
        db.views.where("visitId").equals(visitId).delete(),
        db.blobs.where("visitId").equals(visitId).delete(),
        db.conflicts.where("visitId").equals(visitId).delete(),
      ]);
    },
  );
}

/** Size in bytes of the blobs stored for a visit. */
export async function visitBlobsSize(db: RondeLocalDb, visitId: string): Promise<number> {
  const blobs: LocalBlob[] = await db.blobs.where("visitId").equals(visitId).toArray();
  return blobs.reduce((sum, blob) => sum + blob.size, 0);
}
