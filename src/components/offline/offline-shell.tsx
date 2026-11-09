"use client";

import { useLiveQuery } from "dexie-react-hooks";
import Link from "next/link";
import { useEffect, useState } from "react";

import { Galet } from "@/components/brand/Galet";
import { Logo } from "@/components/brand/Logo";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { ReserveDetailWorkspace } from "@/components/reserves/reserve-detail-workspace";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { NewVisitButton } from "@/components/visits/new-visit-button";
import { KeptBadge, VisitWorkspace } from "@/components/visits/visit-workspace";
import { VisitStatusBadge } from "@/components/visits/visit-status-badge";
import { formatDate } from "@/lib/format";
import { type DeviceUser, readDeviceUser } from "@/lib/offline/device-user";

import { useOptionalOffline } from "./offline-provider";

type Route =
  | { kind: "visit"; visitId: string }
  | { kind: "reserve"; visitId: string; reserveId: string }
  | { kind: "list" }
  | { kind: "other" };

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

/** What the offline shell renders for the address the service worker answered. */
export function routeOf(pathname: string): Route {
  const reserve = new RegExp(`^/visites/(${UUID})/reserves/(${UUID})/?$`, "i").exec(pathname);
  if (reserve) return { kind: "reserve", visitId: reserve[1]!, reserveId: reserve[2]! };
  const visit = new RegExp(`^/visites/(${UUID})/?$`, "i").exec(pathname);
  if (visit) return { kind: "visit", visitId: visit[1]! };
  if (pathname === "/" || pathname === "") return { kind: "list" };
  return { kind: "other" };
}

/** « Mes visites » offline: only the visits kept on this device, from the local store. */
function OfflineVisitList() {
  const db = useOptionalOffline()?.db ?? null;
  const visits = useLiveQuery(
    async () =>
      db
        ? (await db.visits.toArray())
            .filter((visit) => visit.kept)
            .sort((a, b) => b.visitDate.localeCompare(a.visitDate))
        : undefined,
    [db],
  );
  return (
    <>
      <PageHeader title="Visites" actions={<NewVisitButton />} />
      <div className="flex flex-col gap-4" data-testid="offline-visit-list">
        <p className="rounded-md bg-brand-tint px-4 py-3 text-ui text-ink">
          Hors réseau : seules les visites gardées sur cet appareil sont affichées. Les autres
          reviendront avec le réseau.
        </p>
        {visits === undefined ? null : visits.length === 0 ? (
          <EmptyState
            mood="asleep"
            title="Aucune visite gardée sur cet appareil"
            description="Avec le réseau, ouvrez une visite en cours puis choisissez « Garder hors réseau » dans ses actions."
          />
        ) : (
          <ul className="flex flex-col gap-3" aria-label="Visites gardées hors réseau">
            {visits.map((visit) => (
              <li key={visit.id}>
                <Card className="transition-colors hover:bg-brand-tint">
                  <Link
                    href={`/visites/${visit.id}`}
                    className="flex min-h-touch-lg flex-col gap-2 rounded-lg p-4"
                    data-testid={`visit-${visit.id}`}
                  >
                    <span className="flex flex-wrap items-center gap-2 text-ui text-ink-2">
                      <span className="font-semibold text-ink">
                        {formatDate(visit.visitDate, "weekday")}
                      </span>
                      <VisitStatusBadge status={visit.status} />
                      <KeptBadge />
                    </span>
                    <span className="truncate text-body font-semibold text-ink">{visit.title}</span>
                    <span className="truncate text-ui text-ink-2">
                      {visit.site.code} · {visit.site.name}
                    </span>
                  </Link>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

function ShellContent({ route }: { route: Route }) {
  switch (route.kind) {
    case "visit":
      return <VisitWorkspace visitId={route.visitId} snapshot={null} />;
    case "reserve":
      return (
        <ReserveDetailWorkspace
          visitId={route.visitId}
          reserveId={route.reserveId}
          snapshot={null}
          history={null}
        />
      );
    case "list":
      return <OfflineVisitList />;
    default:
      return (
        <EmptyState
          mood="asleep"
          title="Cette page demande le réseau"
          description="Hors réseau, RONDE ouvre la liste des visites et les visites gardées sur cet appareil."
          action={
            <Button asChild>
              <Link href="/">Mes visites</Link>
            </Button>
          }
        />
      );
  }
}

/**
 * Offline shell (step 12): the page the service worker serves, without network, for `/`,
 * `/visites/[id]` and a reserve detail. It opens the local copy of the last user of this
 * browser and renders the visit from it; nothing comes from the server.
 */
export function OfflineShell() {
  const [state, setState] = useState<{ user: DeviceUser | null; route: Route } | null>(null);
  useEffect(() => {
    setState({ user: readDeviceUser(), route: routeOf(window.location.pathname) });
  }, []);

  if (!state) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-craie" aria-busy="true">
        <Galet mood="attentive" size={64} />
      </div>
    );
  }
  if (!state.user) {
    return (
      <div className="flex min-h-dvh flex-col items-center gap-6 bg-craie px-4 py-10 text-ink">
        <Logo size="md" />
        <EmptyState
          mood="asleep"
          title="Aucune copie locale sur cet appareil"
          description="Connectez-vous avec le réseau et gardez vos visites hors réseau pour les retrouver ici."
          action={
            <Button asChild>
              <Link href="/hors-ligne">Que faire hors réseau ?</Link>
            </Button>
          }
        />
      </div>
    );
  }
  return (
    <AppShell
      user={{ id: state.user.id, fullName: state.user.name, role: state.user.role, email: "" }}
    >
      <div data-testid="offline-shell">
        <ShellContent route={state.route} />
      </div>
    </AppShell>
  );
}
