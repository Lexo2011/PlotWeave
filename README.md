# Story Relay

Static site (plain HTML/CSS/JS) that works in two modes:
- **Demo mode** (default): everything is stored in your browser. Open `index.html` and try it; "Simulate next day" lets you play several days.
- **Live mode**: stories are shared through Supabase.

## Deploy on GitHub Pages
1. Create a GitHub repo and upload these files to the root.
2. Settings > Pages > Source: "Deploy from a branch", branch `main`, folder `/ (root)`.
3. Your site appears at `https://<username>.github.io/<repo>/`.

## Go live with Supabase
1. Create a free project at supabase.com.
2. SQL Editor: paste and run `setup.sql`.
3. Authentication > URL Configuration: set Site URL to your GitHub Pages address.
4. Project Settings > API: copy the Project URL and the anon public key into `config.js`, then commit. (The anon key is meant to be public; the security rules in `setup.sql` protect the data.)

## Notes
- A "day" is the server's UTC date.
- Open stories are only readable through `get_turn()`, which reveals just the last paragraph. Finished stories are public.
- Not built yet: moderation/reporting, deleting accounts, email rate limits.
