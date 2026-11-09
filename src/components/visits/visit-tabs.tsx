"use client";

import { useSearchParams } from "next/navigation";
import type { ReactNode } from "react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { VISIT_TABS } from "@/lib/constants";
import { replaceQuery } from "@/lib/offline/query";

const TAB_VALUES = VISIT_TABS.map((tab) => tab.value);
type TabValue = (typeof TAB_VALUES)[number];

/** Filters of the Reserves tab dropped when leaving it (`levees` is shared with Plans). */
const RESERVE_ONLY_PARAMS = ["statut", "priorite", "retard", "tri"];

/**
 * The six visit tabs, synchronised with `?onglet=`. Every tab has content (« Rapport » since
 * step 10). Leaving a tab drops its own parameters (zone, photo,
 * filters).
 */
export function VisitTabs({
  information,
  notes,
  reserves,
  photos,
  plans,
  report,
}: {
  information: ReactNode;
  notes: ReactNode;
  reserves: ReactNode;
  photos: ReactNode;
  plans: ReactNode;
  report: ReactNode;
}) {
  const searchParams = useSearchParams();
  const requested = searchParams.get("onglet");
  const current: TabValue = TAB_VALUES.includes(requested as TabValue)
    ? (requested as TabValue)
    : "information";

  function select(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "information") params.delete("onglet");
    else params.set("onglet", value);
    if (value !== "notes" && value !== "photos") params.delete("zone");
    if (value !== "reserves") for (const key of RESERVE_ONLY_PARAMS) params.delete(key);
    if (value !== "reserves" && value !== "plans") params.delete("levees");
    if (value !== "photos") {
      for (const key of ["photo", "categorie", "legende"]) params.delete(key);
    }
    if (value === "photos") params.delete("zone");
    if (value !== "plans") {
      for (const key of ["plan", "page", "repere", "placer"]) params.delete(key);
    }
    // No server round trip: every tab reads the local store (works offline).
    replaceQuery(params);
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
          {tab.value === "information"
            ? information
            : tab.value === "notes"
              ? notes
              : tab.value === "reserves"
                ? reserves
                : tab.value === "photos"
                  ? photos
                  : tab.value === "plans"
                    ? plans
                    : report}
        </TabsContent>
      ))}
    </Tabs>
  );
}
