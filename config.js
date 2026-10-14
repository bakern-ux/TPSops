// TPS Ops configuration.
// Leave supabaseUrl / supabaseAnonKey empty to run in DEMO mode (sample data kept in this browser only).
// Fill them in (see README.md → "Going live") to share audits, feedback and issues across everyone.
window.TPS_CONFIG = {
  orgName: "Trinity Prep Facilities",
  appName: "TPS Ops",

  // Supabase project (Settings → API in the Supabase dashboard). The anon key is safe to publish;
  // row-level security in supabase/schema.sql decides what it can do.
  supabaseUrl: "",
  supabaseAnonKey: "",

  // Public address of this app, used inside QR codes. Leave empty to use the address it is opened from.
  // GitHub Pages address for this repository (see docs/GETTING-STARTED.md, step 3).
  publicUrl: "https://bakern-ux.github.io/TPSops/",

  // Rating scale is 1–5. Scores at or above `targetScore` meet the service standard;
  // below `minimumScore` is unacceptable and needs a corrective action.
  targetScore: 4.0,
  minimumScore: 3.0,

  // Customer vs vendor alignment: |vendor − customer| below `alignedGap` is aligned,
  // at or above `misalignedGap` is a conversation the operations team should have.
  alignedGap: 0.25,
  misalignedGap: 0.5,

  // Response targets in days, used for "resolved within target" on the dashboard.
  slaDays: { safety: 1, standard: 3 },

  // Brightly CSV export defaults. Ask your vendor which values their Brightly site expects.
  brightly: {
    siteName: "Trinity Preparatory School",
    requestType: "Work Request",
  },
};
