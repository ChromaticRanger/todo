---
title: It started in a terminal
slug: it-started-in-a-terminal
summary: Before Stash Squirrel had a single pixel, it was a little command-line tool I built to scratch my own itch.
published: true
date: 2026-02-08
---

Every project has an origin story, and Stash Squirrel's is not a glamorous one. It began as a handful of commands I typed into a terminal.

I wanted somewhere to keep my todos that felt fast and stayed out of my way. No app to open, no page to load — just `todo --add "buy milk"` and back to work. So I built exactly that.

Over a few weeks it grew the features I kept reaching for:

- **Due dates**, including friendly relative ones like `1w` for "a week from now"
- **A schedule view** that listed everything by when it was due
- **Named lists**, so work and home didn't bleed into each other
- **Moving items** between those lists
- A `--json` flag so other tools could read my todos
- Even a small **MCP server**, so I could ask Claude to manage the list for me

![An early version of the command-line app that started it all](/blog-images/command-line.png)

It was never meant to be a product. It was a tool for an audience of one. But the more I used it, the more I wished I could *see* it all — colours, drag-and-drop, a calendar. The terminal could only take the idea so far.

That itch is what turned a script into the thing you're using now. More on that next time.

If you're curious about any corner of how this was built, I'd genuinely love to hear it — that's what this blog is for.
