// IndexedDB is provided to every unit test by fake-indexeddb (tests/setup.ts).

import Dexie from "dexie";

import type { LocalVisit, RondeLocalDb } from "@/lib/offline/db";
import { RondeLocalDb as Db } from "@/lib/offline/db";
import type { SyncOperation, SyncResponse, SyncResult } from "@/lib/offline/ops";
import type { VisitSnapshot } from "@/lib/offline/snapshot";
import type { SyncTransport } from "@/lib/offline/transport";
import { DEFAULT_REPORT_OPTIONS } from "@/lib/report/options";
import { emptyReserveForm, type ReserveFormValues } from "@/lib/reserves/schema";

export const ALICE = { id: "00000000-0000-4000-8000-000000000001", name: "Alice Fictive" };
export const BRUNO = { id: "00000000-0000-4000-8000-000000000002", name: "Bruno Fictif" };
export const VISIT = "20000000-0000-4000-8000-000000000001";
export const NOTE_ROOF = "40000000-0000-4000-8000-000000000001";
export const NOTE_DOCKS = "40000000-0000-4000-8000-000000000002";

let dbCounter = 0;

/** A fresh database per test (the fake IndexedDB is shared by the whole process). */
export async function freshDb(userId = ALICE.id): Promise<RondeLocalDb> {
  dbCounter += 1;
  const id = `${userId.slice(0, -4)}${String(dbCounter).padStart(4, "0")}`;
  await Dexie.delete(`ronde-${id}`);
  return new Db(id);
}

export function snapshot(overrides: Partial<VisitSnapshot> = {}): VisitSnapshot {
  return {
    fetchedAt: "2026-11-09T08:00:00.000Z",
    user: { id: ALICE.id, role: "rt" },
    canCreate: true,
    visit: {
      id: VISIT,
      siteId: "10000000-0000-4000-8000-000000000001",
      site: { code: "TEST-001", name: "Entrepôt fictif Lyon Sud", city: "Saint-Priest" },
      type: "technical",
      reason: "periodic",
      title: "Visite V1",
      visitDate: "2026-11-05",
      subject: null,
      status: "in_progress",
      writerId: ALICE.id,
      writerName: ALICE.name,
      createdBy: ALICE.id,
      createdByName: ALICE.name,
      completedAt: null,
      completedByName: null,
      deletedAt: null,
      deletedByName: null,
      duplicatedFromId: null,
      version: 3,
      updatedAt: "2026-11-05T10:00:00.000Z",
      updatedByName: ALICE.name,
      permissions: { canEdit: true, canManage: true },
    },
    participants: [],
    writers: [
      { id: ALICE.id, fullName: ALICE.name },
      { id: BRUNO.id, fullName: BRUNO.name },
    ],
    notes: [
      {
        id: NOTE_ROOF,
        zoneKey: "roof",
        zoneLabel: "Toiture",
        sortOrder: 0,
        content: "Étanchéité correcte.",
        version: 2,
        updatedAt: "2026-11-05T10:00:00.000Z",
        updatedBy: ALICE.id,
        updatedByName: ALICE.name,
      },
      {
        id: NOTE_DOCKS,
        zoneKey: "docks",
        zoneLabel: "Quais",
        sortOrder: 1,
        content: "",
        version: 1,
        updatedAt: "2026-11-05T10:00:00.000Z",
        updatedBy: null,
        updatedByName: null,
      },
    ],
    photos: [],
    plans: [],
    planPages: {},
    planOriginals: {},
    markers: [],
    markersSnapshotAt: "2026-11-09T08:00:00.000Z",
    buildings: [],
    views: [],
    reserves: [],
    reports: [],
    reportOptions: DEFAULT_REPORT_OPTIONS,
    ...overrides,
  };
}

export function reserveValues(
  action: string,
  extra: Partial<ReserveFormValues> = {},
): ReserveFormValues {
  return { ...emptyReserveForm(), action, ...extra };
}

/** Transport whose answers are scripted; records what was sent. */
export function fakeTransport(
  answer: (op: SyncOperation) => SyncResult | Promise<SyncResult>,
): SyncTransport & { sent: SyncOperation[][]; failNext: (error: unknown) => void } {
  let failure: unknown = null;
  const sent: SyncOperation[][] = [];
  return {
    sent,
    failNext(error) {
      failure = error;
    },
    async send(ops) {
      if (failure) {
        const error = failure;
        failure = null;
        throw error;
      }
      sent.push(ops);
      const results: SyncResult[] = [];
      for (const op of ops) results.push(await answer(op));
      const response: SyncResponse = { results, serverTime: new Date().toISOString() };
      return response;
    },
    async put() {
      return { status: 200 };
    },
  };
}

export function visitRow(db: RondeLocalDb): Promise<LocalVisit | undefined> {
  return db.visits.get(VISIT);
}
