import { formatDate, TIME_ZONE } from "@/lib/format";
import { isZoneFilled, type NoteBlock, parseNoteContent } from "@/lib/notes/format";
import { overdueLabel } from "@/lib/reserves/dates";
import { sortReserves } from "@/lib/reserves/list";
import {
  RESERVE_PRIORITY_LABELS,
  RESERVE_STATUS_LABELS,
  type ReservePriority,
  type ReserveStatus,
  VISIT_REASON_LABELS,
} from "@/server/domain/enums";

import { chunk } from "./layout";
import type { ReportOptions } from "./options";
import type { ReportData, ReportImage, ReportPhotoData, ReportReserveData } from "./types";

/*
 * buildReportModel: a pure function from the frozen data, the options and the generation time
 * to everything the PDF prints. The PDF components only display this model, so two renders of
 * the same model give the same document.
 */

/** A numbered photo of the report. */
export interface ReportFigure {
  number: number;
  label: string;
  photoId: string;
  image: ReportImage;
  caption: string;
  zoneLabel: string | null;
}

/** One line of the reserves table. */
export interface ReserveRow {
  id: string;
  code: string;
  zoneLabel: string;
  action: string;
  priority: ReservePriority;
  priorityLabel: string;
  responsible: string;
  dueLabel: string;
  status: ReserveStatus;
  statusLabel: string;
  isOverdue: boolean;
  overdueLabel: string | null;
  isDone: boolean;
  /** « Fig. 12, 13 » when its photos are printed. */
  figureRef: string | null;
  /** « Plan A, R-07 » when it is placed on a printed plan. */
  planRef: string | null;
}

/** Short reminder of a reserve inside a zone section. */
export interface ZoneReserveReminder {
  code: string;
  action: string;
  statusLabel: string;
  isOverdue: boolean;
  isDone: boolean;
}

/** A zone section of « Notes par zone ». */
export interface ZoneSection {
  key: string;
  title: string;
  blocks: NoteBlock[];
  reserves: ZoneReserveReminder[];
  /** Photos grouped by page (2, 4 or 6 per page). */
  photoPages: ReportFigure[][];
}

/** A marker drawn on a plan page. */
export interface PlanMarkerItem {
  kind: "photo" | "reserve";
  /** « 3 » or « R-07 ». */
  label: string;
  x: number;
  y: number;
  hasPhoto: boolean;
  reserveStatus: ReserveStatus | null;
  isOverdue: boolean;
}

/** One printed page of a plan. */
export interface PlanPageSection {
  planId: string;
  /** « Plan A ». */
  title: string;
  planName: string;
  isArchived: boolean;
  pageNumber: number;
  pageCount: number;
  image: ReportImage;
  markers: PlanMarkerItem[];
  legend: Array<{ label: string; kind: "photo" | "reserve"; text: string; ref: string | null }>;
}

/** Everything the PDF prints. */
export interface ReportModel {
  meta: {
    title: string;
    author: string;
    subject: string;
    keywords: string;
    creator: "RONDE";
    producer: "RONDE";
    language: "fr-FR";
    fileName: string;
  };
  isDraft: boolean;
  cover: {
    title: string;
    siteCode: string;
    siteName: string;
    addressLines: string[];
    visitDateLabel: string;
    reasonLabel: string;
    writerName: string | null;
    photo: ReportImage | null;
    counters: { open: number; overdue: number; done: number };
  };
  footer: { left: string; generated: string };
  summary: {
    participants: Array<{ name: string; company: string; role: string; presence: string }>;
    info: Array<{ label: string; value: string }>;
    keyPoints: Array<{ code: string; text: string; tag: string }>;
    keyPointsMore: number;
    zones: Array<{ label: string; filled: boolean }>;
  } | null;
  reserves: { rows: ReserveRow[]; includeDone: boolean; hiddenDone: number } | null;
  zones: ZoneSection[];
  plans: PlanPageSection[];
  annex: { photoPages: ReportFigure[][] } | null;
  figures: ReportFigure[];
  photosPerPage: 2 | 4 | 6;
  quality: ReportOptions["quality"];
  /** Image URLs to load, without duplicates (photos then plan pages). */
  images: string[];
}

/** Characters missing from the report fonts, replaced so that nothing prints as a blank box. */
const REPLACEMENTS: Record<string, string> = {
  "≥": ">=",
  "≤": "<=",
  "²": "2",
  "³": "3",
  "½": "1/2",
  "¼": "1/4",
  "¾": "3/4",
  "✓": "OK",
  "✔": "OK",
  "✗": "x",
  "✘": "x",
  ﬁ: "fi",
  ﬂ: "fl",
};
const PICTOGRAPHIC =
  /[\p{Extended_Pictographic}\p{Emoji_Modifier}\u{1F1E6}-\u{1F1FF}\u{E0020}-\u{E007F}\u{FE0F}\u{FE0E}\u{200D}\u{20E3}]/gu;

/**
 * Text safe for the PDF fonts: NFC, a few symbols spelt out (« ≥ » → « >= »), emoji and other
 * pictograms removed, repeated spaces collapsed. Accents, « œ » and « € » are kept.
 */
export function pdfText(value: string | null | undefined): string {
  if (!value) return "";
  let text = value.normalize("NFC").replace(PICTOGRAPHIC, "");
  for (const [from, to] of Object.entries(REPLACEMENTS)) text = text.split(from).join(to);
  return text.replace(/[ \t]{2,}/g, " ").trim();
}

/** Civil date (YYYY-MM-DD) or instant as « 5 novembre 2026 », Europe/Paris. */
export function reportDate(value: string | Date): string {
  const date =
    typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? new Date(`${value}T12:00:00Z`)
      : new Date(value);
  return formatDate(date, "long");
}

/** « 5 novembre 2026 à 14:32 », Europe/Paris. */
export function reportDateTime(value: Date): string {
  const time = new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: TIME_ZONE,
  }).format(value);
  return `${reportDate(value)} à ${time}`;
}

/**
 * File name of a report: `RONDE_{code site}_{AAAA-MM-JJ}_{n}.pdf`. Mirrors the database
 * function `private.report_file_name` (migration 17).
 */
export function reportFileName(siteCode: string, visitDate: string, reportNumber: number): string {
  return `RONDE_${siteCode.replace(/[^A-Za-z0-9-]/g, "-")}_${visitDate}_${reportNumber}.pdf`;
}

/** Plan letters: A, B, …, Z, AA, AB… */
export function planLetter(index: number): string {
  let value = index + 1;
  let letters = "";
  while (value > 0) {
    const rest = (value - 1) % 26;
    letters = String.fromCharCode(65 + rest) + letters;
    value = Math.floor((value - 1) / 26);
  }
  return letters;
}

/** « Nom · Entreprise », « À désigner ». Never an e-mail. */
function responsibleText(reserve: ReportReserveData): string {
  const parts = [pdfText(reserve.responsibleName), pdfText(reserve.responsibleCompany)].filter(
    (part) => part !== "",
  );
  return parts.length > 0 ? parts.join(" · ") : "À désigner";
}

const KEY_POINTS_MAX = 8;

/**
 * Builds the printed model of a report from the frozen data, the options and the generation
 * time (Europe/Paris). Pure: no I/O, no clock, no randomness.
 *
 * - Sections left out by the options, or without content, are not printed — except the
 *   reserves, which say « Aucune réserve relevée lors de cette visite ».
 * - Reserves: overdue first, then priority, then due date; done ones only when asked, dimmed.
 * - Notes: `parseNoteContent`, one section per zone with notes, reserves or photos, plus a
 *   « Hors zone » section for the photos and reserves without a zone that belong to a reserve
 *   or a marker.
 * - Figures are numbered in print order (zones, then annex); the annex holds the photos
 *   linked to no zone, reserve or marker.
 * - No e-mail address ever reaches the model.
 */
export function buildReportModel(dto: ReportData, options: ReportOptions, now: Date): ReportModel {
  const sections = new Set(options.sections);
  const zoneLabels = new Map(dto.zones.map((zone) => [zone.key, pdfText(zone.label)]));
  const zoneLabel = (key: string | null) => (key ? (zoneLabels.get(key) ?? key) : null);
  const visit = dto.visit;
  const site = visit.site;
  const visitDateLabel = reportDate(visit.visitDate);
  const fileName = reportFileName(site.code, visit.visitDate, dto.report.number);

  // ---- Reserves ------------------------------------------------------------------------
  const allReserves = sortReserves(
    dto.reserves.map((reserve) => ({ ...reserve, zoneLabel: zoneLabel(reserve.zoneKey) })),
  );
  const counters = {
    open: allReserves.filter((r) => r.status !== "done").length,
    overdue: allReserves.filter((r) => r.isOverdue).length,
    done: allReserves.filter((r) => r.status === "done").length,
  };
  const printedReserves = allReserves.filter(
    (reserve) => options.includeDoneReserves || reserve.status !== "done",
  );
  const reserveById = new Map(dto.reserves.map((reserve) => [reserve.id, reserve]));

  // ---- Photos: where each one is printed --------------------------------------------------
  const photos = [...dto.photos].sort(
    (a, b) =>
      a.sortOrder - b.sortOrder ||
      a.createdAt.localeCompare(b.createdAt) ||
      a.id.localeCompare(b.id),
  );
  const notesOn = sections.has("notes");
  const zoneKeys = new Set(dto.zones.map((zone) => zone.key));
  const photoHome = new Map<string, string>(); // photo id → zone key, "" (hors zone) or "annex"
  for (const photo of photos) {
    const linkedReserves = photo.reserveIds
      .map((id) => reserveById.get(id))
      .filter((reserve): reserve is ReportReserveData => Boolean(reserve));
    if (photo.zoneKey && zoneKeys.has(photo.zoneKey)) {
      photoHome.set(photo.id, photo.zoneKey);
    } else if (linkedReserves.length > 0 || photo.markerIds.length > 0) {
      const reserveZone = linkedReserves.find((r) => r.zoneKey && zoneKeys.has(r.zoneKey))?.zoneKey;
      photoHome.set(photo.id, reserveZone ?? "");
    } else {
      photoHome.set(photo.id, "annex");
    }
  }

  // ---- Zone sections ------------------------------------------------------------------------
  const figures: ReportFigure[] = [];
  const figureByPhoto = new Map<string, ReportFigure>();
  const addFigure = (photo: ReportPhotoData): ReportFigure => {
    const figure: ReportFigure = {
      number: figures.length + 1,
      label: `Fig. ${figures.length + 1}`,
      photoId: photo.id,
      image: photo.image,
      caption: pdfText(photo.caption) || "Sans légende",
      zoneLabel: zoneLabel(photo.zoneKey),
    };
    figures.push(figure);
    figureByPhoto.set(photo.id, figure);
    return figure;
  };

  const zones: ZoneSection[] = [];
  if (notesOn) {
    const zoneEntries = [...dto.zones.map((zone) => zone.key), ""];
    for (const key of zoneEntries) {
      const zone = dto.zones.find((z) => z.key === key);
      const blocks =
        zone && isZoneFilled(zone.content) ? toPdfBlocks(parseNoteContent(zone.content)) : [];
      const reminders = printedReserves
        .filter((reserve) =>
          key === "" ? !reserve.zoneKey || !zoneKeys.has(reserve.zoneKey) : reserve.zoneKey === key,
        )
        .map((reserve) => ({
          code: reserve.code,
          action: pdfText(reserve.action),
          statusLabel: reserve.isOverdue
            ? overdueLabel(reserve.daysOverdue)
            : RESERVE_STATUS_LABELS[reserve.status],
          isOverdue: reserve.isOverdue,
          isDone: reserve.status === "done",
        }));
      const zonePhotos = photos.filter((photo) => photoHome.get(photo.id) === key);
      if (blocks.length === 0 && reminders.length === 0 && zonePhotos.length === 0) continue;
      zones.push({
        key: key || "hors-zone",
        title: key ? (zoneLabels.get(key) ?? key) : "Hors zone",
        blocks,
        reserves: reminders,
        photoPages: chunk(zonePhotos.map(addFigure), options.photosPerPage),
      });
    }
  }

  // ---- Annex ------------------------------------------------------------------------------
  const annexPhotos = sections.has("annex")
    ? photos.filter((photo) => photoHome.get(photo.id) === "annex")
    : [];
  const annex =
    annexPhotos.length > 0
      ? { photoPages: chunk(annexPhotos.map(addFigure), options.photosPerPage) }
      : null;

  // ---- Plans ------------------------------------------------------------------------------
  const plans: PlanPageSection[] = [];
  const planRefByReserve = new Map<string, string>();
  if (sections.has("plans")) {
    dto.plans
      .filter((plan) => plan.markers.length > 0)
      .forEach((plan, index) => {
        const title = `Plan ${planLetter(index)}`;
        const pages = [...new Set(plan.markers.map((marker) => marker.page))].sort((a, b) => a - b);
        for (const pageNumber of pages) {
          const page = plan.pages.find((p) => p.pageNumber === pageNumber);
          const markers = plan.markers
            .filter((marker) => marker.page === pageNumber)
            .filter((marker) => {
              const reserve = marker.reserveId ? reserveById.get(marker.reserveId) : null;
              return !reserve || options.includeDoneReserves || reserve.status !== "done";
            })
            .sort((a, b) => a.number - b.number);
          if (markers.length === 0) continue;
          const items: PlanMarkerItem[] = [];
          const legend: PlanPageSection["legend"] = [];
          for (const marker of markers) {
            const reserve = marker.reserveId ? reserveById.get(marker.reserveId) : null;
            if (reserve) {
              planRefByReserve.set(reserve.id, `${title}, ${reserve.code}`);
              items.push({
                kind: "reserve",
                label: reserve.code,
                x: marker.x,
                y: marker.y,
                hasPhoto: false,
                reserveStatus: reserve.status,
                isOverdue: reserve.isOverdue,
              });
              const figuresOfReserve = reserve.photoIds
                .map((id) => figureByPhoto.get(id)?.label)
                .filter(Boolean);
              legend.push({
                label: reserve.code,
                kind: "reserve",
                text: pdfText(reserve.action),
                ref: figuresOfReserve.length > 0 ? figuresOfReserve.join(", ") : null,
              });
            } else {
              items.push({
                kind: "photo",
                label: String(marker.number),
                x: marker.x,
                y: marker.y,
                hasPhoto: Boolean(marker.photoId),
                reserveStatus: null,
                isOverdue: false,
              });
              const figure = marker.photoId ? figureByPhoto.get(marker.photoId) : undefined;
              legend.push({
                label: String(marker.number),
                kind: "photo",
                text: pdfText(marker.label) || (figure ? figure.caption : "Repère sans libellé"),
                ref: figure ? figure.label : null,
              });
            }
          }
          plans.push({
            planId: plan.id,
            title,
            planName: pdfText(plan.name),
            isArchived: plan.isArchived,
            pageNumber,
            pageCount: plan.pages.length,
            image: page?.image ?? {
              key: `page:${plan.id}:${pageNumber}`,
              url: null,
              width: null,
              height: null,
            },
            markers: items,
            legend,
          });
        }
      });
  }

  // ---- Reserves table ---------------------------------------------------------------------
  const rows: ReserveRow[] = printedReserves.map((reserve) => {
    const refs = reserve.photoIds
      .map((id) => figureByPhoto.get(id)?.number)
      .filter((n): n is number => typeof n === "number")
      .sort((a, b) => a - b);
    return {
      id: reserve.id,
      code: reserve.code,
      zoneLabel: reserve.zoneLabel ?? "Sans zone",
      action: pdfText(reserve.action),
      priority: reserve.priority,
      priorityLabel: RESERVE_PRIORITY_LABELS[reserve.priority],
      responsible: responsibleText(reserve),
      dueLabel: reserve.dueDate ? formatDate(`${reserve.dueDate}T12:00:00Z`) : "Aucune",
      status: reserve.status,
      statusLabel:
        reserve.status === "done" && reserve.closedAt
          ? `Levée le ${formatDate(reserve.closedAt)}`
          : RESERVE_STATUS_LABELS[reserve.status],
      isOverdue: reserve.isOverdue,
      overdueLabel: reserve.isOverdue ? overdueLabel(reserve.daysOverdue) : null,
      isDone: reserve.status === "done",
      figureRef: refs.length > 0 ? `Fig. ${refs.join(", ")}` : null,
      planRef: planRefByReserve.get(reserve.id) ?? null,
    };
  });

  // ---- Summary ----------------------------------------------------------------------------
  const keyReserves = allReserves.filter(
    (reserve) => reserve.status !== "done" && (reserve.isOverdue || reserve.priority === "urgent"),
  );
  const summary = sections.has("summary")
    ? {
        participants: dto.participants.map((participant) => ({
          name: pdfText(participant.fullName),
          company: pdfText(participant.company) || "—",
          role: pdfText(participant.jobTitle) || "—",
          presence: participant.isPresent ? "Présent" : "Absent",
        })),
        info: [
          { label: "Site", value: `${site.code} · ${pdfText(site.name)}` },
          { label: "Date", value: visitDateLabel },
          { label: "Motif", value: VISIT_REASON_LABELS[visit.reason] },
          { label: "Objet", value: pdfText(visit.subject) || "—" },
          { label: "Rédacteur", value: pdfText(visit.writerName) || "Non désigné" },
          {
            label: "Statut",
            value: visit.completedAt
              ? `Terminée le ${reportDate(new Date(visit.completedAt))}`
              : "En cours (brouillon)",
          },
        ],
        keyPoints: keyReserves.slice(0, KEY_POINTS_MAX).map((reserve) => ({
          code: reserve.code,
          text: pdfText(reserve.action),
          tag: reserve.isOverdue
            ? overdueLabel(reserve.daysOverdue)
            : RESERVE_PRIORITY_LABELS[reserve.priority],
        })),
        keyPointsMore: Math.max(0, keyReserves.length - KEY_POINTS_MAX),
        zones: dto.zones.map((zone) => ({
          label: pdfText(zone.label),
          filled: isZoneFilled(zone.content),
        })),
      }
    : null;

  // ---- Cover ------------------------------------------------------------------------------
  const coverId = options.coverPhotoId ?? visit.coverPhotoId;
  const coverPhoto =
    (coverId ? dto.photos.find((photo) => photo.id === coverId) : undefined) ??
    dto.photos.find((photo) => photo.isCover);
  const addressLines = [
    pdfText(site.address),
    [pdfText(site.postalCode), pdfText(site.city)].filter(Boolean).join(" "),
  ].filter((line) => line !== "");

  const images = [
    ...new Set(
      [
        coverPhoto?.image.url ?? null,
        ...figures.map((figure) => figure.image.url),
        ...plans.map((plan) => plan.image.url),
      ].filter((url): url is string => Boolean(url)),
    ),
  ];

  return {
    meta: {
      title: `Compte rendu de visite · ${site.code} · ${visitDateLabel}`,
      author: pdfText(visit.writerName) || pdfText(dto.report.generatedByName),
      subject: `${VISIT_REASON_LABELS[visit.reason]} · ${pdfText(site.name)}`,
      keywords: `RONDE, compte rendu, ${site.code}`,
      creator: "RONDE",
      producer: "RONDE",
      language: "fr-FR",
      fileName,
    },
    isDraft: dto.report.isDraft,
    cover: {
      title: "Compte rendu de visite",
      siteCode: site.code,
      siteName: pdfText(site.name),
      addressLines,
      visitDateLabel,
      reasonLabel: VISIT_REASON_LABELS[visit.reason],
      writerName: pdfText(visit.writerName) || null,
      photo: coverPhoto ? coverPhoto.image : null,
      counters,
    },
    footer: {
      left: `${site.code} · Visite du ${visitDateLabel}`,
      generated: `Généré par RONDE le ${reportDateTime(now)} par ${pdfText(dto.report.generatedByName)}`,
    },
    summary,
    reserves: sections.has("reserves")
      ? {
          rows,
          includeDone: options.includeDoneReserves,
          hiddenDone: options.includeDoneReserves ? 0 : counters.done,
        }
      : null,
    zones,
    plans,
    annex,
    figures,
    photosPerPage: options.photosPerPage,
    quality: options.quality,
    images,
  };
}

function toPdfBlocks(blocks: NoteBlock[]): NoteBlock[] {
  return blocks
    .map((block): NoteBlock =>
      block.type === "paragraph"
        ? { type: "paragraph", text: pdfText(block.text) }
        : { type: "bullets", items: block.items.map(pdfText).filter((item) => item !== "") },
    )
    .filter((block) => (block.type === "paragraph" ? block.text !== "" : block.items.length > 0));
}
