// rtk: confirmed install + hook setup + proper verification for RTK, built around GitHub Copilot in VS Code.
// This kit makes no network calls itself. Installing RTK runs your package manager, only after you say yes.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const PIN = '0.49.0'; // RTK version whose source this kit audited
const BLOCK = /\n?<!-- rtk-instructions[^>]*-->[\s\S]*?<!-- \/rtk-instructions -->\n?/;
const tok = (s) => Math.ceil(Buffer.byteLength(s) / 4);
const rd = (p) => { try { return fs.readFileSync(p, 'utf8'); } catch { return ''; } };
const sh = (bin, a, o = {}) => {
  const r = spawnSync(bin, a, { encoding: 'utf8', timeout: 90000, ...o });
  return { ok: r.status === 0, code: r.status, out: `${r.stdout || ''}${r.stderr || ''}`.trim(), missing: r.error?.code === 'ENOENT' };
};
const older = (a, b) => { const x = (a || '0.0.0').split('.').map(Number), y = b.split('.').map(Number); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] < y[i]; return false; };

const copilotDir = (HOME) => process.env.COPILOT_HOME || path.join(HOME, '.copilot');
const hookFile = (tool, scope, repo, HOME) => tool === 'copilot'
  ? (scope === 'global' ? path.join(copilotDir(HOME), 'hooks', 'rtk-rewrite.json') : path.join(repo, '.github', 'hooks', 'rtk-rewrite.json'))
  : path.join(HOME, '.claude', 'settings.json');
const insFileOf = (scope, repo, HOME) => path.join(scope === 'global' ? copilotDir(HOME) : path.join(repo, '.github'), 'copilot-instructions.md');

export function checks({ HOME, tool, scope, repo }) {
  const rows = [];
  const add = (s, n, d) => rows.push([s, n, d]);
  const v = sh('rtk', ['--version']);
  if (v.missing || !v.ok) { add('FAIL', 'binary', 'rtk not found on PATH (after installing, open a NEW terminal and re-run: node kit.mjs rtk --check)'); return rows; }
  const ver = (v.out.match(/\d+\.\d+\.\d+/) || [])[0];
  add(older(ver, PIN) ? 'WARN' : 'PASS', 'binary', `rtk ${ver} (source audited at ${PIN})`);
  const gain = sh('rtk', ['gain']);
  add(gain.ok ? 'PASS' : 'FAIL', 'right package', gain.ok ? '`rtk gain` works (not the unrelated "Rust Type Kit" package of the same name)' : '`rtk gain` failed: you may have the wrong "rtk" package');
  const off = /enabled:\s*no/i.test(sh('rtk', ['telemetry', 'status']).out) || process.env.RTK_TELEMETRY_DISABLED === '1';
  add(off ? 'PASS' : 'FAIL', 'telemetry', off ? 'disabled' : 'ENABLED: run `rtk telemetry disable`');
  add(/rtk git status/.test(sh('rtk', ['rewrite', 'git status']).out) ? 'PASS' : 'FAIL', 'rewrite engine', '`git status` -> `rtk git status`');
  const f = hookFile(tool, scope, repo, HOME);
  if (tool === 'copilot') {
    add(rd(f).includes('rtk hook copilot') ? 'PASS' : 'FAIL', 'hook file', `${f}${rd(f) ? '' : ' (missing: run the guided setup)'}`);
    const ev = (c) => JSON.stringify({ tool_name: 'run_in_terminal', tool_input: { command: c } });
    add(/"updatedInput"[\s\S]*rtk git status/.test(sh('rtk', ['hook', 'copilot'], { input: ev('git status') }).out) ? 'PASS' : 'FAIL', 'hook rewrites', 'VS Code Copilot event `git status` -> `rtk git status`');
    add(sh('rtk', ['hook', 'copilot'], { input: ev('echo hi') }).out === '' ? 'PASS' : 'WARN', 'hook passthrough', 'commands RTK does not cover are left unchanged');
    const ins = rd(insFileOf(scope, repo, HOME)).match(BLOCK);
    if (ins) add('INFO', 'instruction block', `RTK's "always prefix with rtk" block adds ~${tok(ins[0])} tokens to every request; the VS Code hook already rewrites commands. Remove it (keep it for Copilot CLI): node kit.mjs rtk --slim`);
  } else {
    const ok = /rtk hook claude|rtk-rewrite/.test(rd(f));
    add(ok ? 'PASS' : 'FAIL', 'hook registered', `${f}${ok ? '' : ' (no RTK PreToolUse hook)'}`);
  }
  const vf = sh('rtk', ['verify']);
  add(vf.ok ? 'PASS' : 'WARN', 'rtk verify', vf.ok ? 'hook integrity and filter tests pass' : vf.out.split('\n').slice(-2).join(' '));
  const rg = !sh('rg', ['--version']).missing;
  add(rg ? 'PASS' : 'WARN', 'ripgrep', rg ? 'found' : 'missing: some RTK filters call `rg`; winget install BurntSushi.ripgrep.MSVC');
  return rows;
}

function show(rows, log) { for (const [s, n, d] of rows) log(`${s.padEnd(5)} ${n.padEnd(18)} ${d}`); }

function liveCheck(log, tool) {
  log(`\nLive check (proves the agent really uses it):
  1. ${tool === 'copilot' ? 'Fully restart VS Code (hooks load at startup).' : 'Start a new session.'}
  2. In agent mode ask: "run git status in the terminal".
  3. In a terminal run: rtk gain --history   -> a "git status" row appears. No row = the hook is not firing.
  Undo anytime: rtk init ${tool === 'copilot' ? '--uninstall --copilot (in the repo)' : '-g --uninstall'}`);
}

export function slim(file, log, dry) {
  const t = rd(file);
  if (!BLOCK.test(t)) return log(`no RTK instruction block in ${file}`);
  if (dry) return log(`[dry-run] remove RTK block (~${tok(t.match(BLOCK)[0])} tokens) from ${file}`);
  if (!fs.existsSync(file + '.pre-token-kit')) fs.copyFileSync(file, file + '.pre-token-kit');
  fs.writeFileSync(file, t.replace(BLOCK, '\n'));
  log(`removed RTK instruction block from ${file} (backup: ${file}.pre-token-kit). Re-running \`rtk init\` adds it back.`);
}

function installPlan() {
  if (process.platform === 'win32') return ['winget', ['install', '--id', 'rtk-ai.rtk', '--exact', '--version', PIN]];
  if (process.platform === 'darwin') return ['brew', ['install', 'rtk']];
  return ['cargo', ['install', '--locked', '--git', 'https://github.com/rtk-ai/rtk', '--tag', `v${PIN}`]];
}

export async function rtkSetup({ HOME, args, log, ask }) {
  const flag = (f) => args.includes(f);
  const opt = (f, d) => { const i = args.indexOf(f); return i > -1 ? args[i + 1] : d; };
  const tool = opt('--tool', 'copilot'), scope = opt('--scope', 'repo'), repo = path.resolve(opt('--repo', process.cwd()));
  const dry = flag('--dry-run');
  const o = { HOME, tool, scope, repo };
  if (!['copilot', 'claude'].includes(tool)) throw new Error('rtk --tool must be copilot or claude');
  const insFile = insFileOf(scope, repo, HOME);
  if (flag('--check')) { show(checks(o), log); return liveCheck(log, tool); }
  if (flag('--slim')) { if (flag('--yes') || await ask(`Remove RTK's instruction block from ${insFile}?`)) slim(insFile, log, dry); return; }

  log('RTK setup (confirmed step by step). Current state:');
  show(checks(o), log);

  if (sh('rtk', ['--version']).missing) {
    const [bin, a] = installPlan();
    const pinned = process.platform === 'darwin' ? ' (Homebrew cannot pin a version)' : ` (pinned to the audited ${PIN})`;
    if (!(await ask(`Install RTK by running: ${bin} ${a.join(' ')}${pinned}? This downloads from the internet.`))) return log('skipped RTK install');
    if (dry) log(`[dry-run] ${bin} ${a.join(' ')}`);
    else {
      const r = sh(bin, a, { stdio: 'inherit' });
      if (r.missing) return log(`${bin} not found. Install it, or download the release for your OS from https://github.com/rtk-ai/rtk/releases and verify its checksum, then re-run.`);
      if (r.code !== 0) return log(`install exited with code ${r.code}. If version ${PIN} is unavailable, install the latest manually (unaudited) and re-run: node kit.mjs rtk`);
      if (sh('rtk', ['--version']).missing) return log('RTK installed but not on PATH in this terminal. Open a NEW terminal and re-run: node kit.mjs rtk');
    }
  }

  if (/enabled:\s*yes/i.test(sh('rtk', ['telemetry', 'status']).out) && await ask('RTK telemetry is ON. Disable it?')) { if (!dry) sh('rtk', ['telemetry', 'disable']); log('telemetry disabled'); }
  if (process.env.RTK_TELEMETRY_DISABLED !== '1') {
    if (process.platform === 'win32') {
      if (await ask('Persist RTK_TELEMETRY_DISABLED=1 for your user (setx), blocking telemetry even if consent is given later?')) { if (!dry) sh('setx', ['RTK_TELEMETRY_DISABLED', '1']); log('set (applies to NEW terminals)'); }
    } else log('Add to your shell profile: export RTK_TELEMETRY_DISABLED=1');
  }

  if (!checks(o).some(([s, n]) => s === 'PASS' && /hook (file|registered)/.test(n))) {
    const cmd = tool === 'copilot' ? (scope === 'global' ? ['init', '-g', '--copilot'] : ['init', '--copilot']) : ['init', '-g'];
    const writes = tool === 'copilot' ? `${hookFile(tool, scope, repo, HOME)} and an RTK block in ${insFile}` : `a PreToolUse hook in ${hookFile(tool, scope, repo, HOME)} (RTK asks before patching it)`;
    if (await ask(`Run \`rtk ${cmd.join(' ')}\`${tool === 'copilot' && scope === 'repo' ? ` in ${repo}` : ''}? It writes ${writes}.`)) {
      if (dry) log(`[dry-run] rtk ${cmd.join(' ')}`); else sh('rtk', cmd, { cwd: repo, stdio: 'inherit' });
    }
  }
  if (tool === 'copilot' && BLOCK.test(rd(insFile)) && await ask(`Remove RTK's instruction block from ${insFile} (~${tok(rd(insFile).match(BLOCK)[0])} tokens per request; the VS Code hook already rewrites commands; keep it if you also use Copilot CLI)?`)) slim(insFile, log, dry);

  log('\nFinal verification:');
  show(checks(o), log);
  liveCheck(log, tool);
}
