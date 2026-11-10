import { z } from "zod";

import { OUTLINE_MAX_POINTS, outlineError, STRUCTURE_LABEL_MAX } from "@/lib/plans/structure";

const uuid = z.uuid();
const label = z.string().max(STRUCTURE_LABEL_MAX * 2);
const point = z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) });

/** Outline of a building, or `null` to remove it; checked like the screen does. */
export const outlineSchema = z
  .array(point)
  .max(OUTLINE_MAX_POINTS)
  .nullable()
  .superRefine((value, context) => {
    if (!value) return;
    const error = outlineError(value);
    if (error) context.addIssue({ code: "custom", message: error });
  });

/** One page of an imported plan in « Affecter les pages ». */
export const pageAssignmentSchema = z.discriminatedUnion("target", [
  z.object({ pageNumber: z.int().min(1), target: z.literal("exterior") }),
  z.object({ pageNumber: z.int().min(1), target: z.literal("level"), buildingId: uuid, label }),
  z.object({
    pageNumber: z.int().min(1),
    target: z.literal("new-building"),
    buildingName: label,
    label,
  }),
  z.object({ pageNumber: z.int().min(1), target: z.literal("skip") }),
]);

export const assignPagesSchema = z.object({
  siteId: uuid,
  planId: uuid,
  assignments: z.array(pageAssignmentSchema).min(1).max(20),
});
export const createBuildingSchema = z.object({ siteId: uuid, name: label });
export const renameSchema = z.object({ id: uuid, name: label });
export const outlineInputSchema = z.object({ id: uuid, outline: outlineSchema });
export const archiveSchema = z.object({ id: uuid, archived: z.boolean() });
export const reorderBuildingsSchema = z.object({
  siteId: uuid,
  orderedIds: z.array(uuid).min(1).max(100),
});
export const reorderViewsSchema = z.object({
  buildingId: uuid,
  orderedIds: z.array(uuid).min(1).max(100),
});
export const replaceImageSchema = z.object({
  viewId: uuid,
  planId: uuid,
  pageNumber: z.int().min(1),
});
export const siteIdSchema = z.object({ siteId: uuid });
