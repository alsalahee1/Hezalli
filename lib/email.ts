// Email transport adapter. No provider is wired yet (Resend/SES etc. plug in
// here in Phase 12.3 — set the transport and the API key). Until then sending
// is a no-op that optionally logs in dev, so the rest of the app can call
// sendEmail() unconditionally.
export type EmailMessage = {
  to: string;
  subject: string;
  body: string;
};

export async function sendEmail(msg: EmailMessage): Promise<void> {
  // Plug-in point: `await resend.emails.send({ ... })` etc.
  void msg;
}
