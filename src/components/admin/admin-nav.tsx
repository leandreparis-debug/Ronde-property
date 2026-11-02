import { NavLink } from "@/components/layout/nav-link";

const LINKS = [
  { href: "/admin/comptes", label: "Comptes" },
  { href: "/admin/journal", label: "Journal d'audit" },
];

/** Secondary navigation of the administration section. */
export function AdminNav() {
  return (
    <nav aria-label="Administration" className="mb-6 flex gap-2 overflow-x-auto">
      {LINKS.map((link) => (
        <NavLink
          key={link.href}
          href={link.href}
          className="inline-flex h-11 shrink-0 items-center rounded-pill border border-rule bg-paper px-4 text-ui font-semibold text-ink hover:bg-galet"
          activeClassName="border-brand bg-brand text-on-brand hover:bg-brand-deep"
        >
          {link.label}
        </NavLink>
      ))}
    </nav>
  );
}
