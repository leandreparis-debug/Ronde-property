import type { ReserveFormValues } from "@/lib/reserves/schema";
import type { Participant } from "@/server/domain";
import type { PhotoView } from "@/server/photos/types";
import { ZONE_TEMPLATES } from "@/server/domain/templates";

import type { LocalMarker, LocalNote, LocalPhoto, LocalReserve, RondeLocalDb } from "./db";
import { blobKeys } from "./db";
import type { SyncKind, SyncPayload } from "./ops";

/** Provisional code of a reserve created offline, until the server numbers it. */
export const PROVISIONAL_RESERVE_CODE = "R-?";

/**
 * Applies an operation to the local store **optimistically**, right after it is enqueued, so
 * that the screens show the change at once. Numbers stay provisional (`number: null`,
 * « R-? », « • ») until the server answers. Versions are never advanced here: they follow the
 * `applied` results. Each kind is a small, explicit case: adding an entity (step 13, 14) means
 * adding its cases here.
 */
export async function applyLocally<K extends SyncKind>(
  db: RondeLocalDb,
  visitId: string,
  kind: K,
  payload: SyncPayload<K>,
  context: { userId: string; userName: string; now?: string },
): Promise<void> {
  const now = context.now ?? new Date().toISOString();
  switch (kind) {
    case "visit.update": {
      const { patch } = payload as SyncPayload<"visit.update">;
      const visit = await db.visits.get(visitId);
      if (!visit) return;
      const writer = visit.writers.find((w) => w.id === patch.writerId);
      await db.visits.put({
        ...visit,
        type: patch.type,
        reason: patch.reason,
        title: patch.title,
        visitDate: patch.visitDate,
        subject: patch.subject,
        writerId: patch.writerId,
        writerName: patch.writerId ? (writer?.fullName ?? visit.writerName) : null,
        updatedAt: now,
      });
      return;
    }
    case "participant.add": {
      const { id, participant } = payload as SyncPayload<"participant.add">;
      const siblings = await db.participants.where("visitId").equals(visitId).toArray();
      const sortOrder = siblings.reduce((max, p) => Math.max(max, p.sortOrder), -1) + 1;
      await db.participants.put({ ...participant, id, visitId, sortOrder } as Participant & {
        visitId: string;
      });
      return;
    }
    case "participant.update": {
      const { id, patch } = payload as SyncPayload<"participant.update">;
      await db.participants.update(id, patch);
      return;
    }
    case "participant.remove": {
      await db.participants.delete((payload as SyncPayload<"participant.remove">).id);
      return;
    }
    case "participant.reorder": {
      const { orderedIds } = payload as SyncPayload<"participant.reorder">;
      for (const [index, id] of orderedIds.entries()) {
        await db.participants.update(id, { sortOrder: index });
      }
      return;
    }
    case "note.update": {
      const { noteId, content } = payload as SyncPayload<"note.update">;
      await db.notes.update(noteId, {
        content,
        updatedAt: now,
        updatedBy: context.userId,
        updatedByName: null,
      });
      return;
    }
    case "zone.add": {
      const { id, label } = payload as SyncPayload<"zone.add">;
      const siblings = await db.notes.where("visitId").equals(visitId).toArray();
      const note: LocalNote = {
        id,
        visitId,
        zoneKey: `custom-${slug(label)}-${id.slice(-4)}`,
        zoneLabel: label,
        sortOrder: siblings.reduce((max, n) => Math.max(max, n.sortOrder), -1) + 1,
        content: "",
        version: 1,
        updatedAt: now,
        updatedBy: context.userId,
        updatedByName: null,
      };
      await db.notes.put(note);
      return;
    }
    case "zone.addTemplate": {
      const { id, zoneKey } = payload as SyncPayload<"zone.addTemplate">;
      const siblings = await db.notes.where("visitId").equals(visitId).toArray();
      await db.notes.put({
        id,
        visitId,
        zoneKey,
        zoneLabel:
          [...ZONE_TEMPLATES.technical.zones, ...ZONE_TEMPLATES.meeting.zones].find(
            (zone) => zone.key === zoneKey,
          )?.label ?? zoneKey,
        sortOrder: siblings.reduce((max, n) => Math.max(max, n.sortOrder), -1) + 1,
        content: "",
        version: 1,
        updatedAt: now,
        updatedBy: context.userId,
        updatedByName: null,
      });
      return;
    }
    case "zone.insertTemplate":
      return;
    case "zone.rename": {
      const { noteId, label } = payload as SyncPayload<"zone.rename">;
      await db.notes.update(noteId, { zoneLabel: label });
      return;
    }
    case "zone.reorder": {
      const { orderedIds } = payload as SyncPayload<"zone.reorder">;
      for (const [index, id] of orderedIds.entries())
        await db.notes.update(id, { sortOrder: index });
      return;
    }
    case "zone.remove": {
      await db.notes.delete((payload as SyncPayload<"zone.remove">).noteId);
      return;
    }
    case "photo.create": {
      const { id, item } = payload as SyncPayload<"photo.create">;
      const siblings = await db.photos.where("visitId").equals(visitId).toArray();
      const zone = item.zoneKey
        ? await db.notes.where("[visitId+zoneKey]").equals([visitId, item.zoneKey]).first()
        : null;
      const photo: LocalPhoto = {
        id,
        visitId,
        caption: null,
        category: "general",
        zoneKey: item.zoneKey ?? null,
        zoneLabel: zone?.zoneLabel ?? null,
        toSort: item.toSort ?? false,
        hintViewId: item.hintViewId ?? null,
        takenAt: item.takenAt ?? null,
        width: item.width,
        height: item.height,
        sizeBytes: item.sizeBytes,
        sortOrder: siblings.reduce((max, p) => Math.max(max, p.sortOrder), -1) + 1,
        isCover: false,
        originalFilename: item.originalFilename ?? null,
        createdByName: context.userName,
        createdAt: now,
        url: null,
        thumbUrl: null,
        urlsExpireAt: now,
        uploadStatus: "pending",
      };
      await db.photos.put(photo);
      return;
    }
    case "photo.confirm":
      return;
    case "photo.update": {
      const { id, patch } = payload as SyncPayload<"photo.update">;
      const photo = await db.photos.get(id);
      if (!photo) return;
      const zone =
        patch.zoneKey !== undefined && patch.zoneKey
          ? await db.notes.where("[visitId+zoneKey]").equals([visitId, patch.zoneKey]).first()
          : null;
      await db.photos.put({
        ...photo,
        ...(patch.caption !== undefined ? { caption: patch.caption } : {}),
        ...(patch.category !== undefined ? { category: patch.category } : {}),
        ...(patch.toSort !== undefined ? { toSort: patch.toSort } : {}),
        ...(patch.zoneKey !== undefined
          ? { zoneKey: patch.zoneKey, zoneLabel: patch.zoneKey ? (zone?.zoneLabel ?? null) : null }
          : {}),
      });
      return;
    }
    case "photo.setCover": {
      const { id } = payload as SyncPayload<"photo.setCover">;
      const photos = await db.photos.where("visitId").equals(visitId).toArray();
      for (const photo of photos) {
        if (photo.isCover !== (photo.id === id)) {
          await db.photos.update(photo.id, { isCover: photo.id === id });
        }
      }
      return;
    }
    case "photo.move": {
      const { id, direction } = payload as SyncPayload<"photo.move">;
      const photos = (await db.photos.where("visitId").equals(visitId).toArray())
        .filter((p) => p.uploadStatus === "ready")
        .sort((a, b) => a.sortOrder - b.sortOrder);
      const index = photos.findIndex((p) => p.id === id);
      const target = direction === "before" ? index - 1 : index + 1;
      if (index < 0 || target < 0 || target >= photos.length) return;
      const [moved] = photos.splice(index, 1);
      photos.splice(target, 0, moved!);
      for (const [order, photo] of photos.entries()) {
        await db.photos.update(photo.id, { sortOrder: order });
      }
      return;
    }
    case "photo.delete": {
      const { id } = payload as SyncPayload<"photo.delete">;
      await db.photos.delete(id);
      await db.blobs.bulkDelete([blobKeys.photoMain(id), blobKeys.photoThumb(id)]);
      // A marker pointing to the photo keeps its place, without photo (like the server).
      const markers = await db.markers.where("visitId").equals(visitId).toArray();
      for (const marker of markers) {
        if (marker.photoId === id) {
          await db.markers.update(marker.id, {
            photoId: null,
            photoThumbUrl: null,
            photoCaption: null,
          });
        }
      }
      const reserves = await db.reserves.where("visitId").equals(visitId).toArray();
      for (const reserve of reserves) {
        if (reserve.photos.some((p) => p.id === id)) {
          const photos = reserve.photos.filter((p) => p.id !== id);
          await db.reserves.update(reserve.id, {
            photos,
            photosCount: photos.length,
            firstThumbUrl: photos[0]?.thumbUrl ?? null,
          });
        }
      }
      return;
    }
    case "marker.create": {
      const input = payload as SyncPayload<"marker.create">;
      const photo = input.photoId ? await db.photos.get(input.photoId) : null;
      const marker: LocalMarker = {
        id: input.id,
        visitId,
        planId: input.planId,
        page: input.page,
        x: input.x,
        y: input.y,
        number: null,
        kind: input.kind ?? "photo",
        label: input.label ?? null,
        photoId: input.photoId ?? null,
        photoThumbUrl: photo?.thumbUrl ?? null,
        photoCaption: photo?.caption ?? null,
        reserve: null,
        createdAt: now,
        updatedAt: now,
      };
      await db.markers.put(marker);
      return;
    }
    case "marker.move": {
      const { id, x, y } = payload as SyncPayload<"marker.move">;
      await db.markers.update(id, { x, y, updatedAt: now });
      return;
    }
    case "marker.update": {
      const { id, label, photoId } = payload as SyncPayload<"marker.update">;
      const marker = await db.markers.get(id);
      if (!marker) return;
      const photo = photoId ? await db.photos.get(photoId) : null;
      await db.markers.put({
        ...marker,
        ...(label !== undefined ? { label } : {}),
        ...(photoId !== undefined
          ? {
              photoId,
              photoThumbUrl: photo?.thumbUrl ?? null,
              photoCaption: photo?.caption ?? null,
            }
          : {}),
        updatedAt: now,
      });
      return;
    }
    case "marker.delete": {
      await db.markers.delete((payload as SyncPayload<"marker.delete">).id);
      return;
    }
    case "reserve.create": {
      const { id, values } = payload as SyncPayload<"reserve.create">;
      const visit = await db.visits.get(visitId);
      const siblings = await db.reserves.where("visitId").equals(visitId).toArray();
      const reserve = await reserveFromValues(db, visitId, id, values, {
        base: null,
        now,
        createdByName: context.userName,
        visitTitle: visit?.title ?? "",
        visitStatus: visit?.status ?? "in_progress",
        siteId: visit?.siteId ?? "",
      });
      void siblings;
      await db.reserves.put(reserve);
      return;
    }
    case "reserve.update": {
      const { id, values } = payload as SyncPayload<"reserve.update">;
      const base = await db.reserves.get(id);
      if (!base) return;
      await db.reserves.put(
        await reserveFromValues(db, visitId, id, values, {
          base,
          now,
          createdByName: base.createdByName ?? context.userName,
          visitTitle: base.visitTitle,
          visitStatus: base.visitStatus,
          siteId: base.siteId,
        }),
      );
      return;
    }
    case "reserve.setStatus": {
      const { id, status } = payload as SyncPayload<"reserve.setStatus">;
      const reserve = await db.reserves.get(id);
      if (!reserve) return;
      const done = status === "done";
      await db.reserves.put({
        ...reserve,
        status,
        closedAt: done ? now : null,
        closedByName: done ? context.userName : null,
        isOverdue: done ? false : reserve.isOverdue,
        updatedAt: now,
      });
      const markers = await db.markers.where("visitId").equals(visitId).toArray();
      for (const marker of markers) {
        if (marker.reserve?.id === id) {
          await db.markers.update(marker.id, {
            reserve: {
              ...marker.reserve,
              status,
              isOverdue: done ? false : marker.reserve.isOverdue,
            },
          });
        }
      }
      return;
    }
    case "reserve.delete": {
      const { id } = payload as SyncPayload<"reserve.delete">;
      const reserve = await db.reserves.get(id);
      await db.reserves.delete(id);
      if (reserve?.marker) await db.markers.delete(reserve.marker.id);
      return;
    }
    case "reserve.place": {
      const { id, markerId, planId, page, x, y } = payload as SyncPayload<"reserve.place">;
      const reserve = await db.reserves.get(id);
      if (!reserve) return;
      if (reserve.marker && reserve.marker.id !== markerId)
        await db.markers.delete(reserve.marker.id);
      const plan = await db.plans.get(planId);
      await db.markers.put({
        id: markerId,
        visitId,
        planId,
        page,
        x,
        y,
        number: null,
        kind: "photo",
        label: null,
        photoId: null,
        photoThumbUrl: null,
        photoCaption: null,
        reserve: {
          id,
          code: reserve.code,
          action: reserve.action,
          status: reserve.status,
          isOverdue: reserve.isOverdue,
        },
        createdAt: now,
        updatedAt: now,
      });
      await db.reserves.update(id, {
        marker: { id: markerId, planId, page },
        markerPlanName: plan?.name ?? null,
      });
      return;
    }
    case "reserve.unplace": {
      const { id } = payload as SyncPayload<"reserve.unplace">;
      const reserve = await db.reserves.get(id);
      if (!reserve) return;
      if (reserve.marker) await db.markers.delete(reserve.marker.id);
      await db.reserves.update(id, { marker: null, markerPlanName: null });
      return;
    }
    case "reserve.attachMarker": {
      const { id, markerId } = payload as SyncPayload<"reserve.attachMarker">;
      const reserve = await db.reserves.get(id);
      const marker = await db.markers.get(markerId);
      if (!reserve || !marker) return;
      const plan = await db.plans.get(marker.planId);
      await db.markers.update(markerId, {
        reserve: {
          id,
          code: reserve.code,
          action: reserve.action,
          status: reserve.status,
          isOverdue: reserve.isOverdue,
        },
      });
      await db.reserves.update(id, {
        marker: { id: markerId, planId: marker.planId, page: marker.page },
        markerPlanName: plan?.name ?? null,
      });
      return;
    }
  }
}

function slug(label: string): string {
  return label
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

/** Builds the local reserve row from the sheet values (creation or update). */
async function reserveFromValues(
  db: RondeLocalDb,
  visitId: string,
  id: string,
  values: ReserveFormValues,
  context: {
    base: LocalReserve | null;
    now: string;
    createdByName: string;
    visitTitle: string;
    visitStatus: LocalReserve["visitStatus"];
    siteId: string;
  },
): Promise<LocalReserve> {
  const zone = values.zoneKey
    ? await db.notes.where("[visitId+zoneKey]").equals([visitId, values.zoneKey]).first()
    : null;
  const visit = await db.visits.get(visitId);
  const internal = values.responsibleMode === "internal";
  const external = values.responsibleMode === "external";
  const profile = internal
    ? visit?.writers.find((w) => w.id === values.responsibleProfileId)
    : null;
  const photos: PhotoView[] = [];
  for (const photoId of values.photoIds) {
    const photo = await db.photos.get(photoId);
    if (photo) photos.push(photo);
  }
  const dueDate = values.dueDate || null;
  const base = context.base;
  return {
    id,
    visitId,
    siteId: context.siteId,
    number: base?.number ?? null,
    code: base?.code ?? PROVISIONAL_RESERVE_CODE,
    action: values.action.trim(),
    description: values.description.trim() || null,
    zoneKey: values.zoneKey || null,
    zoneLabel: values.zoneKey ? (zone?.zoneLabel ?? null) : null,
    priority: values.priority,
    responsibleKind: values.responsibleMode === "none" ? null : values.responsibleMode,
    responsibleLabel: internal
      ? (profile?.fullName ?? base?.responsibleLabel ?? "Compte inconnu")
      : external
        ? [values.responsibleName.trim(), values.responsibleCompany.trim()]
            .filter(Boolean)
            .join(" · ") || null
        : null,
    responsibleInactive: false,
    responsibleProfileId: internal ? values.responsibleProfileId : null,
    responsibleName: external ? values.responsibleName.trim() : null,
    responsibleCompany: external ? values.responsibleCompany.trim() || null : null,
    responsibleEmail: external ? values.responsibleEmail.trim() || null : null,
    dueDate,
    status: base?.status ?? "open",
    isOverdue: base?.status === "done" ? false : isPast(dueDate, context.now),
    daysOverdue: base?.status === "done" ? 0 : daysPast(dueDate, context.now),
    closedAt: base?.closedAt ?? null,
    closedByName: base?.closedByName ?? null,
    photosCount: photos.length,
    firstThumbUrl: photos[0]?.thumbUrl ?? null,
    marker: base?.marker ?? null,
    version: base?.version ?? 1,
    createdAt: base?.createdAt ?? context.now,
    updatedAt: context.now,
    createdByName: context.createdByName,
    visitTitle: context.visitTitle,
    visitStatus: context.visitStatus,
    markerPlanName: base?.markerPlanName ?? null,
    photos: photos.map((photo) => ({
      id: photo.id,
      caption: photo.caption,
      zoneLabel: photo.zoneLabel,
      thumbUrl: photo.thumbUrl,
      url: photo.url,
    })),
  };
}

function parisToday(now: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(new Date(now));
}

function isPast(dueDate: string | null, now: string): boolean {
  return dueDate !== null && dueDate < parisToday(now);
}

function daysPast(dueDate: string | null, now: string): number {
  if (!isPast(dueDate, now)) return 0;
  const today = Date.parse(`${parisToday(now)}T00:00:00Z`);
  const due = Date.parse(`${dueDate}T00:00:00Z`);
  return Math.round((today - due) / 86_400_000);
}
