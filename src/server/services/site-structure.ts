import "server-only";

import { requireRoleForAction, requireUserForAction } from "@/server/auth/session";
import { createSiteStructureService } from "@/server/plans/structure-service";
import { getStorageService } from "@/server/storage";

const WRITERS = ["rt", "admin"] as const;

/** The structure service of the signed-in user (every active user reads). */
export async function siteStructureForReader() {
  const user = await requireUserForAction();
  return createSiteStructureService(user, getStorageService());
}

/** The structure service of an RT or an admin (configuration of a site). */
export async function siteStructureForWriter() {
  const user = await requireRoleForAction(WRITERS);
  return createSiteStructureService(user, getStorageService());
}
