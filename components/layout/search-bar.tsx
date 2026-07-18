"use client";

import { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { Link, useRouter } from "@/i18n/navigation";

type Suggestions = {
  products: { slug: string; title: string; image: string | null }[];
  categories: { slug: string; name: string; icon: string | null }[];
};

const EMPTY: Suggestions = { products: [], categories: [] };

export function SearchBar({ className }: { className?: string }) {
  const c = useTranslations("Common");
  const t = useTranslations("Search");
  const locale = useLocale();
  const router = useRouter();
  const [value, setValue] = useState("");
  const [open, setOpen] = useState(false);
  const [sug, setSug] = useState<Suggestions>(EMPTY);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const term = value.trim();
    if (term.length < 2) {
      setSug(EMPTY);
      return;
    }
    const ctrl = new AbortController();
    const id = window.setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/search/suggest?q=${encodeURIComponent(term)}&locale=${locale}`,
          { signal: ctrl.signal },
        );
        if (res.ok) setSug(await res.json());
      } catch {
        // aborted or offline — ignore
      }
    }, 200);
    return () => {
      ctrl.abort();
      window.clearTimeout(id);
    };
  }, [value, locale]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const term = value.trim();
    if (!term) return;
    setOpen(false);
    router.push(`/search?q=${encodeURIComponent(term)}`);
  };

  const hasSug = sug.products.length > 0 || sug.categories.length > 0;

  return (
    <div ref={boxRef} className={className}>
      <form onSubmit={submit} className="relative">
        <Search className="text-muted-foreground pointer-events-none absolute inset-y-0 my-auto ms-3 size-4" />
        <input
          type="search"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder={c("search")}
          aria-label={c("search")}
          className="bg-muted/40 focus-visible:ring-ring/50 w-full rounded-md border py-2 ps-9 pe-3 text-sm outline-none focus-visible:ring-[3px]"
        />
      </form>

      {open && hasSug ? (
        <div className="bg-popover absolute z-50 mt-1 max-h-96 w-full overflow-auto rounded-md border shadow-lg">
          {sug.categories.length > 0 ? (
            <div className="p-1">
              <p className="text-muted-foreground px-2 py-1 text-xs font-medium">
                {t("categories")}
              </p>
              {sug.categories.map((cat) => (
                <Link
                  key={cat.slug}
                  href={`/c/${cat.slug}`}
                  onClick={() => setOpen(false)}
                  className="hover:bg-muted flex items-center gap-2 rounded px-2 py-1.5 text-sm"
                >
                  {cat.icon ? <span aria-hidden>{cat.icon}</span> : null}
                  {cat.name}
                </Link>
              ))}
            </div>
          ) : null}

          {sug.products.length > 0 ? (
            <div className="border-t p-1">
              <p className="text-muted-foreground px-2 py-1 text-xs font-medium">
                {t("products")}
              </p>
              {sug.products.map((p) => (
                <Link
                  key={p.slug}
                  href={`/product/${p.slug}`}
                  onClick={() => setOpen(false)}
                  className="hover:bg-muted flex items-center gap-2 rounded px-2 py-1.5 text-sm"
                >
                  <span className="bg-muted size-8 shrink-0 overflow-hidden rounded">
                    {p.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={p.image}
                        alt=""
                        className="size-full object-cover"
                      />
                    ) : null}
                  </span>
                  <span className="line-clamp-1">{p.title}</span>
                </Link>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
