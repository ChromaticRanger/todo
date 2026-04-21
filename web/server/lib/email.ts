import { Resend } from 'resend'

const { RESEND_API_KEY, EMAIL_FROM, APP_URL } = process.env

/**
 * Better Auth builds verification/reset URLs off BETTER_AUTH_URL, which
 * points at the Express API server. In dev that's a different origin from
 * the Vite frontend, so clicking the link lands on a dead page. Rewriting
 * `callbackURL` (and the link host, if it matches BETTER_AUTH_URL) to
 * APP_URL puts the user back on the app after verification.
 */
export function rewriteAuthLink(rawUrl: string): string {
  if (!APP_URL) return rawUrl
  try {
    const u = new URL(rawUrl)
    const appOrigin = new URL(APP_URL)

    // Rewrite the link host/port to the app origin so Vite's /api proxy
    // forwards the verification GET to Express.
    u.protocol = appOrigin.protocol
    u.host = appOrigin.host

    // Rewrite callbackURL so the post-verification redirect lands on the app.
    const cb = u.searchParams.get('callbackURL')
    const resolved = cb
      ? (cb.startsWith('http') ? cb : new URL(cb, APP_URL).toString())
      : APP_URL
    u.searchParams.set('callbackURL', resolved)

    return u.toString()
  } catch {
    return rawUrl
  }
}

const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null

if (!resend) {
  console.warn(
    '[email] RESEND_API_KEY not set — verification & reset emails will log to console only.'
  )
}

export interface EmailArgs {
  to: string
  subject: string
  text: string
  html: string
}

export async function sendEmail({ to, subject, text, html }: EmailArgs): Promise<void> {
  if (!resend || !EMAIL_FROM) {
    console.log(`[email] (console fallback — Resend not configured)`)
    console.log(`[email] to=${to}`)
    console.log(`[email] subject=${subject}`)
    console.log(`[email] ${text}`)
    return
  }
  const { error } = await resend.emails.send({ from: EMAIL_FROM, to, subject, text, html })
  if (error) {
    console.error('[email] Resend send failed:', error)
  }
}

// Branded button link used in both templates.
function renderEmail(opts: { heading: string; body: string; cta: string; url: string; footer?: string }): {
  text: string
  html: string
} {
  const { heading, body, cta, url, footer } = opts
  const text = `${heading}\n\n${body}\n\n${cta}: ${url}${footer ? `\n\n${footer}` : ''}`
  const html = `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:24px;background:#f7f7f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1a1a1a;">
    <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:16px;padding:32px;box-shadow:0 1px 3px rgba(0,0,0,0.06);">
      <h1 style="margin:0 0 16px;font-size:22px;font-weight:600;background:linear-gradient(135deg,#e53b30,#c92c24,#8b2a1f);-webkit-background-clip:text;background-clip:text;color:transparent;font-style:italic;">Stash Squirrel</h1>
      <h2 style="margin:0 0 12px;font-size:18px;font-weight:600;">${heading}</h2>
      <p style="margin:0 0 24px;font-size:14px;line-height:1.5;color:#444;">${body}</p>
      <p style="margin:0 0 24px;">
        <a href="${url}" style="display:inline-block;background:#c92c24;color:#ffffff;text-decoration:none;padding:10px 20px;border-radius:10px;font-size:14px;font-weight:500;">${cta}</a>
      </p>
      <p style="margin:0;font-size:12px;color:#888;word-break:break-all;">
        Or copy this link: <br>${url}
      </p>
      ${footer ? `<p style="margin:24px 0 0;font-size:12px;color:#888;">${footer}</p>` : ''}
    </div>
  </body>
</html>`
  return { text, html }
}

export async function sendVerificationEmailFor(user: { email: string }, url: string) {
  const link = rewriteAuthLink(url)
  const { text, html } = renderEmail({
    heading: 'Verify your email',
    body: 'Welcome to Stash Squirrel. Please verify your email address to finish setting up your account.',
    cta: 'Verify email',
    url: link,
    footer: "If you didn't sign up, you can ignore this email.",
  })
  await sendEmail({
    to: user.email,
    subject: 'Verify your Stash Squirrel email',
    text,
    html,
  })
}

export async function sendPasswordResetEmailFor(user: { email: string }, url: string) {
  const link = rewriteAuthLink(url)
  const { text, html } = renderEmail({
    heading: 'Reset your password',
    body: 'Click the button below to choose a new password. This link will expire soon.',
    cta: 'Reset password',
    url: link,
    footer: "If you didn't request this, you can safely ignore it.",
  })
  await sendEmail({
    to: user.email,
    subject: 'Reset your Stash Squirrel password',
    text,
    html,
  })
}
