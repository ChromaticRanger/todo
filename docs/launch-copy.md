# Launch copy

Drafts for Show HN, Product Hunt and Reddit. Written 2026-10-04.

Everything here leads on the same two beats, in this order:

1. **What it is** — todos, bookmarks and notes in one list.
2. **Who it's for** — too small for Notion, too organised for a Google Doc.

Three things carry more weight than any phrasing, so don't let them get edited out:

- **The demo link, early and unmissable.** One click, no signup, thirty minutes in a real account. For a sceptical audience this does more than any paragraph.
- **Pricing stated plainly, before anyone asks.** Free is 3 lists / 50 items; Pro is £6/mo or £60/yr. Being coy reads as a trap.
- **Export exists.** "You can take everything out as JSON, free plan or lapsed subscription included." This is the answer to the lock-in question, and it's better volunteered than extracted.

---

## Show HN

**Title** (80 char limit; this is 63):

```
Show HN: Stash Squirrel – todos, bookmarks and notes in one list
```

Don't write "I built" — the Show HN prefix already says that. Don't add adjectives; HN strips them mentally anyway.

**The comment to post immediately after submitting:**

> Hi HN. Stash Squirrel is somewhere to keep todos, bookmarks and notes in the same list.
>
> The itch: a side project has a ship checklist, three links I keep losing, half-formed notes about tone of voice, and a launch date. That's four apps, and the thing that connects them — the thing that makes them *my project* — only exists in my head. Most tools make you pick a shape first: tasks here, links there, documents somewhere else.
>
> It started as a CLI I built for myself — `todo --add "buy milk"`, a `--json` flag so other tools could read it, and a small MCP server so I could ask Claude to manage the list. It did the job, but I kept wanting to *see* it: colours, drag and drop, a calendar. That's what turned a script into a web app.
>
> You can try it without signing up — there's a demo button on the home page that drops you into a pre-loaded account for thirty minutes. Everything works. Sign up before it ends if you want to keep what you made.
>
> Free is 3 lists and 50 items. Pro is £6/month: unlimited lists, events and a calendar across every list, search, shared lists, and Discover (a catalogue of lists you can clone). You can export everything you've put in as JSON at any time, free plan included — being able to leave shouldn't be a paid feature.
>
> Built solo. Vue 3, Express, Postgres, on DigitalOcean. Most of the build is written up at stash-squirrel.com/blog if the how is more interesting than the what.
>
> Happy to answer anything, including the "why not just use X" questions — they're fair.

**Timing.** Weekday, 8–10am UK (3–5am ET) puts you on /newest as the US wakes. Post the comment within a minute of submitting. Then stay at the keyboard for four hours — on HN, replying fast matters more than the post itself.

**Prepared answers.** Don't paste these verbatim; they're the positions, not the script.

*"Another todo app?"* — Fair, and it's why the first line isn't "a todo app". The claim is narrower: one list holds a task, a link and a note together. If you've never wanted that, this isn't for you and I'd rather say so than argue.

*"Why not Notion / Obsidian / org-mode?"* — All of those can do this and more. The gap I kept falling into was things too small to deserve a Notion database and too structured for a text file. If you're happy in org-mode you are almost certainly not my user.

*"£6/month for a todo app?"* — It's a real bill: managed Postgres, email, a Stripe account and my time. The free tier is genuinely usable rather than a trial, and everything exports. If it isn't worth £6 to you, the free plan doesn't expire.

*"Can I self-host?"* — Not today. The code isn't open and I'm not going to pretend a decision I haven't made is a roadmap item.

*"What happens to my data if you stop?"* — Export is one button on the account page, and it's not gated on a subscription. That's the honest answer to the lock-in question and the reason I built it before posting this.

*"Is it encrypted?"* — In transit and at rest, via managed Postgres. Not application-level encryption, because it would break search, previews and Discover, and that trade-off is disclosed in the privacy policy rather than fudged.

---

## Product Hunt

**Tagline** (60 char limit; this is 48):

```
Todos, bookmarks and notes — together in one list
```

**Description** (260 char limit):

```
A list in Stash Squirrel holds todos, bookmarks and notes at the same
time, because real projects do. Kanban or grid, a calendar across every
list, and lists you can share. Too small for Notion, too organised for
a Google Doc. Try it with no signup.
```

**First comment (maker's note):**

> Hi 👋 I'm Martin, and I built this on my own over the past year.
>
> It came out of a small frustration: every project I start ends up spread across four apps. The tasks in one, the links in another, the notes in a third, the dates in a calendar. Each app is good at its own shape and useless at the others, and the thing that ties them together only lives in my head.
>
> So Stash Squirrel lets one list hold all of it. A trip has the visa todo, the restaurant bookmark, the hotel confirmation note and the flight time, side by side. Flip the same list to a kanban board when you'd rather drag than scroll.
>
> **You can try it without signing up** — there's a demo button on the home page that puts you in a real pre-loaded account for thirty minutes. Break it, drag things about, see if the idea suits you.
>
> Free covers 3 lists and 50 items. Pro is £6/month for unlimited lists, events and a calendar spanning every list, search, shared lists and Discover. Everything you put in exports as JSON whenever you want, free plan included.
>
> I'll be here all day — tell me what's wrong with it.

**Also needed:** the OG image works as the thumbnail, and the five showcase screenshots in `web/public/showcase/` are already sized for the gallery. Lead with the mixed-item list and kanban, not the calendar.

---

## Reddit

Reddit punishes anything that reads like an ad, and every subreddit has its own self-promotion rule. **Check each one's rules on the day** — several require a minimum account age or a comment-to-post ratio, and a removed post costs you the subreddit for months.

### r/SideProject — build story

> **I spent a year building a place to keep todos, bookmarks and notes in the same list**
>
> It started as a command-line tool for myself — `todo --add "buy milk"` and back to work. Over a few weeks it grew due dates, named lists, a JSON output so other tools could read it. It was never meant to be a product.
>
> Then I kept wishing I could *see* it. That's what turned a script into a web app, and the web app into a year of evenings.
>
> The one idea it's built around: a list holds todos, bookmarks *and* notes together, because real projects do. A trip is a visa reminder, a restaurant link, a hotel confirmation and a flight time — four apps today, one list here.
>
> Built with Vue 3, Express and Postgres, solo. There's a no-signup demo on the home page if you want to poke at it, and I wrote up most of the build as I went.
>
> Happy to answer anything about the build, the stack, or the bits I got wrong — there were a few.

### r/productivity — problem first, link last

Lead with the problem and let people ask. A post that opens with a product name gets removed.

> **Does anyone else lose track of a project because it's spread across four apps?**
>
> Every project I start ends up in pieces. Tasks in a todo app, links in browser bookmarks, notes in a notes app, dates in a calendar. Each one is fine on its own, but the connective tissue — the thing that makes them one project — only exists in my head, and it falls out when I'm away for a week.
>
> I got tired enough of it to build something where a single list holds all of it: the task, the link, the note, the date, side by side.
>
> What I'm curious about: how do you handle this? Is it a real problem that everyone quietly works around, or am I unusual for wanting one list instead of four?
>
> (I'll link what I built in a comment if anyone wants it rather than putting it in the post — happy to keep this about the problem.)

### r/webdev — technical

> **Built a mixed-item list app solo — Vue 3, Express, Postgres. A few things I'd do differently.**
>
> A year of evenings on a web app where one list holds todos, bookmarks and notes together. Some things worth passing on:
>
> - **A single-page app serves one HTML file to every URL**, so every page shared the same title and description. Google runs JS and sorts it out eventually; Slack, X and LinkedIn don't, so every link shared anywhere rendered as a bare URL. Fixing it meant injecting per-route meta server-side before sending the shell — not full prerendering, just the part scrapers read.
> - **Scheduled GitHub Actions are not a cron.** A daily digest on an hourly `schedule:` delivered 100 of 428 runs over 18 days, with gaps up to 7.8 hours. Because the job only emails users whose local time is inside a send window, a dropped run isn't a late email, it's no email — one timezone was missing 29% of days, and every run reported success. It's an in-process timer now.
> - **Postgres `COUNT(*)` is a bigint**, which node-postgres hands back as a string. Sort by a `::TEXT` alias and "9" lands above "10" while looking entirely plausible.
>
> Demo on the home page if you want to see the thing itself, no signup.

---

## Order of operations

1. Publish the blog post (`13-saying-hello-properly.md`, needs `npm run db:seed-blog`) so the other channels have something to point at.
2. **Share the home page into Slack or a DM first** and check the preview renders with the image. If a platform cached the old empty shell, X and LinkedIn both have card debuggers that force a refetch.
3. Show HN, early in the UK morning. Stay available for four hours.
4. Product Hunt the same day or the next — it rewards a full day of replies, so don't stack it on an HN day you'll spend firefighting.
5. Reddit last, one subreddit at a time, spaced out. Posting the same thing to three subs in an hour is the fastest route to a ban.

## What to watch while it's happening

- `doctl apps logs <app-id> --type run --follow` — demo starts and any 500s
- Demo users accumulate at 116 rows each; cleanup runs daily, which is fine
- Measured headroom: roughly 50 demo starts/sec across both instances, 8 of 22 DB connections in use. A front page is a few requests a second, so there's room — but watch rather than assume
