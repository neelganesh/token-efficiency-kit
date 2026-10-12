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

test('audit flags gateway, plaintext key, cloud skills; fix moves cloud skills', () => {
  const h = tmp(); const c = path.join(h, '.claude');
  fs.mkdirSync(path.join(c, 'skills', 'caveman-setup'), { recursive: true });
  fs.writeFileSync(path.join(c, 'settings.json'), JSON.stringify({ env: { ANTHROPIC_BASE_URL: 'https://gw.example', ANTHROPIC_AUTH_TOKEN: 'x' } }));
  const out = run(h, 'audit');
  assert.match(out, /WARN\s+gateway/); assert.match(out, /WARN\s+secret/); assert.match(out, /WARN\s+cloud skills/);
  run(h, 'fix');
  assert.ok(fs.existsSync(path.join(c, 'skills.disabled', 'caveman-setup')));
});

test('measure reports first-call context from a transcript', () => {
  const h = tmp(); const d = path.join(h, '.claude', 'projects', 'p'); fs.mkdirSync(d, { recursive: true });
  const row = (n) => JSON.stringify({ type: 'assistant', timestamp: '2026-10-12T10:00:00Z', message: { usage: { input_tokens: 0, cache_read_input_tokens: n, cache_creation_input_tokens: 100 } } });
  fs.writeFileSync(path.join(d, 'abcdef123.jsonl'), [row(500), row(900)].join('\n'));
  assert.match(run(h, 'measure'), /first-call\s+600\s+calls\s+2/);
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

test('rtk --slim removes only the RTK block, keeps user text, backs up', () => {
  const repo = tmp(); const f = path.join(repo, '.github', 'copilot-instructions.md');
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, 'my rule\n\n<!-- rtk-instructions v2 -->\nAlways prefix with rtk\n<!-- /rtk-instructions -->\n\nmore\n');
  const out = run(tmp(), 'rtk', '--slim', '--yes', '--repo', repo);
  const t = fs.readFileSync(f, 'utf8');
  assert.match(out, /removed RTK instruction block/);
  assert.ok(t.includes('my rule') && t.includes('more') && !t.includes('rtk-instructions'));
  assert.ok(fs.existsSync(f + '.pre-token-kit'));
});

test('rtk --check without rtk on PATH reports FAIL and does not crash', () => {
  const empty = tmp();
  const out = execFileSync(process.execPath, [kit, 'rtk', '--check', '--repo', tmp()], { env: { KIT_HOME: tmp(), PATH: empty, Path: empty }, encoding: 'utf8' });
  assert.match(out, /FAIL\s+binary/);
  assert.match(out, /Live check/);
});

import http from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execP = promisify(execFile);
const runAsync = (home, env, ...a) => execP(process.execPath, [kit, ...a], { env: { ...process.env, KIT_HOME: home, ...env }, encoding: 'utf8' });

test('models --live lists newest per family from a local server and sets aliases; key never printed', async () => {
  let seenKey = null;
  const srv = http.createServer((req, res) => {
    seenKey = req.headers['x-api-key'];
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ data: [{ id: 'claude-opus-9', display_name: 'Opus 9' }, { id: 'claude-sonnet-9', display_name: 'Sonnet 9' }, { id: 'claude-haiku-9', display_name: 'Haiku 9' }, { id: 'claude-sonnet-8', display_name: 'Sonnet 8' }], has_more: false }));
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const h = tmp();
  try {
    const { stdout } = await runAsync(h, { ANTHROPIC_API_KEY: 'sk-test-secret', KIT_ANTHROPIC_URL: `http://127.0.0.1:${srv.address().port}` }, 'models', '--tool', 'claude', '--live', '--yes');
    assert.match(stdout, /sonnet\s+claude-sonnet-9/);
    assert.ok(!stdout.includes('sk-test-secret'));
    assert.equal(seenKey, 'sk-test-secret');
    const s = JSON.parse(fs.readFileSync(path.join(h, '.claude', 'settings.json'), 'utf8'));
    assert.equal(s.model, 'sonnet'); assert.equal(s.env.CLAUDE_CODE_SUBAGENT_MODEL, 'haiku');
  } finally { srv.close(); }
});

test('models --live without a key and models with a gateway write nothing', async () => {
  const h = tmp();
  const a = await runAsync(h, { ANTHROPIC_API_KEY: '' }, 'models', '--tool', 'claude', '--live', '--yes');
  assert.match(a.stdout, /needs ANTHROPIC_API_KEY/);
  assert.equal(fs.existsSync(path.join(h, '.claude', 'settings.json')), false);
  fs.mkdirSync(path.join(h, '.claude'), { recursive: true });
  fs.writeFileSync(path.join(h, '.claude', 'settings.json'), JSON.stringify({ env: { ANTHROPIC_BASE_URL: 'https://gw.example' } }));
  const b = await runAsync(h, {}, 'models', '--tool', 'claude', '--yes');
  assert.match(b.stdout, /skip: ANTHROPIC_BASE_URL/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(h, '.claude', 'settings.json'), 'utf8')).model, undefined);
});

test('models --live refuses to send a key to a non-Anthropic host', async () => {
  await assert.rejects(runAsync(tmp(), { ANTHROPIC_API_KEY: 'k', KIT_ANTHROPIC_URL: 'https://evil.example' }, 'models', '--tool', 'claude', '--live', '--yes'), /refusing to send a key/);
});

test('copilot model is written to settings.json with a backup; bad IDs rejected', async () => {
  const h = tmp(); const f = path.join(h, '.copilot', 'settings.json');
  fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify({ theme: 'x' }));
  await runAsync(h, { COPILOT_HOME: '' }, 'models', '--tool', 'copilot', '--model', 'gpt-6-luna', '--yes');
  const s = JSON.parse(fs.readFileSync(f, 'utf8'));
  assert.equal(s.model, 'gpt-6-luna'); assert.equal(s.theme, 'x');
  assert.ok(fs.existsSync(f + '.pre-token-kit'));
  const bad = await runAsync(h, { COPILOT_HOME: '' }, 'models', '--tool', 'copilot', '--model', 'a b;rm', '--yes');
  assert.match(bad.stdout, /invalid model ID/);
});

