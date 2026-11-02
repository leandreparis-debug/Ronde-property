import { Logo } from "@/components/brand/Logo";

/** Top bar with the logo, shown below 1024 px in place of the side navigation. */
export function TopBar() {
  return (
    <header className="flex h-14 items-center border-b border-rule bg-paper px-4 md:px-6 lg:hidden">
      <Logo size="sm" />
    </header>
  );
}
