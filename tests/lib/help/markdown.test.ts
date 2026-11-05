import { describe, expect, it } from "vitest";

import { parseInline, parseMarkdown, safeHref, slugify } from "@/lib/help/markdown";

const same = (src: string) => src;

describe("guide Markdown", () => {
  it("parses headings with anchors, paragraphs and inline syntax", () => {
    const blocks = parseMarkdown(
      "# Créer une visite\n\nTouchez **Nouvelle visite** puis `Créer`.\nSuite.",
    );
    expect(blocks[0]).toEqual({
      type: "heading",
      level: 1,
      id: "creer-une-visite",
      children: [{ type: "text", value: "Créer une visite" }],
    });
    expect(blocks[1]).toEqual({
      type: "paragraph",
      children: [
        { type: "text", value: "Touchez " },
        { type: "strong", children: [{ type: "text", value: "Nouvelle visite" }] },
        { type: "text", value: " puis " },
        { type: "code", value: "Créer" },
        { type: "text", value: ". Suite." },
      ],
    });
  });

  it("parses lists with one nesting level and continuation lines", () => {
    const [list] = parseMarkdown("1. Ouvrir\n   la visite\n2. Toucher\n   - Notes\n   - Photos");
    expect(list).toMatchObject({ type: "list", ordered: true });
    if (list?.type !== "list") throw new Error("list expected");
    expect(list.items).toHaveLength(2);
    expect(list.items[0]!.children.map((c) => (c.type === "text" ? c.value : "")).join("")).toBe(
      "Ouvrir la visite",
    );
    expect(list.items[1]!.sublist?.items).toHaveLength(2);
  });

  it("parses quotes, fenced code, tables and images", () => {
    const blocks = parseMarkdown(
      "> **À savoir** : rien n'est perdu.\n\n```\npnpm dev\n```\n\n| A | B |\n| - | - |\n| 1 | 2 |\n\n![Écran](images/x.png)",
      (src) => `/aide/${src}`,
    );
    expect(blocks.map((b) => b.type)).toEqual(["quote", "code", "table", "image"]);
    expect(blocks[1]).toEqual({ type: "code", value: "pnpm dev" });
    expect(blocks[3]).toEqual({ type: "image", src: "/aide/images/x.png", alt: "Écran" });
  });

  it("drops unsafe links and keeps their text", () => {
    expect(safeHref("javascript:alert(1)")).toBeNull();
    expect(safeHref("//exemple.test")).toBeNull();
    expect(safeHref("/visites")).toBe("/visites");
    expect(parseInline("[clic](javascript:void)", same)).toEqual([{ type: "text", value: "clic" }]);
  });

  it("slugifies French headings", () => {
    expect(slugify("Que faire si… ?")).toBe("que-faire-si");
    expect(slugify("Passer du PC à la tablette")).toBe("passer-du-pc-a-la-tablette");
  });
});
