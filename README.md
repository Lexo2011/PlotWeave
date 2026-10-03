# Plot Weave

Static site (plain HTML/CSS/JS) on GitHub Pages, with Supabase as the shared backend.

## Settings you can change later (config.js)
- `APP_NAME`: the title and heading.
- `ADMIN_USERNAME`: the username that opens the admin view.
- `ADMIN_EMAIL` / `SHARED_EMAIL`: the two Supabase users described below. If you change `ADMIN_EMAIL`, change it in `setup.sql` (function `is_admin`) too.

## Setup
1. Run `setup.sql` in the Supabase SQL Editor (deletes earlier tables and data).
2. Authentication > Users > Add user, with "Auto Confirm User" ticked, twice:
   - `shared@example.com` with the site password everyone gets.
   - `admin@example.com` with your own admin password.
3. Turn OFF "Allow new users to sign up" in the sign-in settings.
4. Put the Project URL and anon key into `config.js`, commit.

## How it works
- Visitors enter the site password once per device, then just a username. Typing the admin username asks for the admin password.
- The admin creates story circles. Users join a circle from their page.
- "Start next day" (admin) hands out turns: members without a story start one; every other story goes to a random member of that circle who hasn't written in it yet (one turn per member per day). Unanswered turns are handed out again.
- Each member writes in each story of the circle exactly once. When every story has a paragraph from every member, the admin can conclude the circle and its stories become readable for everyone.
- The admin can edit any paragraph from the dashboard.
