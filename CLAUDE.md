# Plot Weave – notes for Claude

A German-language collaborative story site: writers in a "circle" each start a story, and the stories pass from writer to writer, one paragraph per day. The README describes the features in detail.

## How it is built
- Static site without build step: `index.html`, `app.js`, `style.css`, `config.js`, served by GitHub Pages from `main`. Other branches do not go live until merged into `main`.
- Backend is Supabase (project `gbbpfmdwtxdqysudfiue`, URL and publishable key in `config.js`). Visitors log in as one shared Supabase user (the site password); the admin logs in as a second user.
- `setup.sql` holds the whole schema and all functions. It is safe to re-run and keeps data. Writers only reach data through `security definer` functions (`my_state`, `submit_turn`, `published_stories`, `published_story`, …). Only the admin reads tables directly.
- Database changes reach the live site only when the user pastes `setup.sql` into the Supabase SQL Editor. Sessions usually have no direct database access. Before anything that changes data, have the user run `backup.sql` first.
- Pushing site files that depend on new columns or functions breaks the live page until `setup.sql` has run, so update the database first, then the page.

## Conventions the user asked for
- The interface is German and addresses writers with "du".
- As much as possible is configurable in the admin panel, especially texts. Site-wide texts are in `SITE` in `app.js` (stored in the `settings` table); texts that belong to one circle are in `CIRCLE` (stored in `circles.texts`). Circle-specific settings belong on the circle, not site-wide.
- Never delete user data: deleting a circle only sets `archived_at`; removing a member only sets `removed_at`.
- Who wrote what is shown only in the admin view, never to readers.
- Code style: compact plain JavaScript and SQL, short comments only where something is not obvious.
- The site password and admin credentials are not in the repository. Ask the user if you need them.

## Current phase: advent calendar
The next step is an advent calendar built from the stories written so far. The user will pitch the ideas, so ask rather than assume. Questions likely to come up:
- Which stories go in (all of a circle, only published ones, picked by the admin) and how they map to 24 doors.
- Whether doors open by date (1 to 24 December, in which time zone) and what a closed door shows.
- Whether it is part of the existing site behind the site password or a separate page, and who may see it.
- Whether authors stay anonymous (they do everywhere else) and whether story pictures are used.
- Published stories are available to logged-in visitors through `published_stories()` and `published_story(id)`.
