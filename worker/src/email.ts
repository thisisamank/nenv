import type { Env } from "./context.ts";
import { escapeHtml } from "./pages.ts";

export type InviteEmail = {
  to: string;
  link: string;
  invitedBy: string | null;
};

type Copy = {
  subject: string;
  preview: string;
  heading: string;
  body: string;
  action: string;
  reason: string;
};

export function canSendEmail(env: Env): boolean {
  return Boolean(env.EMAIL && env.EMAIL_FROM);
}

export async function sendInviteEmail(env: Env, invite: InviteEmail): Promise<boolean> {
  if (!canSendEmail(env)) return false;

  const copy = inviteCopy(invite, new URL(invite.link).host);
  try {
    await env.EMAIL!.send({
      from: { email: env.EMAIL_FROM!, name: "noenv" },
      to: invite.to,
      subject: copy.subject,
      html: renderHtml(copy, invite.link),
      text: renderText(copy, invite.link),
    });
    return true;
  } catch (error) {
    const { code, message } = error as { code?: string; message?: string };
    console.error(`invite email to ${invite.to} failed: ${code ?? "unknown"} ${message ?? ""}`);
    return false;
  }
}

function inviteCopy({ to, invitedBy }: InviteEmail, host: string): Copy {
  if (!invitedBy) {
    return {
      subject: "Finish setting up noenv",
      preview: "Create your admin passkey to start using noenv.",
      heading: "Finish setting up noenv",
      body: `Your noenv deployment at ${host} is ready. Create your admin passkey to sign in, then invite your team and connect your terminal.`,
      action: "Create admin passkey",
      reason: `You received this because ${to} is the admin email set when noenv was deployed at ${host}.`,
    };
  }
  return {
    subject: `${invitedBy} invited you to noenv`,
    preview: `Join your team's secrets on ${host}.`,
    heading: "Join your team on noenv",
    body: `${invitedBy} invited you to ${host}, where your team keeps its environment variables. Accept the invite to create a passkey, then connect your terminal.`,
    action: "Accept invite",
    reason: `You received this because ${invitedBy} invited ${to}.`,
  };
}

function renderText(copy: Copy, link: string): string {
  return `${copy.heading}

${copy.body}

${copy.action}: ${link}

This link expires in 7 days and works once.

${copy.reason} If you were not expecting it, you can ignore this email.

noenv · encrypted environment variables for your team`;
}

function renderHtml(copy: Copy, link: string): string {
  const url = escapeHtml(link);
  const font = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${escapeHtml(copy.subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(copy.preview)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f4f5;">
  <tr>
    <td align="center" style="padding:40px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;">
        <tr>
          <td style="padding:0 4px 20px;font-family:${font};font-size:18px;font-weight:700;letter-spacing:-0.02em;color:#0b0c0e;">
            <span style="display:inline-block;width:28px;height:28px;line-height:28px;margin-right:8px;border-radius:7px;background:#0b0c0e;color:#ffffff;font-size:15px;text-align:center;vertical-align:middle;">n</span><span style="vertical-align:middle;">noenv</span>
          </td>
        </tr>
        <tr>
          <td style="background:#ffffff;border:1px solid #e4e4e7;border-radius:12px;padding:36px 36px 32px;font-family:${font};">
            <h1 style="margin:0 0 12px;font-size:22px;line-height:1.3;font-weight:650;letter-spacing:-0.02em;color:#0b0c0e;">${escapeHtml(copy.heading)}</h1>
            <p style="margin:0 0 28px;font-size:15px;line-height:1.6;color:#3f3f46;">${escapeHtml(copy.body)}</p>
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="border-radius:8px;background:#0b0c0e;">
                  <a href="${url}" style="display:inline-block;padding:12px 22px;font-family:${font};font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">${escapeHtml(copy.action)}</a>
                </td>
              </tr>
            </table>
            <p style="margin:24px 0 0;font-size:13px;line-height:1.6;color:#71717a;">This link expires in 7 days and works once.</p>
            <hr style="margin:28px 0 20px;border:0;border-top:1px solid #e4e4e7;">
            <p style="margin:0 0 6px;font-size:13px;line-height:1.6;color:#71717a;">Button not working? Paste this link into your browser:</p>
            <p style="margin:0;font-size:13px;line-height:1.5;word-break:break-all;"><a href="${url}" style="color:#0b0c0e;">${url}</a></p>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 4px 0;font-family:${font};font-size:12px;line-height:1.6;color:#a1a1aa;">
            ${escapeHtml(copy.reason)} If you were not expecting it, you can ignore this email.<br>
            noenv · encrypted environment variables for your team
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}
