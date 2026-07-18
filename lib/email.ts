// Email transport adapter + one branded template every email shares. No
// provider is wired yet (Resend/SES etc. plug in at the marked point in Phase
// 12.3); until then sending is a no-op, but the branded HTML is always built so
// swapping in a transport needs no other change.
export type EmailMessage = {
  to: string;
  subject: string;
  body: string;
  ctaLabel?: string;
  ctaUrl?: string;
};

// The single brand layout: logo wordmark, brand color, content, footer.
export function renderEmail(opts: {
  title: string;
  body: string;
  ctaLabel?: string;
  ctaUrl?: string;
}): string {
  const brand = "#4f46e5";
  const cta =
    opts.ctaLabel && opts.ctaUrl
      ? `<a href="${opts.ctaUrl}" style="display:inline-block;margin-top:16px;background:${brand};color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600">${opts.ctaLabel}</a>`
      : "";
  return `<!doctype html>
<html><body style="margin:0;background:#f4f4f5;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#18181b">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 0">
    <tr><td align="center">
      <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e4e4e7">
        <tr><td style="background:${brand};padding:16px 24px">
          <span style="color:#fff;font-size:20px;font-weight:700;letter-spacing:-0.02em">Hezalli</span>
        </td></tr>
        <tr><td style="padding:24px">
          <h1 style="margin:0 0 8px;font-size:18px">${opts.title}</h1>
          <p style="margin:0;line-height:1.6;color:#3f3f46">${opts.body}</p>
          ${cta}
        </td></tr>
        <tr><td style="padding:16px 24px;border-top:1px solid #e4e4e7;color:#a1a1aa;font-size:12px">
          Hezalli — Yemen's marketplace. You're receiving this because of your notification settings.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

export async function sendEmail(msg: EmailMessage): Promise<void> {
  const html = renderEmail({
    title: msg.subject,
    body: msg.body,
    ctaLabel: msg.ctaLabel,
    ctaUrl: msg.ctaUrl,
  });
  // Plug-in point: `await resend.emails.send({ to: msg.to, subject: msg.subject, html })`.
  void html;
}
