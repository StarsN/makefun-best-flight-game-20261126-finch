// Kestrel Ridge — hand-in program for the make.fun best flight game
// bounty. The game itself is the static site under game/ (open
// game/index.html in a desktop browser and fly). This program copies
// game/ and screenshots/ into the output directory and writes the
// dossier the judge reads, using the kit's own buildDossier so the
// bytes match what the gate rebuilds. Node 22, standard library only.

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { buildDossier } from "./vendor/makefun-game.ts";

const repoRoot = dirname(fileURLToPath(import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";

// The gate's caps, mirrored so a bad hand-in fails here with a plain
// message instead of at the scorer.
const CAPS = {
  gameFiles: 993,
  gameBytes: 50331648,
  shotFiles: 4,
  shotBytes: 262144,
  dossierBytes: 1572864,
};

function survey(root) {
  let files = 0, bytes = 0;
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      const st = statSync(p);
      if (st.isDirectory()) walk(p);
      else { files++; bytes += st.size; }
    }
  };
  walk(root);
  return { files, bytes };
}

function preflight() {
  const problems = [];
  const gameDir = join(repoRoot, "game");
  if (!existsSync(join(gameDir, "index.html"))) problems.push("game/index.html is missing");
  const game = survey(gameDir);
  if (game.files > CAPS.gameFiles) problems.push(`game/ holds ${game.files} files, over the ${CAPS.gameFiles} cap`);
  if (game.bytes > CAPS.gameBytes) problems.push(`game/ is ${game.bytes} bytes, over the ${CAPS.gameBytes} cap`);
  const shotsDir = join(repoRoot, "screenshots");
  const shots = existsSync(shotsDir) ? readdirSync(shotsDir).filter((n) => !n.startsWith(".")) : [];
  if (shots.length < 3 || shots.length > CAPS.shotFiles) problems.push(`screenshots/ holds ${shots.length} images, needs 3 or 4`);
  for (const name of shots) {
    const size = statSync(join(shotsDir, name)).size;
    if (size > CAPS.shotBytes) problems.push(`screenshots/${name} is ${size} bytes, over the ${CAPS.shotBytes} cap`);
  }
  if (problems.length) throw new Error(`preflight failed:\n - ${problems.join("\n - ")}`);
  return { game, shots };
}

const report = preflight();

mkdirSync(outputDir, { recursive: true });
cpSync(join(repoRoot, "game"), join(outputDir, "game"), { recursive: true });

const shotsOut = join(outputDir, "screenshots");
mkdirSync(shotsOut, { recursive: true });
const shotsIn = join(repoRoot, "screenshots");
if (existsSync(shotsIn)) {
  cpSync(shotsIn, shotsOut, { recursive: true });
}

const dossier = buildDossier(outputDir, {
  text_max_bytes: 163840,
  screenshots: { max: CAPS.shotFiles, max_bytes: CAPS.shotBytes },
  game_max_files: CAPS.gameFiles,
  game_max_bytes: CAPS.gameBytes,
  game_path_max_bytes: 1000,
});
if (dossier.length > CAPS.dossierBytes) {
  throw new Error(`dossier.json would be ${dossier.length} bytes, over the ${CAPS.dossierBytes} cap`);
}
writeFileSync(join(outputDir, "dossier.json"), dossier);

const rel = (p) => relative(repoRoot, p);
console.log(`Kestrel Ridge handed in at ${outputDir}`);
console.log(`  game/       ${report.game.files} files, ${report.game.bytes} bytes (from ${rel(join(repoRoot, "game"))})`);
console.log(`  screenshots ${report.shots.length} images: ${report.shots.join(", ")}`);
console.log(`  dossier     ${dossier.length} bytes`);
