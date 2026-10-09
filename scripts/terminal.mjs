// Renders assets/terminal.svg: an animated terminal window that types out a
// few commands. Static content, so it only needs re-running after edits.
import { mkdir, writeFile } from "node:fs/promises";

const OUT = process.env.OUT || "assets/terminal.svg";

const W = 700;
const BAR = 34;
const FIRST = BAR + 32;
const LINE = 25;
const CHAR = 8.5; // advance width of the 14px monospace font, rounded up
const CMD_X = 52;
const OUT_X = 24;

const C = {
  bg: "#1A1B27",
  bar: "#16161E",
  border: "#2F334D",
  text: "#C0CAF5",
  soft: "#A9B1D6",
  muted: "#787C99",
  faint: "#565F89",
  blue: "#7AA2F7",
  purple: "#BB9AF7",
  green: "#9ECE6A",
};

// Each output is a list of [text, color, bold?] segments.
const SESSION = [
  {
    cmd: "whoami",
    out: [["Ahmet Palavan", C.text, true], ["  ·  Software Engineer, web & mobile", C.soft]],
  },
  {
    cmd: "cat stack.txt",
    out: ["TypeScript", "Next.js", "React", "React Native", "Expo", "Node.js"].flatMap((t, i) => [
      ...(i ? [["  ·  ", C.faint]] : []),
      [t, i % 2 ? C.purple : C.blue],
    ]),
  },
  {
    cmd: "cat now.txt",
    out: [["Building ", C.soft], ["AI-powered products", C.purple, true], [": video generation, chatbots, SaaS", C.soft]],
  },
  {
    cmd: "echo $GOAL_2026",
    out: [["Ship more products end-to-end ", C.soft], ["→", C.blue], [" UI · API · DB · deploy", C.soft]],
  },
];

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function prompt(y) {
  return `<text x="${OUT_X}" y="${y}" class="mono" fill="${C.purple}">❯</text><text x="${OUT_X + 14}" y="${y}" class="mono" fill="${C.blue}">~</text>`;
}

function render() {
  const parts = [];
  let t = 0.6;
  let y = FIRST;

  SESSION.forEach(({ cmd, out }, i) => {
    const typing = cmd.length * 0.06;
    const steps = Array.from({ length: cmd.length + 1 }, (_, k) => (k * CHAR).toFixed(1)).join(";");
    const xs = Array.from({ length: cmd.length + 1 }, (_, k) => (CMD_X + k * CHAR).toFixed(1)).join(";");

    parts.push(`<clipPath id="type${i}"><rect x="${CMD_X}" y="${y - 16}" width="0" height="22">
      <animate attributeName="width" values="${steps};600" calcMode="discrete" begin="${t.toFixed(2)}s" dur="${(typing + 0.06).toFixed(2)}s" fill="freeze"/>
    </rect></clipPath>`);
    parts.push(`<g opacity="0"><set attributeName="opacity" to="1" begin="${(t - 0.3).toFixed(2)}s"/>${prompt(y)}</g>`);
    parts.push(`<text x="${CMD_X}" y="${y}" class="mono" fill="${C.text}" clip-path="url(#type${i})">${esc(cmd)}</text>`);
    // Block cursor that follows the typing, then disappears.
    parts.push(`<rect x="${CMD_X}" y="${y - 14}" width="8" height="17" fill="${C.purple}" opacity="0">
      <set attributeName="opacity" to="0.85" begin="${(t - 0.3).toFixed(2)}s"/>
      <animate attributeName="x" values="${xs}" calcMode="discrete" begin="${t.toFixed(2)}s" dur="${(typing + 0.06).toFixed(2)}s" fill="freeze"/>
      <set attributeName="opacity" to="0" begin="${(t + typing + 0.2).toFixed(2)}s"/>
    </rect>`);

    t += typing + 0.25;
    y += LINE;
    const spans = out
      .map(([s, color, bold]) => `<tspan fill="${color}"${bold ? ' font-weight="700"' : ""}>${esc(s)}</tspan>`)
      .join("");
    parts.push(`<text x="${OUT_X}" y="${y}" class="mono" opacity="0" xml:space="preserve">${spans}<animate attributeName="opacity" from="0" to="1" begin="${t.toFixed(2)}s" dur="0.35s" fill="freeze"/></text>`);

    t += 0.7;
    y += LINE + 6;
  });

  // Final idle prompt with a blinking cursor.
  parts.push(`<g opacity="0"><set attributeName="opacity" to="1" begin="${(t - 0.3).toFixed(2)}s"/>${prompt(y)}
    <rect x="${CMD_X}" y="${y - 14}" width="8" height="17" fill="${C.purple}">
      <animate attributeName="opacity" values="0.85;0" calcMode="discrete" dur="1s" begin="${t.toFixed(2)}s" repeatCount="indefinite"/>
    </rect></g>`);

  const H = y + 22;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Terminal: whoami — Ahmet Palavan, Software Engineer">
  <style>
    text { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Ubuntu, sans-serif; }
    .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace; font-size: 14px; }
    .bar { font-size: 12px; fill: ${C.muted}; }
  </style>
  <rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="10" fill="${C.bg}" stroke="${C.border}"/>
  <path d="M0.5,10.5 a10,10 0 0 1 10,-10 h${W - 21} a10,10 0 0 1 10,10 v${BAR - 10.5} h-${W - 1} z" fill="${C.bar}"/>
  <line x1="0.5" x2="${W - 0.5}" y1="${BAR}" y2="${BAR}" stroke="${C.border}"/>
  <circle cx="20" cy="17" r="6" fill="#F7768E"/><circle cx="40" cy="17" r="6" fill="#E0AF68"/><circle cx="60" cy="17" r="6" fill="${C.green}"/>
  <text x="${W / 2}" y="21" class="bar" text-anchor="middle">ahmet@github: ~</text>
  ${parts.join("\n  ")}
</svg>
`;
}

await mkdir(OUT.split("/").slice(0, -1).join("/") || ".", { recursive: true });
await writeFile(OUT, render());
console.log(`wrote ${OUT}`);
