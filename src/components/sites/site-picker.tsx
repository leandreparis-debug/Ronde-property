"use client";

import { Building2, LoaderCircle, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/cn";
import type { SiteOption } from "@/server/actions/site-actions";

export interface SitePickerProps {
  /** Form field name of the selected site id. */
  name?: string;
  label?: string;
  /** Server search; a server action in the application, static data on /design. */
  search: (query: string) => Promise<SiteOption[]>;
  value?: SiteOption | null;
  onChange?: (site: SiteOption | null) => void;
  required?: boolean;
  /** Message shown under the field. */
  error?: string;
}

const DEBOUNCE_MS = 250;

/**
 * Accessible combobox (ARIA combobox / listbox) that searches sites on the server.
 * Keyboard: arrows move, Enter selects, Escape closes. Touch: tap an option.
 * Only active sites are proposed. The selected site is shown as a clearable chip.
 */
export function SitePicker({
  name = "siteId",
  label = "Site",
  search,
  value = null,
  onChange,
  required,
  error,
}: SitePickerProps) {
  const id = useId();
  const inputId = `${id}-input`;
  const listId = `${id}-listbox`;
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<SiteOption[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [selected, setSelected] = useState<SiteOption | null>(value);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestId = useRef(0);

  useEffect(() => {
    setSelected(value);
  }, [value]);

  function select(site: SiteOption | null) {
    setSelected(site);
    setOpen(false);
    setQuery("");
    setOptions([]);
    setActive(-1);
    onChange?.(site);
  }

  function runSearch(text: string) {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const current = ++requestId.current;
      setStatus("loading");
      try {
        const results = await search(text);
        if (current !== requestId.current) return;
        setOptions(results);
        setActive(results.length > 0 ? 0 : -1);
        setStatus("idle");
        setOpen(true);
      } catch {
        if (current !== requestId.current) return;
        setOptions([]);
        setStatus("error");
        setOpen(true);
      }
    }, DEBOUNCE_MS);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!open) {
        runSearch(query);
        return;
      }
      setActive((index) => (options.length === 0 ? -1 : (index + 1) % options.length));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((index) =>
        options.length === 0 ? -1 : (index - 1 + options.length) % options.length,
      );
    } else if (event.key === "Enter") {
      if (open && active >= 0 && options[active]) {
        event.preventDefault();
        select(options[active]);
      }
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  }

  const activeId = open && active >= 0 ? `${listId}-${active}` : undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={inputId} required={required}>
        {label}
      </Label>
      <input type="hidden" name={name} value={selected?.id ?? ""} />
      {selected ? (
        <div
          className="flex min-h-11 items-center gap-3 rounded-md border border-brand bg-brand-soft px-3.5 py-2 text-ink"
          data-testid="site-picker-selected"
        >
          <Building2 className="size-5 shrink-0 text-brand-deep" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            <span className="font-semibold">{selected.warehouseCode}</span> · {selected.name}
            {selected.city ? <span className="text-ink-2"> · {selected.city}</span> : null}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="md"
            className="-mr-2 px-2"
            onClick={() => select(null)}
            aria-label="Retirer le site sélectionné"
          >
            <X className="size-5" aria-hidden="true" />
          </Button>
        </div>
      ) : (
        <div className="relative">
          <Input
            id={inputId}
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={activeId}
            aria-invalid={error ? true : undefined}
            autoComplete="off"
            placeholder="Nom, code ou ville"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              runSearch(event.target.value);
            }}
            onFocus={() => {
              if (options.length > 0) setOpen(true);
            }}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            onKeyDown={onKeyDown}
          />
          {status === "loading" ? (
            <LoaderCircle
              className="absolute top-1/2 right-3.5 size-5 -translate-y-1/2 animate-spin text-ink-2"
              aria-hidden="true"
            />
          ) : null}
          <ul
            id={listId}
            role="listbox"
            aria-label="Sites proposés"
            className={cn(
              "absolute inset-x-0 top-full z-40 mt-1 max-h-80 overflow-y-auto rounded-lg border border-rule bg-paper p-1 shadow-raised",
              open ? "block" : "hidden",
            )}
          >
            {status === "error" ? (
              <li
                className="px-3 py-3 text-ui text-status-open"
                role="option"
                aria-selected="false"
                aria-disabled="true"
              >
                La recherche a échoué. Réessayez.
              </li>
            ) : null}
            {status !== "error" && options.length === 0 ? (
              <li
                className="px-3 py-3 text-ui text-ink-2"
                role="option"
                aria-selected="false"
                aria-disabled="true"
              >
                {status === "loading" ? "Recherche…" : "Aucun site ne correspond."}
              </li>
            ) : null}
            {options.map((site, index) => (
              <li
                key={site.id}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={index === active}
                className={cn(
                  "flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-ui",
                  index === active ? "bg-brand-soft text-brand-deep" : "text-ink hover:bg-craie",
                )}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActive(index)}
                onClick={() => select(site)}
              >
                <span className="font-semibold">{site.warehouseCode}</span>
                <span className="min-w-0 flex-1 truncate">{site.name}</span>
                {site.city ? <span className="shrink-0 text-ink-2">{site.city}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      )}
      {error ? (
        <p className="text-ui font-medium text-status-open" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
