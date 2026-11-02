import type {
  Participant,
  ParticipantInput,
  Visit,
  VisitInput,
  VisitSummary,
  ZoneNote,
  ZoneNoteInput,
} from "@/server/domain";

import type { Page, Paging } from "./types";

export interface VisitFilters {
  siteId?: string;
  status?: Visit["status"];
  createdBy?: string;
}

/**
 * Visits, their participants and their zone notes. Lifecycle changes go through the
 * database RPCs so that rights are checked and traced in the database.
 */
export interface VisitRepository {
  list(filters?: VisitFilters, paging?: Paging): Promise<Page<VisitSummary>>;
  findById(id: string): Promise<Visit | null>;
  create(input: VisitInput): Promise<Visit>;
  update(id: string, input: Partial<VisitInput>, expectedVersion?: number): Promise<Visit>;
  /** Calls complete_visit. */
  complete(id: string): Promise<Visit>;
  /** Calls reopen_visit. */
  reopen(id: string): Promise<Visit>;
  /** Calls soft_delete_visit. */
  softDelete(id: string): Promise<Visit>;

  listParticipants(visitId: string): Promise<Participant[]>;
  addParticipant(visitId: string, input: ParticipantInput): Promise<Participant>;
  updateParticipant(id: string, input: Partial<ParticipantInput>): Promise<Participant>;
  removeParticipant(id: string): Promise<void>;

  listZoneNotes(visitId: string): Promise<ZoneNote[]>;
  upsertZoneNote(visitId: string, input: ZoneNoteInput): Promise<ZoneNote>;
  removeZoneNote(id: string): Promise<void>;
}
