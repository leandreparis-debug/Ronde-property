/**
 * Reference data for the design page. The values mirror `globals.css`; the page
 * displays them as text next to the live swatch so drift is visible at a glance.
 */
export interface ColorToken {
  name: string;
  value: string;
  usage: string;
  /** Tailwind class that paints the live swatch. */
  swatch: string;
  /** Text colour to use on top of the swatch, for the status pairs. */
  onSwatch?: string;
}

export const BRAND_TOKENS: ColorToken[] = [
  {
    name: "brand",
    value: "#2F6AFF",
    usage: "Mascotte, action principale, onglet actif",
    swatch: "bg-brand",
  },
  {
    name: "brand-deep",
    value: "#1B45C9",
    usage: "Texte sur brand-soft, survol / appui",
    swatch: "bg-brand-deep",
  },
  {
    name: "brand-soft",
    value: "#E7EEFF",
    usage: "Pastilles et fonds légers de marque",
    swatch: "bg-brand-soft",
  },
  {
    name: "brand-tint",
    value: "#F4F7FF",
    usage: "Grands fonds de marque (bandeaux, plan)",
    swatch: "bg-brand-tint",
  },
  { name: "on-brand", value: "#FFFFFF", usage: "Texte sur brand", swatch: "bg-on-brand" },
];

export const NEUTRAL_TOKENS: ColorToken[] = [
  { name: "ink", value: "#121317", usage: "Texte principal (« basalte »)", swatch: "bg-ink" },
  { name: "ink-2", value: "#5C606B", usage: "Texte secondaire", swatch: "bg-ink-2" },
  { name: "paper", value: "#FFFFFF", usage: "Cartes, panneaux", swatch: "bg-paper" },
  { name: "craie", value: "#F6F6F4", usage: "Fond de l'application", swatch: "bg-craie" },
  { name: "galet", value: "#E9E9E6", usage: "Pastilles neutres, compteurs", swatch: "bg-galet" },
  { name: "rule", value: "#E4E4E0", usage: "Bordures, séparateurs", swatch: "bg-rule" },
];

export const STATUS_TOKENS: ColorToken[] = [
  {
    name: "status-open / status-open-bg",
    value: "#C0341F / #FDE4DE (point #D63A22)",
    usage: "Réserve ouverte, retard",
    swatch: "bg-status-open-bg",
    onSwatch: "text-status-open",
  },
  {
    name: "status-progress / status-progress-bg",
    value: "#8F6200 / #FFF0C7 (point #E8A400)",
    usage: "Réserve en cours",
    swatch: "bg-status-progress-bg",
    onSwatch: "text-status-progress",
  },
  {
    name: "status-done / status-done-bg",
    value: "#23704A / #DCF0E3",
    usage: "Réserve levée",
    swatch: "bg-status-done-bg",
    onSwatch: "text-status-done",
  },
];

export const RADIUS_TOKENS = [
  { name: "radius-sm", value: "12px", usage: "Petits éléments", className: "rounded-sm" },
  { name: "radius-md", value: "14px", usage: "Boutons, champs", className: "rounded-md" },
  { name: "radius-lg", value: "20px", usage: "Panneaux", className: "rounded-lg" },
  { name: "radius-xl", value: "24px", usage: "Cartes de section", className: "rounded-xl" },
  { name: "radius-pill", value: "999px", usage: "Pastilles", className: "rounded-pill" },
] as const;

export const TYPE_SCALE = [
  {
    name: "label",
    size: "12 px",
    usage: "Libellés en majuscules, letter-spacing 0,08em",
    className: "label-caps",
    sample: "Priorité haute",
  },
  { name: "ui", size: "14 px", usage: "Interface", className: "text-ui", sample: "Mes visites" },
  {
    name: "body",
    size: "16 px",
    usage: "Texte des notes",
    className: "text-body",
    sample: "Quai 14 : butoir gauche arraché.",
  },
  {
    name: "title-sm",
    size: "20 px",
    usage: "Titres de section (Bricolage)",
    className: "font-display text-title-sm",
    sample: "Réserves",
  },
  {
    name: "title",
    size: "28 px",
    usage: "Titres de page (Bricolage)",
    className: "font-display text-title",
    sample: "Mes visites",
  },
  {
    name: "display",
    size: "40 px",
    usage: "Grands titres (Bricolage)",
    className: "font-display text-display",
    sample: "ronde",
  },
] as const;
