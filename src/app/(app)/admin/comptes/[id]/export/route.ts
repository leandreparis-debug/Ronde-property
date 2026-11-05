import { NextResponse } from "next/server";
import { z } from "zod";

import { userMessage } from "@/server/errors";
import { exportAccount } from "@/server/services/account-privacy";

export const dynamic = "force-dynamic";

/**
 * Admin: downloads everything RONDE holds about an account, as JSON (right of access). The
 * role is checked by `exportAccount` (requireRoleForAction); audit `account.exported`.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) return NextResponse.json({ error: "Compte introuvable." }, { status: 404 });
  try {
    const data = await exportAccount(id.data);
    const day = data.exportedAt.slice(0, 10);
    return new NextResponse(JSON.stringify(data, null, 2), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="ronde-compte-${id.data.slice(0, 8)}-${day}.json"`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    const status =
      typeof error === "object" && error && "status" in error && typeof error.status === "number"
        ? error.status
        : 500;
    return NextResponse.json({ error: userMessage(error) }, { status });
  }
}
