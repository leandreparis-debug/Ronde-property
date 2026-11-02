"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { CopyButton } from "./copy-button";

export interface TemporaryPasswordDialogProps {
  open: boolean;
  onClose: () => void;
  email: string;
  temporaryPassword: string;
  title: string;
}

/** Shows a temporary password once, with a copy button and a clear warning. */
export function TemporaryPasswordDialog({
  open,
  onClose,
  email,
  temporaryPassword,
  title,
}: TemporaryPasswordDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent hideCloseButton>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Transmettez ce mot de passe provisoire à{" "}
            <span className="font-semibold text-ink">{email}</span>. Il devra être changé à la
            première connexion.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 rounded-md border border-rule bg-craie p-4">
          <p className="label-caps text-ink-2">Mot de passe provisoire</p>
          <p
            className="font-mono text-title-sm font-semibold break-all select-all"
            data-testid="temporary-password"
          >
            {temporaryPassword}
          </p>
          <div>
            <CopyButton value={temporaryPassword} />
          </div>
        </div>
        <p role="status" className="text-ui font-medium text-status-open">
          Il ne sera plus affiché.
        </p>
        <DialogFooter>
          <DialogClose asChild>
            <Button>J&apos;ai noté le mot de passe</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
