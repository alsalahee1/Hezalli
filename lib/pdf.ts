import "server-only";

import puppeteer from "puppeteer-core";

// Path to the Chromium binary. In the production image it is installed via apt
// at /usr/bin/chromium (see Dockerfile). Overridable for local dev.
const CHROMIUM_PATH = process.env.CHROMIUM_PATH || "/usr/bin/chromium";

/**
 * Render an internal app URL to a crisp, print-quality PDF using headless
 * Chromium. Auth is carried by forwarding the caller's Cookie header, so the
 * target page renders exactly as the signed-in user would see it (with its own
 * ownership checks still enforced server-side).
 */
export async function renderUrlToPdf(
  url: string,
  cookieHeader: string | null,
): Promise<Uint8Array> {
  const browser = await puppeteer.launch({
    executablePath: CHROMIUM_PATH,
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage", // small /dev/shm inside containers
      "--disable-gpu",
      "--font-render-hinting=none",
      "--no-first-run",
      "--no-default-browser-check",
      // The runtime user (nextjs) has no writable home; give Chromium a
      // writable profile/cache dir or it crashes on launch.
      "--user-data-dir=/tmp/hz-chromium",
    ],
  });
  try {
    const page = await browser.newPage();
    if (cookieHeader) {
      await page.setExtraHTTPHeaders({ cookie: cookieHeader });
    }
    await page.goto(url, { waitUntil: "networkidle0", timeout: 30_000 });
    await page.emulateMediaType("print");
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "12mm", bottom: "12mm", left: "10mm", right: "10mm" },
    });
    return pdf;
  } finally {
    await browser.close();
  }
}
