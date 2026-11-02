"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/** Confirmation dialog, the pattern used instead of `window.confirm`. */
export function DialogDemo() {
  const [confirmed, setConfirmed] = useState(false);

  return (
    <>
      <Dialog>
        <DialogTrigger asChild>
          <Button variant="danger">Supprimer la photo</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Supprimer cette photo ?</DialogTitle>
            <DialogDescription>
              La photo « quai 14 » sera retirée de la visite. Cette action est définitive.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="secondary">Annuler</Button>
            </DialogClose>
            <DialogClose asChild>
              <Button variant="danger" onClick={() => setConfirmed(true)}>
                Supprimer
              </Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <p className="text-ui text-ink-2" aria-live="polite">
        {confirmed ? "Suppression confirmée (démonstration)." : "Aucune action pour l'instant."}
      </p>
    </>
  );
}
