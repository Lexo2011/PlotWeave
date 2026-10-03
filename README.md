# PlotWeave (Story Relay prototype)

Static site (plain HTML/CSS/JS) with two modes:
- **Demo mode** (default): data stays in your browser, no password. "Simulate next day" lets you play several days.
- **Live mode**: stories are shared through Supabase and the whole site sits behind one shared password.

## Deploy on GitHub Pages
Settings > Pages > Deploy from a branch > `main` > `/ (root)`.

## Go live with Supabase
1. Create a free project at supabase.com.
2. SQL Editor: paste and run `setup.sql`.
3. Authentication > Users > Add user > Create new user. Email `shared@example.com` (must match `SHARED_EMAIL` in `config.js`), password = your site password, tick "Auto Confirm User".
4. Authentication > Sign In / Providers (or Settings): turn OFF "Allow new users to sign up".
5. Project Settings > API: copy the Project URL and anon public key into `config.js`, then commit.

## How it works
- Visitors enter a username plus the site password. Supabase checks the password; without it, no story data can be read or written.
- The username is just a name. Everyone shares one password, so anyone who knows it could type another person's username.
- To change the password: Authentication > Users > the shared user > reset password.
- A "day" is the server's UTC date. Open stories only reveal their last paragraph.
