import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const kit = path.join(path.dirname(fileURLToPath(import.meta.url)), 'kit.mjs');
const run = (home, ...a) => execFileSync('node', [kit, ...a], { env: { ...process.env, KIT_HOME: home }, encoding: 'utf8' });
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'kit-'));

test('verify passes on shipped files', () => assert.match(run(tmp(), 'verify'), /verify ok/));

test('dry-run writes nothing', () => {
  const h = tmp(); run(h, 'install', '--tool', 'claude', '--dry-run');
  assert.equal(fs.existsSync(path.join(h, '.claude')), false);
});

test('install is idempotent, backs up once, keeps user content', () => {
  const h = tmp(); const f = path.join(h, '.claude', 'CLAUDE.md');
  fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, 'my own rules\n');
  run(h, 'install', '--tool', 'claude'); const first = fs.readFileSync(f, 'utf8');
  run(h, 'install', '--tool', 'claude');
  assert.equal(fs.readFileSync(f, 'utf8'), first);
  assert.ok(first.startsWith('my own rules'));
  assert.equal(fs.readFileSync(f + '.pre-token-kit', 'utf8'), 'my own rules\n');
  assert.equal(fs.existsSync(path.join(h, '.claude', 'skills', 'ponytail')), false);
  assert.ok(fs.existsSync(path.join(h, '.claude', 'agents', 'opus-reviewer.md')));
});

test('apply-settings skips when a gateway is configured', () => {
  const h = tmp(); const f = path.join(h, '.claude', 'settings.json');
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, JSON.stringify({ env: { ANTHROPIC_BASE_URL: 'https://gw.example' } }));
  run(h, 'install', '--tool', 'claude', '--apply-settings');
  assert.equal(JSON.parse(fs.readFileSync(f, 'utf8')).model, undefined);
});

test('audit flags gateway, plaintext key, cloud skills; fix moves cloud skills', () => {
  const h = tmp(); const c = path.join(h, '.claude');
  fs.mkdirSync(path.join(c, 'skills', 'caveman-setup'), { recursive: true });
  fs.writeFileSync(path.join(c, 'settings.json'), JSON.stringify({ env: { ANTHROPIC_BASE_URL: 'https://gw.example', ANTHROPIC_AUTH_TOKEN: 'x' } }));
  const out = run(h, 'audit');
  assert.match(out, /WARN\s+gateway/); assert.match(out, /WARN\s+secret/); assert.match(out, /WARN\s+cloud skills/);
  run(h, 'fix');
  assert.ok(fs.existsSync(path.join(c, 'skills.disabled', 'caveman-setup')));
});

test('codex and copilot targets', () => {
  const h = tmp(); const repo = tmp();
  run(h, 'install', '--tool', 'codex'); run(h, 'install', '--tool', 'copilot', '--repo', repo);
  assert.ok(fs.existsSync(path.join(h, '.codex', 'AGENTS.md')));
  assert.ok(fs.existsSync(path.join(repo, '.github', 'copilot-instructions.md')));
});

test('claude install skips duplicate rules and skill when ponytail plugin is on, keeps routing', () => {
  const h = tmp(); const c = path.join(h, '.claude');
  fs.mkdirSync(c, { recursive: true });
  fs.writeFileSync(path.join(c, 'settings.json'), JSON.stringify({ enabledPlugins: { 'ponytail@ponytail': true } }));
  run(h, 'install', '--tool', 'claude');
  const md = fs.readFileSync(path.join(c, 'CLAUDE.md'), 'utf8');
  assert.ok(md.includes('Model routing') && !md.includes('Token-efficient working rules'));
  assert.equal(fs.existsSync(path.join(c, 'skills', 'ponytail')), false);
  run(h, 'install', '--tool', 'claude', '--force');
  assert.ok(fs.readFileSync(path.join(c, 'CLAUDE.md'), 'utf8').includes('Token-efficient working rules'));
});

test('budget prints token estimates', () => assert.match(run(tmp(), 'budget'), /tokens each install adds/));

test('measure reports first-call context from a transcript', () => {
  const h = tmp(); const d = path.join(h, '.claude', 'projects', 'p'); fs.mkdirSync(d, { recursive: true });
  const row = (n) => JSON.stringify({ type: 'assistant', timestamp: '2026-10-12T10:00:00Z', message: { usage: { input_tokens: 0, cache_read_input_tokens: n, cache_creation_input_tokens: 100 } } });
  fs.writeFileSync(path.join(d, 'abcdef123.jsonl'), [row(500), row(900)].join('\n'));
  assert.match(run(h, 'measure'), /first-call\s+600\s+calls\s+2/);
});

test('setup --yes installs claude, records baseline, reports added tokens', () => {
  const h = tmp(); fs.mkdirSync(path.join(h, '.claude'), { recursive: true });
  const out = run(h, 'setup', '--yes');
  assert.match(out, /Always-loaded tokens added by this setup: [1-9]\d*/);
  assert.match(out, /Reply with exactly one word: ok/);
  assert.ok(fs.readFileSync(path.join(h, '.claude', 'CLAUDE.md'), 'utf8').includes('Model routing'));
});

test('setup respects --max-added cap and never installs when over it', () => {
  const h = tmp(); fs.mkdirSync(path.join(h, '.claude'), { recursive: true });
  const out = run(h, 'setup', '--yes', '--max-added', '10');
  assert.match(out, /skip claude/);
  assert.equal(fs.existsSync(path.join(h, '.claude', 'CLAUDE.md')), false);
});

test('setup without --yes and without a terminal answer installs nothing', () => {
  const h = tmp(); fs.mkdirSync(path.join(h, '.claude'), { recursive: true });
  const out = execFileSync('node', [kit, 'setup'], { env: { ...process.env, KIT_HOME: h }, encoding: 'utf8', input: '' });
  assert.equal(fs.existsSync(path.join(h, '.claude', 'CLAUDE.md')), false);
  assert.match(out, /added by this setup: 0/);
});

test('inspect ranks waste: unused plugin, duplicate skill, big CLAUDE.md, oversized description', () => {
  const h = tmp(); const c = path.join(h, '.claude'); const proj = tmp();
  const skill = (dir, name, desc) => { fs.mkdirSync(path.join(dir, name), { recursive: true }); fs.writeFileSync(path.join(dir, name, 'SKILL.md'), `---\nname: ${name}\ndescription: ${desc}\n---\nbody\n`); };
  skill(path.join(c, 'skills'), 'dup', 'x'.repeat(700));
  const v = path.join(c, 'plugins', 'cache', 'mk', 'big', '1.0.0');
  for (let i = 0; i < 60; i++) skill(path.join(v, 'skills'), i === 0 ? 'dup' : `s${i}`, 'does something useful for planning and review '.repeat(3));
  fs.writeFileSync(path.join(c, 'settings.json'), JSON.stringify({ enabledPlugins: { 'big@mk': true } }));
  fs.writeFileSync(path.join(c, 'CLAUDE.md'), 'rule\n'.repeat(3000));
  const proc = path.join(c, 'projects', 'p'); fs.mkdirSync(proc, { recursive: true });
  fs.writeFileSync(path.join(proc, 'a.jsonl'), '{"type":"user"}\n'.repeat(1));
  for (let i = 0; i < 25; i++) fs.writeFileSync(path.join(proc, `s${i}.jsonl`), '{"type":"user"}\n');
  const out = execFileSync('node', [kit, 'inspect', '--tool', 'claude', '--repo', proj], { env: { ...process.env, KIT_HOME: h }, encoding: 'utf8' });
  assert.match(out, /plugin big@mk: 60 skills/);
  assert.match(out, /plugin big@mk costs .* never used/);
  assert.match(out, /duplicate skill name "dup"/);
  assert.match(out, /~\/\.claude\/CLAUDE\.md is \d+ tokens/);
  assert.match(out, /oversized skill descriptions/);
});

test('inspect covers codex and copilot files', () => {
  const h = tmp(); const repo = tmp(); fs.mkdirSync(path.join(repo, '.github'), { recursive: true });
  fs.writeFileSync(path.join(repo, '.github', 'copilot-instructions.md'), 'rule\n'.repeat(2000));
  const out = execFileSync('node', [kit, 'inspect', '--tool', 'copilot', '--repo', repo], { env: { ...process.env, KIT_HOME: h }, encoding: 'utf8' });
  assert.match(out, /copilot-instructions\.md is \d+ tokens and is sent with every request/);
});
