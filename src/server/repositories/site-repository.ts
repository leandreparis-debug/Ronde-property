import "server-only";

import { sql } from "kysely";

import { type Trx, type UserRef, withUser } from "@/server/db/context";
import type { Site } from "@/server/domain";

import type { Page } from "./types";

export const SITE_PAGE_SIZE = 20;
export const SITE_QUERY_MAX_LENGTH = 200;

export interface SiteSearchParams {
  /** Free text matched against name, code and city, accent- and case-insensitive. */
  q?: string;
  category?: string;
  includeInactive?: boolean;
  page?: number;
  pageSize?: number;
}

/**
 * Read access to the VIGIE site repository. Users never write sites: the CSV import runs
 * server-side with `withSystem`.
 */
export interface SiteRepository {
  search(params: SiteSearchParams): Promise<Page<Site> & { page: number; pageCount: number }>;
  getByCode(code: string): Promise<Site | null>;
  getById(id: string): Promise<Site | null>;
  /** Distinct categories of the active sites. */
  listCategories(): Promise<string[]>;
}

const SITE_COLUMNS = [
  "id",
  "warehouse_code",
  "name",
  "address",
  "postal_code",
  "city",
  "surface_m2",
  "category",
  "latitude",
  "longitude",
  "is_active",
  "imported_at",
] as const;

type SiteRow = {
  id: string;
  warehouse_code: string;
  name: string;
  address: string | null;
  postal_code: string | null;
  city: string | null;
  surface_m2: number | null;
  category: string | null;
  latitude: number | null;
  longitude: number | null;
  is_active: boolean;
  imported_at: Date | null;
};

function toSite(row: SiteRow): Site {
  return {
    id: row.id,
    warehouseCode: row.warehouse_code,
    name: row.name,
    address: row.address,
    postalCode: row.postal_code,
    city: row.city,
    surfaceM2: row.surface_m2,
    category: row.category,
    latitude: row.latitude,
    longitude: row.longitude,
    isActive: row.is_active,
    importedAt: row.imported_at ? row.imported_at.toISOString() : null,
  };
}

/** Escapes `%`, `_` and `\` for an ILIKE pattern. */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/** Normalises the free text: trimmed, 200 characters max. */
export function normalizeQuery(q: string | undefined): string {
  return (q ?? "").trim().slice(0, SITE_QUERY_MAX_LENGTH);
}

const searchExpr = sql`private.site_search_text(sites.name, sites.warehouse_code, sites.city)`;

/**
 * Kysely implementation over `withUser`: Row Level Security applies (active users read every
 * site). Search ranks exact code matches, then ILIKE matches, then trigram similarity.
 */
export function createSiteRepository(user: UserRef): SiteRepository {
  return {
    async search(params) {
      const q = normalizeQuery(params.q);
      const pageSize = params.pageSize ?? SITE_PAGE_SIZE;
      const requestedPage = params.page && params.page >= 1 ? Math.floor(params.page) : 1;
      const normalizedQ = q.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
      const pattern = `%${escapeLike(normalizedQ)}%`;

      return withUser(user, async (trx: Trx) => {
        let base = trx.selectFrom("sites");
        if (!params.includeInactive) base = base.where("sites.is_active", "=", true);
        if (params.category) base = base.where("sites.category", "=", params.category);
        if (q) {
          base = base.where((eb) =>
            eb.or([
              sql<boolean>`${searchExpr} ilike ${pattern} escape '\\'`,
              sql<boolean>`extensions.similarity(${searchExpr}, ${normalizedQ}) > 0.3`,
            ]),
          );
        }

        const total = Number(
          (
            await base
              .select((eb) => eb.fn.countAll<string>().as("count"))
              .executeTakeFirstOrThrow()
          ).count,
        );
        const pageCount = Math.max(1, Math.ceil(total / pageSize));
        const page = Math.min(requestedPage, pageCount);

        let query = base.select(SITE_COLUMNS);
        if (q) {
          query = query.orderBy(
            sql`case when lower(sites.warehouse_code) = ${normalizedQ} then 0 when ${searchExpr} ilike ${pattern} escape '\\' then 1 else 2 end`,
          );
          query = query.orderBy(sql`extensions.similarity(${searchExpr}, ${normalizedQ})`, "desc");
        }
        const rows = await query
          .orderBy("sites.name")
          .limit(pageSize)
          .offset((page - 1) * pageSize)
          .execute();
        return { items: rows.map(toSite), total, page, pageCount };
      });
    },

    async getByCode(code) {
      const normalized = code.trim().toUpperCase();
      const row = await withUser(user, (trx) =>
        trx
          .selectFrom("sites")
          .select(SITE_COLUMNS)
          .where("warehouse_code", "=", normalized)
          .executeTakeFirst(),
      );
      return row ? toSite(row) : null;
    },

    async getById(id) {
      const row = await withUser(user, (trx) =>
        trx.selectFrom("sites").select(SITE_COLUMNS).where("id", "=", id).executeTakeFirst(),
      );
      return row ? toSite(row) : null;
    },

    async listCategories() {
      const rows = await withUser(user, (trx) =>
        trx
          .selectFrom("sites")
          .select("category")
          .distinct()
          .where("is_active", "=", true)
          .where("category", "is not", null)
          .orderBy("category")
          .execute(),
      );
      return rows.flatMap((row) => (row.category ? [row.category] : []));
    },
  };
}
