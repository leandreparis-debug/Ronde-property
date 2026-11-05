"use client";

import {
  EyeOff,
  FileDown,
  KeyRound,
  LogOut,
  Pencil,
  Plus,
  UserRoundCheck,
  UserRoundX,
} from "lucide-react";
import { useActionState, useEffect, useState } from "react";

import { ErrorNotice } from "@/components/auth/error-notice";
import { SubmitButton } from "@/components/auth/submit-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { formatDate } from "@/lib/format";
import {
  type AccountActionState,
  createAccountAction,
  resetPasswordAction,
  revokeSessionsAction,
  anonymizeAccountAction,
  setActiveAction,
  updateAccountAction,
} from "@/server/actions/account-actions";
import { initialActionState } from "@/server/actions/state";
import type { UserRole } from "@/server/domain/enums";
import { USER_ROLE_LABELS, USER_ROLES } from "@/server/domain/enums";

import { TemporaryPasswordDialog } from "./temporary-password-dialog";

/** Account as serialised for the client (dates as ISO strings). */
export interface AccountRow {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  isActive: boolean;
  /** GDPR: anonymised, irreversible; only the export stays available. */
  anonymized: boolean;
  createdAt: string;
}

type DialogState =
  | { kind: "create" }
  | { kind: "edit"; account: AccountRow }
  | { kind: "toggle"; account: AccountRow }
  | { kind: "reset"; account: AccountRow }
  | { kind: "revoke"; account: AccountRow }
  | { kind: "anonymize"; account: AccountRow }
  | null;

interface RevealedPassword {
  title: string;
  email: string;
  temporaryPassword: string;
}

const initialAccountState: AccountActionState = { ok: false };

function RoleSelect({ id, defaultValue }: { id: string; defaultValue?: UserRole }) {
  return (
    <Field id={id} label="Rôle" required>
      {(control) => (
        <Select {...control} name="role" defaultValue={defaultValue ?? "rt"} required>
          {USER_ROLES.map((role) => (
            <option key={role} value={role}>
              {USER_ROLE_LABELS[role]}
            </option>
          ))}
        </Select>
      )}
    </Field>
  );
}

function AccountStatus({ account }: { account: AccountRow }) {
  if (account.anonymized) return <Badge>Anonymisé</Badge>;
  return account.isActive ? <Badge variant="brand">Actif</Badge> : <Badge>Désactivé</Badge>;
}

function ExportLink({ account }: { account: AccountRow }) {
  return (
    <Button asChild variant="ghost">
      <a href={`/admin/comptes/${account.id}/export`} download data-testid="account-export">
        <FileDown className="size-4" aria-hidden="true" />
        Exporter les données
      </a>
    </Button>
  );
}

function RowActions({
  account,
  onAction,
}: {
  account: AccountRow;
  onAction: (state: DialogState) => void;
}) {
  if (account.anonymized) {
    return (
      <div className="flex flex-wrap gap-2">
        <ExportLink account={account} />
      </div>
    );
  }
  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="secondary" onClick={() => onAction({ kind: "edit", account })}>
        <Pencil className="size-4" aria-hidden="true" />
        Modifier
      </Button>
      <Button variant="secondary" onClick={() => onAction({ kind: "toggle", account })}>
        {account.isActive ? (
          <UserRoundX className="size-4" aria-hidden="true" />
        ) : (
          <UserRoundCheck className="size-4" aria-hidden="true" />
        )}
        {account.isActive ? "Désactiver" : "Réactiver"}
      </Button>
      <Button variant="ghost" onClick={() => onAction({ kind: "reset", account })}>
        <KeyRound className="size-4" aria-hidden="true" />
        Réinitialiser le mot de passe
      </Button>
      {account.isActive ? (
        <Button variant="ghost" onClick={() => onAction({ kind: "revoke", account })}>
          <LogOut className="size-4" aria-hidden="true" />
          Déconnecter toutes les sessions
        </Button>
      ) : (
        <Button variant="ghost" onClick={() => onAction({ kind: "anonymize", account })}>
          <EyeOff className="size-4" aria-hidden="true" />
          Anonymiser
        </Button>
      )}
      <ExportLink account={account} />
    </div>
  );
}

function CreateDialog({
  open,
  onClose,
  onRevealed,
}: {
  open: boolean;
  onClose: () => void;
  onRevealed: (r: RevealedPassword) => void;
}) {
  const [state, action] = useActionState(createAccountAction, initialAccountState);

  useEffect(() => {
    if (state.ok && state.temporaryPassword && state.email) {
      onRevealed({
        title: "Compte créé",
        email: state.email,
        temporaryPassword: state.temporaryPassword,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- react to each new result only
  }, [state.tick]);

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nouveau compte</DialogTitle>
          <DialogDescription>
            Un mot de passe provisoire sera généré et affiché une seule fois.
          </DialogDescription>
        </DialogHeader>
        <form action={action} className="flex flex-col gap-4" noValidate>
          {state.error ? <ErrorNotice message={state.error} /> : null}
          <Field id="create-fullName" label="Nom" required>
            {(control) => (
              <Input {...control} name="fullName" autoComplete="off" maxLength={200} required />
            )}
          </Field>
          <Field id="create-email" label="Email" required>
            {(control) => (
              <Input
                {...control}
                name="email"
                type="email"
                autoComplete="off"
                inputMode="email"
                required
              />
            )}
          </Field>
          <RoleSelect id="create-role" />
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="secondary">
                Annuler
              </Button>
            </DialogClose>
            <SubmitButton>Créer le compte</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditDialog({ account, onClose }: { account: AccountRow; onClose: () => void }) {
  const [state, action] = useActionState(updateAccountAction, initialActionState);
  const { toast } = useToast();

  useEffect(() => {
    if (state.ok) {
      toast({ variant: "success", title: "Compte modifié" });
      onClose();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- react to each new result only
  }, [state.tick]);

  return (
    <Dialog open onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Modifier le compte</DialogTitle>
          <DialogDescription>{account.email}</DialogDescription>
        </DialogHeader>
        <form action={action} className="flex flex-col gap-4" noValidate>
          <input type="hidden" name="id" value={account.id} />
          {state.error ? <ErrorNotice message={state.error} /> : null}
          <Field id="edit-fullName" label="Nom" required>
            {(control) => (
              <Input
                {...control}
                name="fullName"
                defaultValue={account.fullName}
                maxLength={200}
                required
              />
            )}
          </Field>
          <RoleSelect id="edit-role" defaultValue={account.role} />
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="secondary">
                Annuler
              </Button>
            </DialogClose>
            <SubmitButton>Enregistrer</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ToggleDialog({ account, onClose }: { account: AccountRow; onClose: () => void }) {
  const [state, action] = useActionState(setActiveAction, initialActionState);
  const { toast } = useToast();
  const deactivating = account.isActive;

  useEffect(() => {
    if (state.ok) {
      toast({ variant: "success", title: deactivating ? "Compte désactivé" : "Compte réactivé" });
      onClose();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- react to each new result only
  }, [state.tick]);

  return (
    <Dialog open onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {deactivating ? "Désactiver ce compte ?" : "Réactiver ce compte ?"}
          </DialogTitle>
          <DialogDescription>
            {deactivating
              ? `${account.fullName} sera déconnecté·e à sa prochaine requête et ne pourra plus se connecter.`
              : `${account.fullName} pourra de nouveau se connecter.`}
          </DialogDescription>
        </DialogHeader>
        <form action={action} className="flex flex-col gap-4">
          <input type="hidden" name="id" value={account.id} />
          <input type="hidden" name="isActive" value={deactivating ? "false" : "true"} />
          {state.error ? <ErrorNotice message={state.error} /> : null}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="secondary">
                Annuler
              </Button>
            </DialogClose>
            <SubmitButton variant={deactivating ? "danger" : "primary"}>
              {deactivating ? "Désactiver" : "Réactiver"}
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RevokeDialog({ account, onClose }: { account: AccountRow; onClose: () => void }) {
  const [state, action] = useActionState(revokeSessionsAction, initialActionState);
  const { toast } = useToast();

  useEffect(() => {
    if (state.ok) {
      toast({ variant: "success", title: "Sessions déconnectées" });
      onClose();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- react to each new result only
  }, [state.tick]);

  return (
    <Dialog open onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Déconnecter toutes les sessions ?</DialogTitle>
          <DialogDescription>
            {account.fullName} sera déconnecté·e sur tous ses appareils (tablette, ordinateur) à sa
            prochaine action et devra se reconnecter avec son mot de passe. Une saisie en cours non
            enregistrée sera perdue.
          </DialogDescription>
        </DialogHeader>
        <form action={action} className="flex flex-col gap-4">
          <input type="hidden" name="id" value={account.id} />
          {state.error ? <ErrorNotice message={state.error} /> : null}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="secondary">
                Annuler
              </Button>
            </DialogClose>
            <SubmitButton variant="danger">Déconnecter</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AnonymizeDialog({ account, onClose }: { account: AccountRow; onClose: () => void }) {
  const [state, action] = useActionState(anonymizeAccountAction, initialActionState);
  const [step, setStep] = useState<1 | 2>(1);
  const [typed, setTyped] = useState("");
  const { toast } = useToast();
  const matches =
    typed.trim().replace(/\s+/g, " ") === account.fullName.trim().replace(/\s+/g, " ");

  useEffect(() => {
    if (state.ok) {
      toast({ variant: "success", title: "Compte anonymisé" });
      onClose();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- react to each new result only
  }, [state.tick]);

  return (
    <Dialog open onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Anonymiser ce compte ?</DialogTitle>
          <DialogDescription>
            {step === 1
              ? `Le nom et l'adresse e-mail de ${account.fullName} seront remplacés partout dans RONDE (compte, participations, historique affiché). Les visites, réserves et photos restent, attribuées à « Compte anonymisé ». C'est définitif : le compte ne pourra plus être réactivé.`
              : "Deuxième confirmation : saisissez le nom complet du compte, exactement comme affiché."}
          </DialogDescription>
        </DialogHeader>
        {step === 1 ? (
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="secondary">
                Annuler
              </Button>
            </DialogClose>
            <Button type="button" variant="danger" onClick={() => setStep(2)}>
              Continuer
            </Button>
          </DialogFooter>
        ) : (
          <form action={action} className="flex flex-col gap-4">
            <input type="hidden" name="id" value={account.id} />
            <Field id="anonymize-name" label={`Nom du compte : ${account.fullName}`} required>
              {(control) => (
                <Input
                  {...control}
                  name="typedName"
                  autoComplete="off"
                  value={typed}
                  onChange={(event) => setTyped(event.target.value)}
                />
              )}
            </Field>
            {state.error ? <ErrorNotice message={state.error} /> : null}
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="secondary">
                  Annuler
                </Button>
              </DialogClose>
              <SubmitButton variant="danger" disabled={!matches}>
                Anonymiser définitivement
              </SubmitButton>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ResetDialog({
  account,
  onClose,
  onRevealed,
}: {
  account: AccountRow;
  onClose: () => void;
  onRevealed: (r: RevealedPassword) => void;
}) {
  const [state, action] = useActionState(resetPasswordAction, initialAccountState);

  useEffect(() => {
    if (state.ok && state.temporaryPassword && state.email) {
      onRevealed({
        title: "Mot de passe réinitialisé",
        email: state.email,
        temporaryPassword: state.temporaryPassword,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- react to each new result only
  }, [state.tick]);

  return (
    <Dialog open onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Réinitialiser le mot de passe ?</DialogTitle>
          <DialogDescription>
            Un nouveau mot de passe provisoire sera généré pour {account.fullName}. L&apos;ancien
            cessera de fonctionner immédiatement et toutes ses sessions seront déconnectées.
          </DialogDescription>
        </DialogHeader>
        <form action={action} className="flex flex-col gap-4">
          <input type="hidden" name="id" value={account.id} />
          {state.error ? <ErrorNotice message={state.error} /> : null}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="secondary">
                Annuler
              </Button>
            </DialogClose>
            <SubmitButton>Réinitialiser</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Accounts table (cards below 768 px) with create, edit, activate and reset dialogs. */
export function AccountsManager({ accounts }: { accounts: AccountRow[] }) {
  const [dialog, setDialog] = useState<DialogState>(null);
  const [revealed, setRevealed] = useState<RevealedPassword | null>(null);

  function reveal(result: RevealedPassword) {
    setDialog(null);
    setRevealed(result);
  }

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button size="lg" onClick={() => setDialog({ kind: "create" })}>
          <Plus className="size-5" aria-hidden="true" />
          Nouveau compte
        </Button>
      </div>

      {accounts.length === 0 ? (
        <EmptyState
          title="Aucun compte"
          description="Créez le premier compte avec « Nouveau compte »."
        />
      ) : null}

      {/* Table from 768 px */}
      <Card className="hidden overflow-x-auto md:block">
        <table className="w-full text-ui">
          <thead>
            <tr className="border-b border-rule text-left">
              <th scope="col" className="px-4 py-3 label-caps text-ink-2">
                Nom
              </th>
              <th scope="col" className="px-4 py-3 label-caps text-ink-2">
                Email
              </th>
              <th scope="col" className="px-4 py-3 label-caps text-ink-2">
                Rôle
              </th>
              <th scope="col" className="px-4 py-3 label-caps text-ink-2">
                Statut
              </th>
              <th scope="col" className="px-4 py-3 label-caps text-ink-2">
                Créé le
              </th>
              <th scope="col" className="px-4 py-3 label-caps text-ink-2">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {accounts.map((account) => (
              <tr
                key={account.id}
                className="border-b border-rule last:border-b-0"
                data-testid={`account-${account.email}`}
              >
                <td className="px-4 py-3 font-semibold">{account.fullName}</td>
                <td className="px-4 py-3 break-all">{account.email}</td>
                <td className="px-4 py-3">
                  <Badge>{USER_ROLE_LABELS[account.role]}</Badge>
                </td>
                <td className="px-4 py-3">
                  <AccountStatus account={account} />
                </td>
                <td className="px-4 py-3 whitespace-nowrap">{formatDate(account.createdAt)}</td>
                <td className="px-4 py-3">
                  <RowActions account={account} onAction={setDialog} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {/* Cards below 768 px */}
      <ul className="flex flex-col gap-3 md:hidden">
        {accounts.map((account) => (
          <li key={account.id}>
            <Card className="flex flex-col gap-3 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold">{account.fullName}</p>
                  <p className="text-ui break-all text-ink-2">{account.email}</p>
                </div>
                <AccountStatus account={account} />
              </div>
              <div className="flex flex-wrap items-center gap-2 text-ui text-ink-2">
                <Badge>{USER_ROLE_LABELS[account.role]}</Badge>
                <span>Créé le {formatDate(account.createdAt)}</span>
              </div>
              <RowActions account={account} onAction={setDialog} />
            </Card>
          </li>
        ))}
      </ul>

      <CreateDialog
        open={dialog?.kind === "create"}
        onClose={() => setDialog(null)}
        onRevealed={reveal}
      />
      {dialog?.kind === "edit" ? (
        <EditDialog account={dialog.account} onClose={() => setDialog(null)} />
      ) : null}
      {dialog?.kind === "toggle" ? (
        <ToggleDialog account={dialog.account} onClose={() => setDialog(null)} />
      ) : null}
      {dialog?.kind === "anonymize" ? (
        <AnonymizeDialog account={dialog.account} onClose={() => setDialog(null)} />
      ) : null}
      {dialog?.kind === "revoke" ? (
        <RevokeDialog account={dialog.account} onClose={() => setDialog(null)} />
      ) : null}
      {dialog?.kind === "reset" ? (
        <ResetDialog account={dialog.account} onClose={() => setDialog(null)} onRevealed={reveal} />
      ) : null}
      {revealed ? (
        <TemporaryPasswordDialog
          open
          onClose={() => setRevealed(null)}
          title={revealed.title}
          email={revealed.email}
          temporaryPassword={revealed.temporaryPassword}
        />
      ) : null}
    </>
  );
}
