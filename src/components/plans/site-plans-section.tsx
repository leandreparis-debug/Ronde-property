"use client";

import { FileUp } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import type { PlanView } from "@/server/plans/types";

import { ImportPlanDialog } from "./import-plan-dialog";
import { PlanActionsMenu } from "./plan-actions-menu";
import { PlanCard } from "./plan-card";

/**
 * « Plans » section of the site page: plans of the site (archived ones last, with a badge),
 * « Importer un plan » and the rename / archive actions for rt / admin.
 */
export function SitePlansSection({
  siteId,
  initialPlans,
  canImport,
}: {
  siteId: string;
  initialPlans: PlanView[];
  canImport: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [plans, setPlans] = useState(initialPlans);
  const [importing, setImporting] = useState(false);

  useEffect(() => setPlans(initialPlans), [initialPlans]);

  return (
    <Card data-testid="site-plans">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
        <CardTitle>Plans</CardTitle>
        {canImport ? (
          <Button
            type="button"
            variant="secondary"
            onClick={() => setImporting(true)}
            data-testid="open-plan-import"
          >
            <FileUp className="size-5" aria-hidden="true" />
            Importer un plan
          </Button>
        ) : null}
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
      {canImport ? (
        <ImportPlanDialog
          siteId={siteId}
          open={importing}
          onOpenChange={setImporting}
          onImported={(plan) => {
            setPlans((list) => [...list, plan]);
            toast({ variant: "success", title: `Plan « ${plan.name} » importé` });
            router.refresh();
          }}
        />
      ) : null}
    </Card>
  );
}
