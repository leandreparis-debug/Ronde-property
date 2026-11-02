import type { Metadata } from "next";

import { Galet } from "@/components/brand/Galet";
import { ChangePasswordForm } from "@/components/auth/change-password-form";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { Card } from "@/components/ui/card";
import { requireUser } from "@/server/auth/session";

export const metadata: Metadata = {
  title: "Changer le mot de passe",
};

/** Mandatory password change after a temporary password; also reachable voluntarily. */
export default async function ChangePasswordPage() {
  const user = await requireUser();
  const mode = user.mustChangePassword ? "required" : "voluntary";

  return (
    <Card className="p-6 md:p-8">
      <div className="mb-6 flex items-center gap-4">
        <Galet mood="attentive" size={56} />
        <div>
          <h1 className="font-display text-title">Nouveau mot de passe</h1>
          <p className="text-ui text-ink-2">
            {mode === "required"
              ? "Votre mot de passe provisoire doit être remplacé avant de continuer."
              : "Choisissez un nouveau mot de passe."}
          </p>
        </div>
      </div>
      <ChangePasswordForm mode={mode} />
      <div className="mt-6 border-t border-rule pt-4">
        <SignOutButton variant="ghost" />
      </div>
    </Card>
  );
}
