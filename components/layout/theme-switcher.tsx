"use client";

import { useState } from "react";
import { Palette } from "lucide-react";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import { THEME_COOKIE, THEMES, type ThemeId } from "@/lib/theme";

function applyTheme(theme: ThemeId) {
  document.documentElement.classList.toggle(
    "theme-yemeni",
    theme === "yemeni",
  );
  document.cookie = `${THEME_COOKIE}=${theme}; path=/; max-age=31536000; SameSite=Lax`;
}

export function ThemeSwitcher({ initialTheme }: { initialTheme: ThemeId }) {
  const t = useTranslations("Theme");
  const [theme, setTheme] = useState<ThemeId>(initialTheme);

  const switchTo = (next: ThemeId) => {
    if (next !== theme) {
      setTheme(next);
      applyTheme(next);
    }
  };

  return (
    <div
      className="flex items-center overflow-hidden rounded-md border text-xs font-medium"
      title={t("label")}
    >
      {THEMES.map((id) => (
        <button
          key={id}
          type="button"
          onClick={() => switchTo(id)}
          aria-current={theme === id}
          className={cn(
            "flex items-center gap-1 px-2 py-1 transition-colors",
            theme === id
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {id === "yemeni" ? <Palette className="size-3.5" /> : null}
          {t(id)}
        </button>
      ))}
    </div>
  );
}
