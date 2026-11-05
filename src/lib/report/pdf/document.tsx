import {
  Document,
  Image as PdfImage,
  Page,
  Path,
  Rect,
  Circle,
  StyleSheet,
  Svg,
  Text,
  View,
} from "@react-pdf/renderer";
import type { ReactNode } from "react";

import { GALET_BODY_PATH } from "@/components/brand/Galet";
import { TRAIL_PATH } from "@/components/brand/Trail";
import { PIN_PATH, RESERVE_PATH } from "@/lib/plans/pins";

import {
  CAPTION_HEIGHT,
  contentBox,
  fitImage,
  FOOTER_HEIGHT,
  HEADER_HEIGHT,
  MARGIN,
  markerBox,
  pageSize,
  PDF_MARKER_SIZE,
  photoCellSize,
  photoGrid,
  planOrientation,
} from "../layout";
import type {
  PlanMarkerItem,
  PlanPageSection,
  ReportFigure,
  ReportModel,
  ReserveRow,
  ZoneSection,
} from "../model";
import { C, FONTS, reserveStatusColors, SIZES } from "../theme";
import type { ReportImage } from "../types";

/** Loaded image, ready for the PDF (data URI), or `null` when it could not be loaded. */
export interface LoadedImage {
  src: string;
  width: number;
  height: number;
}

/** Loaded images keyed by `ReportImage.key`. */
export type ReportImages = Record<string, LoadedImage | null>;

const styles = StyleSheet.create({
  page: {
    paddingTop: MARGIN + HEADER_HEIGHT,
    paddingBottom: MARGIN + FOOTER_HEIGHT,
    paddingHorizontal: MARGIN,
    fontFamily: FONTS.text,
    fontSize: SIZES.body,
    color: C.ink,
    backgroundColor: C.paper,
    // No lineHeight here: inherited by the « Page X sur Y » render prop, it hides it
    // (@react-pdf 4.9). Body texts set their own line height.
  },
  header: {
    position: "absolute",
    top: MARGIN - 6,
    left: MARGIN,
    right: MARGIN,
    borderBottomWidth: 0.8,
    borderBottomColor: C.brand,
    paddingBottom: 4,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  headerText: { fontSize: SIZES.caption, color: C["brand-deep"], fontWeight: 600 },
  headerSite: { fontSize: SIZES.caption, color: C["ink-2"] },
  footer: {
    position: "absolute",
    bottom: MARGIN - 4,
    left: MARGIN,
    right: MARGIN,
    borderTopWidth: 0.5,
    borderTopColor: C.rule,
    height: 0,
  },
  footerLeft: { position: "absolute", bottom: MARGIN - 14, left: MARGIN },
  footerRight: {
    position: "absolute",
    bottom: MARGIN - 14,
    right: MARGIN,
    width: 120,
    textAlign: "right",
  },
  footerSecond: { position: "absolute", bottom: MARGIN - 24, left: MARGIN },
  footerText: { fontSize: SIZES.caption, color: C["ink-2"] },
  h1: {
    fontFamily: FONTS.display,
    fontWeight: 700,
    fontSize: SIZES.h2,
    color: C["brand-deep"],
    marginBottom: 10,
    letterSpacing: -0.4,
  },
  h2: {
    fontFamily: FONTS.display,
    fontWeight: 600,
    fontSize: SIZES.h3,
    color: C["brand-deep"],
    marginTop: 12,
    marginBottom: 6,
  },
  label: {
    fontSize: SIZES.caption,
    color: C["ink-2"],
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  muted: { color: C["ink-2"] },
  paragraph: { marginBottom: 6, lineHeight: 1.4 },
  bulletRow: { flexDirection: "row", marginBottom: 3, paddingLeft: 4 },
  bulletDot: { width: 10, color: C.brand },
  bulletText: { flex: 1, lineHeight: 1.4 },
  table: { borderTopWidth: 0.8, borderTopColor: C.brand },
  th: {
    flexDirection: "row",
    backgroundColor: C["brand-tint"],
    borderBottomWidth: 0.5,
    borderBottomColor: C.rule,
  },
  thCell: { fontSize: SIZES.caption, fontWeight: 600, color: C["brand-deep"], padding: 4 },
  tr: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: C.rule },
  td: { fontSize: SIZES.small, padding: 4 },
  pill: {
    borderRadius: 8,
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    fontSize: SIZES.caption,
    fontWeight: 600,
    alignSelf: "flex-start",
  },
  figureCaption: { fontSize: SIZES.small, marginTop: 3 },
  missing: {
    backgroundColor: C.galet,
    color: C["ink-2"],
    justifyContent: "center",
    alignItems: "center",
  },
});

const RESERVE_COLUMNS = [
  { key: "code", label: "Code", width: "9%" },
  { key: "zone", label: "Zone", width: "13%" },
  { key: "action", label: "Action", width: "31%" },
  { key: "priority", label: "Priorité", width: "10%" },
  { key: "responsible", label: "Responsable", width: "15%" },
  { key: "due", label: "Échéance", width: "10%" },
  { key: "status", label: "Statut", width: "12%" },
] as const;

/** Mini « Galet » drawn in vector (logo, empty cover). */
function Galet({
  size,
  mood = "neutral",
  color = C.brand,
}: {
  size: number;
  mood?: "neutral" | "happy";
  color?: string;
}) {
  return (
    <Svg viewBox="0 0 100 100" width={size} height={size}>
      <Path d={GALET_BODY_PATH} fill={color} />
      {mood === "happy" ? (
        <Path
          d="M51 56 q7 -9 14 0 M69 56 q7 -9 14 0"
          fill="none"
          stroke={C["on-brand"]}
          strokeWidth={5}
          strokeLinecap="round"
        />
      ) : (
        <>
          <Circle cx={58} cy={54} r={6} fill={C["on-brand"]} />
          <Circle cx={76} cy={54} r={6} fill={C["on-brand"]} />
        </>
      )}
    </Svg>
  );
}

/** Running header (blue rule and section name) and footer of every page but the cover. */
function Frame({ model, section }: { model: ReportModel; section: string }) {
  return (
    <>
      <View style={styles.header} fixed>
        <Text style={styles.headerText}>{section}</Text>
        <Text style={styles.headerSite}>{model.cover.siteCode}</Text>
      </View>
      <View style={styles.footer} fixed />
      <Text style={[styles.footerText, styles.footerLeft]} fixed>
        {model.footer.left}
      </Text>
      <Text
        style={[styles.footerText, styles.footerRight]}
        fixed
        render={({ pageNumber, totalPages }) => `Page ${pageNumber} sur ${totalPages}`}
      />
      <Text style={[styles.footerText, styles.footerSecond]} fixed>
        {model.footer.generated}
      </Text>
      {model.isDraft ? <Watermark /> : null}
    </>
  );
}

/** Light « BROUILLON » watermark on every page of a draft. */
function Watermark() {
  return (
    <View
      fixed
      style={{
        position: "absolute",
        top: 330,
        left: 0,
        right: 0,
        alignItems: "center",
        transform: "rotate(-30deg)",
      }}
    >
      <Text
        style={{
          fontFamily: FONTS.display,
          fontWeight: 700,
          fontSize: 96,
          color: C.galet,
          opacity: 0.45,
          letterSpacing: 6,
        }}
      >
        BROUILLON
      </Text>
    </View>
  );
}

function SectionPage({
  model,
  section,
  title,
  children,
  orientation = "portrait",
}: {
  model: ReportModel;
  section: string;
  title?: string;
  children: ReactNode;
  orientation?: "portrait" | "landscape";
}) {
  return (
    <Page size="A4" orientation={orientation} style={styles.page}>
      <Frame model={model} section={section} />
      {title ? (
        <Text style={styles.h1} minPresenceAhead={60}>
          {title}
        </Text>
      ) : null}
      {children}
    </Page>
  );
}

/** An image of the report, or « Photo indisponible ». */
function Picture({
  image,
  images,
  width,
  height,
  cover = false,
}: {
  image: ReportImage | null;
  images: ReportImages;
  width: number;
  height: number;
  cover?: boolean;
}) {
  const loaded = image ? images[image.key] : null;
  if (!loaded) {
    return (
      <View style={[styles.missing, { width, height }]}>
        <Text style={{ fontSize: SIZES.small }}>Photo indisponible</Text>
      </View>
    );
  }
  if (cover) {
    return <PdfImage src={loaded.src} style={{ width, height, objectFit: "cover" }} />;
  }
  // Contain: keep the ratio inside the cell, centred.
  const scale = Math.min(width / loaded.width, height / loaded.height);
  return (
    <View
      style={{
        width,
        height,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: C.craie,
      }}
    >
      <PdfImage
        src={loaded.src}
        style={{ width: loaded.width * scale, height: loaded.height * scale }}
      />
    </View>
  );
}

function StatusPill({
  row,
}: {
  row: Pick<ReserveRow, "status" | "isOverdue" | "statusLabel" | "overdueLabel">;
}) {
  const colors = reserveStatusColors(row.status, row.isOverdue);
  return (
    <Text style={[styles.pill, { backgroundColor: colors.background, color: colors.text }]}>
      {row.isOverdue ? "En retard" : row.statusLabel}
    </Text>
  );
}

// ---------------------------------------------------------------------------------------------
// Cover
// ---------------------------------------------------------------------------------------------

function Cover({ model, images }: { model: ReportModel; images: ReportImages }) {
  const cover = model.cover;
  const width = pageSize("portrait").width - 2 * MARGIN;
  const counters = [
    {
      label: `${cover.counters.open} réserve${cover.counters.open > 1 ? "s" : ""} ouverte${cover.counters.open > 1 ? "s" : ""}`,
      colors: reserveStatusColors("open", false),
    },
    { label: `${cover.counters.overdue} en retard`, colors: reserveStatusColors("open", true) },
    {
      label: `${cover.counters.done} levée${cover.counters.done > 1 ? "s" : ""}`,
      colors: reserveStatusColors("done", false),
    },
  ];
  return (
    <Page size="A4" style={[styles.page, { paddingTop: MARGIN, paddingBottom: MARGIN }]}>
      {model.isDraft ? <Watermark /> : null}
      <Svg
        viewBox="0 0 320 200"
        width={360}
        height={225}
        style={{ position: "absolute", right: -40, bottom: 30, opacity: 0.5 }}
      >
        <Path
          d={TRAIL_PATH}
          fill="none"
          stroke={C["brand-soft"]}
          strokeWidth={5}
          strokeLinecap="round"
        />
      </Svg>
      <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 28 }}>
        <Galet size={30} />
        <Text
          style={{
            fontFamily: FONTS.display,
            fontWeight: 700,
            fontSize: 22,
            marginLeft: 6,
            letterSpacing: -0.8,
          }}
        >
          ronde
        </Text>
      </View>
      {model.isDraft ? (
        <View
          style={{
            backgroundColor: C["status-progress-bg"],
            borderLeftWidth: 3,
            borderLeftColor: C["status-progress-dot"],
            padding: 8,
            marginBottom: 16,
          }}
        >
          <Text style={{ fontWeight: 600, color: C["status-progress"], letterSpacing: 0.5 }}>
            BROUILLON : visite non terminée
          </Text>
        </View>
      ) : null}
      <Text
        style={{
          fontFamily: FONTS.display,
          fontWeight: 700,
          fontSize: SIZES.h1,
          color: C["brand-deep"],
          letterSpacing: -1,
          lineHeight: 1.1,
        }}
      >
        {cover.title}
      </Text>
      <Text style={{ fontFamily: FONTS.display, fontWeight: 600, fontSize: 16, marginTop: 10 }}>
        {cover.siteCode} · {cover.siteName}
      </Text>
      {cover.addressLines.map((line) => (
        <Text key={line} style={[styles.muted, { fontSize: SIZES.lead }]}>
          {line}
        </Text>
      ))}
      <View style={{ flexDirection: "row", marginTop: 14, marginBottom: 18 }}>
        {[
          { label: "Date de la visite", value: cover.visitDateLabel },
          { label: "Motif", value: cover.reasonLabel },
          { label: "Rédacteur", value: cover.writerName ?? "Non désigné" },
        ].map((item) => (
          <View key={item.label} style={{ marginRight: 24 }}>
            <Text style={styles.label}>{item.label}</Text>
            <Text style={{ fontSize: SIZES.lead, fontWeight: 600 }}>{item.value}</Text>
          </View>
        ))}
      </View>
      {cover.photo && images[cover.photo.key] ? (
        <View style={{ borderRadius: 10, overflow: "hidden" }}>
          <Picture image={cover.photo} images={images} width={width} height={300} cover />
        </View>
      ) : (
        <View
          style={{
            width,
            height: 300,
            borderRadius: 10,
            backgroundColor: C["brand-tint"],
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Galet size={120} mood="happy" />
        </View>
      )}
      <View style={{ flexDirection: "row", marginTop: 18 }}>
        {counters.map((counter) => (
          <View
            key={counter.label}
            style={{
              flexDirection: "row",
              alignItems: "center",
              backgroundColor: counter.colors.background,
              borderRadius: 12,
              paddingHorizontal: 9,
              paddingVertical: 4,
              marginRight: 8,
            }}
          >
            <View
              style={{
                width: 6,
                height: 6,
                borderRadius: 3,
                backgroundColor: counter.colors.dot,
                marginRight: 5,
              }}
            />
            <Text style={{ fontSize: SIZES.body, fontWeight: 600, color: counter.colors.text }}>
              {counter.label}
            </Text>
          </View>
        ))}
      </View>
    </Page>
  );
}

// ---------------------------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------------------------

/** « Aucune réserve relevée lors de cette visite » (or the done ones left out). */
function noReserveMessage(hiddenDone: number): string {
  return hiddenDone > 0
    ? `Aucune réserve ouverte : ${hiddenDone} levée${hiddenDone > 1 ? "s" : ""} non imprimée${hiddenDone > 1 ? "s" : ""}.`
    : "Aucune réserve relevée lors de cette visite.";
}

/** No reserve to print and a synthesis: the message goes there instead of a page of its own. */
function reservesInSummary(model: ReportModel): boolean {
  return Boolean(model.summary && model.reserves && model.reserves.rows.length === 0);
}

function Summary({ model }: { model: ReportModel }) {
  const summary = model.summary!;
  return (
    <SectionPage model={model} section="Synthèse" title="Synthèse">
      <Text style={styles.h2}>Informations de la visite</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
        {summary.info.map((item) => (
          <View key={item.label} style={{ width: "50%", marginBottom: 6, paddingRight: 8 }}>
            <Text style={styles.label}>{item.label}</Text>
            <Text>{item.value}</Text>
          </View>
        ))}
      </View>

      <Text style={styles.h2}>Participants</Text>
      {summary.participants.length === 0 ? (
        <Text style={styles.muted}>Aucun participant renseigné.</Text>
      ) : (
        <View style={styles.table}>
          <View style={styles.th}>
            {["Nom", "Entreprise", "Fonction", "Présence"].map((label, index) => (
              <Text
                key={label}
                style={[styles.thCell, { width: ["32%", "30%", "24%", "14%"][index] }]}
              >
                {label}
              </Text>
            ))}
          </View>
          {summary.participants.map((participant, index) => (
            <View key={`${participant.name}-${index}`} style={styles.tr} wrap={false}>
              <Text style={[styles.td, { width: "32%", fontWeight: 600 }]}>{participant.name}</Text>
              <Text style={[styles.td, { width: "30%" }]}>{participant.company}</Text>
              <Text style={[styles.td, { width: "24%" }]}>{participant.role}</Text>
              <Text style={[styles.td, { width: "14%" }]}>{participant.presence}</Text>
            </View>
          ))}
        </View>
      )}

      <Text style={styles.h2}>Points clés</Text>
      {summary.keyPoints.length === 0 ? (
        <Text style={styles.muted}>Aucune réserve urgente ni en retard.</Text>
      ) : (
        <View>
          {summary.keyPoints.map((point) => (
            <View key={point.code} style={styles.bulletRow} wrap={false}>
              <Text style={{ width: 34, fontWeight: 600 }}>{point.code}</Text>
              <Text style={{ flex: 1 }}>{point.text}</Text>
              <Text
                style={[
                  styles.pill,
                  { backgroundColor: C["status-open-bg"], color: C["status-open"], marginLeft: 6 },
                ]}
              >
                {point.tag}
              </Text>
            </View>
          ))}
          {summary.keyPointsMore > 0 ? (
            <Text style={styles.muted}>
              et {summary.keyPointsMore} autre{summary.keyPointsMore > 1 ? "s" : ""} (voir le
              tableau des réserves).
            </Text>
          ) : null}
        </View>
      )}

      {reservesInSummary(model) ? (
        <>
          <Text style={styles.h2}>Réserves</Text>
          <Text>{noReserveMessage(model.reserves!.hiddenDone)}</Text>
        </>
      ) : null}

      <Text style={styles.h2}>Zones visitées</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
        {summary.zones.map((zone) => (
          <Text
            key={zone.label}
            style={[
              styles.pill,
              {
                backgroundColor: zone.filled ? C["brand-soft"] : C.craie,
                color: zone.filled ? C["brand-deep"] : C["ink-2"],
                marginRight: 5,
                marginBottom: 5,
              },
            ]}
          >
            {zone.label}
            {zone.filled ? "" : " (sans note)"}
          </Text>
        ))}
      </View>
    </SectionPage>
  );
}

// ---------------------------------------------------------------------------------------------
// Reserves
// ---------------------------------------------------------------------------------------------

function ReservesSection({ model }: { model: ReportModel }) {
  const reserves = model.reserves!;
  return (
    <SectionPage model={model} section="Réserves" title="Réserves">
      {reserves.rows.length === 0 ? (
        <Text style={{ fontSize: SIZES.lead }}>{noReserveMessage(reserves.hiddenDone)}</Text>
      ) : (
        <View style={styles.table}>
          <View style={styles.th} fixed>
            {RESERVE_COLUMNS.map((column) => (
              <Text key={column.key} style={[styles.thCell, { width: column.width }]}>
                {column.label}
              </Text>
            ))}
          </View>
          {reserves.rows.map((row) => (
            <ReserveTableRow key={row.id} row={row} />
          ))}
          {reserves.hiddenDone > 0 ? (
            <Text style={[styles.muted, { fontSize: SIZES.small, marginTop: 6 }]}>
              {reserves.hiddenDone} réserve{reserves.hiddenDone > 1 ? "s" : ""} levée
              {reserves.hiddenDone > 1 ? "s" : ""} non imprimée{reserves.hiddenDone > 1 ? "s" : ""}.
            </Text>
          ) : null}
        </View>
      )}
    </SectionPage>
  );
}

function ReserveTableRow({ row }: { row: ReserveRow }) {
  const dim = row.isDone ? { color: C["ink-2"] } : {};
  const refs = [row.figureRef, row.planRef].filter(Boolean).join(" · ");
  return (
    <View
      style={[
        styles.tr,
        row.isOverdue ? { borderLeftWidth: 3, borderLeftColor: C["status-open-dot"] } : {},
        row.isDone ? { backgroundColor: C.craie } : {},
      ]}
      wrap={false}
    >
      <Text style={[styles.td, { width: "9%", fontWeight: 600 }, dim]}>{row.code}</Text>
      <Text style={[styles.td, { width: "13%" }, dim]}>{row.zoneLabel}</Text>
      <View style={[styles.td, { width: "31%" }]}>
        <Text style={dim}>{row.action}</Text>
        {refs ? (
          <Text style={{ fontSize: SIZES.caption, color: C["brand-deep"], marginTop: 2 }}>
            {refs}
          </Text>
        ) : null}
      </View>
      <Text
        style={[
          styles.td,
          { width: "10%", fontWeight: row.priority === "urgent" ? 600 : 400 },
          dim,
        ]}
      >
        {row.priorityLabel}
      </Text>
      <Text style={[styles.td, { width: "15%" }, dim]}>{row.responsible}</Text>
      <Text style={[styles.td, { width: "10%" }, dim]}>{row.dueLabel}</Text>
      <View style={[styles.td, { width: "12%" }]}>
        <StatusPill row={row} />
        {row.overdueLabel ? (
          <Text
            style={{
              fontSize: SIZES.caption,
              color: C["status-open"],
              fontWeight: 600,
              marginTop: 2,
            }}
          >
            {row.overdueLabel}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------------------------
// Notes by zone and photos
// ---------------------------------------------------------------------------------------------

function PhotoPage({
  figures,
  perPage,
  images,
}: {
  figures: ReportFigure[];
  perPage: 2 | 4 | 6;
  images: ReportImages;
}) {
  const cell = photoCellSize(perPage, 18);
  const { columns } = photoGrid(perPage);
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 8 }} wrap={false}>
      {figures.map((figure, index) => (
        <View
          key={figure.photoId}
          style={{
            width: cell.width,
            marginRight: (index + 1) % columns === 0 ? 0 : 12,
            marginBottom: 12,
          }}
        >
          <Picture image={figure.image} images={images} width={cell.width} height={cell.height} />
          <Text style={[styles.figureCaption, { height: CAPTION_HEIGHT - 6 }]}>
            <Text style={{ fontWeight: 600, color: C["brand-deep"] }}>{figure.label}</Text>
            {"  "}
            {figure.caption}
          </Text>
        </View>
      ))}
    </View>
  );
}

function Zone({
  zone,
  model,
  images,
  first,
}: {
  zone: ZoneSection;
  model: ReportModel;
  images: ReportImages;
  first: boolean;
}) {
  return (
    <View break={!first}>
      <Text style={[styles.h2, { fontSize: 15, marginTop: 0 }]} minPresenceAhead={80}>
        {zone.title}
      </Text>
      {zone.blocks.map((block, index) =>
        block.type === "paragraph" ? (
          <Text key={index} style={styles.paragraph} orphans={2} widows={2}>
            {block.text}
          </Text>
        ) : (
          <View key={index} style={{ marginBottom: 6 }}>
            {block.items.map((item, itemIndex) => (
              <View key={itemIndex} style={styles.bulletRow} wrap={false}>
                <Text style={styles.bulletDot}>•</Text>
                <Text style={styles.bulletText}>{item}</Text>
              </View>
            ))}
          </View>
        ),
      )}
      {zone.reserves.length > 0 ? (
        <View
          style={{
            backgroundColor: C.craie,
            padding: 6,
            marginTop: 4,
            marginBottom: 4,
            borderRadius: 4,
          }}
          wrap={false}
        >
          <Text style={styles.label}>Réserves de la zone</Text>
          {zone.reserves.map((reserve) => (
            <Text
              key={reserve.code}
              style={{ fontSize: SIZES.small, color: reserve.isDone ? C["ink-2"] : C.ink }}
            >
              <Text style={{ fontWeight: 600 }}>{reserve.code}</Text> {reserve.action} ·{" "}
              <Text style={{ color: reserve.isOverdue ? C["status-open"] : C["ink-2"] }}>
                {reserve.statusLabel}
              </Text>
            </Text>
          ))}
        </View>
      ) : null}
      {zone.photoPages.map((figures, index) => (
        <PhotoPage key={index} figures={figures} perPage={model.photosPerPage} images={images} />
      ))}
    </View>
  );
}

// ---------------------------------------------------------------------------------------------
// Plans
// ---------------------------------------------------------------------------------------------

function MarkerDrawing({ marker }: { marker: PlanMarkerItem }) {
  if (marker.kind === "reserve") {
    const done = marker.reserveStatus === "done";
    const fill = done
      ? C.galet
      : marker.reserveStatus === "in_progress" && !marker.isOverdue
        ? C["status-progress-dot"]
        : C["status-open-dot"];
    const glyph = done ? C["ink-2"] : C.paper;
    return (
      <Svg viewBox="0 0 36 36" width={PDF_MARKER_SIZE} height={PDF_MARKER_SIZE}>
        <Path d={RESERVE_PATH} fill={fill} stroke={done ? C["ink-2"] : C.paper} strokeWidth={2} />
        {done ? (
          <Path
            d="M11 15 L16 20 L25 10"
            fill="none"
            stroke={glyph}
            strokeWidth={3}
            strokeLinecap="round"
          />
        ) : (
          <>
            <Rect x={16.4} y={7} width={3.2} height={10} rx={1.6} fill={glyph} />
            <Circle cx={18} cy={21.5} r={2} fill={glyph} />
          </>
        )}
      </Svg>
    );
  }
  const eye = marker.hasPhoto ? C["on-brand"] : C.brand;
  return (
    <Svg viewBox="0 0 36 36" width={PDF_MARKER_SIZE} height={PDF_MARKER_SIZE}>
      <Path
        d={PIN_PATH}
        fill={marker.hasPhoto ? C.brand : C.paper}
        stroke={C.brand}
        strokeWidth={2.5}
      />
      <Rect x={18} y={12} width={3.2} height={6.5} rx={1.6} fill={eye} />
      <Rect x={24} y={12} width={3.2} height={6.5} rx={1.6} fill={eye} />
    </Svg>
  );
}

function PlanPage({
  plan,
  model,
  images,
}: {
  plan: PlanPageSection;
  model: ReportModel;
  images: ReportImages;
}) {
  const loaded = images[plan.image.key] ?? null;
  const width = loaded?.width ?? plan.image.width ?? 1414;
  const height = loaded?.height ?? plan.image.height ?? 1000;
  const orientation = planOrientation(width, height);
  const box = contentBox(orientation);
  const page = pageSize(orientation);
  const titleHeight = 26;
  const columns = orientation === "landscape" ? 3 : 2;
  const legendRows = Math.ceil(plan.legend.length / columns);
  const legendHeight = Math.min(legendRows * 12 + 18, box.height * 0.3);
  const fitted = fitImage(
    { width, height },
    {
      left: box.left,
      top: box.top + titleHeight,
      width: box.width,
      height: box.height - titleHeight - legendHeight,
    },
  );
  const section = `Plans · ${plan.title}`;
  return (
    <Page size="A4" orientation={orientation} style={styles.page}>
      <Frame model={model} section={section} />
      <View style={{ height: titleHeight }}>
        <Text style={[styles.h1, { fontSize: 14, marginBottom: 0 }]}>
          {plan.title} · {plan.planName}
          {plan.pageCount > 1 ? ` · page ${plan.pageNumber}` : ""}
          {plan.isArchived ? " (archivé)" : ""}
        </Text>
      </View>
      <View
        style={{
          width: fitted.width,
          height: fitted.height,
          marginLeft: fitted.left - box.left,
          position: "relative",
          borderWidth: 0.5,
          borderColor: C.rule,
        }}
      >
        {loaded ? (
          <PdfImage src={loaded.src} style={{ width: fitted.width, height: fitted.height }} />
        ) : (
          <View style={[styles.missing, { width: fitted.width, height: fitted.height }]}>
            <Text>Plan indisponible</Text>
          </View>
        )}
        {plan.markers.map((marker, index) => {
          const position = markerBox({ x: marker.x, y: marker.y }, fitted, page);
          const left = position.left - fitted.left;
          const top = position.top - fitted.top;
          return (
            <View key={`${marker.label}-${index}`} style={{ position: "absolute", left, top }}>
              <MarkerDrawing marker={marker} />
              <Text
                style={{
                  position: "absolute",
                  left: PDF_MARKER_SIZE - 3,
                  top: -5,
                  fontSize: 6.5,
                  fontWeight: 600,
                  backgroundColor: C.paper,
                  color: C.ink,
                  borderWidth: 0.6,
                  borderColor: marker.kind === "reserve" ? C.ink : C.brand,
                  borderRadius: 4,
                  paddingHorizontal: 2,
                }}
              >
                {marker.label}
              </Text>
            </View>
          );
        })}
      </View>
      <View style={{ marginTop: 8, flexDirection: "row", flexWrap: "wrap" }}>
        {plan.legend.map((item) => (
          <View
            key={`${item.kind}-${item.label}`}
            style={{
              width: `${100 / columns}%`,
              flexDirection: "row",
              marginBottom: 3,
              paddingRight: 6,
            }}
            wrap={false}
          >
            <Text
              style={{
                width: 32,
                fontSize: SIZES.small,
                fontWeight: 600,
                color: item.kind === "reserve" ? C["status-open"] : C["brand-deep"],
              }}
            >
              {item.kind === "reserve" ? item.label : `n° ${item.label}`}
            </Text>
            <Text style={{ flex: 1, fontSize: SIZES.small }}>
              {item.text}
              {item.ref ? <Text style={styles.muted}> ({item.ref})</Text> : null}
            </Text>
          </View>
        ))}
      </View>
    </Page>
  );
}

// ---------------------------------------------------------------------------------------------
// Document
// ---------------------------------------------------------------------------------------------

/**
 * The report PDF. Displays the model only: cover, synthesis, reserves (header repeated, rows
 * never split), notes by zone with photos (2, 4 or 6 per page, never split), one page per plan
 * page with vector markers, photo annex; running header and footer « Page X sur Y » on every
 * page but the cover; « BROUILLON » band and watermark for a visit in progress.
 */
export function ReportDocument({ model, images }: { model: ReportModel; images: ReportImages }) {
  return (
    <Document
      title={model.meta.title}
      author={model.meta.author}
      subject={model.meta.subject}
      keywords={model.meta.keywords}
      creator={model.meta.creator}
      producer={model.meta.producer}
      language={model.meta.language}
    >
      <Cover model={model} images={images} />
      {model.summary ? <Summary model={model} /> : null}
      {model.reserves && !reservesInSummary(model) ? <ReservesSection model={model} /> : null}
      {model.zones.length > 0 ? (
        <SectionPage model={model} section="Notes par zone" title="Notes par zone">
          {model.zones.map((zone, index) => (
            <Zone key={zone.key} zone={zone} model={model} images={images} first={index === 0} />
          ))}
        </SectionPage>
      ) : null}
      {model.plans.map((plan) => (
        <PlanPage
          key={`${plan.planId}-${plan.pageNumber}`}
          plan={plan}
          model={model}
          images={images}
        />
      ))}
      {model.annex ? (
        <SectionPage model={model} section="Annexe photos" title="Annexe photos">
          {model.annex.photoPages.map((figures, index) => (
            <PhotoPage
              key={index}
              figures={figures}
              perPage={model.photosPerPage}
              images={images}
            />
          ))}
        </SectionPage>
      ) : null}
    </Document>
  );
}
