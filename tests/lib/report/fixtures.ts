import type { ReportData, ReportPhotoData, ReportReserveData } from "@/lib/report/types";

/** UUID-like id for tests: `00000000-0000-4000-8000-{n padded}`. */
export function tid(prefix: string, n: number): string {
  return `${prefix.padStart(8, "0").slice(0, 8)}-0000-4000-8000-${String(n).padStart(12, "0")}`;
}

/** A photo of the fixture visit. */
export function photo(n: number, overrides: Partial<ReportPhotoData> = {}): ReportPhotoData {
  return {
    id: tid("6", n),
    zoneKey: null,
    caption: `Photo ${n}`,
    category: "general",
    isCover: false,
    takenAt: null,
    sortOrder: n,
    createdAt: `2026-11-05T09:${String(n % 60).padStart(2, "0")}:00.000Z`,
    image: {
      key: `photo:${tid("6", n)}`,
      url: `https://images.test/photo-${n}.jpg`,
      width: 1600,
      height: 1200,
    },
    markerIds: [],
    reserveIds: [],
    ...overrides,
  };
}

/** A reserve of the fixture visit. */
export function reserve(n: number, overrides: Partial<ReportReserveData> = {}): ReportReserveData {
  return {
    id: tid("5", n),
    number: n,
    code: `R-${String(n).padStart(2, "0")}`,
    action: `Action ${n}`,
    description: null,
    zoneKey: null,
    priority: "normal",
    status: "open",
    dueDate: "2026-12-01",
    isOverdue: false,
    daysOverdue: 0,
    responsibleKind: null,
    responsibleName: null,
    responsibleCompany: null,
    closedAt: null,
    closedByName: null,
    photoIds: [],
    markerId: null,
    ...overrides,
  };
}

/** An empty visit (no participant, note, photo, plan or reserve). */
export function emptyData(overrides: Partial<ReportData> = {}): ReportData {
  return {
    visit: {
      id: tid("2", 1),
      title: "Visite périodique Lyon Sud",
      type: "technical",
      reason: "periodic",
      status: "in_progress",
      visitDate: "2026-11-05",
      subject: null,
      completedAt: null,
      writerName: "Alice Fictive",
      coverPhotoId: null,
      site: {
        code: "TEST-001",
        name: "Entrepôt fictif Lyon Sud",
        address: "1 rue Imaginaire",
        postalCode: "69800",
        city: "Saint-Priest",
      },
    },
    participants: [],
    zones: [
      { key: "roof", label: "Toiture", content: "" },
      { key: "docks", label: "Quais", content: "" },
    ],
    photos: [],
    plans: [],
    reserves: [],
    report: { id: tid("9", 1), number: 1, generatedByName: "Alice Fictive", isDraft: true },
    urlsExpireAt: "2026-11-05T10:10:00.000Z",
    ...overrides,
  };
}

/** A rich visit: notes with bullets, photos per zone, a plan with markers, reserves. */
export function richData(): ReportData {
  const base = emptyData();
  return {
    ...base,
    visit: { ...base.visit, subject: "Contrôle semestriel", coverPhotoId: tid("6", 1) },
    participants: [
      { fullName: "Alice Fictive", company: "Carrefour Property", jobTitle: "RT", isPresent: true },
      {
        fullName: "Marc Imaginaire",
        company: "Maintenance Fictive SAS",
        jobTitle: null,
        isPresent: false,
      },
    ],
    zones: [
      {
        key: "roof",
        label: "Toiture",
        content: "Étanchéité correcte.\n\n- Lanterneau 4 fissuré\n- Évacuation ≥ 2 m bouchée 🔥",
      },
      { key: "docks", label: "Quais", content: "Butoirs à reprendre." },
      { key: "sprinkler", label: "Sprinklage", content: "" },
    ],
    photos: [
      photo(1, { zoneKey: "roof", isCover: true }),
      photo(2, { zoneKey: "roof", reserveIds: [tid("5", 1)] }),
      photo(3, { zoneKey: "docks", markerIds: [tid("8", 1)] }),
      photo(4, { reserveIds: [tid("5", 2)] }),
      photo(5),
    ],
    plans: [
      {
        id: tid("7", 1),
        name: "Plan de masse",
        isArchived: false,
        pages: [
          {
            pageNumber: 1,
            image: {
              key: `page:${tid("7", 1)}:1`,
              url: "https://images.test/plan-1.png",
              width: 3500,
              height: 2475,
            },
          },
        ],
        markers: [
          {
            id: tid("8", 1),
            planId: tid("7", 1),
            page: 1,
            x: 0,
            y: 1,
            number: 1,
            label: "Quai 3",
            photoId: tid("6", 3),
            reserveId: null,
          },
          {
            id: tid("8", 2),
            planId: tid("7", 1),
            page: 1,
            x: 0.5,
            y: 0.4,
            number: 2,
            label: null,
            photoId: null,
            reserveId: tid("5", 1),
          },
          {
            id: tid("8", 3),
            planId: tid("7", 1),
            page: 1,
            x: 1,
            y: 0,
            number: 3,
            label: null,
            photoId: null,
            reserveId: tid("5", 3),
          },
        ],
      },
    ],
    reserves: [
      reserve(1, {
        zoneKey: "roof",
        priority: "high",
        photoIds: [tid("6", 2)],
        markerId: tid("8", 2),
        responsibleKind: "internal",
        responsibleName: "Bruno Fictif",
      }),
      reserve(2, {
        priority: "low",
        photoIds: [tid("6", 4)],
        responsibleKind: "external",
        responsibleName: "Marc Imaginaire",
        responsibleCompany: "Maintenance Fictive SAS",
      }),
      reserve(3, { status: "done", closedAt: "2026-11-04T10:00:00.000Z", markerId: tid("8", 3) }),
      reserve(4, {
        zoneKey: "docks",
        priority: "urgent",
        dueDate: "2026-10-21",
        isOverdue: true,
        daysOverdue: 15,
        action: "Refaire le marquage œ € ≥ 😀",
      }),
      reserve(5, { zoneKey: "docks", priority: "urgent", dueDate: null }),
    ],
  };
}
