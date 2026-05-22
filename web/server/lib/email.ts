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

// Branded email shell shared by every template. `bullets` renders a feature
// list; `bodyExtra` is a second paragraph after it — both optional so the
// verification/reset emails can ignore them.
function renderEmail(opts: {
  heading: string
  body: string
  bullets?: string[]
  bodyExtra?: string
  cta: string
  url: string
  footer?: string
}): {
  text: string
  html: string
} {
  const { heading, body, bullets, bodyExtra, cta, url, footer } = opts

  const textParts = [heading, body]
  if (bullets?.length) textParts.push(bullets.map((b) => `• ${b}`).join('\n'))
  if (bodyExtra) textParts.push(bodyExtra)
  textParts.push(`${cta}: ${url}`)
  if (footer) textParts.push(footer)
  const text = textParts.join('\n\n')

  const bulletsHtml = bullets?.length
    ? `<ul style="margin:0 0 24px;padding-left:20px;font-size:14px;line-height:1.7;color:#444;">${bullets
        .map((b) => `<li>${b}</li>`)
        .join('')}</ul>`
    : ''
  const bodyExtraHtml = bodyExtra
    ? `<p style="margin:0 0 24px;font-size:14px;line-height:1.5;color:#444;">${bodyExtra}</p>`
    : ''
  const html = `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:24px;background:#f7f7f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1a1a1a;">
    <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:16px;padding:32px;box-shadow:0 1px 3px rgba(0,0,0,0.06);">
      <h1 style="margin:0 0 16px;font-size:22px;font-weight:600;background:linear-gradient(135deg,#e53b30,#c92c24,#8b2a1f);-webkit-background-clip:text;background-clip:text;color:transparent;font-style:italic;">Stash Squirrel</h1>
      <h2 style="margin:0 0 12px;font-size:18px;font-weight:600;">${heading}</h2>
      <p style="margin:0 0 24px;font-size:14px;line-height:1.5;color:#444;">${body}</p>
      ${bulletsHtml}
      ${bodyExtraHtml}
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

export async function sendWelcomeEmailFor(
  user: { email: string; name?: string | null },
  tier: 'free' | 'pro'
) {
  const greeting = user.name ? `Hi ${user.name},` : 'Hi there,'
  const appUrl = APP_URL || 'https://stash-squirrel.com'
  const footer = 'Got a question? Just reply to this email — it reaches a real person.'

  const { text, html } =
    tier === 'pro'
      ? renderEmail({
          heading: 'Welcome to Pro — thank you!',
          body: `${greeting} thank you for going Pro and backing Stash Squirrel. Your account is fully unlocked — here's everything you now have:`,
          bullets: [
            'Unlimited lists',
            'Unlimited items',
            'Todos, bookmarks &amp; notes',
            'Categories with drag-to-reorder',
            'Grid &amp; kanban layouts',
            'Today / Week / Month / Overdue views',
            'Overall Schedule — every todo with a due date in one calendar',
            'Global search across every list (Ctrl/⌘K)',
            'Light &amp; dark themes',
          ],
          bodyExtra:
            'You can manage your subscription any time from the Account page. Thanks again for your support — it genuinely keeps the project going.',
          cta: 'Open Stash Squirrel',
          url: appUrl,
          footer,
        })
      : renderEmail({
          heading: 'Welcome to Stash Squirrel',
          body: `${greeting} your account is ready. You're on the Free plan, which gives you:`,
          bullets: [
            'Up to 3 lists',
            'Up to 50 items across all lists',
            'Todos, bookmarks &amp; notes',
            'Categories with drag-to-reorder',
            'Grid &amp; kanban layouts',
            'Today / Week / Month / Overdue views',
            'Light &amp; dark themes',
          ],
          bodyExtra:
            'Need more room? Pro unlocks unlimited lists and items, the Overall Schedule calendar, and global search across everything — from £6/month. Upgrade any time from the Account page.',
          cta: 'Open Stash Squirrel',
          url: appUrl,
          footer,
        })

  await sendEmail({
    to: user.email,
    subject: tier === 'pro' ? 'Welcome to Stash Squirrel Pro' : 'Welcome to Stash Squirrel',
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
