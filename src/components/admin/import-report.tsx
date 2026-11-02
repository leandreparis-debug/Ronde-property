import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { formatNumber } from "@/lib/format";
import type { ImportReport as Report } from "@/server/sites/import";
import type { FieldValue, PlannedChange } from "@/server/sites/import/types";

const FIELD_LABELS: Record<string, string> = {
  warehouse_code: "Code entrepôt",
  name: "Nom",
  address: "Adresse",
  postal_code: "Code postal",
  city: "Ville",
  surface_m2: "Surface (m²)",
  category: "Catégorie",
  latitude: "Latitude",
  longitude: "Longitude",
  is_active: "Actif",
};

const ENCODING_LABELS: Record<Report["encoding"], string> = {
  "utf-8": "UTF-8",
  "utf-8-bom": "UTF-8 (avec BOM)",
  "windows-1252": "Windows-1252 (Excel)",
};

function formatValue(value: FieldValue): string {
  if (value === null || value === undefined) return "(vide)";
  if (typeof value === "boolean") return value ? "oui" : "non";
  if (typeof value === "number") return formatNumber(value, 2);
  return value;
}

function Counter({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: number;
  tone?: "neutral" | "brand" | "alert";
}) {
  return (
    <Card className="flex flex-col gap-1 p-4">
      <span className="label-caps text-ink-2">{label}</span>
      <span
        className={
          tone === "alert" && value > 0
            ? "font-display text-title text-status-open"
            : "font-display text-title text-ink"
        }
        data-testid={`counter-${label}`}
      >
        {value}
      </span>
    </Card>
  );
}

function ChangesList({ title, changes }: { title: string; changes: PlannedChange[] }) {
  if (changes.length === 0) return null;
  return (
    <details className="group rounded-lg border border-rule bg-paper">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 py-2 text-ui font-semibold">
        {title} ({changes.length})<span className="text-ink-2 group-open:hidden">Afficher</span>
        <span className="hidden text-ink-2 group-open:inline">Masquer</span>
      </summary>
      <ul className="divide-y divide-rule border-t border-rule">
        {changes.map((change) => (
          <li
            key={`${change.siteId}-${change.line}`}
            className="flex flex-col gap-1 px-4 py-3 text-ui"
          >
            <p>
              <Badge variant="brand">{change.warehouseCode}</Badge>{" "}
              <span className="font-semibold">{change.name}</span>{" "}
              <span className="text-ink-2">ligne {change.line}</span>
            </p>
            <ul className="flex flex-col gap-0.5 text-ink-2">
              {Object.entries(change.diff).map(([field, delta]) => (
                <li key={field}>
                  {FIELD_LABELS[field] ?? field} : {formatValue(delta.old)} →{" "}
                  <span className="text-ink">{formatValue(delta.new)}</span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </details>
  );
}

/** Simulation or application report: counters, detected format, details and rejects. */
export function ImportReport({ report }: { report: Report }) {
  const { plan } = report;
  return (
    <div className="flex flex-col gap-6" data-testid="import-report">
      <section aria-labelledby="counters-title" className="flex flex-col gap-3">
        <h2 id="counters-title" className="font-display text-title-sm">
          {report.mode === "simulate" ? "Résultat de la simulation" : "Import appliqué"}
        </h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          <Counter label="Créations" value={plan.counts.create} tone="brand" />
          <Counter label="Mises à jour" value={plan.counts.update} />
          <Counter label="Inchangés" value={plan.counts.unchanged} />
          <Counter label="Réactivations" value={plan.counts.reactivate} />
          <Counter label="Désactivations" value={plan.counts.deactivate} tone="alert" />
          <Counter label="Rejets" value={plan.counts.reject} tone="alert" />
        </div>
        {plan.counts.reject > 0 ? (
          <p className="text-ui text-ink-2">
            Les {plan.counts.reject} ligne{plan.counts.reject > 1 ? "s" : ""} rejetée
            {plan.counts.reject > 1 ? "s" : ""} n&apos;empêchent pas d&apos;appliquer le reste du
            fichier.
          </p>
        ) : null}
        {plan.keptEmptyValues > 0 && !report.options.emptyClearsValue ? (
          <p className="text-ui text-ink-2">
            {plan.keptEmptyValues} valeur{plan.keptEmptyValues > 1 ? "s" : ""} vide
            {plan.keptEmptyValues > 1 ? "s" : ""} dans le fichier
            {plan.keptEmptyValues > 1 ? " ont été ignorées" : " a été ignorée"} : les valeurs
            existantes sont conservées.
          </p>
        ) : null}
      </section>

      {plan.guard.requiresConfirmation ? (
        <Card
          className="border-status-open bg-status-open-bg p-4 text-ui text-status-open"
          role="status"
          data-testid="mass-deactivation-guard"
        >
          <p className="font-semibold">Désactivation massive</p>
          <p>
            Ce fichier désactiverait {plan.guard.deactivationsByAbsence} des{" "}
            {plan.guard.activeSites} sites actifs ({Math.round(plan.guard.ratio * 100)} %).
            L&apos;application exige une confirmation explicite.
          </p>
        </Card>
      ) : null}

      <section aria-labelledby="format-title" className="flex flex-col gap-2 text-ui">
        <h2 id="format-title" className="font-display text-title-sm">
          Fichier
        </h2>
        <p>
          <span className="font-semibold">{report.fileName}</span> · {report.totalLines} ligne
          {report.totalLines > 1 ? "s" : ""} · {ENCODING_LABELS[report.encoding]} · séparateur «{" "}
          {report.delimiter === "\t" ? "tabulation" : report.delimiter} »
        </p>
        <p>
          Colonnes reconnues :{" "}
          {report.recognizedColumns.map((column) => (
            <span key={column.header} className="mr-1 inline-block">
              <Badge variant="brand">{column.header}</Badge>{" "}
              <span className="text-ink-2">→ {FIELD_LABELS[column.field]}</span>
            </span>
          ))}
        </p>
        {report.ignoredColumns.length > 0 ? (
          <p>
            Colonnes ignorées :{" "}
            {report.ignoredColumns.map((header) => (
              <Badge key={header} className="mr-1">
                {header}
              </Badge>
            ))}
          </p>
        ) : null}
        <p className="text-ink-2">Empreinte SHA-256 : {report.sha256.slice(0, 16)}…</p>
      </section>

      <section aria-labelledby="details-title" className="flex flex-col gap-3">
        <h2 id="details-title" className="font-display text-title-sm">
          Détail
        </h2>
        {plan.creates.length > 0 ? (
          <details className="group rounded-lg border border-rule bg-paper">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 py-2 text-ui font-semibold">
              Créations ({plan.creates.length})
              <span className="text-ink-2 group-open:hidden">Afficher</span>
              <span className="hidden text-ink-2 group-open:inline">Masquer</span>
            </summary>
            <ul className="divide-y divide-rule border-t border-rule">
              {plan.creates.map(({ row }) => (
                <li key={row.warehouseCode} className="px-4 py-3 text-ui">
                  <Badge variant="brand">{row.warehouseCode}</Badge>{" "}
                  <span className="font-semibold">{row.name}</span>
                  <span className="text-ink-2">
                    {row.city ? ` · ${row.city}` : ""} · ligne {row.line}
                    {row.isActive === false ? " · créé inactif" : ""}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        ) : null}
        <ChangesList title="Mises à jour" changes={plan.updates} />
        <ChangesList title="Réactivations" changes={plan.reactivates} />
        {plan.deactivates.length > 0 ? (
          <details className="group rounded-lg border border-rule bg-paper">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 py-2 text-ui font-semibold">
              Désactivations ({plan.deactivates.length})
              <span className="text-ink-2 group-open:hidden">Afficher</span>
              <span className="hidden text-ink-2 group-open:inline">Masquer</span>
            </summary>
            <ul className="divide-y divide-rule border-t border-rule">
              {plan.deactivates.map((item) => (
                <li key={item.siteId} className="px-4 py-3 text-ui">
                  <Badge variant="brand">{item.warehouseCode}</Badge>{" "}
                  <span className="font-semibold">{item.name}</span>{" "}
                  <span className="text-ink-2">
                    {item.reason === "absent"
                      ? "absent du fichier"
                      : `marqué inactif (ligne ${item.line})`}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        ) : null}
        {plan.unchanged.length > 0 ? (
          <details className="group rounded-lg border border-rule bg-paper">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 py-2 text-ui font-semibold">
              Inchangés ({plan.unchanged.length})
              <span className="text-ink-2 group-open:hidden">Afficher</span>
              <span className="hidden text-ink-2 group-open:inline">Masquer</span>
            </summary>
            <ul className="divide-y divide-rule border-t border-rule">
              {plan.unchanged.map((item) => (
                <li key={item.warehouseCode} className="px-4 py-3 text-ui">
                  <Badge variant="brand">{item.warehouseCode}</Badge> {item.name}{" "}
                  <span className="text-ink-2">· ligne {item.line}</span>
                </li>
              ))}
            </ul>
          </details>
        ) : null}
        {plan.rejects.length > 0 ? (
          <details className="group rounded-lg border border-status-open bg-paper" open>
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 py-2 text-ui font-semibold text-status-open">
              Rejets ({plan.rejects.length})
              <span className="text-ink-2 group-open:hidden">Afficher</span>
              <span className="hidden text-ink-2 group-open:inline">Masquer</span>
            </summary>
            <table className="w-full border-t border-rule text-ui">
              <thead>
                <tr className="text-left">
                  <th scope="col" className="px-4 py-2 label-caps text-ink-2">
                    Ligne
                  </th>
                  <th scope="col" className="px-4 py-2 label-caps text-ink-2">
                    Code
                  </th>
                  <th scope="col" className="px-4 py-2 label-caps text-ink-2">
                    Motif
                  </th>
                </tr>
              </thead>
              <tbody>
                {plan.rejects.map((reject, index) => (
                  <tr
                    key={`${reject.line}-${index}`}
                    className="border-t border-rule"
                    data-testid="reject-row"
                  >
                    <td className="px-4 py-2 whitespace-nowrap">{reject.line}</td>
                    <td className="px-4 py-2">{reject.code ?? "(vide)"}</td>
                    <td className="px-4 py-2">{reject.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        ) : null}
      </section>
    </div>
  );
}
