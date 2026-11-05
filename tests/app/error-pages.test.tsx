import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import ErrorPage from "@/app/error";
import GlobalError from "@/app/global-error";
import NotFound from "@/app/not-found";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const failure = Object.assign(new Error("relation « visits » : connexion refusée à 10.0.0.12"), {
  digest: "4185720931",
});

describe("error pages", () => {
  it.each([
    ["not-found", () => <NotFound />, "Cette page n'existe pas"],
    [
      "error",
      () => <ErrorPage error={failure} reset={() => undefined} />,
      "Une erreur s'est produite",
    ],
    [
      "global-error",
      () => <GlobalError error={failure} reset={() => undefined} />,
      "RONDE ne répond pas",
    ],
  ])("%s shows the worried Galet and a French message", (_name, render, title) => {
    const html = renderToStaticMarkup(render());
    expect(html).toContain('data-mood="worried"');
    expect(html).toContain(title.replace("'", "&#x27;"));
  });

  it("never shows the error detail, only its reference", () => {
    for (const html of [
      renderToStaticMarkup(<ErrorPage error={failure} reset={() => undefined} />),
      renderToStaticMarkup(<GlobalError error={failure} reset={() => undefined} />),
    ]) {
      expect(html).not.toContain("10.0.0.12");
      expect(html).not.toContain("connexion refusée");
      expect(html).toContain("Référence : 4185720931");
    }
  });

  it("global-error renders a whole French document", () => {
    const html = renderToStaticMarkup(<GlobalError error={failure} reset={() => undefined} />);
    expect(html).toMatch(/^<html lang="fr">/);
  });
});
