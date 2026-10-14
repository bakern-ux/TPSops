# Brightly integration notes

The goal of TPS Ops is visibility and alignment. Brightly stays the vendor's system for dispatching work.
These notes describe how issues move from TPS Ops into Brightly, from the simplest option to the most automated.

## Option 1: CSV export (built in)

On **Issues**, select issues and choose **Export selected for Brightly (CSV)**. Then ask the vendor's
Brightly administrator to:

1. Confirm which import their site uses for work requests or work orders.
2. Map the TPS columns to Brightly fields once. Suggested mapping:

| TPS column | Typical Brightly field |
|---|---|
| Request Title | Summary / Title |
| Description | Description |
| Site | Site |
| Location, Building | Location / Building (must match Brightly location names) |
| Category | Craft / Work Category / Request Type |
| Priority | Priority |
| Requested By, Requester Contact | Requester |
| TPS Issue ID | Reference / External ID (lets both sides match records) |

3. Tell you which location names Brightly uses. If you name locations the same way in **Setup**,
   no remapping is needed.

After importing, use **Mark selected as sent to Brightly** so the dashboard shows what was handed off.

## Option 2: Work-request email (built in)

Many Brightly sites accept requests by email. **Copy as work requests** produces one plain-text request per
issue. Paste them into an email to the vendor's request inbox, or into Brightly's request portal.

## Option 3: Automatic API push (future)

Brightly offers APIs to licensed customers. An automatic push would work like this:

1. The vendor's Brightly admin issues API credentials for a TPS integration user.
2. A Supabase Edge Function stores those credentials as secrets. Never put them in `config.js`.
3. The function is triggered by a database webhook on `issues` insert, or by a "Send to Brightly" button.
   It creates the work request and writes the Brightly request number back to the issue.
4. Optionally, a nightly job reads status back from Brightly so "Time to resolve" reflects the vendor's closeout.

This depends on the vendor's Brightly product (for example, Asset Essentials vs. other modules), their license
and their willingness to issue credentials. Confirm those before building it.
