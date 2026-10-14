// TPS Ops: facility audits, QR feedback, issues and the operations dashboard.
(function () {
  const C = window.TPS_CONFIG;
  const { DIMENSIONS, SCALE, CATEGORIES, FEEDBACK_TOPICS } = window.TPS_DATA;
  const CAT = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));
  const CRIT = {};
  CATEGORIES.forEach((c) => c.criteria.forEach((cr) => { CRIT[cr.id] = { ...cr, category: c.id }; }));
  const STATUS = { open: "Open", in_progress: "In progress", resolved: "Resolved", noted: "Noted (no action)" };

  const store = window.TPS_STORE.create();
  let data = { locations: [], audits: [], issues: [] };
  let charts = [];
  let loaded = false;
  const prefs = loadPrefs();

  // ---------- helpers ----------
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const mean = (arr) => { const a = arr.filter((x) => x != null && !isNaN(x)); return a.length ? a.reduce((s, x) => s + x, 0) / a.length : null; };
  const fmt = (n, d = 2) => (n == null || isNaN(n) ? "—" : n.toFixed(d));
  const signed = (n) => (n == null ? "—" : (n > 0 ? "+" : n < 0 ? "−" : "±") + Math.abs(n).toFixed(2));
  const parseDay = (s) => new Date(s + "T00:00:00");
  const isoDay = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const weekStart = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
  const shortDate = (d) => d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const dateTime = (s) => new Date(s).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  const locName = (id) => (data.locations.find((l) => l.id === id) || {}).name || id;
  const days = (ms) => ms / 86400000;
  const cssVar = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

  function loadPrefs() {
    const d = { weeks: 8, category: "all", location: "all", auditor: "", side: "customer" };
    try { return { ...d, ...JSON.parse(localStorage.getItem("tpsops.prefs") || "{}") }; } catch (e) { return d; }
  }
  function savePrefs() { try { localStorage.setItem("tpsops.prefs", JSON.stringify(prefs)); } catch (e) { /* ignore */ } }

  function toast(msg) {
    const t = $("#toast"); t.textContent = msg; t.hidden = false;
    clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, 3200);
  }

  const auditOverall = (a) => mean(Object.values(a.scores || {}));
  const auditDim = (a, dim) => mean(Object.entries(a.scores || {}).filter(([k]) => CRIT[k] && CRIT[k].dim === dim).map(([, v]) => v));
  const band = (s) => (s == null ? "na" : s >= C.targetScore ? "good" : s >= C.minimumScore ? "warn" : "bad");
  const gapBand = (g) => (g == null ? "neutral" : Math.abs(g) < C.alignedGap ? "good" : Math.abs(g) < C.misalignedGap ? "warn" : "bad");
  const gapWord = (g) => (g == null ? "No overlap" : Math.abs(g) < C.alignedGap ? "Aligned" : Math.abs(g) < C.misalignedGap ? "Watch" : "Misaligned");
  const needsAction = (i) => i.status === "open" || i.status === "in_progress";
  const priorityFor = (i) => (i.safety || i.rating <= 1 ? "high" : i.rating <= 2 ? "medium" : "low");

  function stars(n) {
    if (n == null) return "";
    return `<span class="stars" aria-label="${n} of 5">${"★".repeat(n)}<span class="off">${"★".repeat(5 - n)}</span></span>`;
  }

  function downloadText(filename, text, type = "text/csv") {
    const url = URL.createObjectURL(new Blob([text], { type: type + ";charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const csvCell = (v) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const toCsv = (rows) => rows.map((r) => r.map(csvCell).join(",")).join("\r\n");

  async function copy(text) {
    try { await navigator.clipboard.writeText(text); toast("Copied to clipboard"); }
    catch (e) {
      const ta = document.createElement("textarea"); ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); toast("Copied to clipboard"); } catch (e2) { toast("Select the text and copy it manually"); }
      ta.remove();
    }
  }

  function publicBase() {
    if (C.publicUrl) return C.publicUrl.replace(/#.*$/, "");
    return location.href.split("#")[0];
  }

  // ---------- routing ----------
  function route() {
    const h = location.hash.replace(/^#/, "");
    const [name, ...rest] = h.split(".");
    return { name: name || "dashboard", param: rest.join(".") };
  }

  async function render() {
    charts.forEach((c) => c.destroy()); charts = [];
    const r = route();
    const isPublic = r.name === "report";
    document.body.classList.toggle("public", isPublic);
    $$("#tabs a").forEach((a) => (a.dataset.route === r.name ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current")));
    const view = $("#view");

    if (isPublic) return renderReport(view, r.param);

    if (store.mode === "live") {
      const session = await store.session().catch(() => null);
      if (!session) return renderLogin(view);
    }
    if (!loaded) {
      try { await refresh(); } catch (e) { view.innerHTML = `<p class="notice bad">Could not load data: ${esc(e.message)}</p>`; return; }
    }
    const views = { dashboard: renderDashboard, audit: renderAuditForm, audits: renderAuditLog, issues: renderIssues, qr: renderQr, setup: renderSetup };
    (views[r.name] || renderDashboard)(view, r.param);
    view.focus({ preventScroll: true });
  }

  async function refresh() {
    data = await store.loadAll();
    loaded = true;
  }

  // ---------- dashboard ----------
  function inRange(dateStr, weeks) {
    if (weeks === "all") return true;
    const start = weekStart(new Date()); start.setDate(start.getDate() - (Number(weeks) - 1) * 7);
    return new Date(dateStr) >= start;
  }

  function filtered() {
    const f = prefs;
    const audits = data.audits.filter((a) => inRange(a.audit_date + "T00:00:00", f.weeks)
      && (f.category === "all" || a.category === f.category) && (f.location === "all" || a.location_id === f.location));
    const issues = data.issues.filter((i) => inRange(i.created_at, f.weeks)
      && (f.category === "all" || i.category === f.category) && (f.location === "all" || i.location_id === f.location));
    return { audits, issues };
  }

  function weekList(audits, issues) {
    let n = prefs.weeks === "all" ? null : Number(prefs.weeks);
    if (n == null) {
      const all = [...audits.map((a) => parseDay(a.audit_date)), ...issues.map((i) => new Date(i.created_at))];
      const first = all.length ? new Date(Math.min(...all)) : new Date();
      n = Math.max(1, Math.round(days(weekStart(new Date()) - weekStart(first)) / 7) + 1);
    }
    const out = []; const cur = weekStart(new Date());
    for (let k = n - 1; k >= 0; k--) { const d = new Date(cur); d.setDate(cur.getDate() - k * 7); out.push(d); }
    return out;
  }

  function sideAvg(audits, side, fn = auditOverall) { return mean(audits.filter((a) => a.side === side).map(fn)); }

  function renderDashboard(view) {
    const { audits, issues } = filtered();
    const cust = sideAvg(audits, "customer");
    const vend = sideAvg(audits, "vendor");
    const gap = cust != null && vend != null ? vend - cust : null;
    const nCust = audits.filter((a) => a.side === "customer").length;
    const nVend = audits.length - nCust;
    const qr = issues.filter((i) => i.source === "qr");
    const open = data.issues.filter((i) => needsAction(i) && (prefs.category === "all" || i.category === prefs.category) && (prefs.location === "all" || i.location_id === prefs.location));
    const openSafety = open.filter((i) => i.safety);
    const resolved = issues.filter((i) => i.status === "resolved" && i.resolved_at);
    const resDays = resolved.map((i) => days(new Date(i.resolved_at) - new Date(i.created_at)));
    const withinSla = resolved.filter((i) => days(new Date(i.resolved_at) - new Date(i.created_at)) <= (i.safety ? C.slaDays.safety : C.slaDays.standard));
    const meeting = audits.filter((a) => (auditOverall(a) ?? 0) >= C.targetScore).length;
    const safetyCust = sideAvg(audits, "customer", (a) => auditDim(a, "safety"));

    const opt = (v, label, cur) => `<option value="${esc(v)}"${String(cur) === String(v) ? " selected" : ""}>${esc(label)}</option>`;
    view.innerHTML = `
      <section class="page-head">
        <div>
          <div class="eyebrow">Operations dashboard</div>
          <h1>Service and safety, both sides of the contract</h1>
          <p class="sub">Customer and vendor audit scores side by side on a 1–5 scale. The standard is ${C.targetScore.toFixed(1)}; below ${C.minimumScore.toFixed(1)} needs corrective action.</p>
        </div>
        <div class="filters">
          <label class="field" for="fWeeks">Period
            <select id="fWeeks">${opt(4, "Last 4 weeks", prefs.weeks)}${opt(8, "Last 8 weeks", prefs.weeks)}${opt(13, "Last quarter", prefs.weeks)}${opt(26, "Last 6 months", prefs.weeks)}${opt("all", "All time", prefs.weeks)}</select></label>
          <label class="field" for="fCat">Service area
            <select id="fCat">${opt("all", "All areas", prefs.category)}${CATEGORIES.map((c) => opt(c.id, c.name, prefs.category)).join("")}</select></label>
          <label class="field" for="fLoc">Location
            <select id="fLoc">${opt("all", "All locations", prefs.location)}${data.locations.map((l) => opt(l.id, l.name, prefs.location)).join("")}</select></label>
        </div>
      </section>

      <section class="kpis" aria-label="Summary">
        <div class="kpi"><span class="label"><i class="swatch customer"></i>Customer rating</span><span class="value">${fmt(cust)}</span><span class="note">${nCust} audits · <span class="pill ${band(cust)}">${cust == null ? "No data" : cust >= C.targetScore ? "Meets standard" : cust >= C.minimumScore ? "Below standard" : "Unacceptable"}</span></span></div>
        <div class="kpi"><span class="label"><i class="swatch vendor"></i>Vendor self-rating</span><span class="value">${fmt(vend)}</span><span class="note">${nVend} audits · <span class="pill ${band(vend)}">${vend == null ? "No data" : vend >= C.targetScore ? "Meets standard" : vend >= C.minimumScore ? "Below standard" : "Unacceptable"}</span></span></div>
        <div class="kpi"><span class="label">Alignment gap</span><span class="value">${signed(gap)}</span><span class="note"><span class="pill ${gapBand(gap)}">${gapWord(gap)}</span> ${gap == null ? "" : gap > 0 ? "vendor rates higher" : gap < 0 ? "customer rates higher" : ""}</span></div>
        <div class="kpi"><span class="label">Customer safety score</span><span class="value">${fmt(safetyCust)}</span><span class="note">Safety-tagged items only</span></div>
        <div class="kpi"><span class="label">Audits meeting standard</span><span class="value">${audits.length ? Math.round((meeting / audits.length) * 100) + "%" : "—"}</span><span class="note">${meeting} of ${audits.length} at ${C.targetScore.toFixed(1)} or better</span></div>
        <div class="kpi"><span class="label">QR feedback</span><span class="value">${qr.length}</span><span class="note">${qr.filter((i) => i.safety).length} safety reports · avg ${fmt(mean(qr.map((i) => i.rating)), 1)} ★</span></div>
        <div class="kpi"><span class="label">Open issues</span><span class="value">${open.length}</span><span class="note"><span class="pill ${openSafety.length ? "bad" : "good"}">${openSafety.length} safety</span> as of today</span></div>
        <div class="kpi"><span class="label">Time to resolve</span><span class="value">${fmt(mean(resDays), 1)}<small style="font-size:1rem"> days</small></span><span class="note">${resolved.length ? Math.round((withinSla.length / resolved.length) * 100) + "% within target" : "No resolved issues"} (${C.slaDays.safety}d safety, ${C.slaDays.standard}d other)</span></div>
      </section>

      <div class="grid2">
        <section class="panel"><div class="panel-head"><h2>Customer vs vendor by service area</h2><p>Average audit score</p></div><div class="chart-box"><canvas id="chCat" role="img" aria-label="Customer and vendor scores by service area"></canvas></div></section>
        <section class="panel"><div class="panel-head"><h2>Weekly trend</h2><p>Dashed line is the ${C.targetScore.toFixed(1)} standard</p></div><div class="chart-box"><canvas id="chTrend" role="img" aria-label="Weekly customer and vendor scores"></canvas></div></section>
        <section class="panel"><div class="panel-head"><h2>Scoring dimensions</h2><p>Service, safety, condition, appearance</p></div><div class="chart-box"><canvas id="chDim" role="img" aria-label="Scores by dimension"></canvas></div></section>
        <section class="panel"><div class="panel-head"><h2>Activity</h2><p>Audits by side and QR feedback per week</p></div><div class="chart-box"><canvas id="chUse" role="img" aria-label="Audits and feedback per week"></canvas></div></section>
      </div>

      <section class="panel">
        <div class="panel-head"><h2>Location scorecard</h2>
          <div class="legend"><span><i class="swatch" style="background:var(--good-bg);border:1px solid var(--good)"></i>≥ ${C.targetScore.toFixed(1)}</span><span><i class="swatch" style="background:var(--warn-bg);border:1px solid var(--warn)"></i>${C.minimumScore.toFixed(1)}–${C.targetScore.toFixed(1)}</span><span><i class="swatch" style="background:var(--bad-bg);border:1px solid var(--bad)"></i>&lt; ${C.minimumScore.toFixed(1)}</span><span><b style="color:var(--bad)">!</b> customer and vendor differ by ${C.misalignedGap.toFixed(1)}+</span></div>
        </div>
        <p class="sub" style="margin:0;color:var(--muted);font-size:.85rem">Each cell: combined average, then C (customer) and V (vendor).</p>
        <div class="table-wrap">${heatmap(audits)}</div>
      </section>

      <div class="grid2">
        <section class="panel"><div class="panel-head"><h2>Largest alignment gaps</h2><p>Where the two sides see it differently</p></div>${gapList(audits)}</section>
        <section class="panel"><div class="panel-head"><h2>Open safety issues</h2><a href="#issues" class="btn small">All issues</a></div>${safetyList(openSafety)}</section>
      </div>
    `;

    $("#fWeeks").onchange = (e) => { prefs.weeks = e.target.value === "all" ? "all" : Number(e.target.value); savePrefs(); render(); };
    $("#fCat").onchange = (e) => { prefs.category = e.target.value; savePrefs(); render(); };
    $("#fLoc").onchange = (e) => { prefs.location = e.target.value; savePrefs(); render(); };

    drawCharts(audits, issues);
  }

  function heatmap(audits) {
    const locs = data.locations.filter((l) => l.active && (prefs.location === "all" || l.id === prefs.location));
    const cats = CATEGORIES.filter((c) => prefs.category === "all" || c.id === prefs.category);
    if (!locs.length) return `<p class="empty">No locations yet. Add them under Setup.</p>`;
    const head = `<tr><th>Location</th>${cats.map((c) => `<th style="text-align:center">${esc(c.name)}</th>`).join("")}</tr>`;
    const body = locs.map((l) => {
      const cells = cats.map((c) => {
        if (!(l.categories || []).includes(c.id)) return `<td class="cell"><div class="cellbox na">n/a</div></td>`;
        const rows = audits.filter((a) => a.location_id === l.id && a.category === c.id);
        if (!rows.length) return `<td class="cell"><div class="cellbox na">not audited</div></td>`;
        const all = mean(rows.map(auditOverall));
        const cu = sideAvg(rows, "customer"); const ve = sideAvg(rows, "vendor");
        const flag = cu != null && ve != null && Math.abs(ve - cu) >= C.misalignedGap;
        return `<td class="cell"><div class="cellbox ${band(all)}" title="${esc(l.name)} · ${esc(c.name)}: ${rows.length} audits"><span class="big">${fmt(all, 1)}${flag ? ' <span class="flag" aria-label="misaligned">!</span>' : ""}</span><span class="split">C ${fmt(cu, 1)} · V ${fmt(ve, 1)}</span></div></td>`;
      }).join("");
      return `<tr><td><b>${esc(l.name)}</b><div style="font-size:.78rem;color:var(--muted)">${esc(l.building || "")}</div></td>${cells}</tr>`;
    }).join("");
    return `<table class="heat"><thead>${head}</thead><tbody>${body}</tbody></table>`;
  }

  function gapList(audits) {
    const pairs = [];
    data.locations.forEach((l) => (l.categories || []).forEach((c) => {
      const rows = audits.filter((a) => a.location_id === l.id && a.category === c);
      const cu = sideAvg(rows, "customer"); const ve = sideAvg(rows, "vendor");
      if (cu != null && ve != null) pairs.push({ l, c, cu, ve, g: ve - cu });
    }));
    pairs.sort((a, b) => Math.abs(b.g) - Math.abs(a.g));
    if (!pairs.length) return `<p class="empty">Gaps appear once both sides have audited the same area in this period.</p>`;
    return `<div class="rows">${pairs.slice(0, 6).map((p) => `
      <div class="row"><div><div class="title">${esc(p.l.name)}</div><div class="meta">${esc(CAT[p.c].name)} · customer ${fmt(p.cu)} · vendor ${fmt(p.ve)}</div></div>
      <div class="gapbar"><span class="pill ${gapBand(p.g)}">${gapWord(p.g)}</span><b>${signed(p.g)}</b></div></div>`).join("")}</div>`;
  }

  function safetyList(list) {
    if (!list.length) return `<p class="empty">No open safety issues.</p>`;
    const now = Date.now();
    return `<div class="rows">${list.sort((a, b) => new Date(a.created_at) - new Date(b.created_at)).slice(0, 6).map((i) => {
      const age = days(now - new Date(i.created_at));
      return `<div class="row"><div><div class="title">${esc(locName(i.location_id))}</div><div class="meta">${esc(i.comment).slice(0, 110)}</div></div>
        <span class="pill ${age > C.slaDays.safety ? "bad" : "warn"}">${age < 1 ? Math.max(1, Math.round(age * 24)) + "h" : Math.round(age) + "d"} open</span></div>`;
    }).join("")}</div>`;
  }

  function drawCharts(audits, issues) {
    if (!window.Chart) return;
    const ink = cssVar("--ink"), muted = cssVar("--muted"), line = cssVar("--line");
    const cu = cssVar("--customer"), ve = cssVar("--vendor"), tg = cssVar("--target"), acc = cssVar("--mark");
    Chart.defaults.font.family = cssVar("--f-body");
    Chart.defaults.color = muted;
    const scoreAxis = { min: 1, max: 5, ticks: { stepSize: 1, color: muted }, grid: { color: line }, border: { display: false } };
    const catAxis = { ticks: { color: ink }, grid: { display: false }, border: { color: line } };
    const legend = { position: "bottom", labels: { boxWidth: 10, boxHeight: 10, color: ink } };
    const tip = { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y != null && ctx.chart.config.options.indexAxis !== "y" ? fmt(ctx.parsed.y) : fmt(ctx.parsed.x)}` } };
    const bar = (label, data, color) => ({ label, data, backgroundColor: color, borderRadius: 3, maxBarThickness: 26 });

    const cats = CATEGORIES.filter((c) => prefs.category === "all" || c.id === prefs.category);
    charts.push(new Chart($("#chCat"), {
      type: "bar",
      data: { labels: cats.map((c) => c.name.replace("HVAC equipment rooms", "HVAC rooms").replace("Preventive maintenance", "Prev. maint.")),
        datasets: [bar("Customer", cats.map((c) => sideAvg(audits.filter((a) => a.category === c.id), "customer")), cu),
                   bar("Vendor", cats.map((c) => sideAvg(audits.filter((a) => a.category === c.id), "vendor")), ve)] },
      options: { maintainAspectRatio: false, scales: { y: scoreAxis, x: catAxis }, plugins: { legend, tooltip: tip } },
    }));

    const weeks = weekList(audits, issues);
    const wk = (d) => isoDay(weekStart(d));
    const byWeek = (side) => weeks.map((w) => sideAvg(audits.filter((a) => wk(parseDay(a.audit_date)) === isoDay(w)), side));
    const lineDs = (label, d, color) => ({ label, data: d, borderColor: color, backgroundColor: color, tension: 0.25, spanGaps: true, pointRadius: 3, pointHoverRadius: 5, borderWidth: 2 });
    charts.push(new Chart($("#chTrend"), {
      type: "line",
      data: { labels: weeks.map(shortDate), datasets: [lineDs("Customer", byWeek("customer"), cu), lineDs("Vendor", byWeek("vendor"), ve),
        { label: "Standard", data: weeks.map(() => C.targetScore), borderColor: tg, borderDash: [5, 4], borderWidth: 1.5, pointRadius: 0, pointHoverRadius: 0 }] },
      options: { maintainAspectRatio: false, scales: { y: scoreAxis, x: { ...catAxis, ticks: { color: muted, maxRotation: 0, autoSkip: true } } }, plugins: { legend, tooltip: tip }, interaction: { mode: "index", intersect: false } },
    }));

    charts.push(new Chart($("#chDim"), {
      type: "bar",
      data: { labels: DIMENSIONS.map((d) => d.name),
        datasets: [bar("Customer", DIMENSIONS.map((d) => sideAvg(audits, "customer", (a) => auditDim(a, d.id))), cu),
                   bar("Vendor", DIMENSIONS.map((d) => sideAvg(audits, "vendor", (a) => auditDim(a, d.id))), ve)] },
      options: { indexAxis: "y", maintainAspectRatio: false, scales: { x: scoreAxis, y: catAxis }, plugins: { legend, tooltip: tip } },
    }));

    const count = (pred) => weeks.map((w) => pred(isoDay(w)));
    charts.push(new Chart($("#chUse"), {
      type: "bar",
      data: { labels: weeks.map(shortDate), datasets: [
        { ...bar("Customer audits", count((w) => audits.filter((a) => a.side === "customer" && wk(parseDay(a.audit_date)) === w).length), cu), stack: "audits" },
        { ...bar("Vendor audits", count((w) => audits.filter((a) => a.side === "vendor" && wk(parseDay(a.audit_date)) === w).length), ve), stack: "audits" },
        { ...bar("QR feedback", count((w) => issues.filter((i) => i.source === "qr" && wk(new Date(i.created_at)) === w).length), acc), stack: "qr" },
      ] },
      options: { maintainAspectRatio: false, scales: { x: { ...catAxis, stacked: true, ticks: { color: muted, maxRotation: 0, autoSkip: true } }, y: { stacked: true, beginAtZero: true, ticks: { precision: 0, color: muted }, grid: { color: line }, border: { display: false } } }, plugins: { legend } },
    }));
  }

  // ---------- new audit ----------
  function renderAuditForm(view) {
    const locs = data.locations.filter((l) => l.active);
    const loc = locs.find((l) => l.id === prefs.auditLoc) || locs[0];
    const today = isoDay(new Date());
    view.innerHTML = `
      <section class="page-head"><div><div class="eyebrow">New audit</div><h1>Rate a location</h1>
        <p class="sub">Score each item 1–5, or N/A if it does not apply. Safety items scored 1 or 2 open a safety issue automatically.</p></div></section>
      <form class="panel" id="auditForm" novalidate>
        <div class="form-grid">
          <label class="field">Rating as
            <span class="seg" role="radiogroup" aria-label="Rating as">
              <input type="radio" name="side" id="sideC" value="customer" ${prefs.side !== "vendor" ? "checked" : ""}><label for="sideC">Customer</label>
              <input type="radio" name="side" id="sideV" value="vendor" ${prefs.side === "vendor" ? "checked" : ""}><label for="sideV">Vendor</label>
            </span></label>
          <label class="field" for="aAuditor">Your name and role<input type="text" id="aAuditor" required value="${esc(prefs.auditor)}" placeholder="e.g. J. Smith, Facilities Director" autocomplete="name"></label>
          <label class="field" for="aDate">Audit date<input type="date" id="aDate" value="${today}" max="${today}"></label>
          <label class="field" for="aLoc">Location<select id="aLoc">${locs.map((l) => `<option value="${esc(l.id)}"${loc && l.id === loc.id ? " selected" : ""}>${esc(l.name)}</option>`).join("")}</select></label>
          <label class="field" for="aCat">Service area<select id="aCat"></select></label>
        </div>
        <div class="scale-key">${SCALE.map((s) => `<span><b>${s.v}</b> ${s.label}</span>`).join("")}</div>
        <div class="criteria" id="criteria"></div>
        <label class="field" for="aComments">Comments<textarea id="aComments" placeholder="What stood out, good or bad?"></textarea></label>
        <label class="check"><input type="checkbox" id="aIssue"> Open a follow-up issue with these comments</label>
        <div class="toolbar" style="justify-content:space-between">
          <div><span class="eyebrow">Audit score</span> <span class="live-score" id="liveScore">—</span></div>
          <button class="btn primary" type="submit">Submit audit</button>
        </div>
        <p class="notice bad" id="auditErr" hidden></p>
      </form>`;

    const fillCats = () => {
      const l = data.locations.find((x) => x.id === $("#aLoc").value);
      const cats = CATEGORIES.filter((c) => (l?.categories || []).includes(c.id));
      $("#aCat").innerHTML = cats.map((c) => `<option value="${c.id}"${c.id === prefs.auditCat ? " selected" : ""}>${esc(c.name)}</option>`).join("");
      fillCriteria();
    };
    const fillCriteria = () => {
      const cat = CAT[$("#aCat").value];
      $("#criteria").innerHTML = cat ? cat.criteria.map((cr) => `
        <div class="criterion">
          <div><div class="dim ${cr.dim}">${esc(DIMENSIONS.find((d) => d.id === cr.dim).name)}</div><div>${esc(cr.label)}</div></div>
          <span class="seg score-seg" role="radiogroup" aria-label="${esc(cr.label)}">
            ${[1, 2, 3, 4, 5].map((v) => `<input type="radio" name="${cr.id}" id="${cr.id}-${v}" value="${v}"><label for="${cr.id}-${v}" title="${SCALE[v - 1].label}">${v}</label>`).join("")}
            <input type="radio" name="${cr.id}" id="${cr.id}-na" value="na"><label for="${cr.id}-na">N/A</label>
          </span>
        </div>`).join("") : `<p class="empty">This location has no service areas assigned. Edit it under Setup.</p>`;
      updateScore();
    };
    const collect = () => {
      const cat = CAT[$("#aCat").value]; const scores = {}; let answered = 0;
      (cat?.criteria || []).forEach((cr) => {
        const v = $(`input[name="${cr.id}"]:checked`)?.value;
        if (v) answered++;
        scores[cr.id] = v && v !== "na" ? Number(v) : null;
      });
      return { cat, scores, answered };
    };
    const updateScore = () => { const { scores } = collect(); const s = mean(Object.values(scores)); const el = $("#liveScore"); el.textContent = fmt(s); el.style.color = s == null ? "" : `var(--${band(s)})`; };

    $("#aLoc").onchange = () => { prefs.auditLoc = $("#aLoc").value; savePrefs(); fillCats(); };
    $("#aCat").onchange = () => { prefs.auditCat = $("#aCat").value; savePrefs(); fillCriteria(); };
    $("#criteria").onchange = updateScore;
    fillCats();

    $("#auditForm").onsubmit = async (e) => {
      e.preventDefault();
      const err = $("#auditErr"); err.hidden = true;
      const side = $('input[name="side"]:checked').value;
      const auditor = $("#aAuditor").value.trim();
      const { cat, scores, answered } = collect();
      const problems = [];
      if (!auditor) problems.push("Enter your name.");
      if (!cat) problems.push("Pick a service area.");
      else if (answered < cat.criteria.length) problems.push(`Score every item or mark it N/A (${cat.criteria.length - answered} left).`);
      else if (Object.values(scores).every((v) => v == null)) problems.push("Score at least one item.");
      if (problems.length) { err.textContent = problems.join(" "); err.hidden = false; return; }

      prefs.side = side; prefs.auditor = auditor; savePrefs();
      const btn = e.submitter || $("#auditForm button[type=submit]"); btn.disabled = true;
      try {
        const audit = await store.addAudit({ audit_date: $("#aDate").value || isoDay(new Date()), side, auditor, location_id: $("#aLoc").value, category: cat.id, scores, comments: $("#aComments").value.trim() });
        const lowSafety = cat.criteria.filter((cr) => cr.dim === "safety" && scores[cr.id] != null && scores[cr.id] <= 2);
        let opened = 0;
        if (lowSafety.length) {
          await store.addIssue({ location_id: audit.location_id, category: cat.id, rating: Math.min(...lowSafety.map((c) => scores[c.id])),
            comment: "Audit flagged: " + lowSafety.map((c) => c.label).join("; ") + ($("#aComments").value.trim() ? " — " + $("#aComments").value.trim() : ""),
            submitter: `${auditor} (${side})`, contact: "", safety: true, source: "audit", status: "open", priority: "high", assigned_to: "", resolution: "", resolved_at: null, brightly_exported_at: null, audit_id: audit.id });
          opened++;
        }
        if ($("#aIssue").checked && $("#aComments").value.trim() && !lowSafety.length) {
          const o = auditOverall(audit);
          await store.addIssue({ location_id: audit.location_id, category: cat.id, rating: Math.round(o ?? 3), comment: $("#aComments").value.trim(),
            submitter: `${auditor} (${side})`, contact: "", safety: false, source: "audit", status: "open", priority: o != null && o < C.minimumScore ? "high" : "medium",
            assigned_to: "", resolution: "", resolved_at: null, brightly_exported_at: null, audit_id: audit.id });
          opened++;
        }
        await refresh();
        toast(`Audit saved (${fmt(auditOverall(audit))})${opened ? ` · ${opened} issue${opened > 1 ? "s" : ""} opened` : ""}`);
        renderAuditForm(view);
        window.scrollTo(0, 0);
      } catch (ex) { err.textContent = "Could not save the audit: " + ex.message; err.hidden = false; btn.disabled = false; }
    };
  }

  // ---------- audit log ----------
  function renderAuditLog(view) {
    const side = prefs.logSide || "all";
    const rows = data.audits.filter((a) => (side === "all" || a.side === side) && (prefs.location === "all" || a.location_id === prefs.location) && (prefs.category === "all" || a.category === prefs.category))
      .sort((a, b) => (b.audit_date + b.created_at).localeCompare(a.audit_date + a.created_at));
    view.innerHTML = `
      <section class="page-head"><div><div class="eyebrow">Audit log</div><h1>Every audit, both sides</h1><p class="sub">${rows.length} audits shown. Location and service-area filters are shared with the dashboard.</p></div>
        <div class="filters">
          <label class="field" for="lSide">Side<select id="lSide"><option value="all">Both</option><option value="customer"${side === "customer" ? " selected" : ""}>Customer</option><option value="vendor"${side === "vendor" ? " selected" : ""}>Vendor</option></select></label>
          <button class="btn" id="lCsv" type="button">Export CSV</button>
        </div></section>
      <section class="panel"><div class="table-wrap"><table>
        <thead><tr><th>Date</th><th>Side</th><th>Auditor</th><th>Location</th><th>Area</th><th class="n">Score</th>${DIMENSIONS.map((d) => `<th class="n">${d.name.split(" ")[0]}</th>`).join("")}<th>Details</th></tr></thead>
        <tbody>${rows.slice(0, 400).map((a) => { const o = auditOverall(a); return `<tr>
          <td class="tnum" style="white-space:nowrap">${esc(a.audit_date)}</td><td><span class="pill ${a.side}">${a.side === "customer" ? "Customer" : "Vendor"}</span></td>
          <td>${esc(a.auditor)}</td><td>${esc(locName(a.location_id))}</td><td>${esc(CAT[a.category]?.name || a.category)}</td>
          <td class="n"><span class="pill ${band(o)}">${fmt(o)}</span></td>${DIMENSIONS.map((d) => `<td class="n">${fmt(auditDim(a, d.id), 1)}</td>`).join("")}
          <td><details><summary>Items</summary><ul class="crit-list">${Object.entries(a.scores || {}).map(([k, v]) => `<li><span>${esc(CRIT[k]?.label || k)}</span><b>${v ?? "N/A"}</b></li>`).join("")}</ul>${a.comments ? `<p style="margin:6px 0 0;font-size:.82rem">${esc(a.comments)}</p>` : ""}</details></td></tr>`; }).join("")}</tbody>
      </table></div>${rows.length > 400 ? `<p class="empty">Showing the latest 400. Export CSV for the full list.</p>` : ""}${rows.length ? "" : `<p class="empty">No audits yet. Start one under New audit.</p>`}</section>`;
    $("#lSide").onchange = (e) => { prefs.logSide = e.target.value; savePrefs(); render(); };
    $("#lCsv").onclick = () => {
      const crits = CATEGORIES.flatMap((c) => c.criteria);
      const head = ["Audit date", "Side", "Auditor", "Location", "Service area", "Score", ...DIMENSIONS.map((d) => d.name), "Comments", ...crits.map((c) => `${CAT[CRIT[c.id].category].name}: ${c.label}`)];
      const body = rows.map((a) => [a.audit_date, a.side, a.auditor, locName(a.location_id), CAT[a.category]?.name, fmt(auditOverall(a)), ...DIMENSIONS.map((d) => fmt(auditDim(a, d.id))), a.comments, ...crits.map((c) => (c.id in (a.scores || {}) ? a.scores[c.id] ?? "N/A" : ""))]);
      downloadText(`tps-audits-${isoDay(new Date())}.csv`, toCsv([head, ...body]));
    };
  }

  // ---------- issues ----------
  function renderIssues(view) {
    const f = { status: prefs.iStatus || "active", safety: !!prefs.iSafety, q: prefs.iQ || "" };
    const list = data.issues.filter((i) =>
      (f.status === "all" || (f.status === "active" ? needsAction(i) : i.status === f.status))
      && (!f.safety || i.safety)
      && (prefs.location === "all" || i.location_id === prefs.location)
      && (!f.q || (i.comment + " " + locName(i.location_id)).toLowerCase().includes(f.q.toLowerCase())))
      .sort((a, b) => (b.safety && needsAction(b)) - (a.safety && needsAction(a)) || new Date(b.created_at) - new Date(a.created_at));
    const statusOpt = (v, l) => `<option value="${v}"${f.status === v ? " selected" : ""}>${l}</option>`;
    view.innerHTML = `
      <section class="page-head"><div><div class="eyebrow">Issues</div><h1>Feedback and corrective actions</h1>
        <p class="sub">QR submissions and audit-flagged items. Safety issues stay at the top until resolved.</p></div>
        <div class="filters">
          <label class="field" for="iStatus">Status<select id="iStatus">${statusOpt("active", "Needs action")}${statusOpt("open", "Open")}${statusOpt("in_progress", "In progress")}${statusOpt("resolved", "Resolved")}${statusOpt("noted", "Noted (no action)")}${statusOpt("all", "All")}</select></label>
          <label class="field" for="iQ">Search<input type="search" id="iQ" value="${esc(f.q)}" placeholder="Comment or location"></label>
          <label class="check" style="align-self:flex-end;padding-bottom:8px"><input type="checkbox" id="iSafety"${f.safety ? " checked" : ""}> Safety only</label>
        </div></section>
      <section class="panel">
        <div class="toolbar">
          <label class="check"><input type="checkbox" id="iAll"> Select all (${list.length})</label>
          <button class="btn" id="iExport" type="button">Export selected for Brightly (CSV)</button>
          <button class="btn" id="iCopy" type="button">Copy as work requests</button>
          <button class="btn" id="iMark" type="button">Mark selected as sent to Brightly</button>
        </div>
        <div id="issueList">${list.length ? list.map(issueCard).join("") : `<p class="empty">Nothing here. Change the filters to see more.</p>`}</div>
      </section>`;

    $("#iStatus").onchange = (e) => { prefs.iStatus = e.target.value; savePrefs(); render(); };
    $("#iSafety").onchange = (e) => { prefs.iSafety = e.target.checked; savePrefs(); render(); };
    let qt; $("#iQ").oninput = (e) => { clearTimeout(qt); qt = setTimeout(() => { prefs.iQ = e.target.value; savePrefs(); render(); setTimeout(() => { const el = $("#iQ"); el.focus(); el.setSelectionRange(el.value.length, el.value.length); }); }, 300); };
    $("#iAll").onchange = (e) => $$(".iSel").forEach((c) => { c.checked = e.target.checked; });
    const selected = () => $$(".iSel:checked").map((c) => data.issues.find((i) => i.id === c.value));
    $("#iExport").onclick = () => { const s = selected(); if (!s.length) return toast("Select at least one issue"); downloadText(`brightly-work-requests-${isoDay(new Date())}.csv`, brightlyCsv(s)); };
    $("#iCopy").onclick = () => { const s = selected(); if (!s.length) return toast("Select at least one issue"); copy(s.map(workRequestText).join("\n\n----------\n\n")); };
    $("#iMark").onclick = async () => {
      const s = selected(); if (!s.length) return toast("Select at least one issue");
      await store.updateIssues(s.map((i) => i.id), { brightly_exported_at: new Date().toISOString() });
      await refresh(); toast(`${s.length} marked as sent to Brightly`); render();
    };
    $("#issueList").addEventListener("click", async (e) => {
      const btn = e.target.closest("[data-save]"); if (!btn) return;
      const id = btn.dataset.save; const card = btn.closest(".issue");
      const status = $(".iStat", card).value;
      const patch = { status, assigned_to: $(".iAssign", card).value.trim(), resolution: $(".iRes", card).value.trim(), priority: $(".iPri", card).value };
      const cur = data.issues.find((i) => i.id === id);
      if (status === "resolved" && !cur.resolved_at) patch.resolved_at = new Date().toISOString();
      if (status !== "resolved") patch.resolved_at = null;
      btn.disabled = true;
      try { await store.updateIssue(id, patch); await refresh(); toast("Issue updated"); render(); }
      catch (ex) { toast("Could not save: " + ex.message); btn.disabled = false; }
    });
  }

  function issueCard(i) {
    const age = days(Date.now() - new Date(i.created_at));
    const statusPill = i.status === "resolved" ? "good" : i.status === "noted" ? "neutral" : i.status === "in_progress" ? "warn" : "bad";
    const opt = (v, l, cur) => `<option value="${v}"${cur === v ? " selected" : ""}>${l}</option>`;
    const resolvedIn = i.resolved_at ? days(new Date(i.resolved_at) - new Date(i.created_at)) : null;
    return `<article class="issue${i.safety && needsAction(i) ? " safety-open" : ""}">
      <input type="checkbox" class="iSel" value="${esc(i.id)}" aria-label="Select issue">
      <div>
        <div class="pills">
          <span class="pill ${statusPill}">${STATUS[i.status] || i.status}</span>
          ${i.safety ? `<span class="pill safety">Safety</span>` : ""}
          <span class="pill neutral">${i.source === "qr" ? "QR feedback" : "Audit"}</span>
          ${i.brightly_exported_at ? `<span class="pill neutral">Sent to Brightly ${shortDate(new Date(i.brightly_exported_at))}</span>` : ""}
          ${stars(i.rating)}
        </div>
        <div style="margin-top:6px"><b>${esc(locName(i.location_id))}</b> · ${esc(CAT[i.category]?.name || i.category)}</div>
        <p class="comment">${esc(i.comment) || "<span style='color:var(--muted)'>No comment</span>"}</p>
        <div class="meta">${dateTime(i.created_at)}${i.submitter ? " · " + esc(i.submitter) : ""}${i.contact ? " · " + esc(i.contact) : ""} · ${resolvedIn != null ? `resolved in ${fmt(resolvedIn, 1)} days` : `${age < 1 ? Math.max(1, Math.round(age * 24)) + " hours" : Math.round(age) + " days"} old`}</div>
        <div class="controls">
          <label class="field">Status<select class="iStat">${Object.entries(STATUS).map(([v, l]) => opt(v, l, i.status)).join("")}</select></label>
          <label class="field">Priority<select class="iPri">${opt("high", "High", i.priority)}${opt("medium", "Medium", i.priority)}${opt("low", "Low", i.priority)}</select></label>
          <label class="field">Assigned to<input type="text" class="iAssign" value="${esc(i.assigned_to)}" placeholder="Vendor, name…"></label>
          <textarea class="iRes" placeholder="Resolution notes" aria-label="Resolution notes">${esc(i.resolution)}</textarea>
          <button class="btn small primary" type="button" data-save="${esc(i.id)}">Save</button>
        </div>
      </div>
    </article>`;
  }

  // Columns map to the fields a Brightly work request import typically needs. The vendor maps them once in Brightly's importer.
  function brightlyCsv(list) {
    const head = ["Request Title", "Description", "Site", "Location", "Building", "Category", "Priority", "Request Type", "Requested By", "Requester Contact", "Date Requested", "Safety Concern", "Source", "TPS Issue ID"];
    const rows = list.map((i) => {
      const loc = data.locations.find((l) => l.id === i.location_id) || {};
      const title = `${i.safety ? "SAFETY: " : ""}${CAT[i.category]?.name || i.category} - ${loc.name || i.location_id}`;
      return [title, i.comment, C.brightly.siteName, loc.name || i.location_id, loc.building || "", CAT[i.category]?.name || i.category,
        { high: "High", medium: "Medium", low: "Low" }[i.priority || priorityFor(i)], C.brightly.requestType, i.submitter || "Anonymous", i.contact || "",
        new Date(i.created_at).toISOString().slice(0, 16).replace("T", " "), i.safety ? "Yes" : "No", i.source === "qr" ? "QR feedback" : "Audit", i.id];
    });
    return toCsv([head, ...rows]);
  }

  function workRequestText(i) {
    const loc = data.locations.find((l) => l.id === i.location_id) || {};
    return [`${i.safety ? "[SAFETY] " : ""}Work request: ${CAT[i.category]?.name || i.category} at ${loc.name || i.location_id}`,
      `Site: ${C.brightly.siteName}${loc.building ? " / " + loc.building : ""}`,
      `Priority: ${(i.priority || priorityFor(i)).toUpperCase()}`,
      `Reported: ${dateTime(i.created_at)} via ${i.source === "qr" ? "QR feedback" : "audit"}${i.submitter ? " by " + i.submitter : ""}`,
      i.rating ? `Rating: ${i.rating}/5` : "", `Details: ${i.comment}`, `Reference: TPS-${i.id.slice(0, 8)}`].filter(Boolean).join("\n");
  }

  // ---------- QR codes ----------
  function qrSvg(text) {
    const qr = window.qrcode(0, "M"); qr.addData(text); qr.make();
    return qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
  }

  function renderQr(view) {
    const locs = data.locations.filter((l) => l.active);
    const base = publicBase();
    const url = (l) => `${base}#report.${l.id}`;
    const local = /^(file:|https?:\/\/(localhost|127\.|192\.168\.|10\.))/.test(base);
    view.innerHTML = `
      <section class="page-head"><div><div class="eyebrow">QR codes</div><h1>Post a code, collect feedback</h1>
        <p class="sub">Each code opens a short form for that location: a 1–5 rating, a comment and a safety flag. No login needed. Print this page and post the cards.</p></div>
        <div class="toolbar no-print"><button class="btn primary" id="qPrint" type="button">Print cards</button><a class="btn" href="#report" target="_blank" rel="noopener">Open the form</a></div></section>
      ${local ? `<p class="notice no-print">These codes point to <b>${esc(base)}</b>, which phones on campus cannot reach. Set <code>publicUrl</code> in config.js to the hosted address before printing.</p>` : ""}
      ${store.mode === "demo" ? `<p class="notice no-print">Demo mode: feedback is saved only in the browser that submits it. Connect Supabase (see README) so phone submissions reach this dashboard.</p>` : ""}
      <div class="qr-grid">${locs.map((l) => `
        <div class="qr-card">
          <div class="eyebrow">${esc(C.orgName)}</div>
          <h3>${esc(l.name)}</h3>
          <div class="print-only">See something that needs attention? Scan to rate this area or report an issue.</div>
          <div class="qr">${qrSvg(url(l))}</div>
          <div class="url">${esc(url(l))}</div>
          <div class="toolbar no-print"><button class="btn small" type="button" data-copy="${esc(url(l))}">Copy link</button><a class="btn small" href="#report.${esc(l.id)}">Preview</a></div>
        </div>`).join("")}</div>`;
    $("#qPrint").onclick = () => window.print();
    view.addEventListener("click", (e) => { const b = e.target.closest("[data-copy]"); if (b) copy(b.dataset.copy); });
  }

  // ---------- setup ----------
  function renderSetup(view) {
    view.innerHTML = `
      <section class="page-head"><div><div class="eyebrow">Setup</div><h1>Locations and data</h1>
        <p class="sub">Each location lists the service areas audited there. Audits and QR codes use these lists.</p></div></section>
      <section class="panel">
        <div class="panel-head"><h2>Locations</h2><p>${data.locations.length} total</p></div>
        <div class="table-wrap"><table><thead><tr><th>Name</th><th>Building</th>${CATEGORIES.map((c) => `<th style="text-align:center">${esc(c.name.replace("HVAC equipment rooms", "HVAC").replace("Preventive maintenance", "PM"))}</th>`).join("")}<th>Active</th><th></th></tr></thead>
        <tbody>${data.locations.map((l) => `<tr data-id="${esc(l.id)}">
          <td><input type="text" class="sName" value="${esc(l.name)}" aria-label="Name"></td>
          <td><input type="text" class="sBld" value="${esc(l.building || "")}" aria-label="Building" style="width:9em"></td>
          ${CATEGORIES.map((c) => `<td style="text-align:center"><input type="checkbox" class="sCat" value="${c.id}"${(l.categories || []).includes(c.id) ? " checked" : ""} aria-label="${esc(c.name)}"></td>`).join("")}
          <td style="text-align:center"><input type="checkbox" class="sAct"${l.active ? " checked" : ""} aria-label="Active"></td>
          <td><button class="btn small" type="button" data-saveloc>Save</button></td></tr>`).join("")}</tbody></table></div>
        <form id="newLoc" class="toolbar" style="align-items:flex-end">
          <label class="field" for="nName">New location<input type="text" id="nName" placeholder="e.g. Lower School Lobby" required></label>
          <label class="field" for="nBld">Building<input type="text" id="nBld" placeholder="Lower School"></label>
          <button class="btn primary" type="submit">Add location</button>
        </form>
      </section>
      <section class="panel">
        <div class="panel-head"><h2>Data</h2></div>
        ${store.mode === "demo" ? `
          <p style="margin:0">Running in <b>demo mode</b>. Records are kept in this browser only. To share data across auditors, phones and the operations team, add your Supabase details to <code>config.js</code> as described in the README.</p>
          <div class="toolbar"><button class="btn" id="dReset" type="button">Reload sample data</button><button class="btn" id="dClear" type="button">Clear audits and issues</button><button class="btn" id="dJson" type="button">Export everything (JSON)</button></div>
          <p class="notice" id="dConfirm" hidden></p>`
        : `<p style="margin:0">Connected to the shared database. Signed-in staff can enter audits and manage issues; anyone with a QR link can submit feedback.</p>
          <div class="toolbar"><button class="btn" id="dJson" type="button">Export everything (JSON)</button><button class="btn" id="dOut" type="button">Sign out</button></div>`}
        <p style="margin:0;color:var(--muted);font-size:.85rem">Standard ${C.targetScore.toFixed(1)} · minimum ${C.minimumScore.toFixed(1)} · aligned within ±${C.alignedGap} · response targets ${C.slaDays.safety} day (safety) / ${C.slaDays.standard} days. Change these in config.js.</p>
      </section>`;

    view.querySelector("tbody")?.addEventListener("click", async (e) => {
      if (!e.target.matches("[data-saveloc]")) return;
      const tr = e.target.closest("tr");
      const loc = { id: tr.dataset.id, name: $(".sName", tr).value.trim(), building: $(".sBld", tr).value.trim(), categories: $$(".sCat:checked", tr).map((c) => c.value), active: $(".sAct", tr).checked };
      if (!loc.name) return toast("A location needs a name");
      try { await store.saveLocation(loc); await refresh(); toast("Location saved"); } catch (ex) { toast("Could not save: " + ex.message); }
    });
    $("#newLoc").onsubmit = async (e) => {
      e.preventDefault();
      const name = $("#nName").value.trim(); if (!name) return;
      let id = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "loc";
      while (data.locations.some((l) => l.id === id)) id += "-2";
      try { await store.saveLocation({ id, name, building: $("#nBld").value.trim(), categories: ["custodial", "housekeeping", "pm"], active: true }); await refresh(); toast("Location added. Tick its service areas, then Save."); render(); }
      catch (ex) { toast("Could not add: " + ex.message); }
    };
    $("#dJson").onclick = () => downloadText(`tps-ops-export-${isoDay(new Date())}.json`, JSON.stringify(data, null, 2), "application/json");
    if ($("#dOut")) $("#dOut").onclick = async () => { await store.signOut(); render(); };
    // Two-step confirm, since a destructive action deserves one.
    const confirmThen = (msg, fn) => {
      const box = $("#dConfirm"); box.hidden = false;
      box.innerHTML = `${esc(msg)} <button class="btn small" type="button" id="dYes">Yes, do it</button> <button class="btn small" type="button" id="dNo">Cancel</button>`;
      $("#dYes").onclick = async () => { await fn(); await refresh(); render(); };
      $("#dNo").onclick = () => { box.hidden = true; };
    };
    if ($("#dReset")) $("#dReset").onclick = () => confirmThen("Replace everything in this browser with fresh sample data?", () => store.resetDemo().then(() => toast("Sample data reloaded")));
    if ($("#dClear")) $("#dClear").onclick = () => confirmThen("Delete all audits and issues in this browser? Locations are kept.", () => store.clearAll().then(() => toast("Audits and issues cleared")));
  }

  // ---------- login (live mode) ----------
  function renderLogin(view) {
    view.innerHTML = `
      <section class="panel login">
        <div class="eyebrow">${esc(C.orgName)}</div><h1>Sign in</h1>
        <p class="sub" style="margin:0;color:var(--muted)">Auditors and the operations team sign in here. To leave feedback, scan a posted QR code instead.</p>
        <form id="loginForm">
          <label class="field" for="lEmail">Email<input type="email" id="lEmail" required autocomplete="email"></label>
          <label class="field" for="lPass">Password (leave blank to get a sign-in link by email)<input type="password" id="lPass" autocomplete="current-password"></label>
          <button class="btn primary big-btn" type="submit">Sign in</button>
          <p class="notice" id="lMsg" hidden></p>
        </form>
      </section>`;
    $("#loginForm").onsubmit = async (e) => {
      e.preventDefault(); const msg = $("#lMsg"); msg.hidden = true;
      const email = $("#lEmail").value.trim(); const pass = $("#lPass").value;
      try {
        await store.signIn(email, pass);
        if (pass) { await refresh(); render(); }
        else { msg.className = "notice"; msg.textContent = `Check ${email} for a sign-in link.`; msg.hidden = false; }
      } catch (ex) { msg.className = "notice bad"; msg.textContent = "Sign-in failed: " + ex.message; msg.hidden = false; }
    };
  }

  // ---------- public QR feedback form ----------
  async function renderReport(view, locId) {
    let locs = [];
    try { locs = await store.publicLocations(); } catch (e) { /* show the form without a location list */ }
    const loc = locs.find((l) => l.id === locId);
    const topics = FEEDBACK_TOPICS.filter((t) => !loc || (loc.categories || []).includes(t.id));
    const faces = ["Poor", "Fair", "OK", "Good", "Great"];
    view.innerHTML = `
      <div class="public-wrap">
        <div class="public-head"><span class="brand-mark" aria-hidden="true"></span><div><div class="eyebrow" style="color:inherit;opacity:.75">${esc(C.orgName)}</div><h1>${loc ? esc(loc.name) : "Rate a campus space"}</h1><p>Tell us how this area looks and works. It takes 30 seconds.</p></div></div>
        <form class="panel" id="fbForm" novalidate>
          ${loc ? "" : `<label class="field" for="fbLoc">Where are you?<select id="fbLoc" required><option value="">Choose a location</option>${locs.map((l) => `<option value="${esc(l.id)}">${esc(l.name)}</option>`).join("")}</select></label>`}
          <fieldset style="border:0;padding:0;margin:0;display:flex;flex-direction:column;gap:8px"><legend class="eyebrow" style="margin-bottom:8px">What is this about?</legend>
            <div class="chips" id="fbTopics">${topics.map((t, k) => `<input type="radio" name="topic" id="t-${t.id}" value="${t.id}"${k === 0 ? " checked" : ""}><label for="t-${t.id}">${esc(t.label)}</label>`).join("")}</div></fieldset>
          <fieldset style="border:0;padding:0;margin:0"><legend class="eyebrow" style="margin-bottom:8px">How would you rate it?</legend>
            <div class="rate">${faces.map((f, k) => `<input type="radio" name="rating" id="r${k + 1}" value="${k + 1}"><label for="r${k + 1}"><b>${k + 1}</b><span>${f}</span></label>`).join("")}</div></fieldset>
          <label class="field" for="fbComment">Comment<textarea id="fbComment" maxlength="1000" placeholder="What did you notice? Be as specific as you can, e.g. which restroom or room number."></textarea></label>
          <label class="safety-toggle" for="fbSafety"><input type="checkbox" id="fbSafety"><span><b>This is a safety concern</b><br><span style="font-size:.85rem;color:var(--muted)">Spills, trip hazards, broken lights, exposed wiring, blocked exits. For emergencies call campus security or 911 first.</span></span></label>
          <div class="form-grid">
            <label class="field" for="fbName">Your name (optional)<input type="text" id="fbName" maxlength="80" autocomplete="name"></label>
            <label class="field" for="fbContact">Email or phone for follow-up (optional)<input type="text" id="fbContact" maxlength="120" autocomplete="email"></label>
          </div>
          <p class="notice bad" id="fbErr" hidden></p>
          <button class="btn primary big-btn" type="submit">Send feedback</button>
        </form>
      </div>`;
    $("#fbForm").onsubmit = async (e) => {
      e.preventDefault();
      const err = $("#fbErr"); err.hidden = true;
      const location_id = loc ? loc.id : $("#fbLoc").value;
      const rating = Number($('input[name="rating"]:checked')?.value || 0);
      const safety = $("#fbSafety").checked;
      const comment = $("#fbComment").value.trim();
      const category = $('input[name="topic"]:checked')?.value;
      const problems = [];
      if (!location_id) problems.push("Choose a location.");
      if (!rating) problems.push("Pick a rating from 1 to 5.");
      if ((safety || rating <= 2) && !comment) problems.push("Add a short comment so the team knows what to fix.");
      if (problems.length) { err.textContent = problems.join(" "); err.hidden = false; return; }
      const btn = $("#fbForm button[type=submit]"); btn.disabled = true; btn.textContent = "Sending…";
      const issue = { location_id, category, rating, comment, safety, submitter: $("#fbName").value.trim(), contact: $("#fbContact").value.trim(), source: "qr",
        status: rating <= 3 || safety ? "open" : "noted", priority: null, assigned_to: null, resolution: null, resolved_at: null, brightly_exported_at: null, audit_id: null };
      issue.priority = priorityFor(issue);
      try {
        await store.addIssue(issue);
        loaded = false; // staff views in this browser reload on next visit
        view.innerHTML = `<div class="public-wrap"><div class="panel thanks"><span class="brand-mark" style="margin:0 auto" aria-hidden="true"></span><h1>Thank you</h1>
          <p>${issue.status === "open" ? "Your report went to the facilities team." + (safety ? " Safety reports are reviewed first." : "") : "Your feedback helps us keep campus at its best."}</p>
          <a class="btn" href="#report${loc ? "." + esc(loc.id) : ""}" id="again">Send another</a></div></div>`;
        $("#again").onclick = (ev) => { ev.preventDefault(); renderReport(view, locId); };
      } catch (ex) { err.textContent = "Could not send. Check your connection and try again. (" + ex.message + ")"; err.hidden = false; btn.disabled = false; btn.textContent = "Send feedback"; }
    };
  }

  // ---------- boot ----------
  async function boot() {
    $("#brandName").textContent = C.appName;
    $("#orgName").textContent = C.orgName;
    if (store.mode === "demo") {
      const b = $("#modeBanner");
      b.innerHTML = `<div><b>Demo mode.</b> Sample data (people marked “demo”) stored in this browser only. Connect Supabase in config.js to go live.</div>`;
      b.hidden = false;
    }
    window.addEventListener("hashchange", render);
    render();
  }

  boot();
})();
