import type { Metadata } from "next";
import Link from "next/link";
import { forbidden, notFound } from "next/navigation";

import { MarkdownView } from "@/components/help/markdown-view";
import { parseMarkdown } from "@/lib/help/markdown";
import { APP_VERSION } from "@/lib/version";
import { requireUser } from "@/server/auth/session";
import {
  GUIDES,
  type GuideKey,
  guidesFor,
  readGuide,
  resolveGuideImage,
} from "@/server/help/guides";

type Params = Promise<{ guide: string }>;

function isGuide(value: string): value is GuideKey {
  return Object.hasOwn(GUIDES, value);
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { guide } = await params;
  return { title: isGuide(guide) ? GUIDES[guide].title : "Aide" };
}

/** One guide, rendered from docs/guide-*.md. The admin guide is for admins only. */
export default async function GuidePage({ params }: { params: Params }) {
  const user = await requireUser();
  const { guide } = await params;
  if (!isGuide(guide)) notFound();
  if (!guidesFor(user.role).includes(guide)) forbidden();
  const blocks = parseMarkdown(await readGuide(guide), resolveGuideImage);
  return (
    <article className="mx-auto flex max-w-3xl flex-col gap-6 py-6" data-testid="guide">
      <nav aria-label="Fil d'Ariane" className="text-ui">
        <Link href="/aide" className="font-semibold text-brand-deep underline">
          Aide
        </Link>
        <span className="text-ink-2"> › {GUIDES[guide].title}</span>
      </nav>
      <MarkdownView blocks={blocks} />
      <p className="text-ui text-ink-2">RONDE version {APP_VERSION}</p>
    </article>
  );
}
