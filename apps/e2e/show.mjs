// show.mjs — read back an ensemble transcript.
//
//   bun show.mjs              # newest run, summary
//   bun show.mjs --full       # newest run, full response text
//   bun show.mjs runs/x.json  # a specific run
//
// Runs under Bun: it only reads files. Node in this package is confined to the
// scripts that drive Chrome over CDP, which is the one thing Bun cannot do.
//
// Separate from ensemble.mjs on purpose: a run costs minutes of real chat UI
// time, so inspecting one again should never risk re-triggering it.

import { readdir, readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const RUNS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'runs');

const argv = process.argv.slice(2);
const full = argv.includes('--full');
const explicit = argv.find((a) => a.endsWith('.json'));

const file = explicit ?? await (async () => {
    const files = (await readdir(RUNS_DIR).catch(() => [])).filter((f) => f.endsWith('.json')).sort();
    if (!files.length) {
        console.error(`no transcripts in ${RUNS_DIR} — run: node ensemble.mjs "your question"`);
        process.exit(1);
    }
    return path.join(RUNS_DIR, files.at(-1));
})();

const t = JSON.parse(await readFile(file, 'utf8'));
const oneLine = (s) => (s ?? '').replace(/\s+/g, ' ').trim();

console.log(`run      : ${path.relative(process.cwd(), file)}`);
console.log(`question : ${oneLine(t.question)}`);
console.log(`models   : ${t.models.join(', ')}`);

for (const r of t.rounds) {
    console.log(`\n${'─'.repeat(70)}\n${r.kind.toUpperCase()}  round ${r.iteration}\n${'─'.repeat(70)}`);
    for (const res of r.responses) {
        const head = `${res.ok ? '✓' : '✘'} ${res.model.padEnd(8)} ${String(res.ms ?? 0).padStart(7)}ms`;
        if (res.error) { console.log(`${head}  !! ${res.error}`); continue; }
        if (full) console.log(`${head}\n${(res.text ?? '').replace(/^/gm, '    ')}`);
        else console.log(`${head}  ${oneLine(res.text).slice(0, 100)}`);
    }
}

if (t.final) {
    console.log(`\n${'═'.repeat(70)}\nFINAL\n${'═'.repeat(70)}`);
    for (const [model, text] of Object.entries(t.final)) {
        console.log(`\n${model}:\n${(full ? text : oneLine(text).slice(0, 300)).replace(/^/gm, '    ')}`);
    }
}
