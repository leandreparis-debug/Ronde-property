"use client";

import { LogOut } from "lucide-react";
import { useRef, useState } from "react";

import { useOptionalOffline } from "@/components/offline/offline-provider";
import { Button, type ButtonProps } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { signOutAction } from "@/server/actions/auth-actions";

/**
 * « Se déconnecter »: erases the local copy of the device (visits kept offline, changes
 * waiting), after a warning when changes have not reached the server yet, then posts the
 * sign-out action.
 */
export function SignOutButton(props: Omit<ButtonProps, "type" | "children">) {
  const offline = useOptionalOffline();
  const form = useRef<HTMLFormElement>(null);
  const confirmed = useRef(false);
  const [warning, setWarning] = useState(false);
  const [busy, setBusy] = useState(false);
  const waiting = (offline?.status.pending ?? 0) + (offline?.status.conflicts ?? 0);

  async function signOut() {
    setBusy(true);
    try {
      await offline?.wipe();
    } finally {
      confirmed.current = true;
      form.current?.requestSubmit();
    }
  }

  return (
    <>
      <form
        ref={form}
        action={signOutAction}
        onSubmit={(event) => {
          if (confirmed.current) return;
          event.preventDefault();
          if (waiting > 0) setWarning(true);
          else void signOut();
        }}
      >
        <Button type="submit" variant="secondary" loading={busy} {...props}>
          <LogOut className="size-5" aria-hidden="true" />
          Se déconnecter
        </Button>
      </form>
      <Dialog open={warning} onOpenChange={setWarning}>
        <DialogContent data-testid="sign-out-warning">
          <DialogHeader>
            <DialogTitle>Des modifications ne sont pas envoyées</DialogTitle>
            <DialogDescription>
              {waiting} modification{waiting > 1 ? "s" : ""} de cet appareil{" "}
              {waiting > 1 ? "n'ont" : "n'a"} pas encore atteint le serveur. Se déconnecter efface
              la copie de la tablette :{" "}
              {waiting > 1 ? "elles seraient perdues" : "elle serait perdue"}. Synchronisez
              d&apos;abord avec le réseau.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="secondary">
                Annuler
              </Button>
            </DialogClose>
            <Button
              type="button"
              variant="danger"
              loading={busy}
              onClick={() => void signOut()}
              data-testid="sign-out-anyway"
            >
              Se déconnecter quand même
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
