"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import type { PlanView } from "@/server/plans/types";

import { PlanActionsMenu } from "./plan-actions-menu";
import { PlanCard } from "./plan-card";

/**
 * « Fichiers de plans » on the site page: the imported files (archived ones last, with a
 * badge), with rename / archive / original download for rt / admin. Since step 12 b the plans
 * are imported from « Bâtiments et étages », which assigns their pages to the views.
 */
export function SitePlansSection({
  initialPlans,
  canImport,
}: {
  initialPlans: PlanView[];
  canImport: boolean;
}) {
  const router = useRouter();
  const [plans, setPlans] = useState(initialPlans);

  useEffect(() => setPlans(initialPlans), [initialPlans]);

  return (
    <Card data-testid="site-plans">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
        <CardTitle>Fichiers de plans</CardTitle>
      </CardHeader>
      <CardContent>
        {plans.length === 0 ? (
          <EmptyState
            mood="asleep"
            title="Aucun plan pour ce site"
            description={
              canImport
                ? "Importez l'export AutoCAD du site (PDF, PNG ou JPEG) pour y placer les repères des visites."
                : "Les plans du site apparaîtront ici."
            }
            className="py-6"
          />
        ) : (
          <ul className="divide-y divide-rule" aria-label="Plans du site">
            {plans.map((plan) => (
              <li key={plan.id} className="py-3" data-testid="site-plan">
                <PlanCard
                  plan={plan}
                  actions={
                    canImport ? (
                      <PlanActionsMenu
                        plan={plan}
                        onChanged={(next) => {
                          setPlans((list) =>
                            list.map((p) =>
                              p.id === next.id
                                ? { ...next, thumbUrl: next.thumbUrl ?? p.thumbUrl }
                                : p,
                            ),
                          );
                          router.refresh();
                        }}
                      />
                    ) : null
                  }
                />
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
