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

## Advent calendar
`advent.html` / `advent.js` are the calendar, a separate page behind the site password; the README lists what it does. Decisions the user made:
- One door per day; first day and number of doors are settings (`advent_start`, `advent_days`), so it may start before 1 December. Doors open strictly by date (midnight, Europe/Berlin), enforced in `advent_open()`.
- Layout follows the user's sketch: centred title, home link top left, four doors per row, one picture per door (`advent_doors`), numbers counting down.
- Items behind a door (`advent_items`) are stories, pictures and videos. Story items are freely editable copies; files are in the private storage bucket `advent`.
- The calendar is the one place where an author is shown: a free text field, prefilled with the author name (`authors` table) of whoever started the story. Usernames and who wrote which paragraph stay hidden.
- Comments with answers under every item (`advent_comments`), shown with the writer's username (the user asked for that). No likes/dislikes. Writer and admin can edit and delete; deleting is soft (`deleted_at`). The writer is identified only by the username they type, as everywhere on the site.
- The admin edits the calendar on `advent.html` itself, using the admin session from `index.html`.
