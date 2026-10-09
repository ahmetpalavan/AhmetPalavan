// Renders assets/contributions.svg (last-12-months chart) and assets/city.svg
// (isometric 3D contribution calendar), styled to match the README banner.
// Needs GITHUB_TOKEN in the environment.
import { mkdir, writeFile } from "node:fs/promises";

const USER = process.env.GH_USER || "ahmetpalavan";
const OUT_DIR = process.env.OUT_DIR || "assets";

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
  const days = cal.weeks.flatMap((w, c) =>
    w.contributionDays.map((d) => ({ c, r: new Date(d.date + "T00:00:00Z").getUTCDay(), count: d.contributionCount })),
  );
  const activeDays = days.filter((d) => d.count > 0).length;
  return { total: cal.totalContributions, weeks, days, activeDays };
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

// --- 3D city ---------------------------------------------------------------

const CITY_W = 700;
const WEEK = [11.4, 3.4]; // screen offset of one week step
const DAY = [-7.2, 4.6]; // screen offset of one weekday step
const MAX_TOWER = 70;
const GAP = 0.12;

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const toHex = (rgb) => "#" + rgb.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
const mix = (a, b, t) => toHex(hex(a).map((v, i) => v + (hex(b)[i] - v) * t));
const shade = (h, f) => toHex(hex(h).map((v) => v * f));

function towerColor(t) {
  return t < 0.5 ? mix("#2B3A6E", C.blue, t * 2) : mix(C.blue, C.purple, (t - 0.5) * 2);
}

function renderCity({ total, days }) {
  const best = Math.max(1, ...days.map((d) => d.count));
  const cols = Math.max(...days.map((d) => d.c)) + 1;
  const height = (count) => (count === 0 ? 2 : 4 + Math.sqrt(count / best) * (MAX_TOWER - 4));
  const x0 = (CITY_W - (cols * WEEK[0] - 7 * DAY[0])) / 2 - 7 * DAY[0];
  // Lift the board just enough that the tallest tower clears the top edge.
  const y0 = 22 + Math.max(...days.map((d) => height(d.count) - d.c * WEEK[1] - d.r * DAY[1]));
  const CITY_H = Math.round(y0 + cols * WEEK[1] + 7 * DAY[1] + 16);

  const pt = ([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`;
  const columns = [];
  for (let c = 0; c < cols; c++) {
    const cells = days.filter((d) => d.c === c).sort((a, b) => a.r - b.r);
    const shapes = cells.map(({ r, count }) => {
      const base = [x0 + (c + GAP / 2) * WEEK[0] + (r + GAP / 2) * DAY[0], y0 + (c + GAP / 2) * WEEK[1] + (r + GAP / 2) * DAY[1]];
      const a = [WEEK[0] * (1 - GAP), WEEK[1] * (1 - GAP)];
      const b = [DAY[0] * (1 - GAP), DAY[1] * (1 - GAP)];
      const h = height(count);
      const top = count === 0 ? "#24283B" : towerColor((count / best) ** 0.7);
      const T0 = [base[0], base[1] - h];
      const T1 = [T0[0] + a[0], T0[1] + a[1]];
      const T3 = [T0[0] + b[0], T0[1] + b[1]];
      const T2 = [T1[0] + b[0], T1[1] + b[1]];
      const down = ([x, y]) => [x, y + h];
      return (
        `<polygon points="${pt(T3)} ${pt(T2)} ${pt(down(T2))} ${pt(down(T3))}" fill="${shade(top, 0.72)}"/>` +
        `<polygon points="${pt(T1)} ${pt(T2)} ${pt(down(T2))} ${pt(down(T1))}" fill="${shade(top, 0.52)}"/>` +
        `<polygon points="${pt(T0)} ${pt(T1)} ${pt(T2)} ${pt(T3)}" fill="${top}"/>`
      );
    });
    const begin = (0.2 + c * 0.025).toFixed(3);
    columns.push(
      `<g opacity="0"><animate attributeName="opacity" from="0" to="1" begin="${begin}s" dur="0.5s" fill="freeze"/>` +
        `<animateTransform attributeName="transform" type="translate" from="0 14" to="0 0" begin="${begin}s" dur="0.5s" fill="freeze"/>` +
        shapes.join("") +
        `</g>`,
    );
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CITY_W}" height="${CITY_H}" viewBox="0 0 ${CITY_W} ${CITY_H}" role="img" aria-label="3D contribution calendar: ${total} contributions in the last year">
  <style>
    text { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Ubuntu, sans-serif; }
    .num { font-size: 24px; font-weight: 700; fill: url(#text); }
    .sub { font-size: 12px; fill: ${C.muted}; }
    .title { font-size: 15px; font-weight: 600; fill: ${C.title}; }
  </style>
  <defs>
    <linearGradient id="text" x1="0" x2="1"><stop offset="0" stop-color="${C.blue}"/><stop offset="1" stop-color="${C.purple}"/></linearGradient>
  </defs>
  <rect x="0.5" y="0.5" width="${CITY_W - 1}" height="${CITY_H - 1}" rx="10" fill="${C.bg}"/>
  ${columns.join("\n  ")}
  <text x="${CITY_W - 28}" y="38" class="title" text-anchor="end">Contribution city</text>
  <text x="${CITY_W - 28}" y="56" class="sub" text-anchor="end">one tower per day · last 12 months</text>
  <text x="28" y="${CITY_H - 42}" class="num">${total.toLocaleString("en-US")}</text>
  <text x="28" y="${CITY_H - 22}" class="sub">contributions in the last year · best day ${best}</text>
</svg>
`;
}

const data = await fetchWeeks();
await mkdir(OUT_DIR, { recursive: true });
await writeFile(`${OUT_DIR}/contributions.svg`, render(data));
await writeFile(`${OUT_DIR}/city.svg`, renderCity(data));
console.log(`wrote ${OUT_DIR}/contributions.svg and ${OUT_DIR}/city.svg: ${data.total} contributions, ${data.weeks.length} weeks`);
