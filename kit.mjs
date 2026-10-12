#!/usr/bin/env node
// token-efficiency-kit: setup (checkbox wizard), inspect, rtk, audit, fix, verify, budget, measure, log, uninstall. No dependencies; network only in the optional rtk and models commands.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import readline from 'node:readline/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { inspect } from './inspect.mjs';
import { rtkSetup } from './rtk.mjs';
import * as wiz from './wizard.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const HOME = process.env.KIT_HOME || os.homedir();
const CLOUD = ['caveman-setup', 'caveman-discover', 'caveman-evidence-review', 'caveman-manage', 'caveman-optimize', 'caveman-learn'];
const RTK_AUDITED = '0.49.0';
const TEST_PROMPT = 'Reply with exactly one word: ok';

const args = process.argv.slice(2);
const cmd = args[0];
const flag = (f) => args.includes(f);
const opt = (f, d) => { const i = args.indexOf(f); return i > -1 ? args[i + 1] : d; };
const dry = flag('--dry-run');
const log = console.log;
const read = (p) => fs.readFileSync(p, 'utf8');
const rd = (f) => read(path.join(ROOT, f));
const sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const tok = (s) => Math.ceil(Buffer.byteLength(s) / 4);
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };

function write(file, text) {
  if (dry) return log(`[dry-run] write ${file}`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (fs.existsSync(file) && !fs.existsSync(file + '.pre-token-kit') && !readLog().some((e) => e.file === file)) fs.copyFileSync(file, file + '.pre-token-kit');
  fs.writeFileSync(file, text);
  record('write', file);
  log(`wrote ${file}`);
}
// append-only audit trail of every change this kit makes; read it with `node kit.mjs log`, undo with `uninstall`
const LOG = () => path.join(HOME, '.token-kit', 'log.jsonl');
function record(action, file) {
  if (dry) return;
  fs.mkdirSync(path.dirname(LOG()), { recursive: true });
  fs.appendFileSync(LOG(), JSON.stringify({ ts: new Date().toISOString().slice(0, 19), action, file }) + '\n');
}
const readLog = () => (fs.existsSync(LOG()) ? read(LOG()).split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
function put(file, text) {
  if (fs.existsSync(file) && read(file) === text) return log(`unchanged ${file}`);
  write(file, text);
}
function upsert(file, body, tag = 'token-kit') {
  const START = `<!-- ${tag}:start -->`, END = `<!-- ${tag}:end -->`;
  const block = `${START}\n${body.trim()}\n${END}`;
  const cur = fs.existsSync(file) ? read(file) : '';
  const re = new RegExp(`${START}[\\s\\S]*?${END}`);
  const next = re.test(cur) ? cur.replace(re, () => block) : (cur ? cur.replace(/\s*$/, '\n\n') : '') + block + '\n';
  if (next === cur) return log(`unchanged ${file}`);
  write(file, next);
}
function run(bin, a) {
  try { return execFileSync(bin, a, { encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'pipe'] }).trim(); } catch { return null; }
}
function has(bin) {
  try { execFileSync(bin, ['--version'], { stdio: 'ignore', timeout: 5000 }); return true; } catch (e) { return e.code !== 'ENOENT'; }
}
const ver = (s) => (s || '0.0.0').split('.').map(Number);
const older = (a, b) => { const x = ver(a), y = ver(b); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] < y[i]; return false; };

function ponytailPlugin() {
  try { return Object.entries(JSON.parse(read(path.join(HOME, '.claude', 'settings.json'))).enabledPlugins || {}).some(([k, v]) => v && k.startsWith('ponytail@')); } catch { return false; }
}
function applySettings(file) {
  let s = {};
  if (fs.existsSync(file)) { try { s = JSON.parse(read(file)); } catch { return log(`skip settings: ${file} is not plain JSON`); } }
  s.env ||= {};
  if (s.env.ANTHROPIC_BASE_URL) return log(`skip settings: ANTHROPIC_BASE_URL is set (${s.env.ANTHROPIC_BASE_URL}); model aliases may not resolve on that gateway`);
  if (!s.model) s.model = 'sonnet';
  s.env.CLAUDE_CODE_SUBAGENT_MODEL ||= 'haiku';
  write(file, JSON.stringify(s, null, 2) + '\n');
}

function audit() {
  const rows = [];
  const add = (s, item, note) => rows.push([s, item, note]);
  const sf = path.join(HOME, '.claude', 'settings.json');
  let s = {};
  if (fs.existsSync(sf)) { try { s = JSON.parse(read(sf)); } catch { add('WARN', 'settings.json', 'not valid JSON'); } }
  const env = s.env || {};
  if (env.ANTHROPIC_BASE_URL) add('WARN', 'gateway', `ANTHROPIC_BASE_URL=${env.ANTHROPIC_BASE_URL}: traffic leaves the vendor API; confirm this is intended`);
  if (env.ANTHROPIC_AUTH_TOKEN || env.ANTHROPIC_API_KEY) add('WARN', 'secret', 'API key stored in plaintext settings.json; move it to a secret store');
  const sk = path.join(HOME, '.claude', 'skills');
  const dirs = fs.existsSync(sk) ? fs.readdirSync(sk) : [];
  const cloud = dirs.filter((d) => CLOUD.includes(d));
  if (cloud.length) add('WARN', 'cloud skills', `${cloud.join(', ')} send data to Caveman Cloud; run: node kit.mjs fix`);
  if (dirs.length > 60) add('WARN', 'skill count', `${dirs.length} skills; every description loads each session`);
  const plugins = Object.entries(s.enabledPlugins || {}).filter(([, v]) => v).map(([k]) => k);
  if (plugins.length) add('INFO', 'plugins', `${plugins.length} enabled: ${plugins.join(', ')}`);
  if (plugins.some((p) => p.startsWith('ponytail@'))) add('INFO', 'ponytail plugin', 'hooks run Node each session (no network found in v5.1.0); pin the tag or use the vendored skill');
  const cm = path.join(HOME, '.claude', 'CLAUDE.md');
  if (fs.existsSync(cm) && fs.statSync(cm).size > 8000) add('WARN', 'CLAUDE.md', `${fs.statSync(cm).size} bytes, loaded every session; trim it`);
  const pt = path.join(sk, 'ponytail', 'SKILL.md');
  if (fs.existsSync(pt) && read(pt) !== rd('skills/ponytail/SKILL.md')) add('INFO', 'ponytail skill', 'differs from the vendored copy; review the diff before overwriting');
  if (has('rtk')) {
    const v = (run('rtk', ['--version']) || '').match(/\d+\.\d+\.\d+/)?.[0];
    add(older(v, RTK_AUDITED) ? 'WARN' : 'OK', 'rtk', `version ${v}; source audited at ${RTK_AUDITED}`);
    add(/enabled:\s*yes/i.test(run('rtk', ['telemetry', 'status']) || '') ? 'WARN' : 'OK', 'rtk telemetry', 'status from `rtk telemetry status`; disable with: rtk telemetry disable');
    if (process.env.RTK_TELEMETRY_DISABLED !== '1') add('INFO', 'rtk env', 'set RTK_TELEMETRY_DISABLED=1 to block telemetry regardless of consent');
    add('INFO', 'rtk hook', 'auto-approves rewritten commands; add exclude_commands for cat and git diff where exact output matters');
  }
  if (has('caveman') && !(process.env.CAVEMAN_TELEMETRY === '0' || process.env.DO_NOT_TRACK === '1')) add('WARN', 'caveman cli', 'telemetry is on by default; set CAVEMAN_TELEMETRY=0 or DO_NOT_TRACK=1');
  for (const [st, item, note] of rows) log(`${st.padEnd(5)} ${item.padEnd(16)} ${note}`);
  if (!rows.length) log('nothing found');
  if (flag('--strict') && rows.some((r) => r[0] === 'WARN')) process.exitCode = 1;
}

function fix() {
  const sk = path.join(HOME, '.claude', 'skills');
  const off = path.join(HOME, '.claude', 'skills.disabled');
  for (const d of CLOUD) {
    if (!fs.existsSync(path.join(sk, d))) continue;
    log(`${dry ? '[dry-run] ' : ''}move ${d} -> skills.disabled/ (move back to undo)`);
    if (!dry) { fs.mkdirSync(off, { recursive: true }); fs.renameSync(path.join(sk, d), path.join(off, d)); record('move', path.join(sk, d)); }
  }
  if (has('rtk') && /enabled:\s*yes/i.test(run('rtk', ['telemetry', 'status']) || '')) {
    log(`${dry ? '[dry-run] ' : ''}rtk telemetry disable`);
    if (!dry) run('rtk', ['telemetry', 'disable']);
  }
  log('Manual: remove gateway env and keys from settings, rotate any exposed key, disable unused plugins and MCP servers.');
}

function verify() {
  let bad = 0;
  for (const line of rd('checksums.sha256').trim().split('\n')) {
    const [h, name] = line.split(/\s+/);
    const f = name.replace(/^\*/, '');
    if (sha(path.join(ROOT, f)) !== h) { log(`MISMATCH ${f}`); bad++; }
  }
  if (rd('AGENTS.md') !== rd('.github/copilot-instructions.md')) { log('.github/copilot-instructions.md differs from AGENTS.md'); bad++; }
  log(bad ? 'verify FAILED' : 'verify ok');
  process.exitCode = bad ? 1 : 0;
}

function firstCalls(n) {
  const root = path.join(HOME, '.claude', 'projects');
  if (!fs.existsSync(root)) return [];
  const files = fs.readdirSync(root, { recursive: true }).map(String).filter((f) => f.endsWith('.jsonl')).map((f) => path.join(root, f))
    .map((f) => [f, fs.statSync(f).mtimeMs]).sort((a, b) => b[1] - a[1]).slice(0, n);
  const out = [];
  for (const [f] of files) {
    let first = null, calls = 0, cr = 0, all = 0;
    for (const line of read(f).split('\n')) {
      if (!line.includes('"usage"')) continue;
      let d; try { d = JSON.parse(line); } catch { continue; }
      const u = d.type === 'assistant' && !d.isSidechain && d.message?.usage;
      if (!u) continue;
      const ctx = (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0);
      if (!ctx) continue;
      calls++; cr += u.cache_read_input_tokens || 0; all += ctx;
      first ??= { ctx, at: String(d.timestamp || '').slice(0, 16) };
    }
    if (first) out.push({ at: first.at, first: first.ctx, calls, hit: Math.round((100 * cr) / all), id: path.basename(f).slice(0, 8) });
  }
  return out;
}
const BASE = () => path.join(HOME, '.claude', '.token-kit-baseline.json');

function measure() {
  const rows = firstCalls(Number(opt('--last', 8)));
  log('newest first. first-call = fixed prefix (system prompt, tools, skills, CLAUDE.md), in tokens');
  for (const r of rows) log(`${r.at}  first-call ${String(r.first).padStart(7)}  calls ${String(r.calls).padStart(4)}  cache-hit ${r.hit}%  ${r.id}`);
  if (!fs.existsSync(BASE())) return;
  const b = JSON.parse(read(BASE()));
  const after = rows.find((r) => r.at > b.at);
  if (!after) return log(`baseline median ${b.median}; no session since setup. Start a NEW session, send: ${TEST_PROMPT}   then run measure again`);
  const d = after.first - b.median;
  log(`baseline median ${b.median} -> newest after setup ${after.first} (${d >= 0 ? '+' : ''}${d}, ${Math.round((100 * d) / b.median)}%)`);
}

function saveBaseline() {
  const base = median(firstCalls(5).map((r) => r.first));
  if (base) write(BASE(), JSON.stringify({ median: base, at: new Date().toISOString().slice(0, 16) }) + '\n');
  return base;
}

// one place builds the prompts (y/N and free text) and the dependency bag the modules share.
// Input lines are queued, so piped or fast input is never dropped, and a closed stream means "no answer" (never "n").
async function withIO(fn) {
  const yes = flag('--yes');
  const rl = yes ? null : readline.createInterface({ input: process.stdin });
  const lines = []; let waiter = null; let ended = false;
  rl?.on('line', (l) => { if (waiter) { const w = waiter; waiter = null; w(l); } else lines.push(l); });
  rl?.on('close', () => { ended = true; if (waiter) { const w = waiter; waiter = null; w(null); } });
  const prompt = (q) => { process.stdout.write(`${q} `); if (lines.length) return Promise.resolve(lines.shift()); if (ended) return Promise.resolve(null); return new Promise((r) => { waiter = r; }); };
  const ask = async (q) => { if (yes) return true; const a = await prompt(`${q} [y/N]`); return a !== null && /^y/i.test(a.trim()); };
  const say = async (q) => { if (yes) return ''; return String((await prompt(q)) ?? '').trim(); };
  const d = { HOME, ROOT, args, flag, opt, log, rd, read, write, put, upsert, fix, applySettings, verify, audit, saveBaseline, rtkSetup, ponytailPlugin, tok, CLOUD, readLog, record, ask, say };
  try { await fn(d); } finally { rl?.close(); }
}

async function models() {
  let mod;
  try { mod = await import('./models.mjs'); } catch { return log('models.mjs is not present (offline build): nothing to do.'); }
  await withIO((d) => mod.modelsSetup(d));
}

const cmds = {
  setup: () => withIO(wiz.setup),
  components: () => withIO(wiz.componentsJson),
  budget: () => withIO(wiz.budget),
  log: () => withIO(wiz.showLog),
  uninstall: () => withIO(wiz.uninstall),
  rtk: () => withIO(rtkSetup),
  install: () => log('`install` was replaced by setup. Example: node kit.mjs setup --components rules --targets claude,codex,copilot --yes   (see USAGE.md)'),
  models, audit, fix, verify, measure, inspect: () => inspect({ HOME, args, log, firstCalls }),
};
if (!cmds[cmd]) {
  log(`usage: node kit.mjs <setup|components|inspect|rtk|models|audit|fix|verify|budget|measure|log|uninstall>
  setup [--components rules,orchestration,ponytail,caveman,rtk,cleanup] [--targets claude,codex,copilot,agents-md,cursor,windsurf,cline]
        [--repo PATH] [--yes] [--dry-run] [--max-added N] [--apply-settings] [--force]    checkbox menu, plan, ONE confirmation
  components [--repo PATH]    JSON list of components and detected tools (for agents building their own checkbox UI)
  inspect [--tool claude|codex|copilot|all] [--repo PATH] [--no-usage]    what each agent loads before your first message + ranked fixes
  rtk [--audit-latest] [--version V] [--update] [--tool copilot|claude] [--scope repo|global] [--repo PATH] [--check] [--slim]
  models [--tool claude|copilot] [--live] [--model ID]    optional; --live makes one confirmed call to Anthropic's models API
  log [--last N]    every change this kit made          uninstall [--dry-run]    remove what the log says we added
  common: [--dry-run] [--strict] [--last N]`);
  process.exitCode = cmd ? 2 : 0;
} else await cmds[cmd]();
