"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { VISIT_SCREENS } from "@/lib/constants";

/** The three entries of a visit (Plan, Liste, Rapport), scrollable when the width is short. */
export function VisitTabsDemo() {
  return (
    <Tabs defaultValue="plan" className="w-full">
      <TabsList aria-label="Sections de la visite">
        {VISIT_SCREENS.map((tab) => (
          <TabsTrigger key={tab.value} value={tab.value}>
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {VISIT_SCREENS.map((tab) => (
        <TabsContent key={tab.value} value={tab.value}>
          <p className="text-body text-ink-2">Contenu de l&apos;onglet « {tab.label} ».</p>
        </TabsContent>
      ))}
    </Tabs>
  );
}
