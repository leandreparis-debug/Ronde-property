import { describe, expect, it, vi } from "vitest";

import {
  detectPlanType,
  ImportCancelledError,
  importPlan,
  importProgressLabel,
  type PlanImportDeps,
} from "@/lib/plans/importer";
import type { PlanSource, RenderedPage } from "@/lib/plans/render";

function target(url: string) {
  return { url, headers: { "Content-Type": "image/png" }, expiresAt: "2026-11-04T10:02:00Z" };
}

function source(pageCount: number, rendered: number[] = []): PlanSource {
  return {
    pageCount,
    renderPage: vi.fn(async (pageNumber: number): Promise<RenderedPage> => {
      rendered.push(pageNumber);
      return {
        pageNumber,
        image: new Blob([new Uint8Array(900)]),
        imageMime: "image/png",
        thumb: new Blob([new Uint8Array(100)]),
        width: 3500,
        height: 2475,
      };
    }),
    renderPreview: vi.fn(async () => "blob:preview"),
    destroy: vi.fn(),
  };
}

function deps(overrides: Partial<PlanImportDeps> = {}) {
  const calls: string[] = [];
  const base: PlanImportDeps = {
    prepare: vi.fn(async () => ({ planId: "plan-1", original: target("/original") })),
    preparePages: vi.fn(async (_id, pages) =>
      pages.map((p: { pageNumber: number }) => ({
        pageNumber: p.pageNumber,
        image: target(`/p${p.pageNumber}`),
        thumb: target(`/p${p.pageNumber}_thumb`),
      })),
    ),
    renew: vi.fn(async () => ({
      original: { planId: "plan-1", original: target("/original?renewed") },
      pages: [1, 2, 3].map((n) => ({
        pageNumber: n,
        image: target(`/p${n}?renewed`),
        thumb: target(`/p${n}_thumb?renewed`),
      })),
    })),
    confirm: vi.fn(async () => ({
      ok: true as const,
      plan: {
        id: "plan-1",
        siteId: "s",
        name: "Plan",
        mimeType: "application/pdf" as const,
        pageCount: 3,
        isArchived: false,
        uploadedByName: null,
        createdAt: "",
        thumbUrl: null,
        markersCount: 0,
      },
    })),
    discard: vi.fn(async () => undefined),
    put: vi.fn(async (t, _b, onProgress) => {
      calls.push(t.url);
      onProgress(1, 1);
      return { status: 200 };
    }),
    retryDelaysMs: [1, 1, 1],
    sleep: async () => undefined,
    ...overrides,
  };
  return { deps: base, calls };
}

const file = new Blob([new Uint8Array(50)]);

describe("importPlan", () => {
  it("uploads the original, then converts and uploads one page at a time, then confirms", async () => {
    const { deps: d, calls } = deps();
    const rendered: number[] = [];
    const progress: string[] = [];
    const plan = await importPlan(
      {
        file,
        name: "Plan",
        mimeType: "application/pdf",
        source: source(3, rendered),
        signal: new AbortController().signal,
        onProgress: (p) => progress.push(importProgressLabel(p)),
      },
      d,
    );
    expect(plan.id).toBe("plan-1");
    expect(rendered).toEqual([1, 2, 3]);
    expect(calls).toEqual([
      "/original",
      "/p1",
      "/p1_thumb",
      "/p2",
      "/p2_thumb",
      "/p3",
      "/p3_thumb",
    ]);
    expect(d.preparePages).toHaveBeenCalledTimes(3);
    expect(progress).toContain("Conversion de la page 3 sur 3");
    expect(progress).toContain("Vérification…");
    expect(d.discard).not.toHaveBeenCalled();
  });

  it("retries a network failure, renews an expired URL, then succeeds", async () => {
    let failures = 0;
    const { deps: d, calls } = deps({
      put: vi.fn(async (t) => {
        calls.push(t.url);
        if (t.url === "/p1" && failures === 0) {
          failures += 1;
          throw new Error("network");
        }
        if (t.url === "/p1" && failures === 1) {
          failures += 1;
          return { status: 410 };
        }
        return { status: 200 };
      }),
    });
    await importPlan(
      {
        file,
        name: "Plan",
        mimeType: "application/pdf",
        source: source(1),
        signal: new AbortController().signal,
        onProgress: () => undefined,
      },
      d,
    );
    expect(calls).toEqual(["/original", "/p1", "/p1", "/p1?renewed", "/p1_thumb"]);
    expect(d.renew).toHaveBeenCalledTimes(1);
  });

  it("discards the pending plan when cancelled before the confirmation", async () => {
    const controller = new AbortController();
    const { deps: d } = deps({
      preparePages: vi.fn(async (_id, pages) => {
        controller.abort();
        return pages.map((p: { pageNumber: number }) => ({
          pageNumber: p.pageNumber,
          image: target("/p"),
          thumb: target("/t"),
        }));
      }),
    });
    await expect(
      importPlan(
        {
          file,
          name: "Plan",
          mimeType: "application/pdf",
          source: source(2),
          signal: controller.signal,
          onProgress: () => undefined,
        },
        d,
      ),
    ).rejects.toBeInstanceOf(ImportCancelledError);
    expect(d.discard).toHaveBeenCalledWith("plan-1");
    expect(d.confirm).not.toHaveBeenCalled();
  });

  it("fails with the server message and discards when the preparation of a page is refused", async () => {
    const { deps: d } = deps({
      preparePages: vi.fn(async () => ({ error: "Vous ne pouvez pas modifier ce plan." })),
    });
    await expect(
      importPlan(
        {
          file,
          name: "Plan",
          mimeType: "application/pdf",
          source: source(1),
          signal: new AbortController().signal,
          onProgress: () => undefined,
        },
        d,
      ),
    ).rejects.toThrow("Vous ne pouvez pas modifier ce plan.");
    expect(d.discard).toHaveBeenCalled();
  });
});

describe("detectPlanType", () => {
  it("refuses a file above 50 MB before reading it, and a fake PDF", async () => {
    const big = { size: 51 * 1024 * 1024, slice: () => new Blob() } as unknown as Blob;
    await expect(detectPlanType(big)).rejects.toThrow("50 Mo");
    await expect(detectPlanType(new Blob(["pas un pdf"]))).rejects.toThrow(
      "Format non pris en charge",
    );
    expect(await detectPlanType(new Blob(["%PDF-1.7\n"]))).toBe("application/pdf");
  });
});
