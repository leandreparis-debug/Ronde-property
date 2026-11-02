import type { Database } from "./database.types";

export type { Database, Json } from "./database.types";
export { Constants } from "./database.types";

type PublicSchema = Database["public"];

/** Row type of a table or a view of the public schema. */
export type Tables<T extends keyof (PublicSchema["Tables"] & PublicSchema["Views"])> =
  (PublicSchema["Tables"] & PublicSchema["Views"])[T]["Row"];

/** Insert type of a table of the public schema. */
export type TablesInsert<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Insert"];

/** Update type of a table of the public schema. */
export type TablesUpdate<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Update"];

/** Enumerated type of the public schema. */
export type Enums<T extends keyof PublicSchema["Enums"]> = PublicSchema["Enums"][T];
