export const THEME_COOKIE = "hezalli-theme";
export const THEMES = ["default", "yemeni"] as const;
export type ThemeId = (typeof THEMES)[number];
