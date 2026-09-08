/** Read-only checks for the proposal, not tests of the implemented application. */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const directory = dirname(fileURLToPath(import.meta.url));
const root = resolve(directory, "../..");
const files = readdirSync(directory).filter((name) => name.endsWith(".md"));
const documents = new Map(files.map((name) => [name, readFileSync(resolve(directory, name), "utf8")]));
const failures = [];

for (const [name, text] of documents) {
  if (text.split("\n").filter((line) => line.startsWith("```")).length % 2) {
    failures.push(`${name}: unpaired code fence`);
  }
  for (const match of text.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    const href = match[1];
    if (/^(https?:|#)/.test(href)) continue;
    if (!existsSync(resolve(directory, href.split("#")[0]))) {
      failures.push(`${name}: broken local link ${href}`);
    }
  }
}

const implementation = documents.get("05-implementation.md");
const validation = documents.get("06-validation.md");
const audit = documents.get("01-audit.md");
const visual = documents.get("03-design-motion-map.md");
const tasks = [...implementation.matchAll(/^### (PIP-\d+) —/gm)].map((match) => match[1]);
const scenarios = [...validation.matchAll(/^### (V\d+) —/gm)].map((match) => match[1]);
const findings = [...audit.matchAll(/^\| (F\d+) \|/gm)].map((match) => match[1]);

for (const [name, text] of documents) {
  for (const match of text.matchAll(/\b(PIP-\d+|V\d{2}|F\d{2})\b/g)) {
    const id = match[1];
    const defined = id.startsWith("PIP-") ? tasks : id.startsWith("V") ? scenarios : findings;
    if (!defined.includes(id)) failures.push(`${name}: undefined reference ${id}`);
  }
}

const taskBodies = implementation.split(/^### (?=PIP-\d+ —)/m).slice(1);
const deferredTasks = taskBodies.filter((body) => body.split("\n")[0].includes("Deferred"))
  .map((body) => body.match(/^(PIP-\d+)/)[1]);
const coreTasks = tasks.filter((task) => task !== "PIP-16" && !deferredTasks.includes(task));
const dependencies = new Map();
for (const body of taskBodies) {
  const id = body.match(/^(PIP-\d+)/)?.[1];
  const dependencyText = body.match(/\*\*Depends:\*\*([^\n]+)/)?.[1] ?? "";
  const dependenciesForTask = [...dependencyText.matchAll(/PIP-\d+/g)].map((match) => match[0]);
  if (id === "PIP-16") dependenciesForTask.push(...coreTasks);
  if (coreTasks.includes(id) && dependenciesForTask.some((task) => deferredTasks.includes(task))) {
    failures.push(`${id}: core task depends on deferred work`);
  }
  dependencies.set(id, [...new Set(dependenciesForTask)]);
}

const visiting = new Set();
const visited = new Set();
function visit(id) {
  if (visiting.has(id)) {
    failures.push(`Task dependency cycle at ${id}`);
    return;
  }
  if (visited.has(id)) return;
  visiting.add(id);
  for (const dependency of dependencies.get(id) ?? []) {
    if (!tasks.includes(dependency)) failures.push(`${id}: missing dependency ${dependency}`);
    else visit(dependency);
  }
  visiting.delete(id);
  visited.add(id);
}
tasks.forEach(visit);

const tokens = Object.fromEntries(
  [...visual.matchAll(/\| `(--[a-z-]+)` \| `(#[a-f0-9]{6})` \| `(#[a-f0-9]{6})`/g)]
    .map((match) => [match[1], [match[2], match[3]]]),
);
function luminance(hex) {
  return [0.2126, 0.7152, 0.0722].reduce((sum, weight, index) => {
    const value = parseInt(hex.slice(1 + index * 2, 3 + index * 2), 16) / 255;
    const linear = value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    return sum + weight * linear;
  }, 0);
}
function contrast(a, b) {
  const first = luminance(a);
  const second = luminance(b);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}
const pairs = [
  ["--ink", "--canvas", 4.5],
  ...["body", "muted"].map((role) => [`--${role}`, "--canvas", 4.5]),
  ["--focus", "--canvas", 3],
  ...["ink", "body", "muted"].map((role) => [`--${role}`, "--canvas-far", 4.5]),
  ["--focus", "--canvas-far", 3],
  ["--body", "--raised", 4.5],
  ["--muted", "--raised", 4.5],
  ["--placeholder", "--raised", 4.5],
  ["--on-action", "--action-bg", 4.5],
  ["--on-action", "--action-hover", 4.5],
  ["--on-action", "--action-pressed", 4.5],
  ["--selection-ink", "--selection-bg", 4.5],
  ["--on-secondary", "--secondary", 4.5],
  ["--focus", "--raised", 3],
  ["--control-border", "--raised", 3],
  ...["success", "warning", "danger", "info", "visit"].map((role) => [`--${role}-ink`, `--${role}-bg`, 4.5]),
  ["--pin-ink", "--pin-bg", 4.5],
  ["--pin-selected-ink", "--pin-selected-bg", 4.5],
  ["--map-label", "--map-halo", 4.5],
  ["--map-label-secondary", "--map-halo", 4.5],
  ["--map-water-label", "--map-halo", 4.5],
];
const colorChecks = [];
for (const [foreground, background, minimum] of pairs) {
  for (const [index, theme] of ["day", "night"].entries()) {
    if (!tokens[foreground] || !tokens[background]) {
      failures.push(`Missing token in ${foreground}/${background}`);
      continue;
    }
    const ratio = contrast(tokens[foreground][index], tokens[background][index]);
    colorChecks.push({ foreground, background, theme, ratio, minimum });
    if (ratio < minimum) failures.push(`${theme} ${foreground}/${background}: ${ratio} < ${minimum}`);
  }
}

const stylePath = resolve(root, "_local/.firecrawl/positron.md");
let mapCoverage = { checked: false, reason: "Optional local public-style cache is absent" };
if (existsSync(stylePath)) {
  const raw = readFileSync(stylePath, "utf8");
  const style = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1));
  const manifestText = visual.split("## 7. Complete basemap theming contract")[1]?.split("## 8.")[0] ?? "";
  const named = new Set([...manifestText.matchAll(/`([^`]+)`/g)].map((match) => match[1]));
  const unmapped = style.layers.filter((layer) => !named.has(layer.id)).map((layer) => layer.id);
  failures.push(...unmapped.map((id) => `Unmapped baseline map layer: ${id}`));
  mapCoverage = { checked: true, layers: style.layers.length, unmapped };
}

console.log(JSON.stringify({
  documents: files.length,
  findings: findings.length,
  tasks: tasks.length,
  coreChangeTasks: coreTasks.length,
  deferredTasks,
  validationScenarios: scenarios.length,
  colorPairsChecked: colorChecks.length,
  minimumPassingTextContrast: Math.min(...colorChecks.filter((check) => check.minimum === 4.5).map((check) => check.ratio)),
  mapCoverage,
  failures,
  limitation: "Checks document consistency and selected solid color pairs; does not verify rendered UI, real animation performance, or application behavior.",
}, null, 2));
process.exitCode = failures.length ? 1 : 0;
