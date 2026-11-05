import Link from "next/link";
import { Fragment, type ReactNode } from "react";

import type { Block, Inline, ListItem } from "@/lib/help/markdown";

function InlineNodes({ nodes }: { nodes: Inline[] }): ReactNode {
  return nodes.map((node, index) => {
    switch (node.type) {
      case "text":
        return <Fragment key={index}>{node.value}</Fragment>;
      case "strong":
        return (
          <strong key={index} className="font-semibold">
            <InlineNodes nodes={node.children} />
          </strong>
        );
      case "em":
        return (
          <em key={index}>
            <InlineNodes nodes={node.children} />
          </em>
        );
      case "code":
        return (
          <code key={index} className="rounded-sm bg-galet px-1.5 py-0.5 text-ui">
            {node.value}
          </code>
        );
      case "link":
        return node.href.startsWith("/") || node.href.startsWith("#") ? (
          <Link key={index} href={node.href} className="font-semibold text-brand-deep underline">
            <InlineNodes nodes={node.children} />
          </Link>
        ) : (
          <a
            key={index}
            href={node.href}
            className="font-semibold text-brand-deep underline"
            rel="noreferrer"
          >
            <InlineNodes nodes={node.children} />
          </a>
        );
      case "image":
        // eslint-disable-next-line @next/next/no-img-element -- static screenshots of the guides
        return <img key={index} src={node.src} alt={node.alt} className="inline max-h-6" />;
    }
  });
}

function ListView({ ordered, items }: { ordered: boolean; items: ListItem[] }) {
  const Tag = ordered ? "ol" : "ul";
  return (
    <Tag className={ordered ? "list-decimal space-y-1.5 pl-6" : "list-disc space-y-1.5 pl-6"}>
      {items.map((item, index) => (
        <li key={index}>
          <InlineNodes nodes={item.children} />
          {item.sublist ? (
            <div className="mt-1.5">
              <ListView ordered={item.sublist.ordered} items={item.sublist.items} />
            </div>
          ) : null}
        </li>
      ))}
    </Tag>
  );
}

/**
 * Renders a guide parsed by `parseMarkdown`, with the tokens of the design system. The first
 * level-1 heading becomes the page title; level-2 headings carry their anchor.
 */
export function MarkdownView({ blocks }: { blocks: Block[] }) {
  return (
    <div className="flex flex-col gap-4 text-body text-ink">
      {blocks.map((block, index) => {
        switch (block.type) {
          case "heading": {
            const styles = {
              1: "font-display text-title font-bold",
              2: "mt-6 scroll-mt-24 border-t border-rule pt-6 font-display text-title-sm font-bold",
              3: "mt-2 font-display text-body font-bold",
              4: "text-body font-semibold",
            } as const;
            const Tag = `h${block.level}` as "h1" | "h2" | "h3" | "h4";
            return (
              <Tag key={index} id={block.id} className={styles[block.level]}>
                <InlineNodes nodes={block.children} />
              </Tag>
            );
          }
          case "paragraph":
            return (
              <p key={index}>
                <InlineNodes nodes={block.children} />
              </p>
            );
          case "list":
            return <ListView key={index} ordered={block.ordered} items={block.items} />;
          case "quote":
            return (
              <aside
                key={index}
                className="rounded-md border-l-4 border-brand bg-brand-tint px-4 py-3"
              >
                <MarkdownView blocks={block.children} />
              </aside>
            );
          case "code":
            return (
              <pre key={index} className="overflow-x-auto rounded-md bg-craie p-3 text-ui">
                <code>{block.value}</code>
              </pre>
            );
          case "table":
            return (
              <div key={index} className="overflow-x-auto">
                <table className="w-full border-collapse text-ui">
                  <thead>
                    <tr className="border-b border-rule text-left">
                      {block.header.map((cell, cellIndex) => (
                        <th key={cellIndex} scope="col" className="px-3 py-2 font-semibold">
                          <InlineNodes nodes={cell} />
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {block.rows.map((row, rowIndex) => (
                      <tr key={rowIndex} className="border-b border-rule align-top">
                        {row.map((cell, cellIndex) => (
                          <td key={cellIndex} className="px-3 py-2">
                            <InlineNodes nodes={cell} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          case "image":
            return (
              <figure key={index} className="flex flex-col gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element -- static screenshots of the guides */}
                <img
                  src={block.src}
                  alt={block.alt}
                  loading="lazy"
                  className="w-full max-w-xl rounded-lg border border-rule bg-paper"
                />
                <figcaption className="text-ui text-ink-2">{block.alt}</figcaption>
              </figure>
            );
        }
      })}
    </div>
  );
}
