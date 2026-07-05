---
title: From the terminal to the browser
slug: from-terminal-to-browser
summary: The leap from a command-line script to a real web app — a database move, a front end, and a lot of new questions.
published: true
date: 2026-04-07
---

For a couple of months the todo tool lived happily in my terminal. Then I decided to give it a face.

The first job was unglamorous but important: I moved all the data out of a local file and into a proper **PostgreSQL database**. That one change unlocked everything that followed — a place for data to live that a website could reach from anywhere.

Then came the front end. I built the first web version with Vue, and suddenly the todos I'd only ever seen as lines of text had colour, layout, and buttons you could click. To keep it feeling as snappy as the command line, I added a small in-memory cache so switching between lists was instant instead of waiting on the server each time.

There were plenty of teething problems — a wildcard route that fought me, database connections that needed rationing, favicons that wouldn't behave. Little things, but they're the difference between "a demo" and "something you'd actually use".

Seeing it in a browser for the first time was the moment this stopped being a private script and started being a *product* I wanted other people to have. Everything since has been building on that foundation.

Next: the slightly nerve-wracking step of letting other people in — accounts, security, and finally a name.
