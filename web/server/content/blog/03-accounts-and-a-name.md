---
title: Accounts, security, and finally a name
slug: accounts-and-a-name
summary: Turning a single-user app into something anyone could sign into — and the moment Stash Squirrel got its name.
published: true
date: 2026-04-19
---

A web app that only *I* could use isn't much of a web app. To open the doors, I needed accounts — and accounts you can trust.

The security story went through a few drafts, and I'm glad it did:

1. First a simple login with a token, just to get a lock on the door.
2. Then proper JWT tokens, with credentials moved out of the code and into a safe place.
3. Finally I rebuilt the whole thing on **Better Auth**, and made the app genuinely **multi-tenant** — meaning every person's data is walled off from everyone else's, checked on every single request.

That last step mattered more than any feature. Your lists, your bookmarks, your notes — they're yours, and the app is built so they simply can't leak into anyone else's account.

Somewhere in the middle of all this, the app got its name. It had been going by something forgettable, and one day **Stash Squirrel** stuck: a place to stash the things you'll want later, kept safe until you need them. It fit so well I never looked back. (The squirrel came shortly after, and has been the mascot ever since.)

![Stash Squirrel, the mascot that gave the app its name](/blog-images/squirrel.jpg)

With the doors open and a name on the sign, I could finally start building the things that make Stash Squirrel more than a todo list.

Do you like the name? I still smile at it. Let me know what you think.
