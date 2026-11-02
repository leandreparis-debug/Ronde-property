import type { Reserve, ReserveInput, ReserveStatus } from "@/server/domain";
import type { Tables } from "@/server/db";

import type { Page, Paging } from "./types";

export interface ReserveFilters {
  visitId?: string;
  siteId?: string;
  status?: ReserveStatus;
  overdueOnly?: boolean;
  responsibleProfileId?: string;
}

export type ReserveEvent = Tables<"reserve_events">;

/**
 * Reserves read from reserves_with_state (derived fields included) and their history.
 * Numbering, closing dates and history are handled by database triggers.
 */
export interface ReserveRepository {
  list(filters?: ReserveFilters, paging?: Paging): Promise<Page<Reserve>>;
  findById(id: string): Promise<Reserve | null>;
  create(visitId: string, input: ReserveInput): Promise<Reserve>;
  update(id: string, input: Partial<ReserveInput>): Promise<Reserve>;
  changeStatus(id: string, status: ReserveStatus): Promise<Reserve>;
  softDelete(id: string): Promise<void>;
  listEvents(reserveId: string): Promise<ReserveEvent[]>;
  linkPhoto(reserveId: string, photoId: string, kind: "defect" | "proof"): Promise<void>;
  unlinkPhoto(reserveId: string, photoId: string): Promise<void>;
}
