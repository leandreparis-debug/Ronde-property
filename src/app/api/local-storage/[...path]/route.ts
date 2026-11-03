import { env } from "@/lib/env";
import { getLocalStorageService } from "@/server/storage";
import { serveLocalStorage } from "@/server/storage/local-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ path: string[] }> };

/**
 * Local storage provider endpoint (`STORAGE_PROVIDER=local`, tests and development only).
 * Answers 404 for every request under any other provider, so that a misconfigured deployment
 * exposes nothing. Rights are not checked here: they were checked when the signed URL was
 * delivered, and the signature covers everything the URL allows.
 */
async function handle(request: Request, context: Context): Promise<Response> {
  const service = getLocalStorageService();
  if (!service || !env.LOCAL_STORAGE_SECRET) {
    return new Response("Introuvable.", { status: 404 });
  }
  const { path } = await context.params;
  return serveLocalStorage(service, env.LOCAL_STORAGE_SECRET, request, path);
}

export { handle as GET, handle as PUT };
