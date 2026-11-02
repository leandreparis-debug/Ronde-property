import type { Photo } from "@/server/domain";

export type PhotoInput = Omit<Photo, "id" | "createdBy">;

/** Photo metadata of a visit. Files themselves go through StorageService. */
export interface PhotoRepository {
  listByVisit(visitId: string): Promise<Photo[]>;
  findById(id: string): Promise<Photo | null>;
  create(input: PhotoInput): Promise<Photo>;
  update(
    id: string,
    input: Partial<Pick<Photo, "caption" | "category" | "zoneKey" | "sortOrder" | "isCover">>,
  ): Promise<Photo>;
  remove(id: string): Promise<void>;
}
