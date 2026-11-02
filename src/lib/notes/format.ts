/**
 * Pure helpers for zone notes: the « report » formatting of a note (bullets), the bullet
 * insertion of the editor toolbar, the retry schedule of the autosave and the filled state.
 * Shared with the PDF report (step 10). No DOM, no HTML: the text is always kept as plain text.
 */

/** Maximum length of a note, mirrored by the database CHECK constraint. */
export const NOTE_MAX_LENGTH = 20_000;

/** Length from which the editor shows the character counter. */
export const NOTE_COUNTER_THRESHOLD = 18_000;

/** A block of a formatted note: a paragraph, or a list of bullets. */
export type NoteBlock = { type: "paragraph"; text: string } | { type: "bullets"; items: string[] };

/** A bullet line: optional leading spaces, then `-`, `•` or `*`, then at least one space. */
const BULLET_LINE = /^\s*[-•*]\s+(.*)$/;

/**
 * Splits a note into paragraphs and bullet lists, as shown in the report.
 *
 * - A line starting with `- `, `• ` or `* ` (leading spaces tolerated) is a bullet; consecutive
 *   bullets form one list.
 * - Consecutive non-bullet lines form one paragraph; an empty line separates paragraphs.
 * - Trailing spaces and repeated empty lines are normalised; `\r\n` is accepted.
 * - `-5 °C` or `--` are not bullets (no space after the marker).
 * - An empty or blank note gives `[]`.
 */
export function parseNoteContent(text: string): NoteBlock[] {
  const blocks: NoteBlock[] = [];
  let paragraph: string[] = [];
  let bullets: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length > 0) {
      blocks.push({ type: "paragraph", text: paragraph.join("\n") });
      paragraph = [];
    }
  };
  const flushBullets = () => {
    if (bullets.length > 0) {
      blocks.push({ type: "bullets", items: bullets });
      bullets = [];
    }
  };

  for (const rawLine of text.replace(/\r\n?/g, "\n").split("\n")) {
    const line = rawLine.replace(/\s+$/, "");
    if (line.trim() === "") {
      flushParagraph();
      flushBullets();
      continue;
    }
    // Tested on the raw line: « - » followed by spaces only is an empty bullet, ignored.
    const bullet = BULLET_LINE.exec(rawLine);
    if (bullet) {
      flushParagraph();
      const item = (bullet[1] ?? "").trim();
      if (item !== "") bullets.push(item);
      continue;
    }
    flushBullets();
    paragraph.push(line.trim());
  }
  flushParagraph();
  flushBullets();
  return blocks;
}

/** Whether a zone counts as « renseignée »: its content is not blank. */
export function isZoneFilled(content: string): boolean {
  return content.trim() !== "";
}

export interface TextSelection {
  text: string;
  selectionStart: number;
  selectionEnd: number;
}

/**
 * Toolbar « Puce »: prefixes the current line, or every line of the selection, with `- `.
 * Lines that already start with a bullet marker are left as they are. Returns the new text and
 * the selection to restore, so the caret stays on the same characters.
 */
export function insertBullets({
  text,
  selectionStart,
  selectionEnd,
}: TextSelection): TextSelection {
  const start = Math.max(0, Math.min(selectionStart, selectionEnd));
  const end = Math.max(selectionStart, selectionEnd, start);
  const lineStart = text.lastIndexOf("\n", start - 1) + 1;
  const lineEndIndex = text.indexOf("\n", end);
  const lineEnd = lineEndIndex === -1 ? text.length : lineEndIndex;
  const lines = text.slice(lineStart, lineEnd).split("\n");

  let added = 0;
  let firstAdded = 0;
  const rewritten = lines.map((line, index) => {
    if (BULLET_LINE.test(line)) return line;
    const indent = /^\s*/.exec(line)?.[0] ?? "";
    added += 2;
    if (index === 0) firstAdded = 2;
    return `${indent}- ${line.slice(indent.length)}`;
  });

  return {
    text: text.slice(0, lineStart) + rewritten.join("\n") + text.slice(lineEnd),
    selectionStart: start + firstAdded,
    selectionEnd: end + added,
  };
}

/** Retry schedule of the autosave after a failure: 1 s, 2 s, 5 s, 10 s, then every 30 s. */
export const RETRY_DELAYS_MS = [1_000, 2_000, 5_000, 10_000] as const;

/** Delay before the given retry (0 for the first retry); 30 s once the schedule is exhausted. */
export function retryDelayMs(attempt: number): number {
  return RETRY_DELAYS_MS[Math.max(0, attempt)] ?? 30_000;
}
