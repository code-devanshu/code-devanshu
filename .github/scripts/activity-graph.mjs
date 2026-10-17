// Renders a themed, animated contribution activity graph (dark + light) into ./dist
// Uses the GitHub GraphQL API with the workflow's GITHUB_TOKEN. No dependencies.
import { mkdirSync, writeFileSync } from "node:fs";

const USER = process.env.GH_USER;
const TOKEN = process.env.GITHUB_TOKEN;
const DAYS = 60;

const query = `query($login:String!){ user(login:$login){ contributionsCollection{ contributionCalendar{ weeks{ contributionDays{ date contributionCount } } } } } }`;
const res = await fetch("https://api.github.com/graphql", {
  method: "POST",
  headers: { Authorization: `bearer ${TOKEN}`, "Content-Type": "application/json", "User-Agent": "activity-graph" },
  body: JSON.stringify({ query, variables: { login: USER } }),
});
const json = await res.json();
if (!json.data) throw new Error(JSON.stringify(json));
const days = json.data.user.contributionsCollection.contributionCalendar.weeks
  .flatMap((w) => w.contributionDays)
  .slice(-DAYS);

const THEMES = {
  dark:  { bg: "#0b0f19", card: "#111827", stroke: "#1f2937", text: "#f8fafc", muted: "#94a3b8", grid: "#1f2937", g1: "#a78bfa", g2: "#22d3ee", g3: "#f472b6" },
  light: { bg: "#f8fafc", card: "#ffffff", stroke: "#e2e8f0", text: "#0f172a", muted: "#64748b", grid: "#e2e8f0", g1: "#7c3aed", g2: "#0891b2", g3: "#db2777" },
};

const W = 1200, H = 360, PL = 64, PR = 32, PT = 96, PB = 56;
const iw = W - PL - PR, ih = H - PT - PB;
const max = Math.max(4, ...days.map((d) => d.contributionCount));
const niceMax = Math.ceil(max / 4) * 4;
const x = (i) => PL + (i * iw) / (days.length - 1);
const y = (v) => PT + ih - (v / niceMax) * ih;
const total = days.reduce((s, d) => s + d.contributionCount, 0);
const best = days.reduce((a, d) => (d.contributionCount > a.contributionCount ? d : a), days[0]);
const active = days.filter((d) => d.contributionCount > 0).length;

// smooth path (monotone-ish cubic)
const pts = days.map((d, i) => [x(i), y(d.contributionCount)]);
let line = `M${pts[0][0]},${pts[0][1]}`;
for (let i = 1; i < pts.length; i++) {
  const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], cx = (x0 + x1) / 2;
  line += ` C${cx},${y0} ${cx},${y1} ${x1},${y1}`;
}
const area = `${line} L${x(days.length - 1)},${PT + ih} L${PL},${PT + ih} Z`;
const fmt = (s) => new Date(s + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

function svg(t) {
  const c = THEMES[t];
  const grid = [0, 0.25, 0.5, 0.75, 1].map((f) => {
    const v = Math.round(niceMax * f), yy = y(v);
    return `<line x1="${PL}" x2="${W - PR}" y1="${yy}" y2="${yy}" stroke="${c.grid}" stroke-dasharray="4 6"/><text x="${PL - 12}" y="${yy + 4}" text-anchor="end" font-size="12" fill="${c.muted}">${v}</text>`;
  }).join("");
  const labels = days.map((d, i) => (i % 10 === 0 || i === days.length - 1)
    ? `<text x="${x(i)}" y="${H - 24}" text-anchor="middle" font-size="12" fill="${c.muted}">${fmt(d.date)}</text>` : "").join("");
  const dots = days.map((d, i) => d.contributionCount > 0
    ? `<circle class="dot" style="animation-delay:${(1.6 + i * 0.015).toFixed(2)}s" cx="${x(i)}" cy="${y(d.contributionCount)}" r="3.5" fill="${c.card}" stroke="url(#lg)" stroke-width="2"><title>${fmt(d.date)}: ${d.contributionCount} contributions</title></circle>` : "").join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${USER} contribution activity: ${total} contributions in the last ${DAYS} days">
<defs>
  <linearGradient id="lg" x1="0" x2="1"><stop offset="0" stop-color="${c.g1}"/><stop offset=".5" stop-color="${c.g2}"/><stop offset="1" stop-color="${c.g3}"/></linearGradient>
  <linearGradient id="ag" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c.g2}" stop-opacity=".35"/><stop offset="1" stop-color="${c.g2}" stop-opacity="0"/></linearGradient>
  <clipPath id="reveal"><rect x="0" y="0" width="0" height="${H}"><animate attributeName="width" from="0" to="${W}" dur="1.8s" fill="freeze" calcMode="spline" keySplines=".4 0 .2 1" keyTimes="0;1"/></rect></clipPath>
</defs>
<style>
  text{font-family:'Segoe UI',-apple-system,BlinkMacSystemFont,Inter,Roboto,Helvetica,Arial,sans-serif}
  .dot{opacity:0;animation:pop .4s ease-out forwards}
  @keyframes pop{from{opacity:0}to{opacity:1}}
  @media (prefers-reduced-motion:reduce){.dot{animation:none;opacity:1}}
</style>
<rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="16" fill="${c.card}" stroke="${c.stroke}"/>
<text x="${PL}" y="44" font-size="20" font-weight="700" fill="${c.text}">Contribution activity</text>
<text x="${PL}" y="68" font-size="13" fill="${c.muted}">Last ${DAYS} days · updated ${fmt(new Date().toISOString().slice(0, 10))}</text>
<g text-anchor="end">
  <text x="${W - PR}" y="44" font-size="20" font-weight="800" fill="url(#lg)">${total}</text>
  <text x="${W - PR}" y="68" font-size="12" fill="${c.muted}">contributions</text>
  <text x="${W - PR - 150}" y="44" font-size="20" font-weight="800" fill="${c.text}">${active}</text>
  <text x="${W - PR - 150}" y="68" font-size="12" fill="${c.muted}">active days</text>
  <text x="${W - PR - 290}" y="44" font-size="20" font-weight="800" fill="${c.text}">${best.contributionCount}</text>
  <text x="${W - PR - 290}" y="68" font-size="12" fill="${c.muted}">best day (${fmt(best.date)})</text>
</g>
${grid}${labels}
<g clip-path="url(#reveal)">
  <path d="${area}" fill="url(#ag)"/>
  <path d="${line}" fill="none" stroke="url(#lg)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
</g>
${dots}
</svg>`;
}

mkdirSync("dist", { recursive: true });
for (const t of Object.keys(THEMES)) writeFileSync(`dist/activity-${t}.svg`, svg(t));
console.log(`activity graph: ${total} contributions, best ${best.contributionCount} on ${best.date}`);
