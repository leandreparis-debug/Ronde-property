"use client";

import { Search } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

export interface SiteSearchFormProps {
  q: string;
  category: string;
  includeInactive: boolean;
  categories: string[];
}

const DEBOUNCE_MS = 250;

/**
 * Search field (debounced, reflected in `?q=`), category filter and inactive toggle.
 * Every change updates the URL; the page re-renders with the new results.
 */
export function SiteSearchForm({ q, category, includeInactive, categories }: SiteSearchFormProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [value, setValue] = useState(q);
  const [selectedCategory, setSelectedCategory] = useState(category);
  const [inactive, setInactive] = useState(includeInactive);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function navigate(next: { q?: string; category?: string; inactive?: boolean }) {
    const params = new URLSearchParams(searchParams.toString());
    const nextQ = next.q ?? value;
    const nextCategory = next.category ?? selectedCategory;
    const nextInactive = next.inactive ?? inactive;
    if (nextQ.trim()) params.set("q", nextQ.trim());
    else params.delete("q");
    if (nextCategory) params.set("category", nextCategory);
    else params.delete("category");
    if (nextInactive) params.set("inactive", "1");
    else params.delete("inactive");
    params.delete("page");
    const query = params.toString();
    startTransition(() => router.replace(query ? `${pathname}?${query}` : pathname));
  }

  useEffect(() => {
    setValue(q);
  }, [q]);
  useEffect(() => {
    setSelectedCategory(category);
  }, [category]);
  useEffect(() => {
    setInactive(includeInactive);
  }, [includeInactive]);

  function onChangeQuery(next: string) {
    setValue(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => navigate({ q: next }), DEBOUNCE_MS);
  }

  return (
    <form
      role="search"
      className="grid grid-cols-1 gap-4 md:grid-cols-[2fr_1fr_auto] md:items-end"
      onSubmit={(event) => {
        event.preventDefault();
        if (timer.current) clearTimeout(timer.current);
        navigate({ q: value });
      }}
    >
      <Field id="site-search" label="Rechercher un site">
        {(control) => (
          <div className="relative">
            <Search
              className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-ink-2"
              aria-hidden="true"
            />
            <Input
              {...control}
              name="q"
              type="search"
              value={value}
              onChange={(event) => onChangeQuery(event.target.value)}
              placeholder="Nom, code ou ville"
              maxLength={200}
              autoComplete="off"
              className="pl-11"
              aria-busy={isPending || undefined}
            />
          </div>
        )}
      </Field>
      <Field id="site-category" label="Catégorie">
        {(control) => (
          <Select
            {...control}
            name="category"
            value={category}
            onChange={(event) => navigate({ category: event.target.value })}
          >
            <option value="">Toutes</option>
            {categories.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <label className="flex min-h-11 items-center gap-3 text-ui font-medium text-ink">
        <input
          type="checkbox"
          name="inactive"
          className="size-5 accent-brand"
          checked={inactive}
          onChange={(event) => {
            setInactive(event.target.checked);
            navigate({ inactive: event.target.checked });
          }}
        />
        Inclure les sites inactifs
      </label>
    </form>
  );
}
