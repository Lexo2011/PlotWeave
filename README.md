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
- The admin creates story circles. Users join a circle from their page (automatically, if there is only one to choose from) and can write the first paragraph of their own story right away.
- Once a circle has begun (its first day has been started), joining needs the admin's approval: the request shows up on that circle in the admin panel.
- "Kopieren" in a story's row copies the story so far to the clipboard.
- The × next to a member's name removes them from the circle: they get no more turns, an open turn is closed, and what they wrote stays. They cannot join that circle again on their own; "wieder aufnehmen" brings them back.
- Turns are handed out per circle when a new day starts: members who have not been asked to start a story are asked to start one; every other story goes to a member of that circle who has not had a turn in it yet (one turn per member per day). Stories and members are paired so that as many stories as possible get a writer; among equally good pairings the choice is random.
- A new day starts when the admin presses "Start next day", or daily at the time set in the circle settings. There is no background job: a circle with a daily time starts its day at the first visit (by a writer or the admin) after that time.
- A writer who has not written when the next day starts misses that turn for good. The circle moves on without the paragraph, and the admin sees a "Missed turns" notice on that circle.
- A circle is finished when no turn is open and every member has written or missed every turn. The admin can then conclude it.
- "Schlussrunde starten" (on a finished or concluded circle) hands every story without an ending to one more member, who sees the whole story and writes its ending. Nobody gets the story whose last paragraph they wrote. It switches off the circle's daily time and reopens a concluded circle; conclude it again once the endings are in.
- Backups: "Sicherung herunterladen" in the admin panel saves everything as a JSON file. `backup.sql` (run in the SQL Editor) copies all tables into the schema `backup` inside the database.
- Stories are published one by one: in a concluded circle, "Bearbeiten" on a story lets the admin set a title and a picture and publish it (or take it back). Once at least one story is published, everyone with the site password sees the list of published stories and can open one to read it, without the names of who wrote what. Pictures are shrunk in the browser and stored in the database.
- The admin can edit any paragraph from the dashboard.
- "Kreis löschen" does not delete anything: it sets `archived_at` on the circle, which hides it everywhere. To bring a circle back, set `archived_at` to null in the Supabase table editor.
- A writer can change their paragraph until the next day starts.
- When a story has only a few paragraphs left (3 by default, set per circle; 0 turns it off), the writer continuing it is told so, and on the last paragraph that it is the last one.
- How much of a story a writer sees (first N and last N paragraphs) is enforced by the database.
- The background colour changes every day (same colour for everyone on the same date).

## Advent calendar
`advent.html` is a page of its own behind the same site password. Its address is the site's address plus `/advent.html`.
- One door per day. The first day and the number of doors are set under "Kalendereinstellungen", so the calendar can start before 1 December. Doors count down by default (the first day shows the highest number, the last day 1); this can be switched off.
- Door n opens on its day at midnight, German time, and stays open. The database does not hand out what is behind a closed door, and the storage bucket does not hand out its files.
- Each door can have its own front picture (visible to everyone, also while the door is closed) and holds any number of items: stories, pictures and videos.
- A story item is a copy of a story from a circle (or starts empty). Title, author, text and preview picture are edited freely; the original story is not touched.
- "Autorennamen" maps usernames to author names. A story shows the author name of whoever wrote its first paragraph, unless the admin types another author for it. Pictures and videos show only a typed author. The wording of the author line is set separately for stories, pictures and videos. Usernames are never shown in the calendar.
- Every item can have a short text (an abstract or similar) that is shown on its card in the door.
- Pictures and videos are uploaded to the private Supabase storage bucket `advent` (created by `setup.sql`). The Supabase plan limits the file size (free plan: 50 MB per file, 1 GB in total).
- Editing: log in as admin on the main page, then open `advent.html` (link "Adventskalender bearbeiten" in the admin panel). The admin sees behind every door.
- Comments: under every item, everyone with the site password can comment and answer comments, under their username (the one from the main page, or typed once on the calendar page). No likes. Writer and admin can change or delete a comment; deleting only sets `deleted_at`, a deleted comment with answers stays as a placeholder, and the admin can bring it back. Comments can be read and written only once the item's door is open.
- All calendar texts are in `TEXTS` in `advent.js` and are changed under "Kalendereinstellungen".
