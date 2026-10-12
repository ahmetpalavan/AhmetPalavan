// Renders the profile cards in light and dark variants:
//   assets/activity-{dark,light}.svg  contributions per month over the last 12 months
//   assets/streak-{dark,light}.svg    all-time total, current and longest streak
// Needs GITHUB_TOKEN in the environment.
import { mkdir, writeFile } from "node:fs/promises";

const USER = process.env.GH_USER || "ahmetpalavan";
const OUT_DIR = process.env.OUT_DIR || "assets";

// GitHub Primer colors, so the cards sit naturally on either profile theme.
const THEMES = {
  dark: { border: "#30363D", fg: "#E6EDF3", muted: "#8B949E", accent: "#58A6FF", bar: "#1F6FEB", grid: "#21262D" },
  light: { border: "#D0D7DE", fg: "#1F2328", muted: "#656D76", accent: "#0969DA", bar: "#0969DA", grid: "#EAEEF2" },
};

const FONT = `-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif`;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

async function graphql(query, variables) {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch("https://api.github.com/graphql", {
      method: "POST",
      headers: { Authorization: `bearer ${process.env.GITHUB_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables }),
    });
    // The endpoint throws the odd 502 under load; give it a couple more tries.
    if (res.status >= 500 && attempt < 3) {
      await new Promise((r) => setTimeout(r, 2000 * attempt));
      continue;
    }
    const body = await res.text();
    const json = res.ok ? JSON.parse(body) : null;
    if (!json || json.errors) throw new Error(json ? JSON.stringify(json.errors) : `HTTP ${res.status}: ${body.slice(0, 200)}`);
    return json.data;
  }
}

const CALENDAR = `contributionCalendar {
  totalContributions
  weeks { contributionDays { date contributionCount } }
}`;

async function fetchStats() {
  const { user } = await graphql(
    `query($login: String!) {
      user(login: $login) {
        contributionsCollection { contributionYears ${CALENDAR} }
      }
    }`,
    { login: USER },
  );
  const cal = user.contributionsCollection.contributionCalendar;
  const days = cal.weeks.flatMap((w) => w.contributionDays);

  const perMonth = new Map();
  for (const d of days) {
    const key = d.date.slice(0, 7);
    perMonth.set(key, (perMonth.get(key) || 0) + d.contributionCount);
  }
  const months = [...perMonth.entries()].slice(-12).map(([key, total]) => ({ key, total }));

  // Streaks need every day since the first contribution, but one collection spans
  // at most a year, so ask for each contribution year under its own alias.
  const now = new Date().toISOString();
  const years = user.contributionsCollection.contributionYears.map((y) => {
    const to = `${y}-12-31T23:59:59Z` < now ? `${y}-12-31T23:59:59Z` : now;
    return `y${y}: contributionsCollection(from: "${y}-01-01T00:00:00Z", to: "${to}") { ${CALENDAR} }`;
  });
  const history = await graphql(`query($login: String!) { user(login: $login) { ${years.join("\n")} } }`, { login: USER });
  const byDate = new Map();
  for (const c of Object.values(history.user)) {
    for (const d of c.contributionCalendar.weeks.flatMap((w) => w.contributionDays)) byDate.set(d.date, d.contributionCount);
  }
  const allDays = [...byDate.entries()]
    .filter(([date]) => date <= now.slice(0, 10))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, count]) => ({ date, count }));

  return { contributions: cal.totalContributions, months, ...streaks(allDays) };
}

// allDays is one entry per calendar day, oldest first, ending today.
function streaks(allDays) {
  const total = allDays.reduce((sum, d) => sum + d.count, 0);
  const first = allDays.find((d) => d.count > 0)?.date;

  let longest = { length: 0 };
  let run = null;
  for (const d of allDays) {
    run = d.count > 0 ? { start: run?.start ?? d.date, end: d.date, length: (run?.length ?? 0) + 1 } : null;
    if (run && run.length > longest.length) longest = run;
  }

  // Today is still in progress, so an empty today doesn't break the streak yet.
  let end = allDays.length - 1;
  if (end >= 0 && allDays[end].count === 0) end--;
  let start = end + 1;
  while (start > 0 && allDays[start - 1].count > 0) start--;
  const current = start <= end ? { start: allDays[start].date, end: allDays[end].date, length: end - start + 1 } : { length: 0 };

  return { total, first, current, longest };
}

const fmt = (n) => n.toLocaleString("en-US");

// "Oct 3" this year, "Oct 3, 2025" otherwise.
function fmtDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const day = `${MONTHS[m - 1]} ${d}`;
  return y === new Date().getUTCFullYear() ? day : `${day}, ${y}`;
}

function range(r) {
  if (!r.length) return "No active streak";
  if (r.start === r.end) return fmtDate(r.start);
  const [from, to] = [fmtDate(r.start), fmtDate(r.end)];
  // "Aug 25 – Sep 17, 2024" rather than the year on both ends.
  return r.start.slice(0, 4) === r.end.slice(0, 4) ? `${from.split(",")[0]} – ${to}` : `${from} – ${to}`;
}
const days = (n) => `<tspan class="unit"> ${n === 1 ? "day" : "days"}</tspan>`;

function activity(s, t) {
  const W = 340;
  const H = 200;
  const left = 34;
  const right = W - 16;
  const top = 58;
  const bottom = 166;
  const max = Math.max(1, ...s.months.map((m) => m.total));
  const slot = (right - left) / s.months.length;
  const barW = slot * 0.62;

  const bars = s.months
    .map((m, i) => {
      const h = Math.max(m.total ? 2 : 0, (m.total / max) * (bottom - top));
      const x = left + slot * i + (slot - barW) / 2;
      const month = MONTHS[Number(m.key.slice(5)) - 1];
      return `<rect x="${x.toFixed(1)}" y="${(bottom - h).toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}" rx="2" fill="${t.bar}"><title>${month}: ${m.total}</title></rect>
  <text x="${(x + barW / 2).toFixed(1)}" y="${bottom + 14}" class="axis" text-anchor="middle">${month[0]}</text>`;
    })
    .join("\n  ");

  const ticks = [0, 0.5, 1]
    .map((f) => {
      const y = bottom - f * (bottom - top);
      return `<line x1="${left}" x2="${right}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}" stroke="${t.grid}"/>
  <text x="${left - 6}" y="${(y + 3.5).toFixed(1)}" class="axis" text-anchor="end">${Math.round(max * f)}</text>`;
    })
    .join("\n  ");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${fmt(s.contributions)} contributions in the last 12 months, by month">
  <style>
    text { font-family: ${FONT}; }
    .title { font-size: 17px; font-weight: 600; fill: ${t.accent}; }
    .sub { font-size: 11px; fill: ${t.muted}; }
    .axis { font-size: 10px; fill: ${t.muted}; }
  </style>
  <rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="8" fill="none" stroke="${t.border}"/>
  <text x="20" y="32" class="title">Monthly contributions</text>
  <text x="${W - 16}" y="31" class="sub" text-anchor="end">last 12 months</text>
  ${ticks}
  ${bars}
</svg>
`;
}

// Same 200px height as the activity card, so the two line up side by side.
function streak(s, t) {
  const W = 472;
  const H = 200;
  const col = W / 3;
  const cells = [
    { value: fmt(s.total), label: "Total contributions", sub: s.first ? `${fmtDate(s.first)} – Present` : "No contributions yet" },
    { value: `${s.current.length}${days(s.current.length)}`, label: "Current streak", sub: range(s.current), accent: true },
    { value: `${s.longest.length}${days(s.longest.length)}`, label: "Longest streak", sub: range(s.longest) },
  ]
    .map((c, i) => {
      const x = (col * (i + 0.5)).toFixed(1);
      return `<text x="${x}" y="110" class="value${c.accent ? " accent" : ""}" text-anchor="middle">${c.value}</text>
  <text x="${x}" y="136" class="label" text-anchor="middle">${c.label}</text>
  <text x="${x}" y="156" class="sub" text-anchor="middle">${c.sub}</text>`;
    })
    .join("\n  ");
  const dividers = [1, 2]
    .map((i) => `<line x1="${(col * i).toFixed(1)}" x2="${(col * i).toFixed(1)}" y1="84" y2="164" stroke="${t.grid}"/>`)
    .join("\n  ");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${fmt(s.total)} contributions in total, current streak ${s.current.length} days, longest streak ${s.longest.length} days">
  <style>
    text { font-family: ${FONT}; }
    .title { font-size: 17px; font-weight: 600; fill: ${t.accent}; }
    .value { font-size: 30px; font-weight: 600; fill: ${t.fg}; }
    .accent { fill: ${t.accent}; }
    .unit { font-size: 13px; font-weight: 400; fill: ${t.muted}; }
    .label { font-size: 12px; font-weight: 600; fill: ${t.fg}; }
    .sub { font-size: 11px; fill: ${t.muted}; }
  </style>
  <rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="8" fill="none" stroke="${t.border}"/>
  <text x="20" y="32" class="title">Contribution streak</text>
  <text x="${W - 16}" y="31" class="sub" text-anchor="end">all time</text>
  ${dividers}
  ${cells}
</svg>
`;
}

const stats = await fetchStats();
await mkdir(OUT_DIR, { recursive: true });
for (const [name, theme] of Object.entries(THEMES)) {
  await writeFile(`${OUT_DIR}/activity-${name}.svg`, activity(stats, theme));
  await writeFile(`${OUT_DIR}/streak-${name}.svg`, streak(stats, theme));
}
console.log(
  `wrote cards to ${OUT_DIR}/: ${stats.contributions} contributions in 12 months, ${stats.total} all time, ` +
    `current streak ${stats.current.length}, longest ${stats.longest.length}`,
);
