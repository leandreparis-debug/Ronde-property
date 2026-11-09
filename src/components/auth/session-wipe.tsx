"use client";

import { useEffect, useState } from "react";

import { deleteLocalDb } from "@/lib/offline/db";
import { clearDeviceUser, readDeviceUser } from "@/lib/offline/device-user";

/**
 * On the sign-in page after « sessions révoquées » or « compte désactivé »: erases the local
 * copy of the last user of this browser (visits kept offline, changes waiting) and says so.
 */
export function SessionWipe({ reason }: { reason: "revoquee" | "desactive" }) {
  const [done, setDone] = useState(false);
  useEffect(() => {
    const user = readDeviceUser();
    void (async () => {
      if (user) await deleteLocalDb(user.id).catch(() => undefined);
      clearDeviceUser();
      setDone(true);
    })();
  }, []);
  return (
    <p
      role="status"
      className="mb-4 rounded-md bg-brand-tint px-3 py-2 text-ui text-ink"
      data-testid="session-wipe"
      data-done={done ? "true" : undefined}
    >
      {reason === "revoquee"
        ? "Vos sessions ont été déconnectées par l'administrateur."
        : "Ce compte a été désactivé."}{" "}
      La copie locale de cet appareil a été effacée.
    </p>
  );
}
