# TPS Ops: Campus Facility Audits

A web app for weekly facility audits that puts **customer and vendor ratings side by side**, collects
**QR code feedback** from anyone on campus, and gives the operations team one **dashboard** for usage,
service, safety, resolution and quality standards.

It covers three service areas (**Housekeeping, Maintenance, Landscaping**) across 24 campus locations,
from Tennis Courts and Hubbard Field to Brokaw, Ellis, the SRC and West Campus.

> **New to GitHub?** Start with **[docs/GETTING-STARTED.md](docs/GETTING-STARTED.md)**, a step-by-step guide
> to putting the app online, connecting the database and printing the QR codes.

## What it does

| Screen | Who uses it | Purpose |
|---|---|---|
| **Dashboard** | Operations team | Customer vs vendor scores, the alignment gap, weekly trend, the four scoring dimensions, audit and QR activity, **when QR feedback comes in** (day of week × time of day, low or high scores), a location × service-area scorecard, the largest gaps, open safety issues, time to resolve. **Click any bar, point, cell or row** for an item-by-item customer vs vendor comparison and the responses behind it. |
| **New audit** | Customer and vendor auditors | Pick a side (customer or vendor), location and service area, then score 8 criteria from 1 to 5 or N/A. Safety items scored 1–2 open a safety issue automatically. |
| **Audit log** | Everyone on staff | Every audit with criterion detail; CSV export |
| **Issues** | Ops team, vendor | QR feedback and audit-flagged items. Set status, priority, owner and resolution. Export to Brightly. |
| **QR codes** | Ops team | One printable QR card per location. A ready-to-print PDF is in `docs/qr-codes.pdf`. |
| **Setup** | Ops team | Locations and the service areas for each; **People**: each person's side (customer or vendor) and access (Ops team, or New audit only); data export |
| **Account** | Everyone signed in | Your name (fills in on audits), password, sign out |
| **Feedback form** (`#report.<location>`) | Students, staff, parents, visitors | The page a QR code opens: topic, 1–5 rating, comment, safety flag, an optional name and email for follow-up. No login needed. |

### Scoring model

* **Scale (1–5):** 1 Unacceptable · 2 Needs improvement · 3 Meets minimum · 4 Meets standard · 5 Exemplary.
* **Standard:** 4.0, **minimum:** 3.0. Both are set in `config.js`.
* Each service area has 8 criteria, and each criterion rolls up into one **dimension**:
  *Service quality, Safety, Condition, Appearance*. Edit the criteria in `js/data.js`.
* **Alignment gap** = vendor average − customer average for the same filter. The gap is *Aligned* below ±0.25,
  *Watch* from 0.25 to 0.5, and *Misaligned* at 0.5 or more. Misaligned cells get a red **!** on the scorecard.
* **Time to resolve** is measured from report to "Resolved". The targets are 1 day for safety issues and 3 days
  for everything else (`slaDays` in `config.js`).

## Try it (demo mode)

The app works with no setup at all. With `supabaseUrl` left empty in `config.js`, it runs in **demo mode**
with ten weeks of sample data. Every sample person and record is labeled "(demo)". All data stays in that browser.

```bash
cd tpsops
python3 -m http.server 8000      # or any static file server
# open http://localhost:8000
```

## Going live

Step-by-step, beginner-friendly instructions: **[docs/GETTING-STARTED.md](docs/GETTING-STARTED.md)**. The summary is below.

Live mode needs two things: a shared database, so auditors, phones and the ops team all see the same data,
and a public web address, so QR codes work on campus.

### 1. Database: Supabase (free tier is plenty)

1. Create a project at [supabase.com](https://supabase.com).
2. **SQL Editor → New query**: paste `supabase/schema.sql` and run it. This creates the tables, the
   security rules and starter locations.
3. **Authentication → Providers → Email**: turn off "Allow new users to sign up".
4. **Authentication → Users → Invite**: invite each auditor (customer and vendor side) and each ops team member.
   They can sign in with a password or an emailed link.
5. **Authentication → URL Configuration**: set Site URL to the address from step 2 below.
6. **Settings → API**: copy the *Project URL* and the *anon public* key into `config.js`:

```js
supabaseUrl: "https://YOUR-PROJECT.supabase.co",
supabaseAnonKey: "eyJ...",
publicUrl: "https://bakern-ux.github.io/TPSops/",
```

The anon key is meant to be public. The row-level security rules in `schema.sql` limit it to reading
active locations and *adding* QR feedback. It cannot read audits, read feedback or change anything.

### 2. Hosting: GitHub Pages

Go to **Repository → Settings → Pages**, set Source to *Deploy from a branch*, and pick `main` and `/ (root)`. On a free GitHub plan, Pages requires the repository to be public.
The app will be at `https://bakern-ux.github.io/TPSops/`, which is already set as `publicUrl` in `config.js`,
so the QR codes in `docs/qr-codes.pdf` point there. Any static host works, including Netlify, Cloudflare Pages
and your school web server.

> A GitHub Pages site is public even when the repository is private. That is fine here because data
> lives in Supabase behind sign-in. The page itself only holds code and the anon key.

## Brightly

The Issues screen has three ways to hand work to the vendor's Brightly account:

* **Export selected for Brightly (CSV):** one row per issue with Request Title, Description, Site, Location,
  Building, Category, Priority, Request Type, Requested By, Requester Contact, Date Requested, Safety Concern,
  Source and TPS Issue ID. Brightly sites differ, so the vendor maps these columns once in their
  work-order import. `brightly.siteName` and `brightly.requestType` in `config.js` set the defaults.
* **Copy as work requests:** plain-text requests to paste into Brightly's request form, or to send to
  the vendor's work-request email inbox if their Brightly site has one.
* **Mark selected as sent to Brightly:** stamps each issue so the team can see what has been handed off.

A direct API connection is a possible next step. It would be a small Supabase Edge Function that posts new issues
to Brightly's API. It needs API credentials from the vendor's Brightly administrator, which must never go
in this front-end code. See `docs/brightly.md`.

## Project layout

```
index.html            App shell
styles.css            All styling (light and dark themes, print layout for QR cards)
config.js             Organization name, Supabase keys, thresholds, Brightly defaults
js/data.js            Service areas, criteria, dimensions, the 24 locations, sample data generator
js/store.js           Data layer: demo (localStorage) and live (Supabase), same API
js/app.js             Screens, dashboard calculations, charts, QR, exports
supabase/schema.sql   Tables and row-level security
supabase/002_roles.sql  People, sides and access levels (run after schema.sql)
vendor/               Chart.js 4.4.1, qrcode-generator 1.4.4, supabase-js 2.45.4 (MIT), bundled so nothing loads from a CDN
docs/GETTING-STARTED.md  Beginner's guide to going live
docs/qr-codes.pdf     Printable QR cards for all 24 locations (4 per page)
docs/brightly.md      Notes on Brightly integration
```

There is no build step. Edit a file and reload.
