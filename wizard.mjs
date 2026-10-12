// wizard: component checkbox menu, data-driven IDE targets, plan + per-tool token cap, install log, uninstall. Local only.
import fs from 'node:fs';
import path from 'node:path';

const OWNED = '<!-- token-kit:owned -->';
const targetsOf = (d) => JSON.parse(d.rd('targets.json'));
const fileOf = (d, t, repo) => (t.file.startsWith('~/') ? path.join(d.HOME, t.file.slice(2)) : path.join(repo, t.file));
const tokOf = (d, f) => d.tok(d.rd(f));
const descTok = (d, f) => { const m = d.rd(f).match(/description:\s*>?\s*([\s\S]*?)\n(?=\S)/); return d.tok(m ? m[1] : '') + 12; };

// which targets look present on this machine / in this repo
export function detect(d, repo) {
  return Object.fromEntries(Object.entries(targetsOf(d)).map(([id, t]) => {
    const top = t.file.startsWith('~/') ? path.join(d.HOME, t.file.slice(2).split('/')[0]) : path.join(repo, t.file.split('/')[0]);
    return [id, id !== 'agents-md' && fs.existsSync(top)];
  }));
}

export function components(d) {
  const sk = path.join(d.HOME, '.claude', 'skills');
  const cloud = fs.existsSync(sk) && fs.readdirSync(sk).some((x) => d.CLOUD.includes(x));
  return [
    { id: 'rules', label: 'Core rules file: smallest change, read less, concise replies', def: true, tokens: tokOf(d, 'AGENTS.md'), tools: 'any', note: 'the token saver' },
    { id: 'orchestration', label: 'Agentic orchestration (Claude Code): Sonnet main, Haiku helpers, Opus reviewer agent', def: false, tokens: tokOf(d, 'claude/CLAUDE.snippet.md') + tokOf(d, 'claude/agents/opus-reviewer.md'), tools: 'claude', note: 'better use of models, NOT a cost saver; it adds tokens' },
    { id: 'ponytail', label: 'Ponytail skill: minimal-diff coding mode (Claude Code)', def: false, tokens: descTok(d, 'skills/ponytail/SKILL.md'), tools: 'claude', note: 'skipped if the ponytail plugin is on' },
    { id: 'caveman', label: 'Caveman skill: terse replies (Claude Code)', def: false, tokens: descTok(d, 'optional/caveman/SKILL.md'), tools: 'claude', note: 'about 0% net on the bill per its own docs' },
    { id: 'rtk', label: 'RTK shell-output compression: live audit of the latest release, then install', def: false, tokens: 0, tools: 'copilot|claude', note: 'downloads software; asks again before each step' },
    { id: 'cleanup', label: 'Clean up: move Caveman Cloud skills aside, disable RTK telemetry', def: cloud, tokens: 0, tools: 'claude', note: 'reversible' },
  ];
}

// numbered checkbox menu: type numbers to toggle, Enter to accept
async function menu(d, title, items, yes) {
  const on = new Set(items.filter((i) => i.on).map((i) => i.id));
  if (yes) return on;
  for (;;) {
    d.log(`\n${title}  (numbers toggle, a = all, n = none, Enter = continue)`);
    items.forEach((it, i) => d.log(` [${on.has(it.id) ? 'x' : ' '}] ${i + 1}. ${it.label}`));
    const a = (await d.say('>')).toLowerCase();
    if (!a) return on;
    if (a === 'a') items.forEach((i) => on.add(i.id));
    else if (a === 'n') on.clear();
    else for (const n of a.split(/[\s,]+/)) { const it = items[Number(n) - 1]; if (it) (on.has(it.id) ? on.delete(it.id) : on.add(it.id)); }
  }
}

function installRules(d, id, repo, T) {
  const t = T[id], f = fileOf(d, t, repo), rules = d.rd('AGENTS.md');
  if (id === 'claude' && d.ponytailPlugin() && !d.flag('--force')) return d.log('claude: skip rules, the ponytail plugin already injects equivalent rules (--force to add anyway)');
  if (t.mode === 'block') d.upsert(f, rules);
  else d.put(f, `${t.header || ''}${OWNED}\n${rules}`);
}

export async function setup(d) {
  const { flag, opt, log, ask } = d;
  const yes = flag('--yes'), repo = path.resolve(opt('--repo', process.cwd()));
  d.verify();
  if (process.exitCode) return;
  log('\n== audit ==');
  d.audit();
  const base = d.saveBaseline();
  log(`\nbaseline fixed prefix (median of your last sessions): ${base || 'unknown'} tokens`);
  const T = targetsOf(d), comps = components(d), det = detect(d, repo);
  const list = (name) => (opt(name, null) ? new Set(opt(name).split(',').filter(Boolean)) : null);
  const chosen = list('--components') || await menu(d, 'What do you want to set up?', comps.map((c) => ({ id: c.id, on: c.def, label: `${c.label}  (${c.tokens ? `+${c.tokens} tokens` : 'no extra tokens'}; ${c.note})` })), yes);
  for (const c of chosen) if (!comps.some((x) => x.id === c)) return log(`unknown component: ${c} (${comps.map((x) => x.id).join(', ')})`);
  const targets = !chosen.has('rules') ? new Set() : list('--targets') || await menu(d, 'Which tools should get the rules file?', Object.entries(T).map(([id, t]) => ({ id, on: det[id], label: `${t.label}  ->  ${t.file}` })), yes);
  for (const x of targets) if (!T[x]) return log(`unknown target: ${x} (${Object.keys(T).join(', ')})`);

  const skip = d.ponytailPlugin() && !flag('--force');
  const cm = path.join(d.HOME, '.claude', 'CLAUDE.md');
  const routingBlock = /<!-- token-kit-routing:start -->[\s\S]*?<!-- token-kit-routing:end -->/;
  const hasRouting = !flag('--force') && fs.existsSync(cm) && /^#+\s*model routing/im.test(fs.readFileSync(cm, 'utf8').replace(routingBlock, ''));
  const by = (id) => comps.find((c) => c.id === id).tokens;
  const perTool = {};
  for (const x of targets) perTool[x] = by('rules') - (x === 'claude' && skip ? by('rules') : 0);
  const extra = (chosen.has('orchestration') ? by('orchestration') - (hasRouting ? tokOf(d, 'claude/CLAUDE.snippet.md') : 0) : 0) + (chosen.has('ponytail') && !skip ? by('ponytail') : 0) + (chosen.has('caveman') ? by('caveman') : 0);
  if (extra) perTool.claude = (perTool.claude || 0) + extra;
  const cap = Number(opt('--max-added', 600));
  log('\n== plan ==');
  for (const x of targets) log(`rules          -> ${fileOf(d, T[x], repo)}${x === 'claude' && skip ? '  (skipped: ponytail plugin on)' : ''}`);
  if (chosen.has('orchestration')) log(`orchestration  -> ~/.claude/CLAUDE.md (routing block), ~/.claude/agents/opus-reviewer.md${flag('--apply-settings') ? ', settings.json (model, subagent)' : ''}${hasRouting ? '  [routing block skipped: your CLAUDE.md already has one]' : ''}`);
  if (chosen.has('ponytail')) log(`ponytail skill -> ${skip ? 'skipped (plugin on)' : '~/.claude/skills/ponytail/SKILL.md'}`);
  if (chosen.has('caveman')) log('caveman skill  -> ~/.claude/skills/caveman/SKILL.md');
  if (chosen.has('rtk')) log('RTK            -> live audit of the latest release, guided install, hook, verification (asks again before each step)');
  if (chosen.has('cleanup')) log('cleanup        -> move Caveman Cloud skills to skills.disabled/, disable RTK telemetry if on');
  for (const [tool, n] of Object.entries(perTool)) log(`always-loaded tokens added for ${tool}: ${n}`);
  const over = Object.entries(perTool).filter(([, n]) => n > cap);
  if (over.length) return log(`refusing: ${over.map(([t, n]) => `${t} +${n}`).join(', ')} exceeds --max-added ${cap}. Deselect something or raise the cap.`);
  if (![...chosen].length) return log('nothing selected');
  if (!(await ask('Apply this plan?'))) return log('nothing changed');

  for (const x of targets) installRules(d, x, repo, T);
  const c = path.join(d.HOME, '.claude');
  if (chosen.has('orchestration')) {
    if (!hasRouting) d.upsert(path.join(c, 'CLAUDE.md'), d.rd('claude/CLAUDE.snippet.md'), 'token-kit-routing');
    d.put(path.join(c, 'agents/opus-reviewer.md'), d.rd('claude/agents/opus-reviewer.md'));
    if (flag('--apply-settings')) d.applySettings(path.join(c, 'settings.json'));
  }
  if (chosen.has('ponytail') && !skip) d.put(path.join(c, 'skills/ponytail/SKILL.md'), d.rd('skills/ponytail/SKILL.md'));
  if (chosen.has('caveman')) d.put(path.join(c, 'skills/caveman/SKILL.md'), d.rd('optional/caveman/SKILL.md'));
  if (chosen.has('cleanup')) d.fix();
  if (chosen.has('rtk')) {
    if (yes && !flag('--allow-rtk-yes')) log('RTK needs your live confirmation (it downloads software): run  node kit.mjs rtk --tool <copilot|claude> --repo <path>');
    else await d.rtkSetup({ HOME: d.HOME, args: [...d.args, ...(d.args.includes('--tool') ? [] : ['--tool', targets.has('copilot') || !targets.has('claude') ? 'copilot' : 'claude'])], log, ask });
  }
  log('\nDone. See what changed: node kit.mjs log     Undo: node kit.mjs uninstall --dry-run');
  log('Measure (Claude Code): open a NEW session in an empty folder, send:  Reply with exactly one word: ok   then run: node kit.mjs measure');
}

export function componentsJson(d) {
  const repo = path.resolve(d.opt('--repo', process.cwd())), T = targetsOf(d), det = detect(d, repo);
  console.log(JSON.stringify({
    components: components(d),
    targets: Object.entries(T).map(([id, t]) => ({ id, label: t.label, file: t.file, detected: det[id] })),
    maxAdded: 600, rtkReviewed: '0.49.0', testPrompt: 'Reply with exactly one word: ok',
  }, null, 2));
}

export function budget(d) {
  d.log('always-loaded tokens each component adds to every session (bytes/4 upper bound)');
  for (const c of components(d)) d.log(`${String(c.tokens).padStart(5)}  ${c.id.padEnd(14)} ${c.note}`);
  d.log('\nEach always-loaded token is re-read on every model call (~0.1x input price when cached): tokens x calls x 0.1, e.g. 400 x 120 = ~4.8k input-equivalent per session. Keep only text that saves more.');
}

export function showLog(d) {
  const e = d.readLog();
  if (!e.length) return d.log('no changes recorded yet');
  for (const x of e.slice(-Number(d.opt('--last', 40)))) d.log(`${x.ts}  ${x.action.padEnd(6)} ${x.file}`);
}

export function uninstall(d) {
  const dry = d.flag('--dry-run'), entries = d.readLog();
  const shipped = new Set(['skills/ponytail/SKILL.md', 'optional/caveman/SKILL.md', 'claude/agents/opus-reviewer.md'].map((f) => d.rd(f)));
  const say = (m) => d.log(`${dry ? '[dry-run] ' : ''}${m}`);
  for (const f of [...new Set(entries.filter((e) => e.action === 'write').map((e) => e.file))]) {
    if (!fs.existsSync(f)) continue;
    const t = fs.readFileSync(f, 'utf8');
    if (/<!-- token-kit(-routing)?:start -->/.test(t)) {
      const nt = t.replace(/\n*<!-- (token-kit(?:-routing)?):start -->[\s\S]*?<!-- \1:end -->\n*/g, '\n\n').trim();
      say(nt ? `remove our block from ${f}` : `delete ${f} (only held our block)`);
      if (!dry) nt ? fs.writeFileSync(f, nt + '\n') : fs.unlinkSync(f);
    } else if (t.includes(OWNED) || shipped.has(t)) { say(`delete ${f}`); if (!dry) fs.unlinkSync(f); }
    else d.log(`left alone (edited or not ours): ${f}`);
  }
  for (const m of entries.filter((e) => e.action === 'move')) d.log(`moved earlier, restore by hand if wanted: ${m.file}`);
  d.log('Settings changes (model, env) are not auto-reverted: restore settings.json from settings.json.pre-token-kit if you want the old values.');
}
