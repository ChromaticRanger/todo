/**
 * Regenerates the help-centre screenshots in public/help-images/.
 *
 * Runs against a live dev (or prod) instance, drives a throwaway DEMO session
 * — never a real account — and screenshots the key surfaces. Re-run whenever
 * the UI changes so the help pages stay honest:
 *
 *   npm run help:shots            # expects the dev server on localhost:5173
 *   HELP_SHOTS_URL=... npm run help:shots
 */
import { chromium, type Locator, type Page } from 'playwright'
import { mkdirSync } from 'fs'
import path from 'path'

const BASE = process.env.HELP_SHOTS_URL ?? 'http://localhost:5173'
const OUT = path.join(import.meta.dirname, '../public/help-images')

const captured: string[] = []
const skipped: string[] = []

function out(name: string): string {
  return path.join(OUT, `${name}.png`)
}

async function settle(page: Page, ms = 600) {
  await page.waitForTimeout(ms)
}

/** Screenshot the page area covering all the given locators, plus padding. */
async function shotAround(page: Page, name: string, locators: Locator[], pad = 16) {
  const boxes = []
  for (const l of locators) {
    const b = await l.boundingBox()
    if (b) boxes.push(b)
  }
  if (boxes.length === 0) throw new Error('no visible targets')
  const x1 = Math.max(0, Math.min(...boxes.map((b) => b.x)) - pad)
  const y1 = Math.max(0, Math.min(...boxes.map((b) => b.y)) - pad)
  const x2 = Math.max(...boxes.map((b) => b.x + b.width)) + pad
  const y2 = Math.max(...boxes.map((b) => b.y + b.height)) + pad
  await page.screenshot({
    path: out(name),
    clip: { x: x1, y: y1, width: x2 - x1, height: y2 - y1 },
  })
}

/**
 * Reset UI state between captures. Escape closes modals/dialogs; the neutral
 * header click closes click-outside menus (the Add-type menu and the theme
 * picker's invisible full-screen backdrop don't listen for Escape).
 */
async function reset(page: Page) {
  for (let i = 0; i < 2; i++) {
    await page.keyboard.press('Escape')
    await page.waitForTimeout(150)
  }
  await page.mouse.click(600, 20) // empty stretch of the header bar
  await page.waitForTimeout(250)
}

async function capture(page: Page, name: string, fn: () => Promise<void>) {
  // Two attempts: late-arriving overlays (e.g. the due-today modal) can block
  // a click mid-capture; reset() clears them and the retry usually lands.
  for (let attempt = 1; attempt <= 2; attempt++) {
    await reset(page)
    try {
      await fn()
      captured.push(name)
      console.log(`  ✓ ${name}`)
      return
    } catch (err) {
      if (attempt === 2) {
        skipped.push(name)
        console.warn(`  ✗ ${name}: ${String(err).split('\n')[0]}`)
      }
    }
  }
}

const addMenu = (page: Page) => page.locator('[data-tour="add-buttons"] .absolute')

async function openAddMenu(page: Page) {
  if (!(await addMenu(page).isVisible())) {
    await page.locator('[data-tour="add-buttons"] > button').click()
    await addMenu(page).waitFor({ state: 'visible' })
  }
}

/** Open the form modal for one Add-menu item and screenshot it. */
async function shotAddForm(page: Page, name: string, itemText: string) {
  await openAddMenu(page)
  await addMenu(page).locator('button', { hasText: itemText }).first().click()
  const modal = page.locator('.modal-card')
  await modal.waitFor({ state: 'visible' })
  await settle(page, 300)
  await modal.screenshot({ path: out(name) })
}

/** Click an action icon on the first item card that has one, then shoot the dialog. */
async function shotItemDialog(page: Page, name: string, buttonTitle: string) {
  const btn = page.locator(`[title="${buttonTitle}"]`).first()
  await btn.scrollIntoViewIfNeeded().catch(() => {})
  // The icons only reveal on card hover; a DOM-level click sidesteps
  // Playwright's visibility/occlusion checks, which are flaky here.
  await btn.evaluate((el) => (el as HTMLElement).click())
  const modal = page.locator('.modal-card')
  await modal.waitFor({ state: 'visible' })
  await settle(page, 300)
  await modal.screenshot({ path: out(name) })
}

async function main() {
  mkdirSync(OUT, { recursive: true })
  const browser = await chromium.launch()
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 2,
    reducedMotion: 'reduce',
  })
  context.setDefaultTimeout(8000)
  const page = await context.newPage()

  console.log(`Capturing from ${BASE} …`)

  // ── Start a throwaway demo session ────────────────────────────────────────
  await page.goto(BASE)
  await page.getByRole('button', { name: 'Open the demo' }).first().click()
  await page.waitForSelector('[data-tour="list-tabs"]', { timeout: 20_000 })
  // The demo-session banner is honest UI for demo users but noise in help
  // images — hide it (and the header's DEMO pill row stays, which is fine).
  await page.addStyleTag({ content: '[data-demo-banner] { display: none !important; }' })
  await settle(page, 1500) // let seed content, tour and modals arrive

  // Dismiss the welcome tour explicitly — its spotlight overlay swallows
  // clicks, and Escape timing alone is unreliable.
  const skipBtn = page.getByRole('button', { name: /skip/i }).first()
  if (await skipBtn.isVisible().catch(() => false)) {
    await skipBtn.click()
    await settle(page, 400)
  }

  await capture(page, 'app-overview', async () => {
    // The demo's Home list is dominated by the big welcome note; Travel shows
    // ordinary categorised todos, which illustrates the app far better.
    await page.locator('[data-tour="list-tabs"] .list-tab-handle', { hasText: 'Travel' }).click()
    await settle(page, 800)
    await page.screenshot({ path: out('app-overview') })
  })

  await capture(page, 'view-switcher', async () => {
    await shotAround(page, 'view-switcher', [page.locator('[data-tour="view-switcher"]')], 10)
  })

  await capture(page, 'search-modal', async () => {
    await page.locator('[data-tour="search"]').click()
    const modal = page.locator('.modal-card')
    await modal.waitFor({ state: 'visible' })
    await modal.locator('input').fill('re')
    await settle(page, 900) // debounce + results
    await modal.screenshot({ path: out('search-modal') })
  })

  await capture(page, 'todo-form', () => shotAddForm(page, 'todo-form', 'Todo'))
  await capture(page, 'event-form', () => shotAddForm(page, 'event-form', 'Event'))

  await capture(page, 'add-menu', async () => {
    await openAddMenu(page)
    await shotAround(page, 'add-menu', [
      page.locator('[data-tour="add-buttons"]'),
      addMenu(page),
    ])
  })

  await capture(page, 'snooze-dialog', () => shotItemDialog(page, 'snooze-dialog', 'Remind me later'))
  await capture(page, 'move-dialog', () => shotItemDialog(page, 'move-dialog', 'Move to list'))

  await capture(page, 'kanban', async () => {
    await page.locator('[title="Kanban view"]').click()
    await settle(page)
    await page.screenshot({ path: out('kanban') })
    await page.locator('[title="Grid view"]').click()
  })

  await capture(page, 'import-dialog', async () => {
    await page.locator('[title="Import bookmarks from a browser export"]').click()
    const modal = page.locator('.modal-card')
    await modal.waitFor({ state: 'visible' })
    await settle(page, 300)
    await modal.screenshot({ path: out('import-dialog') })
  })

  await capture(page, 'calendar', async () => {
    await page.locator('[title="Overall schedule"]').click()
    await settle(page, 1200)
    await page.screenshot({ path: out('calendar') })
    await page.locator('[title="Back to lists"]').click()
  })

  await capture(page, 'discover', async () => {
    await page.locator('[title="Discover community lists"]').click()
    await settle(page, 1200)
    await page.screenshot({ path: out('discover') })
    await page.locator('[title="Back to lists"]').click()
  })

  // Theme picker leaves a click-outside backdrop; keep it near the end and
  // rely on the next reset()'s neutral click to clear it.
  await capture(page, 'theme-picker', async () => {
    await page.locator('[data-tour="theme-picker"] button').first().click()
    await settle(page, 300)
    await shotAround(page, 'theme-picker', [
      page.locator('[data-tour="theme-picker"]'),
      page.locator('[data-tour="theme-picker"] .absolute'),
    ])
  })

  await capture(page, 'settings', async () => {
    await page.goto(`${BASE}/settings`)
    // full navigation → the injected style tag is gone; re-add it
    await page.addStyleTag({ content: '[data-demo-banner] { display: none !important; }' })
    await settle(page, 1200)
    await page.screenshot({ path: out('settings'), fullPage: true })
  })

  await browser.close()

  console.log(`\n${captured.length} captured → ${OUT}`)
  if (skipped.length) {
    console.warn(`Skipped (selector not found / UI changed?): ${skipped.join(', ')}`)
    process.exitCode = 1
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
