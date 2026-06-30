# Bookshelf — Feature Backlog

Features are grouped by effort. Heavy = 3+ days, Medium = 1-2 days, Easy = a few hours.
Pick anything from this list and run `/feature-dev <item>` to start the pipeline.

---

## Already Built
- Book shelves: Want to Read / Reading / Read / Favorites / DNF
- Search via Open Library API with quality filtering
- Discover tab with dynamic Book of the Week (rotates by week)
- Similar books panel in modal (lazy-loaded)
- Public profile pages (`/u/username`) with shelf grids
- "+ Want to Read" button on other users' public profiles
- Reading history timeline on own profile
- Notes & quotes per book
- Goodreads CSV import
- Dark mode
- PWA (installable)
- Collections (custom groupings)
- Reading stats: streak, pace, monthly heatmap
- OAuth login: Google + GitHub
- Post-read recommendations panel
- Rate limiting: login / register / reset-password
- Password strength indicator on register

---

## Heavy Lift (3+ days)

### H1 — Social Follow + Activity Feed
Follow other users. See a feed of books they're finishing, adding, or rating. The public profile + Want button infrastructure is already in place — this is the natural next step.
- New DB tables: `follows`, `activity_events`
- Feed endpoint: `/api/feed` — paginated events from followed users
- Follow/unfollow button on `/u/username` pages
- New `/feed` tab or section in app
- Notification dot when new feed activity exists

### H2 — Book Clubs / Group Reading
Create or join a private reading group. Members pick a current book, track each other's progress, and post threaded comments.
- New DB tables: `groups`, `group_members`, `group_books`, `group_comments`
- `/clubs` page: create group, invite by username, set active book
- Comment thread on shared book with timestamps
- Member progress indicators (who's finished, who's reading)

### H3 — Email Notifications & Weekly Digest
Opt-in weekly email: books finished this week, current streak, one AI-suggested read. Re-engages lapsed users.
- nodemailer + SMTP config (or Resend/Sendgrid)
- `email_prefs` table: digest opt-in, streak reminders
- Weekly digest template (HTML email)
- Node cron job firing every Monday
- Streak reminder: email if no activity in 3 days

### H4 — Recommendation Engine (Personalized)
Instead of just "similar books", build a proper engine: collaborative filtering based on what users with similar tastes have read, weighted by ratings.
- Build user-book rating matrix from shelf + ratings data
- Cosine similarity or simple overlap scoring across users
- `/api/recommend` endpoint returning ranked suggestions
- "Recommended for you" section on Discover tab

### H5 — Mobile Push Notifications (PWA)
Web Push API for streak reminders, new follower activity, book club messages. Extends the existing PWA setup.
- Service worker push event handler
- Web Push VAPID key setup (web-push npm package)
- Subscription management endpoint
- Notification triggers: streak at risk, follower finishes a book

---

## Medium Lift (1-2 days)

### M1 — Star Ratings + Short Reviews ⭐ (Recommended next)
Add 1–5 star ratings to any shelved book. Optional one-paragraph review. Shows on public profiles with aggregate star average.
- New `ratings` table: `user_id`, `book_key`, `stars`, `review_text`, `created_at`
- Star picker in book modal (only shown when book is on a shelf)
- Public profile: show avg rating + review snippet per book
- `/api/books/:key/ratings` public endpoint

### M2 — Advanced Reading Analytics
Deeper stats page: genre breakdown pie chart, reading pace over time, fastest/slowest book, author diversity score.
- Aggregate genre data from Open Library on shelf add
- Chart.js visualizations (genre pie, pace line graph)
- "Reading personality" summary card (e.g. "You read mostly Fiction in under 2 weeks")

### M3 — Yearly Reading Challenge
Set a reading goal for the year (e.g. 24 books). Track progress with a visual progress bar and milestone badges.
- `reading_goals` table: `user_id`, `year`, `target`
- Progress bar widget on profile
- Milestone messages at 25%, 50%, 75%, 100%
- Share goal progress as a card image (canvas screenshot)

### M4 — Custom Shelves (Beyond Fixed 5)
Let users create arbitrary named shelves: "Beach Reads", "For Book Club", "Abandoned Mid-Series", etc. Shown on public profiles.
- `custom_shelves` and `custom_shelf_books` tables
- "New Shelf" button in sidebar
- Shelf management: rename, reorder, delete
- Show custom shelves on `/u/username`

### M5 — Author Pages
Clicking an author name opens a dedicated author page: bio from Open Library, all their books, which ones you've read.
- `/author/:authorKey` route serving `author.html`
- Fetch author bio + works from Open Library API
- Highlight books already on your shelves
- "Add all to Want" bulk action

### M6 — Book Series Tracking
Detect when books are part of a series (Open Library has series data). Show series progress: "Book 2 of 5 in The Expanse".
- Series lookup on book add via Open Library
- `series` table linking books
- Series progress badge on modal and shelf cards
- "Read next in series" button after marking a book read

### M7 — Reading Log (Daily Pages)
Log actual pages read each day rather than just start/end dates. Unlocks accurate daily pace graphs and "pages today" widget.
- `reading_log` table: `user_id`, `book_key`, `date`, `pages_read`
- Quick log widget: "I read X pages today" on Reading tab
- Daily pages chart on profile (line graph)
- Replaces pace estimate with real data

### M8 — Bulk Actions on Shelves
Select multiple books at once: move all to Read, remove all, export selection. Useful after Goodreads import with hundreds of books.
- Checkbox mode toggle on shelf tabs
- Select All / Deselect All
- Bulk: Move to shelf, Remove, Add to Collection

### M9 — Search Within Notes/Quotes
Global search across all your saved notes and quotes. Find that passage you saved 3 months ago.
- Full-text search on `notes` table (SQLite FTS5)
- `/api/notes/search?q=` endpoint
- Notes search tab or modal in app

---

## Easy Lift (a few hours)

### E1 — Sort & Filter Shelves
Sort Want/Read/Fav shelves by: date added, title A-Z, author, rating. Filter by genre, year read.
- Sort dropdown on each shelf tab
- Genre filter chips (populated from saved genre data)
- Persisted in localStorage

### E2 — Reading Pace Goal
Set a daily pages goal (e.g. 30 pages/day). Show a simple "on track / behind" indicator on the Reading tab.
- One input in settings: daily pages target
- Compare against reading log or current-book pace
- Green/amber/red indicator badge

### E3 — Copy-to-Clipboard Share Card
"Share this book" button that generates a small card image (title, cover, your rating) and copies it or opens a native share sheet.
- Canvas rendering of share card
- `navigator.share()` on mobile, clipboard fallback on desktop

### E4 — "Currently Reading" Widget Code
Let users embed a "Currently Reading" badge on their personal website or GitHub profile.
- `/api/widget/:username` endpoint returning SVG badge
- Shows cover thumbnail + title + author
- Copy-embed-code button on public profile

### E5 — Keyboard Shortcuts
Power-user shortcuts: `/` to focus search, `Esc` to close modal, `W` to add to want, `R` to mark read.
- `keydown` listener in app.html
- Shortcut hint overlay (triggered by `?`)

### E6 — Book Cover Upload (Override)
Some books have bad or missing covers. Let users upload their own cover image for a book.
- Extend multer to handle cover uploads
- Store in `public/covers/` or as base64 blob in DB
- Override `coverUrl()` when custom cover exists

### E7 — "Did Not Finish" Reason
When adding a book to DNF, prompt for a reason: "Too slow", "Not for me", "Wrong time", etc. Shown on DNF shelf.
- Add `dnf_reason` column to shelf table
- Reason picker in modal when DNF is clicked
- Displayed as a small tag on DNF shelf cards

### E8 — Shelf Statistics Cards
Quick-glance stat cards at the top of each shelf tab: "12 books · avg 320 pages · fastest: 3 days".
- Aggregate on tab render from shelf data
- Small card row above the grid
- Animated count-up on first load

### E9 — Back-to-Top Button
On long shelves, a floating "↑ Top" button appears after scrolling 400px.
- Simple scroll listener + fixed-position button
- Smooth scroll to top on click

### E10 — Print / Export Reading List
Export current shelf as a clean PDF or CSV: title, author, date read, rating.
- `/api/export/:shelf` endpoint returning CSV
- Client-side PDF option via `window.print()` + print stylesheet

---

## Infrastructure / Non-Feature

### I1 — Cloudflare DDoS Protection
Move DDoS defense from in-process rate limiting to Cloudflare's network layer. Current setup is per-process and won't survive a coordinated attack.
- Set up Cloudflare free tier in front of the server
- Enable bot fight mode + rate limiting rules in CF dashboard
- Keep in-process limits as a backstop

### I2 — Helmet.js Security Headers
Add `Content-Security-Policy`, `X-Frame-Options`, `Referrer-Policy`, and other hardening headers.
- `npm install helmet`
- Configure CSP to allow Open Library images and CDN fonts
- Verify no inline script breakage

### I3 — Postgres Migration (if scaling)
SQLite is fine for single-server. If traffic grows, migrate to Postgres for concurrent writes and connection pooling.
- Keep schema identical, swap better-sqlite3 for pg
- Add DB_URL env var; abstract DB calls behind a thin wrapper

### I4 — Test Coverage for Remaining E2E Gaps
- Collections e2e: create, add book, view
- Dark mode persistence across page reload
- PWA install prompt behavior
- Goodreads import with malformed CSV

---

*Last updated: 2026-06-30*
