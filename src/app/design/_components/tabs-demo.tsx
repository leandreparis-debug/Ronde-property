"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { VISIT_TABS } from "@/lib/constants";

/** The six tabs of a visit, scrollable when the width is short. */
export function VisitTabsDemo() {
  return (
    <Tabs defaultValue="information" className="w-full">
      <TabsList aria-label="Sections de la visite">
        {VISIT_TABS.map((tab) => (
          <TabsTrigger key={tab.value} value={tab.value}>
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {VISIT_TABS.map((tab) => (
        <TabsContent key={tab.value} value={tab.value}>
          <p className="text-body text-ink-2">Contenu de l&apos;onglet « {tab.label} ».</p>
        </TabsContent>
      ))}
    </Tabs>
  );
}
