import nodemailer from 'nodemailer';

const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
const FROM = process.env.MAIL_FROM || 'VAIs <no-reply@example.com>';

export const mailConfigured = Boolean(SMTP_HOST && SMTP_USER && SMTP_PASS);

const port = Number(SMTP_PORT) || 587;
const transport = mailConfigured
  ? nodemailer.createTransport({
      host: SMTP_HOST,
      port,
      secure: port === 465 || port === 2465, // sonst STARTTLS (587, 2525)
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    })
  : null;

const TEXTS = {
  verify: {
    subject: 'Dein VAIs-Bestätigungscode',
    title: 'Bestätige deine E-Mail-Adresse',
    body: 'Gib diesen Code auf VAIs ein, um dein Konto zu aktivieren.',
  },
  reset: {
    subject: 'Dein VAIs-Code zum Zurücksetzen',
    title: 'Passwort zurücksetzen',
    body: 'Gib diesen Code auf VAIs ein, um ein neues Passwort festzulegen.',
  },
};

function html({ title, body }, code) {
  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#f4f2ee;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1f1e1c">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:40px 16px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:440px;background:#ffffff;border-radius:16px;padding:36px 32px">
        <tr><td style="font-family:Georgia,'Times New Roman',serif;font-size:26px;letter-spacing:-0.5px">VAIs</td></tr>
        <tr><td style="padding-top:28px;font-size:18px;font-weight:600">${title}</td></tr>
        <tr><td style="padding-top:8px;font-size:15px;line-height:1.5;color:#5c5a55">${body}</td></tr>
        <tr><td style="padding-top:24px">
          <div style="font-family:'SF Mono',Menlo,Consolas,monospace;font-size:32px;letter-spacing:10px;font-weight:600;background:#f4f2ee;border-radius:12px;padding:18px 0;text-align:center">${code}</div>
        </td></tr>
        <tr><td style="padding-top:24px;font-size:13px;line-height:1.5;color:#8a877f">Der Code ist 10 Minuten gültig. Wenn du das nicht angefordert hast, kannst du diese E-Mail ignorieren.</td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

export async function sendCode(email, code, purpose) {
  const t = TEXTS[purpose];
  if (!transport) {
    // Entwicklungsmodus: kein SMTP eingerichtet → Code in der Konsole anzeigen
    console.log(`\n  ✉  [DEV] ${t.subject} für ${email}: ${code}\n`);
    return;
  }
  await transport.sendMail({
    from: FROM,
    to: email,
    subject: t.subject,
    text: `${t.title}\n\n${t.body}\n\nDein Code: ${code}\n\nDer Code ist 10 Minuten gültig.`,
    html: html(t, code),
  });
}
