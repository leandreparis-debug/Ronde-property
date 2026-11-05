/**
 * Minimal Markdown parser for the guides served on /aide (docs/guide-*.md). It covers what the
 * guides use, nothing more: headings, paragraphs, lists (one nesting level), quotes, fenced
 * code, tables, images, and inline bold, italic, code and links. The output is a tree of plain
 * objects rendered by React (never HTML strings): no dependency, no injection.
 */

export type Inline =
  | { type: "text"; value: string }
  | { type: "strong"; children: Inline[] }
  | { type: "em"; children: Inline[] }
  | { type: "code"; value: string }
  | { type: "link"; href: string; children: Inline[] }
  | { type: "image"; src: string; alt: string };

export interface ListItem {
  children: Inline[];
  sublist?: { ordered: boolean; items: ListItem[] };
}

export type Block =
  | { type: "heading"; level: 1 | 2 | 3 | 4; id: string; children: Inline[] }
  | { type: "paragraph"; children: Inline[] }
  | { type: "list"; ordered: boolean; items: ListItem[] }
  | { type: "quote"; children: Block[] }
  | { type: "code"; value: string }
  | { type: "table"; header: Inline[][]; rows: Inline[][][] }
  | { type: "image"; src: string; alt: string };

/** Anchor of a heading: lowercase, accents removed, words joined by hyphens. */
export function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Only safe link targets: internal paths, anchors, https and mailto. */
export function safeHref(href: string): string | null {
  if (/^(\/|#)/.test(href) && !href.startsWith("//")) return href;
  if (/^https:\/\//.test(href) || /^mailto:/.test(href)) return href;
  return null;
}

const INLINE =
  /(!\[([^\]]*)\]\(([^)\s]+)\))|(\[([^\]]+)\]\(([^)\s]+)\))|(`([^`]+)`)|(\*\*([^*]+)\*\*)|(\*([^*]+)\*)/;

/** Parses inline syntax. `resolveImage` maps an image path of the docs to its served URL. */
export function parseInline(text: string, resolveImage: (src: string) => string): Inline[] {
  const out: Inline[] = [];
  let rest = text;
  while (rest.length > 0) {
    const match = INLINE.exec(rest);
    if (!match) {
      out.push({ type: "text", value: rest });
      break;
    }
    if (match.index > 0) out.push({ type: "text", value: rest.slice(0, match.index) });
    if (match[1]) out.push({ type: "image", src: resolveImage(match[3]!), alt: match[2]! });
    else if (match[4]) {
      const href = safeHref(match[6]!);
      const children = parseInline(match[5]!, resolveImage);
      if (href) out.push({ type: "link", href, children });
      else out.push(...children);
    } else if (match[7]) out.push({ type: "code", value: match[8]! });
    else if (match[9])
      out.push({ type: "strong", children: parseInline(match[10]!, resolveImage) });
    else if (match[11]) out.push({ type: "em", children: parseInline(match[12]!, resolveImage) });
    rest = rest.slice(match.index + match[0].length);
  }
  return out;
}

const LIST_ITEM = /^(\s*)([-*]|\d+\.)\s+(.*)$/;

function splitRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

/** Parses a Markdown document into blocks. */
export function parseMarkdown(
  source: string,
  resolveImage: (src: string) => string = (s) => s,
): Block[] {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  const inline = (text: string) => parseInline(text, resolveImage);
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!;
    if (line.trim() === "") {
      i += 1;
      continue;
    }
    const fence = /^```/.exec(line);
    if (fence) {
      const body: string[] = [];
      i += 1;
      while (i < lines.length && !/^```/.test(lines[i]!)) body.push(lines[i++]!);
      i += 1;
      blocks.push({ type: "code", value: body.join("\n") });
      continue;
    }
    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      const text = heading[2]!.trim();
      blocks.push({
        type: "heading",
        level: heading[1]!.length as 1 | 2 | 3 | 4,
        id: slugify(text),
        children: inline(text),
      });
      i += 1;
      continue;
    }
    if (/^>/.test(line)) {
      const body: string[] = [];
      while (i < lines.length && /^>/.test(lines[i]!)) body.push(lines[i++]!.replace(/^>\s?/, ""));
      blocks.push({ type: "quote", children: parseMarkdown(body.join("\n"), resolveImage) });
      continue;
    }
    if (/^\|/.test(line) && i + 1 < lines.length && /^\|?\s*:?-+:?\s*\|/.test(lines[i + 1]!)) {
      const header = splitRow(line).map(inline);
      i += 2;
      const rows: Inline[][][] = [];
      while (i < lines.length && /^\|/.test(lines[i]!))
        rows.push(splitRow(lines[i++]!).map(inline));
      blocks.push({ type: "table", header, rows });
      continue;
    }
    const image = /^!\[([^\]]*)\]\(([^)\s]+)\)\s*$/.exec(line);
    if (image) {
      blocks.push({ type: "image", alt: image[1]!, src: resolveImage(image[2]!) });
      i += 1;
      continue;
    }
    const item = LIST_ITEM.exec(line);
    if (item && item[1]!.length === 0) {
      const ordered = /\d/.test(item[2]!);
      const items: ListItem[] = [];
      while (i < lines.length) {
        const current = LIST_ITEM.exec(lines[i]!);
        if (current && current[1]!.length === 0) {
          items.push({ children: inline(current[3]!) });
          i += 1;
        } else if (current && items.length > 0) {
          const parent = items[items.length - 1]!;
          parent.sublist ??= { ordered: /\d/.test(current[2]!), items: [] };
          parent.sublist.items.push({ children: inline(current[3]!) });
          i += 1;
        } else if (lines[i]!.trim() !== "" && /^\s{2,}\S/.test(lines[i]!) && items.length > 0) {
          // Continuation line of the previous item.
          const parent = items[items.length - 1]!;
          parent.children.push({ type: "text", value: " " }, ...inline(lines[i]!.trim()));
          i += 1;
        } else break;
      }
      blocks.push({ type: "list", ordered, items });
      continue;
    }
    // A paragraph always takes its first line (whatever it starts with), then the next ones
    // until a blank line or another block.
    const paragraph: string[] = [lines[i++]!.trim()];
    while (
      i < lines.length &&
      lines[i]!.trim() !== "" &&
      !/^(#{1,4}\s|>|```|\|)/.test(lines[i]!) &&
      !(LIST_ITEM.exec(lines[i]!)?.[1] === "")
    ) {
      paragraph.push(lines[i++]!.trim());
    }
    blocks.push({ type: "paragraph", children: inline(paragraph.join(" ")) });
  }
  return blocks;
}
