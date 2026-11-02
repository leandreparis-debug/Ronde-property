import type { Metadata } from "next";

import { AccountNameForm } from "@/components/account/account-name-form";
import { ChangePasswordForm } from "@/components/auth/change-password-form";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/server/auth/session";
import { USER_ROLE_LABELS } from "@/server/domain/enums";

export const metadata: Metadata = {
  title: "Mon compte",
};

/** Own account: name, email and role, password change, sign out. */
export default async function AccountPage() {
  const user = await requireUser();

  return (
    <>
      <PageHeader eyebrow="Mon compte" title={user.fullName} actions={<SignOutButton />} />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Identité</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-ui">
              <dt className="text-ink-2">Email</dt>
              <dd className="font-medium break-all">{user.email}</dd>
              <dt className="text-ink-2">Rôle</dt>
              <dd>
                <Badge variant="brand">{USER_ROLE_LABELS[user.role]}</Badge>
              </dd>
            </dl>
            <AccountNameForm fullName={user.fullName} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Mot de passe</CardTitle>
          </CardHeader>
          <CardContent>
            <ChangePasswordForm mode="voluntary" />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
