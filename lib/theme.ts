import { cookies } from "next/headers";

import { THEME_COOKIE, THEMES, type ThemeId } from "./theme-constants";

function isThemeId(value: string | undefined): value is ThemeId {
  return !!value && (THEMES as readonly string[]).includes(value);
}

export async function getTheme(): Promise<ThemeId> {
  const store = await cookies();
  const value = store.get(THEME_COOKIE)?.value;
  return isThemeId(value) ? value : "default";
}
