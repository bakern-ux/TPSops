# Getting TPS Ops running: a beginner's guide

This guide assumes you have never used GitHub before. Plan on about **45 minutes** the first time.
You'll need a computer (not a phone) and the GitHub account you already have (`bakern-ux`).

---

## First, a few words you'll see

| Word | What it means here |
|---|---|
| **Repository** ("repo") | A folder on GitHub that holds the app's files. Yours is **github.com/bakern-ux/TPSops**. |
| **Commit** | A saved snapshot of changes, with a short note about what changed. Like "Save" with a label. |
| **Push** | Uploading commits from where they were made to GitHub. Claude works on a temporary computer in the cloud. Until Claude *pushes*, the work exists only there and disappears when the session ends. After a push, it's safely in your repository. |
| **GitHub Pages** | Free website hosting built into GitHub. It turns your repository into a web address: **https://bakern-ux.github.io/TPSops/** |
| **Supabase** | A free online database. It's where audits, feedback and issues are stored so everyone sees the same information. |

**How the pieces fit:** GitHub Pages shows the app. Supabase stores the data. The QR codes point people to the app.

---

## Step 1: Get the files into your repository (Claude does this)

Your repository on GitHub is currently empty. When you tell Claude "yes, push it", Claude uploads the app.
To check, go to **github.com/bakern-ux/TPSops**. You should see files such as `index.html`, `config.js` and
folders such as `js` and `docs`.

---

## Step 2: Make the repository public

GitHub only offers free website hosting for **public** repositories. Your repository is currently **private**.

**Is it safe to make it public?** Yes. The repository holds only the app's code. It has no passwords, audits,
feedback or names. All of that lives in Supabase, which requires a sign-in. Anyone *could* read the code,
but they can't see or change your data.

1. Go to **github.com/bakern-ux/TPSops**.
2. Click **Settings** (the gear tab near the top right of the repository page, not your account settings).
3. Stay on the **General** page and scroll all the way down to the red **Danger Zone** box.
4. Click **Change visibility** → **Change to public**.
5. GitHub asks you to confirm a few times and may ask for your password or a code. Follow the prompts.

> **Prefer to keep it private?** A paid GitHub Pro plan (about $4/month) lets GitHub Pages work with private repositories.
> Your school's IT team may also have another place to host it. Tell Claude and it can adjust the instructions.

---

## Step 3: Turn on the website (GitHub Pages)

1. In the repository, click **Settings** again.
2. In the left-hand menu, click **Pages** (under "Code and automation").
3. Under **Build and deployment**:
   * **Source:** choose **Deploy from a branch**.
   * **Branch:** choose **main**. In the folder box next to it, leave **/ (root)**. Click **Save**.
4. Wait 1–3 minutes, then refresh the page. A box appears at the top saying
   **"Your site is live at https://bakern-ux.github.io/TPSops/"**.
5. Click that link. You should see the TPS Ops dashboard with a yellow **Demo mode** bar.
   Demo mode is expected at this point because the database isn't connected yet.

---

## Step 4: Create the database (Supabase)

### 4a. Make an account and a project
1. Go to **supabase.com** and click **Start your project**. Sign in with GitHub (easiest) or with your email.
2. Click **New project**.
   * **Organization:** accept the default (it may ask you to name one; "Trinity Prep" is fine).
   * **Project name:** `TPS Ops`
   * **Database password:** click **Generate a password** and **save it somewhere safe** (a password manager).
     You won't need it day to day, but you can't see it again later.
   * **Region:** pick the one closest to you (for example *East US*).
   * **Plan:** Free.
3. Click **Create new project** and wait about 2 minutes while it sets up.

### 4b. Create the tables
1. Open **github.com/bakern-ux/TPSops/blob/main/supabase/schema.sql** in another browser tab.
2. Click the **Copy raw file** button (two overlapping squares, top right of the file).
3. Back in Supabase, click **SQL Editor** in the left-hand menu (the icon looks like `>_`).
4. Click **+ New query**. Paste into the big text box (Ctrl+V, or Cmd+V on a Mac).
5. Click **Run** (bottom right). You should see **"Success. No rows returned"**.
6. To check: click **Table Editor** in the left-hand menu, then **locations**. You should see your 24 locations.

### 4c. Control who can sign in
Only people you invite should be able to enter audits or see the dashboard. Anyone can still use the QR feedback form.

1. Click **Authentication** in the left-hand menu.
2. Find **Sign In / Providers** (on some screens: **Providers → Email**). Turn **off** **"Allow new users to sign up"**. Click **Save**.
3. Click **URL Configuration**:
   * **Site URL:** `https://bakern-ux.github.io/TPSops/`
   * Under **Redirect URLs**, click **Add URL**, enter the same address and save.
4. Click **Users** → **Add user** → **Send invitation**. Enter one person's email. Repeat for each customer auditor,
   vendor auditor and operations team member. Each person gets an email with a link that signs them in.

### 4d. Copy the two connection values
1. Click the **Connect** button at the top of the Supabase project page.
   Or go to **Project Settings** (gear icon, bottom left) → **API Keys**.
2. You need two values:
   * The **Project URL**, which looks like `https://abcdefghijk.supabase.co`
   * The **anon public** key: a long string that starts with `eyJ`. If you see tabs, it's under **Legacy API keys**.

These two values are designed to be public. They let the app *talk* to the database. The security rules from
step 4b control what each person can do. **Do not** share the *service_role* key or your database password.

---

## Step 5: Connect the app to the database

**Easiest way:** paste the Project URL and the anon public key into your chat with Claude and say
"put these in config.js and push". Claude makes the change and uploads it.

**Doing it yourself on GitHub:**
1. In your repository, click **config.js**.
2. Click the **pencil icon** (top right of the file, "Edit this file").
3. Change these two lines, keeping the quotation marks:
   ```js
   supabaseUrl: "https://abcdefghijk.supabase.co",
   supabaseAnonKey: "eyJhbGciOi...the whole long key...",
   ```
4. Click the green **Commit changes…** button. Leave **Commit directly to the main branch** selected and click **Commit changes**.
5. Wait 1–2 minutes for the site to update. Then open **https://bakern-ux.github.io/TPSops/** and refresh.
   The yellow demo bar is gone and you see a **Sign in** screen.

---

## Step 6: Sign in and test it

1. On the sign-in screen, type your email, leave the password blank and click **Sign in**.
   You'll get an email with a sign-in link. (You must have invited yourself in step 4c.)
2. Click **New audit** and submit a quick test audit. It should appear on **Dashboard** and **Audit log**.
3. On your phone, scan a QR code from `docs/qr-codes.pdf` (or from the **QR codes** screen). Submit a test with your
   name and email. It should appear on the **Issues** screen within a few seconds. (Refresh the page if needed.)
4. On the Issues screen, set your test issue to **Resolved** and click **Save**.

---

## Step 7: Print and post the QR codes

* **Ready-made PDF:** `docs/qr-codes.pdf` has 24 cards, 4 per letter-size page (6 pages). Cut along the dashed
  lines. In GitHub, open the file and use the **download** button (arrow icon, top right).
* **From the app:** go to **QR codes** → **Print cards**. Use this if you add or rename locations later.
* The codes point to `https://bakern-ux.github.io/TPSops/`. They work once step 3 is done. Submissions reach the
  dashboard once step 5 is done.
* Each code includes the location's short ID (for example `#report.tennis-courts`). Renaming a location on the
  **Setup** screen is fine, because the printed code still works.

---

## Making changes later

* **Easiest:** open Claude Code with this repository and describe the change in plain English
  (for example "add a location called Science Lab" or "change the standard to 3.5"). Ask Claude to push when it's done.
  The website updates 1–2 minutes after a push.
* **Locations** can also be added, renamed or turned off on the app's **Setup** screen, with no GitHub needed.
* **Thresholds** (standard 4.0, minimum 3.0, response targets) are in `config.js`.
* **The criteria auditors score** are in `js/data.js`.

## If something goes wrong

| What you see | What to try |
|---|---|
| "404 There isn't a GitHub Pages site here" | Wait 3 minutes and refresh. Check steps 2 and 3. The address is case-sensitive: `TPSops`. |
| The site still shows **Demo mode** after step 5 | Wait 2 minutes, then hard-refresh (Ctrl+Shift+R, or Cmd+Shift+R on a Mac). Check that `config.js` was saved with both values inside quotation marks. |
| "Sign-in failed" or no email arrives | Check that the person was invited (step 4c) and look in their spam folder. Supabase's free email service sends only a few emails per hour, so wait and try again. |
| The QR form says "Could not send" | Check that step 4b succeeded (Table Editor shows 24 locations) and that the anon key in `config.js` is complete. |
| A phone shows an old version | Close the browser tab and scan again. |
