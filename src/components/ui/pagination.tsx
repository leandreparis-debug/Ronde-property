import Link from "next/link";

import { Button } from "./button";

export interface PaginationProps {
  page: number;
  pageCount: number;
  total: number;
  /** Builds the URL of a page. */
  href: (page: number) => string;
  /** Singular and plural nouns for the total (« site », « sites »). */
  noun: [string, string];
}

/** Previous / next links with a « Page x sur y · n éléments » summary. */
export function Pagination({ page, pageCount, total, href, noun }: PaginationProps) {
  const label = total <= 1 ? noun[0] : noun[1];
  return (
    <nav className="flex items-center justify-between gap-3" aria-label="Pagination">
      <p className="text-ui text-ink-2">
        Page {page} sur {pageCount} · {total} {label}
      </p>
      <div className="flex gap-2">
        {page > 1 ? (
          <Button asChild variant="secondary">
            <Link href={href(page - 1)}>Précédente</Link>
          </Button>
        ) : null}
        {page < pageCount ? (
          <Button asChild variant="secondary">
            <Link href={href(page + 1)}>Suivante</Link>
          </Button>
        ) : null}
      </div>
    </nav>
  );
}
