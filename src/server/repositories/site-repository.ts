import type { Site } from "@/server/domain";

import type { Page, Paging } from "./types";

/**
 * Read access to the VIGIE site repository. Users never write sites: the CSV import
 * (step 4) runs server-side with the admin client.
 */
export interface SiteRepository {
  /** Searches active sites by name, city or warehouse code. */
  search(query: string, paging?: Paging): Promise<Page<Site>>;
  findById(id: string): Promise<Site | null>;
  findByWarehouseCode(code: string): Promise<Site | null>;
}
