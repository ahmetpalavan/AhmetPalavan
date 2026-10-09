// Renders assets/activity-{dark,light}.svg: contributions per month over the
// last 12 months, in light and dark variants. Needs GITHUB_TOKEN in the environment.
import { mkdir, writeFile } from "node:fs/promises";

const USER = process.env.GH_USER || "ahmetpalavan";
const OUT_DIR = process.env.OUT_DIR || "assets";

// GitHub Primer colors, so the cards sit naturally on either profile theme.
const THEMES = {
  dark: { border: "#30363D", muted: "#8B949E", accent: "#58A6FF", bar: "#1F6FEB", grid: "#21262D" },
  light: { border: "#D0D7DE", muted: "#656D76", accent: "#0969DA", bar: "#0969DA", grid: "#EAEEF2" },
};

const FONT = `-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif`;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

async function fetchStats() {
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
  const days = cal.weeks.flatMap((w) => w.contributionDays);

  const perMonth = new Map();
  for (const d of days) {
    const key = d.date.slice(0, 7);
    perMonth.set(key, (perMonth.get(key) || 0) + d.contributionCount);
  }
  const months = [...perMonth.entries()].slice(-12).map(([key, total]) => ({ key, total }));

  return { contributions: cal.totalContributions, months };
}

const fmt = (n) => n.toLocaleString("en-US");

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

const stats = await fetchStats();
await mkdir(OUT_DIR, { recursive: true });
for (const [name, theme] of Object.entries(THEMES)) {
  await writeFile(`${OUT_DIR}/activity-${name}.svg`, activity(stats, theme));
}
console.log(`wrote activity cards to ${OUT_DIR}/: ${stats.contributions} contributions, ${stats.months.length} months`);
