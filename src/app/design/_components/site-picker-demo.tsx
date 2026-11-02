"use client";

import { useState } from "react";

import { SitePicker } from "@/components/sites/site-picker";
import type { SiteOption } from "@/server/actions/site-actions";

/** Fictitious sites for the design page (no server call). */
const DEMO_SITES: SiteOption[] = [
  {
    id: "demo-1",
    warehouseCode: "LOG-118",
    name: "Entrepôt de Saint-Quentin-Fallavier (fictif)",
    city: "Saint-Quentin-Fallavier",
  },
  { id: "demo-2", warehouseCode: "LOG-204", name: "Plateforme de Nîmes (fictif)", city: "Nîmes" },
  {
    id: "demo-3",
    warehouseCode: "LOG-310",
    name: "Entrepôt de Lille Lesquin (fictif)",
    city: "Lesquin",
  },
  {
    id: "demo-4",
    warehouseCode: "LOG-415",
    name: "Entrepôt de Bordeaux Nord (fictif)",
    city: "Bordeaux",
  },
];

function normalize(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

async function searchDemo(query: string): Promise<SiteOption[]> {
  await new Promise((resolve) => setTimeout(resolve, 150));
  const q = normalize(query.trim());
  return DEMO_SITES.filter(
    (site) => !q || normalize(`${site.warehouseCode} ${site.name} ${site.city ?? ""}`).includes(q),
  );
}

/** SitePicker bound to static fictitious data. */
export function SitePickerDemo() {
  const [selected, setSelected] = useState<SiteOption | null>(null);
  return (
    <div className="flex max-w-lg flex-col gap-3">
      <SitePicker
        search={searchDemo}
        value={selected}
        onChange={setSelected}
        label="Site de la visite"
        required
      />
      <p className="text-ui text-ink-2" aria-live="polite" data-testid="site-picker-value">
        {selected ? `Sélection : ${selected.warehouseCode}` : "Aucun site sélectionné."}
      </p>
    </div>
  );
}
