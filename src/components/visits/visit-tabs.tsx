"use client";

import { useSearchParams } from "next/navigation";
import type { ReactNode } from "react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LIST_SECTIONS, VISIT_SCREENS } from "@/lib/constants";
import { replaceQuery } from "@/lib/offline/query";
import {
  type ListSection,
  screenOfTab,
  tabOfScreen,
  type VisitScreen,
} from "@/lib/plans/visit-plan";

/** Filters of the Reserves section dropped when leaving it (`levees` is shared with Plan). */
const RESERVE_ONLY_PARAMS = ["statut", "priorite", "retard", "tri"];
/** Parameters of the plan screen dropped when leaving it. */
const PLAN_ONLY_PARAMS = ["plan", "page", "repere", "placer", "a-ranger"];

/**
 * The three entries of a visit (step 12 b), synchronised with `?onglet=`: « Plan » (the main
 * screen, no parameter), « Liste » with the former tabs as sections (Informations, Notes,
 * Réserves, Photos) and « Rapport ». The former links stay valid: `?onglet=plans` opens Plan,
 * `?onglet=photos` opens Liste on Photos. Leaving a section drops its own parameters.
 */
export function VisitTabs({
  plan,
  information,
  notes,
  reserves,
  photos,
  report,
  defaultScreen = "plan",
}: {
  plan: ReactNode;
  information: ReactNode;
  notes: ReactNode;
  reserves: ReactNode;
  photos: ReactNode;
  report: ReactNode;
  /** Without `?onglet=`: « Plan », or « Liste » when the site has no plan to read. */
  defaultScreen?: VisitScreen;
}) {
  const searchParams = useSearchParams();
  const requested = searchParams.get("onglet");
  const resolved = screenOfTab(requested);
  const screen: VisitScreen = requested === null ? defaultScreen : resolved.screen;
  const section: ListSection = resolved.section;

  function select(nextScreen: VisitScreen, nextSection: ListSection = section) {
    const params = new URLSearchParams(searchParams.toString());
    // « Plan » is written explicitly when it is not the default screen.
    const tab = tabOfScreen(nextScreen, nextSection) ?? (defaultScreen === "plan" ? null : "plans");
    if (tab === null) params.delete("onglet");
    else params.set("onglet", tab);
    const inList = nextScreen === "liste";
    if (!inList || (nextSection !== "notes" && nextSection !== "photos")) params.delete("zone");
    if (!inList || nextSection !== "reserves") {
      for (const key of RESERVE_ONLY_PARAMS) params.delete(key);
    }
    if (nextScreen === "rapport" || (inList && nextSection !== "reserves")) params.delete("levees");
    if (!inList || nextSection !== "photos") {
      for (const key of ["photo", "categorie", "legende"]) params.delete(key);
    }
    if (inList && nextSection === "photos") params.delete("zone");
    if (nextScreen !== "plan") for (const key of PLAN_ONLY_PARAMS) params.delete(key);
    // No server round trip: every screen reads the local store (works offline).
    replaceQuery(params);
  }

  const sections: Record<ListSection, ReactNode> = { information, notes, reserves, photos };

  return (
    <Tabs value={screen} onValueChange={(value) => select(value as VisitScreen)}>
      <TabsList aria-label="Sections de la visite">
        {VISIT_SCREENS.map((tab) => (
          <TabsTrigger key={tab.value} value={tab.value} className="min-w-24">
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>
      <TabsContent value="plan">{plan}</TabsContent>
      <TabsContent value="liste">
        <Tabs value={section} onValueChange={(value) => select("liste", value as ListSection)}>
          <TabsList aria-label="Sections de la liste" className="mt-1">
            {LIST_SECTIONS.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value}>
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
          {LIST_SECTIONS.map((tab) => (
            <TabsContent key={tab.value} value={tab.value}>
              {sections[tab.value]}
            </TabsContent>
          ))}
        </Tabs>
      </TabsContent>
      <TabsContent value="rapport">{report}</TabsContent>
    </Tabs>
  );
}
