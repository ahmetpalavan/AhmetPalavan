// Renders the README stat cards in light and dark variants:
//   assets/overview-{dark,light}.svg  followers, stars, repos, activity
//   assets/activity-{dark,light}.svg  contributions per month, last 12 months
// Needs GITHUB_TOKEN in the environment.
import { mkdir, writeFile } from "node:fs/promises";

const USER = process.env.GH_USER || "ahmetpalavan";
const OUT_DIR = process.env.OUT_DIR || "assets";

// GitHub Primer colors, so the cards sit naturally on either profile theme.
const THEMES = {
  dark: { border: "#30363D", text: "#E6EDF3", muted: "#8B949E", accent: "#58A6FF", bar: "#1F6FEB", grid: "#21262D" },
  light: { border: "#D0D7DE", text: "#1F2328", muted: "#656D76", accent: "#0969DA", bar: "#0969DA", grid: "#EAEEF2" },
};

const FONT = `-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif`;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Octicons (MIT, github.com/primer/octicons), 16px grid.
const ICONS = {
  people: "M2 5.5a3.5 3.5 0 1 1 5.898 2.549 5.508 5.508 0 0 1 3.034 4.084.75.75 0 1 1-1.482.235 4 4 0 0 0-7.9 0 .75.75 0 0 1-1.482-.236A5.507 5.507 0 0 1 3.102 8.05 3.493 3.493 0 0 1 2 5.5ZM11 4a3.001 3.001 0 0 1 2.22 5.018 5.01 5.01 0 0 1 2.56 3.012.749.749 0 0 1-.885.954.752.752 0 0 1-.549-.514 3.507 3.507 0 0 0-2.522-2.372.75.75 0 0 1-.574-.73v-.352a.75.75 0 0 1 .416-.672A1.5 1.5 0 0 0 11 5.5.75.75 0 0 1 11 4Zm-5.5-.5a2 2 0 1 0-.001 3.999A2 2 0 0 0 5.5 3.5Z",
  star: "M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.751.751 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25Zm0 2.445L6.615 5.5a.75.75 0 0 1-.564.41l-3.097.45 2.24 2.184a.75.75 0 0 1 .216.664l-.528 3.084 2.769-1.456a.75.75 0 0 1 .698 0l2.77 1.456-.53-3.084a.75.75 0 0 1 .216-.664l2.24-2.183-3.096-.45a.75.75 0 0 1-.564-.41L8 2.694Z",
  repo: "M2 2.5A2.5 2.5 0 0 1 4.5 0h8.75a.75.75 0 0 1 .75.75v12.5a.75.75 0 0 1-.75.75h-2.5a.75.75 0 0 1 0-1.5h1.75v-2h-8a1 1 0 0 0-.714 1.7.75.75 0 1 1-1.072 1.05A2.495 2.495 0 0 1 2 11.5Zm10.5-1h-8a1 1 0 0 0-1 1v6.708A2.486 2.486 0 0 1 4.5 9h8ZM5 12.25a.25.25 0 0 1 .25-.25h3.5a.25.25 0 0 1 .25.25v3.25a.25.25 0 0 1-.4.2l-1.45-1.087a.249.249 0 0 0-.3 0L5.4 15.7a.25.25 0 0 1-.4-.2Z",
  graph: "M1.5 1.75V13.5h13.75a.75.75 0 0 1 0 1.5H.75a.75.75 0 0 1-.75-.75V1.75a.75.75 0 0 1 1.5 0Zm14.28 2.53-5.25 5.25a.75.75 0 0 1-1.06 0L7 7.06 4.28 9.78a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042l3.25-3.25a.75.75 0 0 1 1.06 0L10 7.94l4.72-4.72a.751.751 0 0 1 1.042.018.751.751 0 0 1 .018 1.042Z",
  calendar: "M4.75 0a.75.75 0 0 1 .75.75V2h5V.75a.75.75 0 0 1 1.5 0V2h1.25c.966 0 1.75.784 1.75 1.75v10.5A1.75 1.75 0 0 1 13.25 16H2.75A1.75 1.75 0 0 1 1 14.25V3.75C1 2.784 1.784 2 2.75 2H4V.75A.75.75 0 0 1 4.75 0ZM2.5 7.5v6.75c0 .138.112.25.25.25h10.5a.25.25 0 0 0 .25-.25V7.5Zm10.75-4H2.75a.25.25 0 0 0-.25.25V6h11V3.75a.25.25 0 0 0-.25-.25Z",
  flame: "M9.533.753V.752c.217 2.385 1.463 3.626 2.653 4.81C13.37 6.74 14.498 7.863 14.498 10c0 3.5-3 6-6.5 6S1.5 13.512 1.5 10c0-1.298.536-2.56 1.425-3.286.376-.308.862 0 1.035.454C4.46 8.487 5.581 8.419 6 8c.282-.282.341-.811-.003-1.5C4.34 3.187 7.035.75 8.77.146c.39-.137.726.194.763.607ZM7.998 14.5c2.832 0 5-1.98 5-4.5 0-1.463-.68-2.19-1.879-3.383l-.036-.037c-1.013-1.008-2.3-2.29-2.834-4.434-.322.256-.63.579-.864.953-.432.696-.621 1.58-.046 2.73.473.947.67 2.284-.278 3.232-.61.61-1.545.84-2.403.633a2.79 2.79 0 0 1-1.436-.874A3.198 3.198 0 0 0 3 10c0 2.53 2.164 4.5 4.998 4.5Z",
};

async function fetchStats() {
  const query = `query($login: String!) {
    user(login: $login) {
      followers { totalCount }
      repositories(ownerAffiliations: OWNER, privacy: PUBLIC, first: 100) {
        totalCount
        nodes { stargazerCount }
      }
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
  const user = json.data.user;
  const cal = user.contributionsCollection.contributionCalendar;
  const days = cal.weeks.flatMap((w) => w.contributionDays);

  const perMonth = new Map();
  for (const d of days) {
    const key = d.date.slice(0, 7);
    perMonth.set(key, (perMonth.get(key) || 0) + d.contributionCount);
  }
  const months = [...perMonth.entries()].slice(-12).map(([key, total]) => ({ key, total }));

  return {
    followers: user.followers.totalCount,
    stars: user.repositories.nodes.reduce((s, r) => s + r.stargazerCount, 0),
    repos: user.repositories.totalCount,
    contributions: cal.totalContributions,
    activeDays: days.filter((d) => d.contributionCount > 0).length,
    bestDay: Math.max(...days.map((d) => d.contributionCount)),
    months,
  };
}

const fmt = (n) => n.toLocaleString("en-US");

function overview(s, t) {
  const W = 840;
  const H = 150;
  const items = [
    ["people", s.followers, "Followers"],
    ["star", s.stars, "Stargazers"],
    ["repo", s.repos, "Repositories"],
    ["graph", s.contributions, "Contributions (1y)"],
    ["calendar", s.activeDays, "Active days"],
    ["flame", s.bestDay, "Best day"],
  ];
  const colW = (W - 56) / items.length;
  const cols = items
    .map(([icon, value, label], i) => {
      const cx = 28 + colW * (i + 0.5);
      return `<g>
    <path d="${ICONS[icon]}" fill="${t.accent}" transform="translate(${(cx - 9).toFixed(1)} 72) scale(1.125)"/>
    <text x="${cx.toFixed(1)}" y="118" class="num" text-anchor="middle">${fmt(value)}</text>
    <text x="${cx.toFixed(1)}" y="137" class="label" text-anchor="middle">${label}</text>
  </g>`;
    })
    .join("\n  ");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Overview: ${items.map(([, v, l]) => `${fmt(v)} ${l.toLowerCase()}`).join(", ")}">
  <style>
    text { font-family: ${FONT}; }
    .title { font-size: 17px; font-weight: 600; fill: ${t.accent}; }
    .num { font-size: 24px; font-weight: 700; fill: ${t.text}; }
    .label { font-size: 12px; fill: ${t.muted}; }
  </style>
  <rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="8" fill="none" stroke="${t.border}"/>
  <text x="28" y="36" class="title">Overview</text>
  <line x1="28" x2="${W - 28}" y1="52" y2="52" stroke="${t.border}"/>
  ${cols}
</svg>
`;
}

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
  await writeFile(`${OUT_DIR}/overview-${name}.svg`, overview(stats, theme));
  await writeFile(`${OUT_DIR}/activity-${name}.svg`, activity(stats, theme));
}
console.log(`wrote overview and activity cards to ${OUT_DIR}/: ${stats.contributions} contributions, ${stats.months.length} months`);
