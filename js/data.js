// Scoring model and demo data for TPS Ops.
(function () {
  // Each criterion is scored 1–5 (or N/A) and rolls up into one of four dimensions.
  const DIMENSIONS = [
    { id: "service", name: "Service quality" },
    { id: "safety", name: "Safety" },
    { id: "condition", name: "Condition" },
    { id: "appearance", name: "Appearance" },
  ];

  const SCALE = [
    { v: 1, label: "Unacceptable" },
    { v: 2, label: "Needs improvement" },
    { v: 3, label: "Meets minimum" },
    { v: 4, label: "Meets standard" },
    { v: 5, label: "Exemplary" },
  ];

  const CATEGORIES = [
    {
      id: "custodial", name: "Custodial", criteria: [
        { id: "cus-floors", label: "Floors clean, free of debris and residue", dim: "appearance" },
        { id: "cus-restrooms", label: "Restrooms cleaned and sanitized", dim: "service" },
        { id: "cus-trash", label: "Trash and recycling emptied, liners replaced", dim: "service" },
        { id: "cus-dust", label: "Horizontal surfaces, vents and ledges dusted", dim: "appearance" },
        { id: "cus-glass", label: "Entry glass, doors and touchpoints clean", dim: "appearance" },
        { id: "cus-wet", label: "Wet floors signed; chemicals stored and labeled", dim: "safety" },
      ],
    },
    {
      id: "housekeeping", name: "Housekeeping", criteria: [
        { id: "hk-supplies", label: "Soap, towels and tissue stocked", dim: "service" },
        { id: "hk-rooms", label: "Classrooms and offices reset and orderly", dim: "service" },
        { id: "hk-furniture", label: "Furniture clean and undamaged", dim: "condition" },
        { id: "hk-stains", label: "Spills and stains addressed promptly", dim: "appearance" },
        { id: "hk-common", label: "Lobbies and common areas tidy", dim: "appearance" },
        { id: "hk-egress", label: "Hallways and exits clear of obstructions", dim: "safety" },
      ],
    },
    {
      id: "grounds", name: "Grounds", criteria: [
        { id: "gr-walks", label: "Walkways clear, no trip hazards", dim: "safety" },
        { id: "gr-litter", label: "Litter removed from grounds and lots", dim: "appearance" },
        { id: "gr-fields", label: "Athletic fields and courts game-ready", dim: "condition" },
        { id: "gr-parking", label: "Parking lots, striping and signage", dim: "condition" },
        { id: "gr-lighting", label: "Exterior lighting working", dim: "safety" },
        { id: "gr-response", label: "Requests handled on schedule", dim: "service" },
      ],
    },
    {
      id: "landscaping", name: "Landscaping", criteria: [
        { id: "ls-turf", label: "Turf mowed and edged", dim: "appearance" },
        { id: "ls-beds", label: "Beds weeded and mulched", dim: "appearance" },
        { id: "ls-prune", label: "Trees and shrubs pruned; sightlines clear", dim: "safety" },
        { id: "ls-irrigation", label: "Irrigation working, no runoff onto walks", dim: "condition" },
        { id: "ls-seasonal", label: "Seasonal plantings and color", dim: "appearance" },
        { id: "ls-schedule", label: "Work done on the agreed schedule", dim: "service" },
      ],
    },
    {
      id: "hvac", name: "HVAC equipment rooms", criteria: [
        { id: "hv-clear", label: "Room clean; 36\" clearance at panels and equipment", dim: "safety" },
        { id: "hv-filters", label: "Filters current and change log posted", dim: "service" },
        { id: "hv-leaks", label: "No leaks, unusual noise or vibration", dim: "condition" },
        { id: "hv-labels", label: "Equipment labeled; lockout/tagout available", dim: "safety" },
        { id: "hv-storage", label: "No combustibles or unrelated storage", dim: "safety" },
        { id: "hv-temps", label: "Served spaces within temperature setpoint", dim: "service" },
      ],
    },
    {
      id: "pm", name: "Preventive maintenance", criteria: [
        { id: "pm-ontime", label: "PM tasks completed on schedule", dim: "service" },
        { id: "pm-closeout", label: "Work orders closed with notes and parts", dim: "service" },
        { id: "pm-lifesafety", label: "Life-safety checks current (extinguishers, exit signs, eyewash)", dim: "safety" },
        { id: "pm-assets", label: "Asset tags and records accurate", dim: "condition" },
        { id: "pm-deferred", label: "Deferred items documented with a plan", dim: "condition" },
        { id: "pm-finish", label: "Work areas left clean after repairs", dim: "appearance" },
      ],
    },
  ];

  // What a customer can pick on the QR feedback form, mapped to a service area.
  const FEEDBACK_TOPICS = [
    { id: "custodial", label: "Cleanliness" },
    { id: "housekeeping", label: "Restroom supplies / room setup" },
    { id: "grounds", label: "Grounds, walkways, lighting" },
    { id: "landscaping", label: "Landscaping" },
    { id: "hvac", label: "Temperature / air" },
    { id: "pm", label: "Something broken" },
  ];

  // ---------- Demo data (DEMO mode only; never written to the live database) ----------
  const DEMO_LOCATIONS = [
    { id: "us-main", name: "Upper School Main Hall", building: "Upper School", categories: ["custodial", "housekeeping", "hvac", "pm"] },
    { id: "ms-wing", name: "Middle School Wing", building: "Middle School", categories: ["custodial", "housekeeping", "pm"] },
    { id: "library", name: "Library & Learning Commons", building: "Library", categories: ["custodial", "housekeeping", "pm"] },
    { id: "dining", name: "Dining Hall", building: "Student Center", categories: ["custodial", "housekeeping", "pm"] },
    { id: "gym", name: "Gymnasium & Locker Rooms", building: "Athletics", categories: ["custodial", "housekeeping", "hvac", "pm"] },
    { id: "science", name: "Science Building", building: "Science", categories: ["custodial", "housekeeping", "hvac", "pm"] },
    { id: "arts", name: "Performing Arts Center", building: "Arts", categories: ["custodial", "housekeeping", "pm"] },
    { id: "mech-a", name: "Central Plant Mechanical Room", building: "Central Plant", categories: ["hvac", "pm"] },
    { id: "fields", name: "Athletic Fields & Track", building: "Grounds", categories: ["grounds", "landscaping"] },
    { id: "campus-core", name: "Campus Quad & Entrances", building: "Grounds", categories: ["grounds", "landscaping"] },
    { id: "lot-north", name: "North Parking Lot", building: "Grounds", categories: ["grounds", "landscaping"] },
  ].map((l) => ({ ...l, active: true }));

  const DEMO_AUDITORS = {
    customer: ["Facilities Director (demo)", "Asst. Head of School (demo)", "Athletics Director (demo)", "Business Office (demo)"],
    vendor: ["Account Manager (demo)", "Custodial Supervisor (demo)", "Grounds Lead (demo)", "HVAC Technician (demo)"],
  };

  const DEMO_FEEDBACK = [
    ["custodial", 2, "Trash overflowing by the vending machines after lunch.", false],
    ["housekeeping", 1, "No paper towels in the 2nd floor boys' restroom, again.", false],
    ["custodial", 1, "Spill at the bottom of the east stairwell. Really slippery, someone almost fell.", true],
    ["hvac", 2, "Room 214 is 79°F during first period.", false],
    ["grounds", 2, "Light out on the path from the north lot. Very dark after practice.", true],
    ["landscaping", 2, "Sprinklers spraying across the sidewalk at drop-off.", false],
    ["pm", 2, "Hand dryer in the gym locker room is not working.", false],
    ["custodial", 5, "Lobby looked great for open house. Thank you!", false],
    ["housekeeping", 3, "Soap dispenser near the cafeteria is low.", false],
    ["pm", 1, "Exit sign over the back door of the black box theater is dark.", true],
    ["grounds", 1, "Raised sidewalk slab near the quad. Tripped on it.", true],
    ["hvac", 3, "A little warm in the library reading room in the afternoon.", false],
    ["custodial", 4, "Restrooms much better this week.", false],
    ["landscaping", 4, "Front entrance flowers look nice.", false],
    ["housekeeping", 2, "Desks in the science lab not wiped down after Friday.", false],
    ["pm", 2, "Ceiling tile stained above the stage left door. Possible leak.", false],
    ["custodial", 2, "Gym bleachers still sticky from Friday's game.", false],
    ["grounds", 3, "Some litter behind the bleachers.", false],
    ["hvac", 1, "Strong burning smell from the vent in room 108.", true],
    ["housekeeping", 5, "Dining hall staff and cleaning crew are doing a great job.", false],
    ["custodial", 2, "Glass doors at main entrance covered in fingerprints.", false],
    ["pm", 3, "Water fountain pressure is low on 1st floor.", false],
    ["landscaping", 2, "Overgrown shrubs blocking the view at the crosswalk.", true],
    ["custodial", 3, "Classroom floors need a deeper clean.", false],
    ["housekeeping", 1, "Girls' restroom out of toilet paper during an event.", false],
    ["grounds", 4, "Fields looked ready for Saturday's game.", false],
  ];

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function uuid(rand) {
    const h = () => Math.floor(rand() * 16).toString(16);
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => (c === "x" ? h() : ((Math.floor(rand() * 4) + 8).toString(16))));
  }

  function isoDay(d) {
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  }

  // Ten weeks of audits by both sides plus QR feedback, with a realistic customer/vendor gap.
  function buildDemo(now = new Date()) {
    const rand = mulberry32(20261014);
    const audits = [];
    const issues = [];
    const vendorBias = { custodial: 0.3, housekeeping: 0.25, grounds: 0.35, landscaping: 0.2, hvac: 0.7, pm: 0.75 };
    const base = {};
    DEMO_LOCATIONS.forEach((l) => l.categories.forEach((c) => { base[l.id + "|" + c] = 2.9 + rand() * 1.3; }));

    const today = new Date(now); today.setHours(0, 0, 0, 0);
    const WEEKS = 10;
    for (let w = WEEKS - 1; w >= 0; w--) {
      const monday = new Date(today);
      monday.setDate(today.getDate() - ((today.getDay() + 6) % 7) - w * 7);
      const improvement = (WEEKS - 1 - w) * 0.035;
      for (const side of ["customer", "vendor"]) {
        DEMO_LOCATIONS.forEach((loc) => {
          loc.categories.forEach((cat) => {
            // Not every area is audited every week by every side.
            if (rand() < (side === "customer" ? 0.5 : 0.6)) return;
            const day = new Date(monday);
            day.setDate(monday.getDate() + Math.floor(rand() * 5));
            if (day > today) return;
            const mean = base[loc.id + "|" + cat] + improvement + (side === "vendor" ? vendorBias[cat] : 0);
            const scores = {};
            const category = CATEGORIES.find((c) => c.id === cat);
            category.criteria.forEach((cr) => {
              if (rand() < 0.06) { scores[cr.id] = null; return; }
              const dimShift = cr.dim === "safety" && side === "customer" ? -0.2 : 0;
              scores[cr.id] = Math.max(1, Math.min(5, Math.round(mean + dimShift + (rand() - 0.5) * 1.6)));
            });
            const pool = DEMO_AUDITORS[side];
            const id = uuid(rand);
            const created = new Date(day); created.setHours(8 + Math.floor(rand() * 8), Math.floor(rand() * 60));
            audits.push({
              id, created_at: created.toISOString(), audit_date: isoDay(day), side,
              auditor: pool[Math.floor(rand() * pool.length)], location_id: loc.id, category: cat, scores,
              comments: "",
            });
            // Low safety scores from customer audits become issues, as they would in live use.
            const lowSafety = category.criteria.filter((cr) => cr.dim === "safety" && scores[cr.id] != null && scores[cr.id] <= 2);
            if (side === "customer" && lowSafety.length) {
              const ageDays = (today - created) / 86400000;
              const resolved = ageDays > 4 || rand() < 0.5;
              const resolvedAt = resolved ? new Date(created.getTime() + (0.2 + rand() * (rand() < 0.75 ? 1.2 : 5)) * 86400000) : null;
              issues.push({
                id: uuid(rand), created_at: created.toISOString(), location_id: loc.id, category: cat,
                rating: Math.min(...lowSafety.map((c) => scores[c.id])),
                comment: "Audit flagged: " + lowSafety.map((c) => c.label).join("; "),
                submitter: audits[audits.length - 1].auditor, contact: "", safety: true, source: "audit",
                status: resolved && resolvedAt <= now ? "resolved" : rand() < 0.5 ? "in_progress" : "open",
                priority: "high", assigned_to: resolved ? "Vendor" : "", resolution: resolved ? "Corrected on site." : "",
                resolved_at: resolved && resolvedAt <= now ? resolvedAt.toISOString() : null,
                brightly_exported_at: null, audit_id: id,
              });
            }
          });
        });
      }
    }

    // QR feedback spread over the same ten weeks, newest last.
    DEMO_FEEDBACK.forEach((f, i) => {
      const [category, rating, comment, safety] = f;
      const locs = DEMO_LOCATIONS.filter((l) => l.categories.includes(category));
      const loc = locs[Math.floor(rand() * locs.length)];
      const fromEnd = DEMO_FEEDBACK.length - i;
      const daysAgo = fromEnd <= 7 ? (fromEnd - 1) * 0.8 : Math.round((fromEnd / DEMO_FEEDBACK.length) * 68 * (0.85 + rand() * 0.3));
      const created = new Date(today.getTime() - daysAgo * 86400000);
      created.setHours(7 + Math.floor(rand() * 10), Math.floor(rand() * 60));
      const needsAction = rating <= 3 || safety;
      const ageDays = (now - created) / 86400000;
      const recent = i >= DEMO_FEEDBACK.length - 7;
      let status = needsAction ? "open" : "noted";
      let resolvedAt = null;
      if (needsAction && recent) status = i % 2 ? "open" : "in_progress";
      else if (needsAction && ageDays > 6) status = "resolved";
      else if (needsAction && ageDays > 2) status = rand() < 0.6 ? "resolved" : "in_progress";
      if (status === "resolved") {
        const days = safety ? 0.1 + rand() * 1.4 : 0.3 + rand() * 4.5;
        resolvedAt = new Date(Math.min(now.getTime(), created.getTime() + days * 86400000)).toISOString();
      }
      issues.push({
        id: uuid(rand), created_at: created.toISOString(), location_id: loc.id, category, rating, comment,
        submitter: rand() < 0.4 ? "" : ["Student", "Teacher", "Staff", "Parent", "Coach"][Math.floor(rand() * 5)] + " (demo)",
        contact: "", safety, source: "qr", status,
        priority: safety ? "high" : rating <= 1 ? "high" : rating <= 2 ? "medium" : "low",
        assigned_to: status === "noted" ? "" : status === "open" ? "" : "Vendor",
        resolution: status === "resolved" ? "Completed by vendor." : "", resolved_at: resolvedAt,
        brightly_exported_at: status === "resolved" && rand() < 0.5 ? resolvedAt : null, audit_id: null,
      });
    });

    return { locations: DEMO_LOCATIONS.map((l) => ({ ...l })), audits, issues };
  }

  window.TPS_DATA = { DIMENSIONS, SCALE, CATEGORIES, FEEDBACK_TOPICS, buildDemo };
})();
