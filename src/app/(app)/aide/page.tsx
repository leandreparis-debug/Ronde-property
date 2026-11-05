import { BookOpen } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Galet } from "@/components/brand/Galet";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { APP_VERSION } from "@/lib/version";
import { requireUser } from "@/server/auth/session";
import { GUIDES, guidesFor } from "@/server/help/guides";

export const metadata: Metadata = {
  title: "Aide",
};

/** Help: the guides the user may read, and the version of the application. */
export default async function HelpPage() {
  const user = await requireUser();
  return (
    <>
      <PageHeader eyebrow="Aide" title="Guides de RONDE" />
      <div className="flex flex-col gap-4">
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {guidesFor(user.role).map((key) => (
            <li key={key}>
              <Card className="h-full">
                <Link
                  href={`/aide/${key}`}
                  className="flex h-full min-h-24 items-start gap-4 rounded-lg p-5 hover:bg-craie"
                  data-testid={`guide-${key}`}
                >
                  <BookOpen className="mt-1 size-6 shrink-0 text-brand" aria-hidden="true" />
                  <span className="flex flex-col gap-1">
                    <span className="font-display text-title-sm font-bold">
                      {GUIDES[key].title}
                    </span>
                    <span className="text-ui text-ink-2">{GUIDES[key].description}</span>
                  </span>
                </Link>
              </Card>
            </li>
          ))}
        </ul>
        <Card className="flex items-center gap-4 p-5">
          <Galet mood="happy" size={48} />
          <p className="text-ui">
            Une question, un blocage, une idée ? Ouvrez le menu du compte puis{" "}
            <span className="font-semibold">« Donner mon avis »</span> : chaque avis est lu pendant
            le pilote.
          </p>
        </Card>
        <p className="text-ui text-ink-2" data-testid="help-version">
          RONDE version {APP_VERSION}
        </p>
      </div>
    </>
  );
}
