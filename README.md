# Plot Weave

Static site (plain HTML/CSS/JS) on GitHub Pages, with Supabase as the shared backend.

## Settings
Almost everything is changed in the admin panel:
- **Site settings** (top of the admin panel): the site name, the text under it and all other site-wide texts.
- **Circle settings** (inside each circle): name, description, whether new writers can join, the daily time turns are handed out, how much of a story a writer sees, the longest paragraph, and every text a writer sees inside that circle.

Only what is needed to connect and log in stays in `config.js`:
- `ADMIN_USERNAME`: the username that opens the admin view.
- `ADMIN_EMAIL` / `SHARED_EMAIL`: the two Supabase users described below. If you change `ADMIN_EMAIL`, change it in `setup.sql` (function `is_admin`) too.
- `SUPABASE_URL` / `SUPABASE_ANON_KEY`.
- `APP_NAME` / `APP_DESCRIPTION`: only used until a site name and text are saved in the admin panel.

## Setup
1. Run `setup.sql` in the Supabase SQL Editor (safe to re-run; keeps your data and updates the functions). Re-run it whenever the file changes, before publishing the matching site files.
2. Authentication > Users > Add user, with "Auto Confirm User" ticked, twice:
   - `shared@example.com` with the site password everyone gets.
   - `admin@example.com` with your own admin password.
3. Turn OFF "Allow new users to sign up" in the sign-in settings.
4. Put the Project URL and anon key into `config.js`, commit.

## How it works
- Visitors enter the site password once per device, then just a username. Typing the admin username asks for the admin password.
- The admin creates story circles. Users join a circle from their page and can write the first paragraph of their own story right away.
- Once a circle has begun (its first day has been started), joining needs the admin's approval: the request shows up on that circle in the admin panel.
- "Kopieren" in a story's row copies the story so far to the clipboard.
- Turns are handed out per circle when a new day starts: members who have not been asked to start a story are asked to start one; every other story goes to a random member of that circle who has not had a turn in it yet (one turn per member per day).
- A new day starts when the admin presses "Start next day", or daily at the time set in the circle settings. There is no background job: a circle with a daily time starts its day at the first visit (by a writer or the admin) after that time.
- A writer who has not written when the next day starts misses that turn for good. The circle moves on without the paragraph, and the admin sees a "Missed turns" notice on that circle.
- A circle is finished when no turn is open and every member has written or missed every turn. The admin can then conclude it.
- Stories are published one by one: in a concluded circle, "Bearbeiten" on a story lets the admin set a title and a picture and publish it (or take it back). Everyone with the site password sees the list of published stories and can open one to read it, without the names of who wrote what. Pictures are shrunk in the browser and stored in the database.
- The admin can edit any paragraph from the dashboard.
- "Kreis löschen" does not delete anything: it sets `archived_at` on the circle, which hides it everywhere. To bring a circle back, set `archived_at` to null in the Supabase table editor.
- A writer can change their paragraph until the next day starts.
- How much of a story a writer sees (first N and last N paragraphs) is enforced by the database.
- The background colour changes every day (same colour for everyone on the same date).
