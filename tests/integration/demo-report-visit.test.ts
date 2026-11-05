import path from "node:path";

import sharp from "sharp";
import { afterAll, expect, it } from "vitest";

import { closePool } from "@/server/db/pool";
import { createPhotoService } from "@/server/photos/service";
import { createPlanService } from "@/server/plans/service";
import { createParticipantRepository } from "@/server/repositories/participant-repository";
import { createVisitRepository } from "@/server/repositories/visit-repository";
import { createZoneNoteRepository } from "@/server/repositories/zone-note-repository";
import { createReserveRepository } from "@/server/reserves/repository";
import { LocalStorageService } from "@/server/storage/local";
import { serveLocalStorage } from "@/server/storage/local-route";
import { LOCAL_STORAGE_ROUTE } from "@/server/storage/local-signing";

/*
 * Demo visit for the report (step 10): run on demand only, against ronde_test, with the local
 * storage of the demo server. Fictitious data and synthetic images only.
 *
 *   RONDE_DEMO=1 LOCAL_STORAGE_DIR=.storage/demo \
 *   LOCAL_STORAGE_SECRET=e2e-local-storage-secret-ronde-0123456789abcdef \
 *   pnpm vitest run --config vitest.db.config.mts tests/integration/demo-report-visit.test.ts
 */

const ALICE = { id: "00000000-0000-4000-8000-000000000001" };
const BRUNO = "00000000-0000-4000-8000-000000000002";
const SITE_RENNES = "10000000-0000-4000-8000-000000000009";
const DIR = path.resolve(process.env.LOCAL_STORAGE_DIR ?? ".storage/demo");
const SECRET =
  process.env.LOCAL_STORAGE_SECRET ?? "e2e-local-storage-secret-ronde-0123456789abcdef";

const storage = new LocalStorageService({ dir: DIR, secret: SECRET });

afterAll(async () => {
  await closePool();
});

async function put(target: { url: string; headers: Record<string, string> }, body: Buffer) {
  const request = new Request(`http://ronde.test${target.url}`, {
    method: "PUT",
    headers: target.headers,
    body: body as unknown as BodyInit,
  });
  const segments = new URL(request.url).pathname.slice(`${LOCAL_STORAGE_ROUTE}/`.length).split("/");
  const response = await serveLocalStorage(storage, SECRET, request, segments);
  if (response.status !== 200) throw new Error(`PUT ${response.status}: ${await response.text()}`);
}

/**
 * Synthetic photo: gradient, shapes, a number and a grain, so that the JPEG weighs about as
 * much as a real 1 600 px photo (≈ 300 to 450 KB). Never a real picture.
 */
async function syntheticPhoto(n: number, width: number, height: number): Promise<Buffer> {
  const hue = (n * 37) % 360;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="hsl(${hue},50%,64%)"/><stop offset="1" stop-color="hsl(${(hue + 70) % 360},40%,32%)"/>
    </linearGradient></defs>
    <rect width="100%" height="100%" fill="url(#g)"/>
    ${Array.from({ length: 30 }, (_, i) => `<circle cx="${(i * 97 + n * 13) % width}" cy="${(i * 53 + n * 29) % height}" r="${20 + ((i * 7) % 60)}" fill="hsl(${(hue + i * 9) % 360},45%,55%)" fill-opacity="0.45"/>`).join("")}
    <text x="40" y="${height - 50}" font-size="90" font-family="sans-serif" fill="#ffffff" fill-opacity="0.8">Photo fictive ${n}</text>
  </svg>`;
  // Deterministic grain (pseudo-random, seeded by n).
  const grain = Buffer.alloc(width * height * 3);
  let seed = n * 2654435761;
  for (let index = 0; index < grain.length; index += 1) {
    seed = (seed * 1103515245 + 12345) >>> 0;
    grain[index] = 104 + (seed >>> 24) / 5;
  }
  const base = await sharp(Buffer.from(svg)).png().toBuffer();
  return sharp(base)
    .composite([
      {
        input: await sharp(grain, { raw: { width, height, channels: 3 } })
          .png()
          .toBuffer(),
        blend: "overlay",
      },
    ])
    .jpeg({ quality: 80 })
    .toBuffer();
}

/** Synthetic plan page (warehouse cells and docks). */
async function syntheticPlanPage(page: number): Promise<Buffer> {
  const width = 3500;
  const height = 2475;
  const cells = Array.from({ length: 12 }, (_, i) => {
    const x = 300 + (i % 4) * 700;
    const y = 400 + Math.floor(i / 4) * 520;
    return `<rect x="${x}" y="${y}" width="660" height="480" fill="none" stroke="#121317" stroke-width="8"/>
      <text x="${x + 30}" y="${y + 70}" font-size="56" font-family="sans-serif" fill="#5c606b">Cellule ${page}.${i + 1}</text>`;
  }).join("");
  const docks = Array.from(
    { length: 20 },
    (_, i) =>
      `<rect x="${300 + i * 140}" y="2050" width="100" height="160" fill="none" stroke="#2f6aff" stroke-width="6"/>`,
  ).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <rect width="100%" height="100%" fill="#ffffff"/>${cells}${docks}
    <text x="300" y="250" font-size="90" font-family="sans-serif" fill="#121317">PLAN FICTIF · niveau ${page}</text></svg>`;
  return sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
}

const ZONE_NOTES: Record<string, string> = {
  roof: "Étanchéité globalement correcte, relevés en bon état.\n\n- Lanterneau 4 : verre fissuré, à remplacer\n- Évacuation EP nord partiellement obstruée\n- Garde-corps de la crinoline à refixer",
  docks:
    "Quais 1 à 20 contrôlés avec l'exploitant.\n\n- Butoirs 12 et 14 arrachés\n- Niveleur 7 : fuite hydraulique\n- Signalétique au sol effacée devant les quais 3 à 6",
  sprinkler:
    "Essai hebdomadaire réalisé, pression conforme (7,2 bars).\n\n- Registre à jour\n- Une tête endommagée cellule 2.3",
  facades:
    "Bardage double peau en bon état général.\n\nTraces de corrosion en pied de façade ouest, à surveiller ; un panneau enfoncé près du local de charge.",
  electrical:
    "TGBT propre, thermographie annuelle présentée (fictive).\n\n- Bac de rétention du transformateur à nettoyer\n- Plan d'évacuation absent dans le local",
  fire_safety:
    "Extincteurs vérifiés, RIA accessibles.\n\n- Deux portes coupe-feu calées ouvertes cellule 1.2\n- Éclairage de sécurité : 3 blocs hors service",
};

it.skipIf(!process.env.RONDE_DEMO)(
  "creates the demo visit of the report",
  async () => {
    const visits = createVisitRepository(ALICE);
    const { id: visitId } = await visits.create({
      siteId: SITE_RENNES,
      type: "technical",
      reason: "periodic",
      title: "Visite périodique de démonstration",
      visitDate: new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(new Date()),
      subject: "Contrôle semestriel du clos-couvert, des quais et de la sécurité incendie.",
      writerId: ALICE.id,
    });

    // Participants.
    const participants = createParticipantRepository(ALICE);
    let version = (await visits.getById(visitId))!.version;
    for (const [index, input] of [
      {
        profileId: ALICE.id,
        fullName: "Alice Fictive",
        company: "Carrefour Property",
        jobTitle: "Responsable technique",
      },
      {
        profileId: BRUNO,
        fullName: "Bruno Fictif",
        company: "Carrefour Property",
        jobTitle: "Responsable technique",
      },
      {
        profileId: null,
        fullName: "Léa Imaginaire",
        company: "Logistique Fictive SAS",
        jobTitle: "Directrice de site",
      },
    ].entries()) {
      const added = await participants.add(visitId, version, {
        ...input,
        email: null,
        isPresent: true,
        sortOrder: index,
      });
      version = added.version;
    }

    // Notes: six zones filled.
    const notes = createZoneNoteRepository(ALICE);
    for (const note of await notes.list(visitId)) {
      const content = ZONE_NOTES[note.zoneKey];
      if (content) await notes.updateContent(note.id, note.version, content);
    }

    // 40 photos, spread over the zones (some without a zone).
    const photos = createPhotoService(ALICE, storage);
    const zoneKeys = Object.keys(ZONE_NOTES);
    const photoIds: string[] = [];
    for (let n = 1; n <= 40; n += 1) {
      const image = await syntheticPhoto(n, 1600, 1200);
      const thumb = await sharp(image).resize(400).jpeg({ quality: 70 }).toBuffer();
      const zoneKey = n % 8 === 0 ? null : zoneKeys[n % zoneKeys.length]!;
      const [prepared] = await photos.prepare(visitId, [
        {
          originalFilename: `photo-${n}.jpg`,
          width: 1600,
          height: 1200,
          sizeBytes: image.byteLength,
          thumbSizeBytes: thumb.byteLength,
          takenAt: null,
          zoneKey,
        },
      ]);
      await put(prepared!.main, image);
      await put(prepared!.thumb, thumb);
      const confirmed = await photos.confirm(prepared!.photoId);
      if (!confirmed.ok) throw new Error(confirmed.error);
      await photos.update(prepared!.photoId, {
        caption: `Constat ${n} : élément contrôlé (fictif)`,
      });
      photoIds.push(prepared!.photoId);
    }
    await photos.setCover(photoIds[0]!);

    // A 2-page plan of the site.
    const plans = createPlanService(ALICE, storage);
    const pdf = Buffer.from("%PDF-1.7\n% plan fictif\n%%EOF\n");
    const pages = [await syntheticPlanPage(1), await syntheticPlanPage(2)];
    const thumbs = await Promise.all(
      pages.map((page) => sharp(page).resize(400).jpeg().toBuffer()),
    );
    const prepared = await plans.prepare(SITE_RENNES, {
      name: `Plan de masse de démonstration ${Date.now().toString(36)}`,
      mimeType: "application/pdf",
      sizeBytes: pdf.byteLength,
      pageCount: 2,
    });
    const pageTargets = await plans.preparePages(
      prepared.planId,
      pages.map((page, index) => ({
        pageNumber: index + 1,
        imageMime: "image/png" as const,
        width: 3500,
        height: 2475,
        sizeBytes: page.byteLength,
        thumbSizeBytes: thumbs[index]!.byteLength,
      })),
    );
    await put(prepared.original, pdf);
    for (const [index, target] of pageTargets.entries()) {
      await put(target.image, pages[index]!);
      await put(target.thumb, thumbs[index]!);
    }
    const plan = await plans.confirm(prepared.planId);
    if (!plan.ok) throw new Error(plan.error);

    // 12 reserves: every priority, 3 overdue, 2 done, internal / external / « À désigner ».
    const reserves = createReserveRepository(ALICE);
    const day = (offset: number) =>
      new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(
        new Date(Date.now() + offset * 86_400_000),
      );
    const specs = [
      {
        action: "Remplacer le verre fissuré du lanterneau 4",
        zoneKey: "roof",
        priority: "high",
        due: 20,
        kind: "external",
        name: "Paul Fictif",
        company: "Toitures Imaginaires SARL",
      },
      {
        action: "Déboucher l'évacuation EP nord",
        zoneKey: "roof",
        priority: "urgent",
        due: -6,
        kind: "external",
        name: "Paul Fictif",
        company: "Toitures Imaginaires SARL",
      },
      {
        action: "Refixer le garde-corps de la crinoline",
        zoneKey: "roof",
        priority: "normal",
        due: 45,
        kind: "internal",
      },
      {
        action: "Remplacer les butoirs des quais 12 et 14",
        zoneKey: "docks",
        priority: "urgent",
        due: -12,
        kind: "external",
        name: "Marc Imaginaire",
        company: "Maintenance Fictive SAS",
      },
      {
        action: "Réparer la fuite hydraulique du niveleur 7",
        zoneKey: "docks",
        priority: "high",
        due: 10,
        kind: "external",
        name: "Marc Imaginaire",
        company: "Maintenance Fictive SAS",
      },
      {
        action: "Repeindre la signalétique au sol des quais 3 à 6",
        zoneKey: "docks",
        priority: "low",
        due: 90,
        kind: null,
      },
      {
        action: "Remplacer la tête sprinkler de la cellule 2.3",
        zoneKey: "sprinkler",
        priority: "urgent",
        due: 3,
        kind: "internal",
      },
      {
        action: "Traiter la corrosion en pied de façade ouest",
        zoneKey: "facades",
        priority: "normal",
        due: -2,
        kind: null,
      },
      {
        action: "Nettoyer le bac de rétention du transformateur",
        zoneKey: "electrical",
        priority: "normal",
        due: 30,
        kind: "internal",
        done: true,
      },
      {
        action: "Afficher le plan d'évacuation dans le local TGBT",
        zoneKey: "electrical",
        priority: "low",
        due: null,
        kind: null,
        done: true,
      },
      {
        action: "Fermer les portes coupe-feu de la cellule 1.2 (cales retirées)",
        zoneKey: "fire_safety",
        priority: "urgent",
        due: 7,
        kind: "internal",
      },
      {
        action: "Remplacer 3 blocs d'éclairage de sécurité",
        zoneKey: "fire_safety",
        priority: "high",
        due: 15,
        kind: "external",
        name: "Nadia Fictive",
        company: "Sécurité Imaginaire",
      },
    ] as const;
    const created: string[] = [];
    for (const [index, spec] of specs.entries()) {
      const zonePhotos = photoIds.filter(
        (_, n) => zoneKeys[(n + 1) % zoneKeys.length] === spec.zoneKey && (n + 1) % 8 !== 0,
      );
      const reserve = await reserves.create(
        visitId,
        {
          action: spec.action,
          description: null,
          zoneKey: spec.zoneKey,
          priority: spec.priority,
          dueDate: spec.due === null ? null : day(spec.due),
          responsibleKind: spec.kind,
          responsibleProfileId: spec.kind === "internal" ? (index % 2 ? BRUNO : ALICE.id) : null,
          responsibleName: spec.kind === "external" ? spec.name : null,
          responsibleCompany: spec.kind === "external" ? spec.company : null,
          responsibleEmail: spec.kind === "external" ? "contact@example.test" : null,
        },
        zonePhotos.slice(index % 2, (index % 2) + 1),
      );
      if ("done" in spec && spec.done) await reserves.setStatus(reserve.id, "done");
      created.push(reserve.id);
    }

    // 8 markers over the 2 pages: 5 with photos, 3 placing reserves.
    const markers = plans.markers;
    const spots = [
      { page: 1, x: 0.18, y: 0.22, photo: 2 },
      { page: 1, x: 0.62, y: 0.35, photo: 5 },
      { page: 1, x: 0.9, y: 0.85, photo: 9 },
      { page: 2, x: 0.3, y: 0.6, photo: 14 },
      { page: 2, x: 0, y: 1, photo: 21 },
    ];
    for (const spot of spots) {
      await markers.create(visitId, {
        planId: prepared.planId,
        page: spot.page,
        x: spot.x,
        y: spot.y,
        label: `Point ${spot.photo}`,
        photoId: photoIds[spot.photo - 1]!,
      });
    }
    await reserves.placeOnPlan(created[1]!, { planId: prepared.planId, page: 1, x: 0.45, y: 0.12 });
    await reserves.placeOnPlan(created[3]!, { planId: prepared.planId, page: 1, x: 0.4, y: 0.88 });
    await reserves.placeOnPlan(created[10]!, { planId: prepared.planId, page: 2, x: 1, y: 0 });

    console.log(`DEMO_VISIT=${visitId}`);
    expect(created).toHaveLength(12);
  },
  300_000,
);
