"use client";

import { Button } from "@/components/ui/button";
import { ToastProvider, useToast } from "@/components/ui/toast";

function ToastButtons() {
  const { toast } = useToast();
  return (
    <>
      <Button
        variant="secondary"
        onClick={() =>
          toast({
            variant: "success",
            title: "Réserve levée",
            description: "R-07 a été marquée comme levée.",
          })
        }
      >
        Toast succès
      </Button>
      <Button
        variant="secondary"
        onClick={() =>
          toast({
            variant: "error",
            title: "Enregistrement impossible",
            description: "Vérifiez la connexion puis réessayez.",
          })
        }
      >
        Toast erreur
      </Button>
      <Button
        variant="secondary"
        onClick={() =>
          toast({
            variant: "info",
            title: "Synchronisation terminée",
            description: "3 photos envoyées.",
          })
        }
      >
        Toast info
      </Button>
    </>
  );
}

/** Buttons that trigger each toast variant, with their own provider. */
export function ToastDemo() {
  return (
    <ToastProvider>
      <ToastButtons />
    </ToastProvider>
  );
}
