// inspect: estimate what each agent loads before your first message, find waste, rank fixes. Read-only, no network.
import fs from 'node:fs';
import path from 'node:path';

const T = (n) => Math.ceil(n / 4);
const rd = (p) => { try { return fs.readFileSync(p, 'utf8'); } catch { return ''; } };
const ls = (p) => { try { return fs.readdirSync(p, { withFileTypes: true }); } catch { return []; } };
const fmt = (n) => String(n).replace(/\B(?=(\d{3})+$)/g, ',').padStart(7);
const CLOUD = ['caveman-setup', 'caveman-discover', 'caveman-evidence-review', 'caveman-manage', 'caveman-optimize', 'caveman-learn'];

function front(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const out = {}; let key = null;
  if (!m) return out;
  for (const line of m[1].split(/\r?\n/)) {
    const k = line.match(/^([A-Za-z][\w-]*):\s*(.*)$/);
    if (k) { key = k[1]; out[key] = k[2].replace(/^[>|][-+]?\s*$/, ''); } else if (key) out[key] += ' ' + line.trim();
  }
  for (const k in out) out[k] = out[k].replace(/^["']|["']$/g, '').trim();
  return out;
}
// one listed entry costs name + description + ~12 tokens of list formatting
function entries(dir, kind, prefix = '') {
  const out = [];
  const add = (file, fallback) => {
    const t = rd(file);
    if (!t) return out.push({ name: prefix + fallback, tokens: 0, desc: 0, broken: true, kind });
    const f = front(t);
    const name = prefix + (f.name || fallback);
    out.push({ name, tokens: T(name.length + (f.description || '').length) + 12, desc: (f.description || '').length, kind });
  };
  for (const e of ls(dir)) {
    if (kind === 'skill' && (e.isDirectory() || e.isSymbolicLink())) add(path.join(dir, e.name, 'SKILL.md'), e.name);
    else if (kind !== 'skill' && e.isFile() && e.name.endsWith('.md')) add(path.join(dir, e.name), e.name.slice(0, -3));
  }
  return out;
}
const sum = (a) => a.reduce((s, x) => s + x.tokens, 0);

function usage(HOME) {
  const u = { skill: {}, mcp: {}, agent: {}, sessions: 0 };
  const root = path.join(HOME, '.claude', 'projects');
  let files = [];
  try { files = fs.readdirSync(root, { recursive: true }).map(String).filter((f) => f.endsWith('.jsonl')); } catch { return u; }
  for (const f of files) {
    u.sessions++;
    for (const line of rd(path.join(root, f)).split('\n')) {
      if (line.includes('<command-name>')) for (const m of line.matchAll(/<command-name>\/?([^<]+)<\/command-name>/g)) u.skill[m[1]] = (u.skill[m[1]] || 0) + 1;
      if (!line.includes('"tool_use"')) continue;
      for (const m of line.matchAll(/"name":"Skill","input":\{"skill":"([^"]+)"/g)) u.skill[m[1]] = (u.skill[m[1]] || 0) + 1;
      for (const m of line.matchAll(/"name":"mcp__([^"]+?)__[^"]*"/g)) u.mcp[m[1]] = (u.mcp[m[1]] || 0) + 1;
      for (const m of line.matchAll(/"subagent_type":"([^"]+)"/g)) u.agent[m[1]] = (u.agent[m[1]] || 0) + 1;
    }
  }
  return u;
}

function claude(ctx, findings) {
  const { HOME, cwd } = ctx;
  const c = path.join(HOME, '.claude');
  const rows = [];
  const use = ctx.noUsage ? null : usage(HOME);
  const seen = use && use.sessions >= 20;
  let settings = {}; try { settings = JSON.parse(rd(path.join(c, 'settings.json'))); } catch { /* none */ }
  const seenMd = new Set();
  const md = (label, p) => {
    if (seenMd.has(path.resolve(p))) return;
    seenMd.add(path.resolve(p));
    const t = rd(p); if (!t) return;
    let tokens = T(Buffer.byteLength(t));
    for (const m of t.matchAll(/^@(\S+)/gm)) { const ip = path.resolve(path.dirname(p), m[1].replace(/^~/, HOME)); tokens += T(Buffer.byteLength(rd(ip))); }
    rows.push([tokens, `${label} (incl. @imports)`]);
    if (tokens > 2500) findings.push({ save: tokens - 1500, what: `${label} is ${tokens} tokens, loaded every session and every subagent`, act: 'trim to rules you actually need; move reference material into on-demand files' });
  };
  md('~/.claude/CLAUDE.md', path.join(c, 'CLAUDE.md'));
  md('project CLAUDE.md', path.join(cwd, 'CLAUDE.md'));
  md('project .claude/CLAUDE.md', path.join(cwd, '.claude', 'CLAUDE.md'));
  const enc = cwd.replace(/[^A-Za-z0-9]/g, '-');
  md('project auto-memory MEMORY.md', path.join(c, 'projects', enc, 'memory', 'MEMORY.md'));

  const names = {};
  const userSkills = entries(path.join(c, 'skills'), 'skill');
  const userAgents = entries(path.join(c, 'agents'), 'agent');
  rows.push([sum(userSkills), `user skills: ${userSkills.length}`], [sum(userAgents), `user agents: ${userAgents.length}`]);
  for (const s of userSkills) { (names[s.name] ||= []).push('user'); if (s.broken) findings.push({ save: 12, what: `skill folder without SKILL.md: ${s.name}`, act: 'delete or fix the folder' }); }
  const cloud = userSkills.filter((s) => CLOUD.includes(s.name));
  if (cloud.length) findings.push({ save: sum(cloud), what: `Caveman Cloud skills installed (${cloud.map((s) => s.name).join(', ')}): descriptions load every session and the skills send data to a third party`, act: 'node kit.mjs fix (moves them to skills.disabled/, reversible)' });
  if (seen) {
    const unused = userSkills.filter((s) => !use.skill[s.name] && !CLOUD.includes(s.name));
    if (unused.length > 5) findings.push({ save: sum(unused), what: `${unused.length} user skills with no Skill-tool call or typed slash command in ${use.sessions} sessions (skills applied through CLAUDE.md or hooks, such as caveman, are not counted)`, act: `review the list and move ones you do not need to ~/.claude/skills.disabled/ (reversible). Examples: ${unused.slice(0, 6).map((s) => s.name).join(', ')}` });
  }
  const fat = [...userSkills].sort((a, b) => b.desc - a.desc).filter((s) => s.desc > 500).slice(0, 5);
  if (fat.length) findings.push({ save: fat.reduce((s, x) => s + T(x.desc - 300), 0), what: `oversized skill descriptions (>500 chars): ${fat.map((s) => `${s.name} ${s.desc}`).join(', ')}`, act: 'shorten to one or two sentences; the body loads only on use' });

  const plugins = Object.entries(settings.enabledPlugins || {}).filter(([, v]) => v).map(([k]) => k);
  for (const key of plugins) {
    const [plug, mkt] = key.split('@');
    const base = path.join(c, 'plugins', 'cache', mkt || plug, plug);
    const vers = ls(base).filter((e) => e.isDirectory()).map((e) => path.join(base, e.name)).sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
    const v = vers[0];
    if (!v) { rows.push([0, `plugin ${key}: install folder not found`]); continue; }
    const sk = entries(path.join(v, 'skills'), 'skill', `${plug}:`), cm = entries(path.join(v, 'commands'), 'command', `${plug}:`), ag = entries(path.join(v, 'agents'), 'agent', `${plug}:`);
    for (const s of sk) (names[s.name.split(':')[1]] ||= []).push(plug);
    const tokens = sum(sk) + sum(cm) + sum(ag);
    let mcp = 0; try { const j = JSON.parse(rd(path.join(v, '.mcp.json'))); mcp = Object.keys(j.mcpServers || j).length; } catch { /* none */ }
    const hooks = /"SessionStart"/.test(rd(path.join(v, 'hooks', 'hooks.json')));
    rows.push([tokens, `plugin ${key}: ${sk.length} skills, ${cm.length} commands, ${ag.length} agents${mcp ? `, ${mcp} MCP servers` : ''}${hooks ? ', SessionStart hook' : ''}`]);
    if (hooks) findings.push({ save: 0, what: `plugin ${key} injects text via a SessionStart hook (also into each subagent); size not visible offline`, act: 'check its injected size; prefer a short rules file if it is large' });
    if (seen) {
      const uses = Object.entries(use.skill).filter(([k]) => k.startsWith(plug + ':')).reduce((s, [, n]) => s + n, 0)
        + Object.entries(use.agent).filter(([k]) => k.startsWith(plug + ':')).reduce((s, [, n]) => s + n, 0)
        + Object.entries(use.mcp).filter(([k]) => k.includes(`plugin_${plug}_`)).reduce((s, [, n]) => s + n, 0);
      if (tokens > 1500 && uses === 0) findings.push({ save: tokens, what: `plugin ${key} costs ~${tokens} tokens/session and was never used in ${use.sessions} sessions`, act: `disable it ("${key}": false in enabledPlugins), or enable it only in projects that need it` });
      else if (tokens > 3000 && uses < 5) findings.push({ save: Math.round(tokens * 0.8), what: `plugin ${key} costs ~${tokens} tokens/session but was used only ${uses} times in ${use.sessions} sessions`, act: 'enable per project (project .claude/settings.json) instead of globally' });
    }
  }
  for (const [n, owners] of Object.entries(names)) if (owners.length > 1) findings.push({ save: 40, what: `duplicate skill name "${n}" in ${owners.join(' and ')}`, act: 'keep one copy' });

  let user = {}; try { user = JSON.parse(rd(path.join(HOME, '.claude.json'))); } catch { /* none */ }
  const servers = { ...(user.mcpServers || {}), ...((user.projects || {})[cwd.replace(/\\/g, '/')]?.mcpServers || {}) };
  try { Object.assign(servers, JSON.parse(rd(path.join(cwd, '.mcp.json'))).mcpServers || {}); } catch { /* none */ }
  const sn = Object.keys(servers);
  rows.push([0, `MCP servers (user/project): ${sn.length} - tool names are deferred, but each server's instructions text still loads`]);
  if (seen) for (const s of sn) if (!Object.keys(use.mcp).some((k) => k === s || k.endsWith(`_${s}`))) findings.push({ save: 300, what: `MCP server "${s}" never used in ${use.sessions} sessions`, act: `claude mcp remove ${s} (or define it only in the project's .mcp.json)` });
  if (sn.length > 8) findings.push({ save: sn.length * 100, what: `${sn.length} MCP servers configured`, act: 'keep only what you use daily; scope the rest to projects' });
  const hookCount = ['SessionStart', 'UserPromptSubmit'].reduce((s, e) => s + (settings.hooks?.[e] || []).length, 0);
  if (hookCount) rows.push([0, `settings hooks on SessionStart/UserPromptSubmit: ${hookCount} (output, if any, is added to context)`]);
  if (settings.env?.ANTHROPIC_BASE_URL) findings.push({ save: 0, what: `ANTHROPIC_BASE_URL points at ${settings.env.ANTHROPIC_BASE_URL}`, act: 'confirm intended; gateways can break prompt caching (check cache-hit in `measure`)' });
  return rows;
}

function codex(ctx, findings) {
  const rows = [];
  for (const f of [path.join(ctx.HOME, '.codex', 'AGENTS.md'), path.join(ctx.cwd, 'AGENTS.md')]) {
    const t = rd(f); if (!t) continue;
    const tokens = T(Buffer.byteLength(t));
    rows.push([tokens, f]);
    if (tokens > 2500) findings.push({ save: tokens - 1500, what: `${f} is ${tokens} tokens and loads every session`, act: 'trim' });
  }
  const servers = [...rd(path.join(ctx.HOME, '.codex', 'config.toml')).matchAll(/^\[mcp_servers\.([^\].]+)/gm)].map((m) => m[1]);
  rows.push([0, `MCP servers in config.toml: ${servers.length}${servers.length ? ' (' + servers.join(', ') + ')' : ''}`]);
  if (servers.length > 6) findings.push({ save: servers.length * 100, what: `${servers.length} Codex MCP servers`, act: 'remove unused ones' });
  return rows;
}

function copilot(ctx, findings) {
  const rows = [];
  const one = (label, p, alwaysOn = true) => {
    const t = rd(p); if (!t) return;
    const tokens = T(Buffer.byteLength(t));
    rows.push([alwaysOn ? tokens : 0, `${label}${alwaysOn ? '' : ' (applies only to matching files)'}`]);
    if (alwaysOn && tokens > 1500) findings.push({ save: tokens - 800, what: `${label} is ${tokens} tokens and is sent with every request`, act: 'shorten; keep only rules that change behavior' });
  };
  one('.github/copilot-instructions.md', path.join(ctx.cwd, '.github', 'copilot-instructions.md'));
  one('AGENTS.md', path.join(ctx.cwd, 'AGENTS.md'));
  for (const e of ls(path.join(ctx.cwd, '.github', 'instructions'))) {
    if (!e.name.endsWith('.md')) continue;
    const p = path.join(ctx.cwd, '.github', 'instructions', e.name);
    one(`.github/instructions/${e.name}`, p, !/applyTo/.test(rd(p)));
  }
  let n = 0; try { n = Object.keys(JSON.parse(rd(path.join(ctx.cwd, '.vscode', 'mcp.json'))).servers || {}).length; } catch { /* none */ }
  rows.push([0, `MCP servers in .vscode/mcp.json: ${n}`]);
  if (n > 6) findings.push({ save: n * 100, what: `${n} MCP servers in the workspace`, act: 'enable only the tools you use per chat' });
  return rows;
}

export function inspect({ HOME, args, log, firstCalls }) {
  const opt = (f, d) => { const i = args.indexOf(f); return i > -1 ? args[i + 1] : d; };
  const tool = opt('--tool', 'all');
  const ctx = { HOME, cwd: path.resolve(opt('--repo', process.cwd())), noUsage: args.includes('--no-usage') };
  const fns = { claude, codex, copilot };
  for (const t of tool === 'all' ? Object.keys(fns) : [tool]) {
    if (!fns[t]) throw new Error(`unknown tool: ${t} (claude|codex|copilot|all)`);
    if (tool === 'all' && t === 'claude' && !fs.existsSync(path.join(HOME, '.claude'))) continue;
    if (tool === 'all' && t === 'codex' && !fs.existsSync(path.join(HOME, '.codex')) && !fs.existsSync(path.join(ctx.cwd, 'AGENTS.md'))) continue;
    if (tool === 'all' && t === 'copilot' && !fs.existsSync(path.join(ctx.cwd, '.github'))) continue;
    const findings = [];
    const rows = fns[t](ctx, findings).sort((a, b) => b[0] - a[0]);
    const total = rows.reduce((s, r) => s + r[0], 0);
    log(`\n== ${t}: loaded before your first message (estimate, bytes/4) ==\n tokens  source`);
    for (const [n, label] of rows) log(`${n ? fmt(n) : '      -'}  ${label}`);
    log(`${fmt(total)}  estimated total from files above`);
    if (t === 'claude') {
      const m = firstCalls(5).map((r) => r.first).sort((a, b) => a - b);
      if (m.length) log(`${fmt(m[Math.floor(m.length / 2)])}  measured first call (median of ${m.length} recent sessions); the remainder is the system prompt and built-in tools (fixed) plus MCP tool names and server instructions and hook output (partly controllable: remove unused MCP servers and plugins, then re-measure)`);
    }
    findings.sort((a, b) => b.save - a.save);
    log(`\n== ${t}: findings, largest saving first ==`);
    if (!findings.length) log('none: nothing wasteful found in files this tool can see');
    findings.forEach((f, i) => log(`${i + 1}. [~${f.save} tokens/session] ${f.what}\n   action: ${f.act}`));
  }
  log('\nNext: apply the top actions one at a time, then in a NEW empty-folder session send "Reply with exactly one word: ok" and run: node kit.mjs measure');
  log('Estimates use bytes/4 and cannot see MCP tool names, MCP instructions or hook output; trust `measure` for the real number.');
}
