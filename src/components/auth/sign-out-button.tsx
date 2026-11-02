import { LogOut } from "lucide-react";

import { Button, type ButtonProps } from "@/components/ui/button";
import { signOutAction } from "@/server/actions/auth-actions";

/** « Se déconnecter » as a form posting the sign-out action (works without JavaScript). */
export function SignOutButton(props: Omit<ButtonProps, "type" | "children">) {
  return (
    <form action={signOutAction}>
      <Button type="submit" variant="secondary" {...props}>
        <LogOut className="size-5" aria-hidden="true" />
        Se déconnecter
      </Button>
    </form>
  );
}
