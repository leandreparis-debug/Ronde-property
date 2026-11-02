import { cn } from "@/lib/cn";
import type { NoteBlock } from "@/lib/notes/format";

/**
 * Formatted note, as in the report: paragraphs and bullet lists from `parseNoteContent`.
 * Plain text only: nothing is interpreted as HTML.
 */
export function NoteContent({ blocks, className }: { blocks: NoteBlock[]; className?: string }) {
  if (blocks.length === 0) return null;
  return (
    <div className={cn("flex flex-col gap-3 text-body text-ink", className)}>
      {blocks.map((block, index) =>
        block.type === "paragraph" ? (
          <p key={index} className="whitespace-pre-wrap">
            {block.text}
          </p>
        ) : (
          <ul key={index} className="list-disc space-y-1 pl-6 marker:text-brand">
            {block.items.map((item, itemIndex) => (
              <li key={itemIndex}>{item}</li>
            ))}
          </ul>
        ),
      )}
    </div>
  );
}
