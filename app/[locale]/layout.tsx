import type { Metadata, Viewport } from "next";
import { Cairo } from "next/font/google";
import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";

import { routing } from "@/i18n/routing";
import { cn } from "@/lib/utils";
import { getTheme } from "@/lib/theme";
import { getSetting } from "@/lib/settings";
import { assistantReady } from "@/lib/ai/gemini";
import { getActiveBot, getBotAvatar } from "@/lib/ai/active-bot";
import { botName } from "@/lib/ai/bot-constants";
import { AiAssistant } from "@/components/ai/ai-assistant";

import "../globals.css";

const cairo = Cairo({
  subsets: ["arabic", "latin"],
  variable: "--font-cairo",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Hezalli — Multi-Vendor Marketplace",
    template: "%s · Hezalli",
  },
  description:
    "Hezalli is Yemen's multi-vendor marketplace where buyers shop from many sellers, and sellers open stores, list products, and get paid.",
};

// `viewport-fit=cover` lets the layout extend into the phone's safe areas so the
// bottom tab bar can pad itself with env(safe-area-inset-bottom) and sit flush
// above the home indicator, the way a native app does.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  setRequestLocale(locale);
  const messages = await getMessages();
  const dir = locale === "ar" ? "rtl" : "ltr";
  const theme = await getTheme();
  const showShadi = await assistantReady();
  const activeBot = showShadi ? await getActiveBot() : "shadi";
  const shadiAvatar = showShadi ? await getBotAvatar(activeBot) : "";
  const shadiGreeting = showShadi ? await getSetting("ai_greeting") : "";

  return (
    <html
      lang={locale}
      dir={dir}
      className={cn(cairo.variable, theme === "yemeni" && "theme-yemeni")}
      suppressHydrationWarning
    >
      <body className="bg-background text-foreground min-h-screen font-sans antialiased">
        <NextIntlClientProvider messages={messages}>
          {children}
          {/* Shadi (شادي), the AI assistant, floats on every page of the site —
            not just the storefront — so shoppers, sellers, and drivers can all
            reach it. Hidden when the admin toggle is off or no Gemini key is
            configured (Admin → Settings, or the GEMINI_API_KEY env var). */}
          {showShadi ? (
            <AiAssistant
              botId={activeBot}
              botName={botName(activeBot, locale)}
              avatar={shadiAvatar}
              greeting={shadiGreeting}
            />
          ) : null}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
