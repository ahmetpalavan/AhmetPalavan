// Renders assets/contributions.svg: a last-12-months contribution chart
// styled to match the README banner. Needs GITHUB_TOKEN in the environment.
import { mkdir, writeFile } from "node:fs/promises";

const USER = process.env.GH_USER || "ahmetpalavan";
const OUT = process.env.OUT || "assets/contributions.svg";

const W = 700;
const H = 200;
const PAD_X = 32;
const CHART_TOP = 80;
const CHART_BOTTOM = 160;

const C = {
  bg: "#1A1B27",
  border: "#2F334D",
  title: "#C0CAF5",
  muted: "#787C99",
  faint: "#565F89",
  blue: "#7AA2F7",
  purple: "#BB9AF7",
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

async function fetchWeeks() {
  const query = `query($login: String!) {
    user(login: $login) {
      contributionsCollection {
        contributionCalendar {
          totalContributions
          weeks { contributionDays { date contributionCount } }
        }
      }
    }
  }`;
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { Authorization: `bearer ${process.env.GITHUB_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables: { login: USER } }),
  });
  const json = await res.json();
  if (!res.ok || json.errors) throw new Error(JSON.stringify(json.errors || json));
  const cal = json.data.user.contributionsCollection.contributionCalendar;
  const weeks = cal.weeks.map((w) => ({
    start: w.contributionDays[0].date,
    total: w.contributionDays.reduce((s, d) => s + d.contributionCount, 0),
  }));
  const activeDays = cal.weeks.flatMap((w) => w.contributionDays).filter((d) => d.contributionCount > 0).length;
  return { total: cal.totalContributions, weeks, activeDays };
}

// Catmull-Rom spline through the points, with control points clamped to the
// chart band so the curve never dips below the baseline.
function smoothPath(pts) {
  const clamp = (y) => Math.min(CHART_BOTTOM, Math.max(CHART_TOP - 6, y));
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = clamp(p1[1] + (p2[1] - p0[1]) / 6);
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = clamp(p2[1] - (p3[1] - p1[1]) / 6);
    d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
}

function render({ total, weeks, activeDays }) {
  const best = Math.max(...weeks.map((w) => w.total));
  // 1-2-1 smoothing keeps the overall shape but drops week-to-week jitter.
  const smooth = weeks.map((w, i) => {
    const prev = weeks[i - 1]?.total ?? w.total;
    const next = weeks[i + 1]?.total ?? w.total;
    return (prev + 2 * w.total + next) / 4;
  });
  const max = Math.max(1, ...smooth);
  const stepX = (W - PAD_X * 2) / (weeks.length - 1);
  const pts = smooth.map((v, i) => [PAD_X + i * stepX, CHART_BOTTOM - (v / max) * (CHART_BOTTOM - CHART_TOP)]);
  const line = smoothPath(pts);
  const area = `${line} L${pts.at(-1)[0].toFixed(1)},${CHART_BOTTOM} L${pts[0][0].toFixed(1)},${CHART_BOTTOM} Z`;

  const grid = [0, 0.5, 1]
    .map((f) => CHART_BOTTOM - f * (CHART_BOTTOM - CHART_TOP))
    .map((y) => `<line x1="${PAD_X}" x2="${W - PAD_X}" y1="${y}" y2="${y}" stroke="${C.border}" stroke-dasharray="3 5"/>`)
    .join("");

  const labels = [];
  let lastMonth = -1;
  weeks.forEach((w, i) => {
    const m = new Date(w.start + "T00:00:00Z").getUTCMonth();
    if (m !== lastMonth && i > 0 && i < weeks.length - 2) {
      labels.push(`<text x="${pts[i][0].toFixed(1)}" y="184" class="axis" text-anchor="middle">${MONTHS[m]}</text>`);
    }
    lastMonth = m;
  });

  const last = pts.at(-1);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${total} contributions in the last year">
  <style>
    text { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Ubuntu, sans-serif; }
    .title { font-size: 15px; font-weight: 600; fill: ${C.title}; }
    .sub { font-size: 12px; fill: ${C.muted}; }
    .num { font-size: 22px; font-weight: 700; fill: url(#text); }
    .axis { font-size: 11px; fill: ${C.faint}; }
    .line { stroke-dasharray: 1; stroke-dashoffset: 1; animation: draw 1.6s ease-out forwards; }
    .fade { opacity: 0; animation: fade 0.8s ease-out 0.9s forwards; }
    @keyframes draw { to { stroke-dashoffset: 0; } }
    @keyframes fade { to { opacity: 1; } }
  </style>
  <defs>
    <linearGradient id="stroke" x1="0" x2="1"><stop offset="0" stop-color="${C.blue}"/><stop offset="1" stop-color="${C.purple}"/></linearGradient>
    <linearGradient id="text" x1="0" x2="1"><stop offset="0" stop-color="${C.blue}"/><stop offset="1" stop-color="${C.purple}"/></linearGradient>
    <linearGradient id="fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${C.purple}" stop-opacity="0.5"/><stop offset="1" stop-color="${C.blue}" stop-opacity="0"/></linearGradient>
  </defs>
  <rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="10" fill="${C.bg}"/>
  <text x="${PAD_X}" y="36" class="title">Contribution activity</text>
  <text x="${PAD_X}" y="54" class="sub">Last 12 months · ${activeDays} active days · best week ${best}</text>
  <text x="${W - PAD_X}" y="40" class="num" text-anchor="end">${total.toLocaleString("en-US")}</text>
  <text x="${W - PAD_X}" y="56" class="sub" text-anchor="end">contributions</text>
  ${grid}
  <path d="${area}" fill="url(#fill)" class="fade"/>
  <path d="${line}" fill="none" stroke="url(#stroke)" stroke-width="2.5" stroke-linecap="round" pathLength="1" class="line"/>
  <g class="fade">
    <circle cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="7" fill="${C.purple}" opacity="0.25"/>
    <circle cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="3.5" fill="${C.purple}"/>
  </g>
  ${labels.join("")}
</svg>
`;
}

const data = await fetchWeeks();
await mkdir(OUT.split("/").slice(0, -1).join("/") || ".", { recursive: true });
await writeFile(OUT, render(data));
console.log(`wrote ${OUT}: ${data.total} contributions, ${data.weeks.length} weeks`);
