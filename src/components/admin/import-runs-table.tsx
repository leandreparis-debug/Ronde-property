import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDateTime } from "@/lib/format";
import type { ImportRun } from "@/server/services/site-imports";

/** Past imports with their counters and expandable rejects. */
export function ImportRunsTable({ runs }: { runs: ImportRun[] }) {
  if (runs.length === 0) {
    return (
      <EmptyState
        title="Aucun import"
        description="Les simulations et les imports appliqués apparaîtront ici."
      />
    );
  }
  return (
    <Card>
      <ol className="divide-y divide-rule">
        {runs.map((run) => (
          <li
            key={run.id}
            className="px-4 py-3 md:px-5"
            data-testid="import-run"
            data-mode={run.mode}
          >
            <details className="group">
              <summary className="flex min-h-11 cursor-pointer list-none flex-col gap-1 md:flex-row md:items-center md:gap-4">
                <span className="w-40 shrink-0 text-ui text-ink-2">
                  {formatDateTime(run.createdAt)}
                </span>
                <span className="w-36 shrink-0 truncate text-ui font-semibold">
                  {run.performedBy ?? "Système"}
                </span>
                <span className="shrink-0">
                  <Badge variant={run.mode === "apply" ? "brand" : "neutral"}>
                    {run.mode === "apply" ? "Appliqué" : "Simulation"}
                  </Badge>
                </span>
                <span className="min-w-0 flex-1 truncate text-ui">{run.fileName}</span>
                <span className="text-ui text-ink-2">
                  {run.rowsTotal} lignes · {run.rowsCreated} créés · {run.rowsUpdated} mis à jour ·{" "}
                  {run.rowsDeactivated} désactivés · {run.rowsRejected} rejetés
                </span>
              </summary>
              <div className="mt-2 flex flex-col gap-2 rounded-md bg-craie p-3 text-ui">
                <p className="text-ink-2">
                  Empreinte : {run.fileSha256 ?? "—"} · Options :{" "}
                  {run.options.fullReferential ? "référentiel complet" : "fichier partiel"},{" "}
                  {run.options.emptyClearsValue ? "les vides effacent" : "les vides conservent"}
                </p>
                {run.errors.length > 0 ? (
                  <ul className="flex flex-col gap-0.5">
                    {run.errors.map((error, index) => (
                      <li key={index}>
                        Ligne {error.line}
                        {error.code ? ` (${error.code})` : ""} : {error.message}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>Aucun rejet.</p>
                )}
              </div>
            </details>
          </li>
        ))}
      </ol>
    </Card>
  );
}
