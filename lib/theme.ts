import { cookies } from "next/headers";

export const THEME_COOKIE = "hezalli-theme";
export const THEMES = ["default", "yemeni"] as const;
export type ThemeId = (typeof THEMES)[number];

function isThemeId(value: string | undefined): value is ThemeId {
  return !!value && (THEMES as readonly string[]).includes(value);
}

export async function getTheme(): Promise<ThemeId> {
  const store = await cookies();
  const value = store.get(THEME_COOKIE)?.value;
  return isThemeId(value) ? value : "default";
}
