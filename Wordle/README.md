# Wordle (Offline PWA)

A fully offline-capable Wordle clone you can install on iOS, Android, and desktop. No accounts, no servers, no tracking — your stats live on your device.

## Features

- 🎯 **Daily puzzle** — same word for everyone on a given day (deterministic, computed locally)
- 🔁 **Practice mode** — unlimited random puzzles
- ⚙️ **Hard mode** — revealed hints must be used in subsequent guesses
- 🌙 **Dark theme** + **High contrast (color-blind) mode**
- 📊 **Statistics** — wins, streaks, guess distribution
- 📋 **Share results** — copies an emoji grid to clipboard
- ⌨️ **Physical & on-screen keyboards**
- 💾 **Saves in-progress games** automatically
- 📱 **Installable PWA** — works fully offline after first load

## Project structure

```
wordle-app/
├── index.html
├── manifest.json
├── service-worker.js
├── css/
│   └── style.css
├── js/
│   ├── words.js     # Both word lists (answers + valid guesses)
│   └── game.js      # Game logic
├── icons/           # PWA icons (32, 180, 192, 512 + maskable)
└── README.md
```

## Publishing to GitHub Pages

1. **Create a new repository** on GitHub (e.g. `wordle`).
2. **Push these files** to the repository's default branch:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/wordle.git
   git push -u origin main
   ```
3. **Enable GitHub Pages**: go to **Settings → Pages**, set source to `Deploy from a branch`, choose `main` and `/ (root)`, and save.
4. After a minute or two your game will be live at:
   `https://YOUR_USERNAME.github.io/wordle/`

> If you publish to the root of a custom domain or a `<username>.github.io` repo, no path changes are needed — every URL in this app is relative.

## Installing the app

Once the site is live, open it in a browser and install:

- **iOS / Safari** — tap the Share button → **Add to Home Screen**.
- **Android / Chrome** — tap the menu (⋮) → **Install app** (or "Add to Home Screen"). You may also see an install banner.
- **Desktop / Chrome / Edge** — click the install icon in the address bar (or **⋮ → Install Wordle**).

After installation, **the game will work fully offline** — open it from the home screen even with no internet connection.

> The first visit caches all assets via the service worker. Subsequent visits and offline launches load instantly from the cache.

## Updating the game

If you change any file, edit `service-worker.js` and bump `CACHE_VERSION` (e.g. `'wordle-v2'`). On the next online visit, users' devices will pick up the new version automatically.

## Word lists

- **Answers** (~2,300 words) — the curated solution list. Used to choose the daily word.
- **Valid guesses** (~14,800 words) — every word the game accepts as a guess.

The daily puzzle is determined by:
```
dayNumber = floor((today_UTC - 2021-06-19_UTC) / 1 day)
answer    = ANSWERS[dayNumber % ANSWERS.length]
```

This means everyone running this app sees the same word on the same day, with no server needed. Once the list wraps (after ~6 years), it cycles.

## Local development

Service workers require a non-`file://` origin. Run any static server:

```bash
# Python
python3 -m http.server 8000

# Or Node
npx serve .
```

Then open `http://localhost:8000`.

## Privacy

Everything runs on your device. The app makes **no** network requests after the initial load. Your stats and settings are stored in `localStorage`.
