import { Resend } from 'resend'

const { RESEND_API_KEY, EMAIL_FROM, EMAIL_FROM_SUPPORT, APP_URL } = process.env

// Transactional mail (verification, password reset) goes from the no-reply
// address. The welcome email invites a reply, so it must come from a monitored
// inbox — falls back to the support address even if the env var is unset.
const SUPPORT_FROM = EMAIL_FROM_SUPPORT || 'support@stash-squirrel.com'

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
  /** Overrides the default no-reply sender. Use for mail that invites a reply. */
  from?: string
}

export async function sendEmail({ to, subject, text, html, from }: EmailArgs): Promise<void> {
  if (!resend || !EMAIL_FROM) {
    console.log(`[email] (console fallback — Resend not configured)`)
    console.log(`[email] from=${from ?? EMAIL_FROM ?? '(unset)'}`)
    console.log(`[email] to=${to}`)
    console.log(`[email] subject=${subject}`)
    console.log(`[email] ${text}`)
    return
  }
  const { error } = await resend.emails.send({ from: from ?? EMAIL_FROM, to, subject, text, html })
  if (error) {
    console.error('[email] Resend send failed:', error)
  }
}

// Branded email shell shared by every template. `bullets` renders a feature
// list; `bodyExtra` is a second paragraph after it; `promo` renders a divided
// section with its own heading + bullet list (the Free email's Pro upsell).
// All optional so the verification/reset emails can ignore them.
function renderEmail(opts: {
  heading: string
  body: string
  bullets?: string[]
  bodyExtra?: string
  promo?: { heading: string; bullets: string[] }
  cta: string
  url: string
  footer?: string
}): {
  text: string
  html: string
} {
  const { heading, body, bullets, bodyExtra, promo, cta, url, footer } = opts

  const textParts = [heading, body]
  if (bullets?.length) textParts.push(bullets.map((b) => `• ${b}`).join('\n'))
  if (bodyExtra) textParts.push(bodyExtra)
  if (promo) {
    textParts.push(promo.heading)
    textParts.push(promo.bullets.map((b) => `• ${b}`).join('\n'))
  }
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
  const promoHtml = promo
    ? `<div style="margin:0 0 24px;padding-top:20px;border-top:1px solid #ececec;">
        <h3 style="margin:0 0 8px;font-size:15px;font-weight:600;color:#c92c24;">${promo.heading}</h3>
        <ul style="margin:0;padding-left:20px;font-size:14px;line-height:1.7;color:#444;">${promo.bullets
          .map((b) => `<li>${b}</li>`)
          .join('')}</ul>
      </div>`
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
      ${promoHtml}
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
            'Events — a calendar item type with recurring options',
            'Categories with drag-to-reorder',
            'Grid &amp; kanban layouts',
            'Today / Week / Month / Overdue views',
            'Overall Schedule — every todo with a due date in one calendar',
            'Global search across every list (Ctrl/⌘K)',
            'Discover — browse and clone community-shared lists',
            'Bookmark import from your browser',
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
          promo: {
            heading: 'Upgrade to Pro — from £6/month',
            bullets: [
              'Unlimited lists',
              'Unlimited items',
              'Events — a calendar item type with recurring options',
              'Overall Schedule — every todo with a due date in one calendar',
              'Global search across every list (Ctrl/⌘K)',
              'Discover — browse and clone community-shared lists',
              'Bookmark import from your browser',
            ],
          },
          cta: 'Open Stash Squirrel',
          url: appUrl,
          footer,
        })

  await sendEmail({
    to: user.email,
    subject: tier === 'pro' ? 'Welcome to Stash Squirrel Pro' : 'Welcome to Stash Squirrel',
    text,
    html,
    // The footer invites a reply — send from the monitored support inbox,
    // not the no-reply address.
    from: SUPPORT_FROM,
  })
}

// ── Daily digest ─────────────────────────────────────────────────────────────

export interface DigestItem {
  title: string
  /** List name, or null for events / items outside a list. */
  list: string | null
  /** Due-date epoch (seconds), used to label overdue items with their date. */
  due: number | null
}

// User content goes into the HTML body, so escape it. The other templates only
// interpolate static strings; the digest is the first to render user input.
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// "Today" is computed on UTC day boundaries (matching the in-app Today view),
// so overdue dates are formatted in UTC too for consistency.
function formatOverdueDate(epoch: number | null): string {
  if (epoch == null) return ''
  return new Date(epoch * 1000).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  })
}

function digestSectionHtml(heading: string, color: string, items: DigestItem[], showDate: boolean): string {
  if (!items.length) return ''
  const rows = items
    .map((it) => {
      const meta: string[] = []
      if (it.list) meta.push(escapeHtml(it.list))
      if (showDate && it.due != null) meta.push(`was due ${formatOverdueDate(it.due)}`)
      const metaHtml = meta.length
        ? `<span style="color:#888;font-size:13px;"> — ${meta.join(' · ')}</span>`
        : ''
      return `<li style="margin:0 0 6px;">${escapeHtml(it.title)}${metaHtml}</li>`
    })
    .join('')
  return `<div style="margin:0 0 24px;">
      <h3 style="margin:0 0 8px;font-size:15px;font-weight:600;color:${color};">${heading}</h3>
      <ul style="margin:0;padding-left:20px;font-size:14px;line-height:1.6;color:#1a1a1a;">${rows}</ul>
    </div>`
}

/**
 * Daily reminder digest: everything overdue plus everything due today, grouped.
 * Callers should skip sending when both lists are empty.
 */
export async function sendDigestEmailFor(
  user: { email: string; name?: string | null },
  groups: { overdue: DigestItem[]; today: DigestItem[] }
) {
  const { overdue, today } = groups
  const appUrl = APP_URL || 'https://stash-squirrel.com'
  const manageUrl = `${appUrl}/settings`
  const greeting = user.name ? `Hi ${user.name},` : 'Hi there,'
  const intro =
    overdue.length > 0
      ? `${greeting} here's what needs your attention today.`
      : `${greeting} here's what's on for today.`

  // Plain-text alternative.
  const textParts = ['Your Stash Squirrel digest', intro]
  if (overdue.length) {
    textParts.push(
      `Overdue (${overdue.length}):\n` +
        overdue
          .map((it) => {
            const meta = [it.list, it.due != null ? `was due ${formatOverdueDate(it.due)}` : '']
              .filter(Boolean)
              .join(' · ')
            return `• ${it.title}${meta ? ` — ${meta}` : ''}`
          })
          .join('\n')
    )
  }
  if (today.length) {
    textParts.push(
      `Due today (${today.length}):\n` +
        today.map((it) => `• ${it.title}${it.list ? ` — ${it.list}` : ''}`).join('\n')
    )
  }
  textParts.push(`Open Stash Squirrel: ${appUrl}`)
  textParts.push(`You're receiving this because you turned on the daily digest. Manage it: ${manageUrl}`)
  const text = textParts.join('\n\n')

  const overdueHtml = digestSectionHtml(`Overdue (${overdue.length})`, '#c92c24', overdue, true)
  const todayHtml = digestSectionHtml(`Due today (${today.length})`, '#1a1a1a', today, false)

  const html = `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:24px;background:#f7f7f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1a1a1a;">
    <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:16px;padding:32px;box-shadow:0 1px 3px rgba(0,0,0,0.06);">
      <h1 style="margin:0 0 16px;font-size:22px;font-weight:600;background:linear-gradient(135deg,#e53b30,#c92c24,#8b2a1f);-webkit-background-clip:text;background-clip:text;color:transparent;font-style:italic;">Stash Squirrel</h1>
      <h2 style="margin:0 0 12px;font-size:18px;font-weight:600;">Your day at a glance</h2>
      <p style="margin:0 0 24px;font-size:14px;line-height:1.5;color:#444;">${intro}</p>
      ${overdueHtml}
      ${todayHtml}
      <p style="margin:0 0 24px;">
        <a href="${appUrl}" style="display:inline-block;background:#c92c24;color:#ffffff;text-decoration:none;padding:10px 20px;border-radius:10px;font-size:14px;font-weight:500;">Open Stash Squirrel</a>
      </p>
      <p style="margin:24px 0 0;font-size:12px;color:#888;">
        You're receiving this because you turned on the daily digest.
        <a href="${manageUrl}" style="color:#888;">Manage it in Settings</a>.
      </p>
    </div>
  </body>
</html>`

  const count = overdue.length + today.length
  await sendEmail({
    to: user.email,
    subject: `Stash Squirrel: ${count} ${count === 1 ? 'item needs' : 'items need'} attention`,
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
