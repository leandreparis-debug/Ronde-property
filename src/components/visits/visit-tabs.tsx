"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";

import { EmptyState } from "@/components/ui/empty-state";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { VISIT_TABS } from "@/lib/constants";

const TAB_VALUES = VISIT_TABS.map((tab) => tab.value);
type TabValue = (typeof TAB_VALUES)[number];

/** The six visit tabs, synchronised with `?onglet=`. « Informations » and « Notes » have content. */
export function VisitTabs({ information, notes }: { information: ReactNode; notes: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const requested = searchParams.get("onglet");
  const current: TabValue = TAB_VALUES.includes(requested as TabValue)
    ? (requested as TabValue)
    : "information";

  function select(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "information") params.delete("onglet");
    else params.set("onglet", value);
    if (value !== "notes") params.delete("zone");
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  return (
    <Tabs value={current} onValueChange={select}>
      <TabsList aria-label="Sections de la visite">
        {VISIT_TABS.map((tab) => (
          <TabsTrigger key={tab.value} value={tab.value}>
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {VISIT_TABS.map((tab) => (
        <TabsContent key={tab.value} value={tab.value}>
          {tab.value === "information" ? (
            information
          ) : tab.value === "notes" ? (
            notes
          ) : (
            <EmptyState
              mood="asleep"
              title="Cette section arrive bientôt"
              description={`L'onglet « ${tab.label} » sera disponible prochainement.`}
            />
          )}
        </TabsContent>
      ))}
    </Tabs>
  );
}
