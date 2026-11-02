/** Fields of a site that the VIGIE export can carry. */
export const SITE_FIELDS = [
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
] as const;

export type SiteField = (typeof SITE_FIELDS)[number];

/** A normalised, validated row of the file. Empty cells are `null`. */
export interface ImportedSiteRow {
  /** 1-based line number in the file (header is line 1). */
  line: number;
  warehouseCode: string;
  name: string;
  address: string | null;
  postalCode: string | null;
  city: string | null;
  surfaceM2: number | null;
  category: string | null;
  latitude: number | null;
  longitude: number | null;
  /** `null` when the column is absent or empty: the current state is kept. */
  isActive: boolean | null;
}

export interface RowError {
  line: number;
  code: string | null;
  message: string;
}

export type DetectedEncoding = "utf-8" | "utf-8-bom" | "windows-1252";

export interface ParseResult {
  fileName: string;
  sha256: string;
  encoding: DetectedEncoding;
  delimiter: string;
  /** Data lines read (header excluded). */
  totalLines: number;
  rows: ImportedSiteRow[];
  errors: RowError[];
  recognizedColumns: Array<{ header: string; field: SiteField }>;
  ignoredColumns: string[];
  /** Fields present in the file (a column may be present yet empty on a row). */
  presentFields: SiteField[];
}

/** Site as currently stored, the shape `planImport` compares against. */
export interface ExistingSite {
  id: string;
  warehouseCode: string;
  name: string;
  address: string | null;
  postalCode: string | null;
  city: string | null;
  surfaceM2: number | null;
  category: string | null;
  latitude: number | null;
  longitude: number | null;
  isActive: boolean;
}

export interface PlanOptions {
  /** The file holds the whole repository: active sites absent from it are deactivated. */
  fullReferential: boolean;
  /** An empty cell clears the stored value (default: keeps it). */
  emptyClearsValue: boolean;
}

/** Value that can appear in a diff. */
export type FieldValue = string | number | boolean | null;

export type FieldDiff = Partial<
  Record<Exclude<SiteField, "warehouse_code">, { old: FieldValue; new: FieldValue }>
>;

export interface PlannedCreate {
  line: number;
  row: ImportedSiteRow;
}

export interface PlannedChange {
  line: number;
  siteId: string;
  warehouseCode: string;
  name: string;
  diff: FieldDiff;
}

export interface PlannedDeactivation {
  siteId: string;
  warehouseCode: string;
  name: string;
  /** `absent`: not in the file (full referential); `explicit`: the file says inactive. */
  reason: "absent" | "explicit";
  line: number | null;
}

export interface ImportCounts {
  create: number;
  update: number;
  unchanged: number;
  reactivate: number;
  deactivate: number;
  reject: number;
}

export interface ImportPlan {
  counts: ImportCounts;
  creates: PlannedCreate[];
  updates: PlannedChange[];
  unchanged: Array<{ line: number; warehouseCode: string; name: string }>;
  reactivates: PlannedChange[];
  deactivates: PlannedDeactivation[];
  rejects: RowError[];
  /** Mass deactivation guard (full referential only). */
  guard: {
    activeSites: number;
    deactivationsByAbsence: number;
    /** Share of active sites that would be deactivated by absence (0..1). */
    ratio: number;
    /** True when the ratio exceeds 20 %: an explicit confirmation is required to apply. */
    requiresConfirmation: boolean;
  };
  /** Rows whose empty cells were kept because `emptyClearsValue` is off. */
  keptEmptyValues: number;
}

/** Share of active sites above which a full-referential import needs confirmation. */
export const MASS_DEACTIVATION_RATIO = 0.2;
