import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const kit = path.join(path.dirname(fileURLToPath(import.meta.url)), 'kit.mjs');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'kit-'));
const run = (home, input, ...a) => execFileSync(process.execPath, [kit, ...a], { env: { ...process.env, KIT_HOME: home }, encoding: 'utf8', input });
const setup = (home, repo, ...a) => run(home, undefined, 'setup', '--yes', '--repo', repo, ...a);
const withRepo = () => { const h = tmp(), r = tmp(); fs.mkdirSync(path.join(h, '.claude'), { recursive: true }); return [h, r]; };
const claudeMd = (h) => fs.readFileSync(path.join(h, '.claude', 'CLAUDE.md'), 'utf8');

test('rules go to every selected IDE target; header, owned marker and idempotence', () => {
  const [h, r] = withRepo();
  setup(h, r, '--components', 'rules', '--targets', 'claude,codex,copilot,cursor,windsurf,cline,agents-md');
  for (const f of ['.github/copilot-instructions.md', '.cursor/rules/token-kit.mdc', '.windsurf/rules/token-kit.md', '.clinerules/token-kit.md', 'AGENTS.md']) assert.ok(fs.existsSync(path.join(r, f)), f);
  assert.ok(fs.existsSync(path.join(h, '.codex', 'AGENTS.md')));
  const mdc = fs.readFileSync(path.join(r, '.cursor/rules/token-kit.mdc'), 'utf8');
  assert.ok(mdc.startsWith('---\ndescription') && mdc.includes('alwaysApply: true') && mdc.includes('token-kit:owned'));
  const before = claudeMd(h);
  setup(h, r, '--components', 'rules', '--targets', 'claude');
  assert.equal(claudeMd(h), before);
});

test('dry-run writes nothing and records nothing', () => {
  const [h, r] = withRepo();
  setup(h, r, '--components', 'rules,orchestration', '--targets', 'claude,copilot', '--dry-run');
  assert.equal(fs.existsSync(path.join(h, '.claude', 'CLAUDE.md')), false);
  assert.equal(fs.existsSync(path.join(h, '.token-kit')), false);
  assert.equal(fs.existsSync(path.join(r, '.github')), false);
});

test('orchestration is optional: absent by default, present with the component, separate marker', () => {
  const [h, r] = withRepo();
  setup(h, r, '--components', 'rules', '--targets', 'claude');
  assert.equal(fs.existsSync(path.join(h, '.claude', 'agents', 'opus-reviewer.md')), false);
  assert.ok(!claudeMd(h).includes('Model routing'));
  setup(h, r, '--components', 'orchestration');
  const md = claudeMd(h);
  assert.ok(md.includes('Model routing') && md.includes('token-kit-routing:start') && md.includes('Token-efficient working rules'));
  assert.ok(fs.existsSync(path.join(h, '.claude', 'agents', 'opus-reviewer.md')));
});

test('ponytail plugin on: rules and skill skipped, orchestration still installed', () => {
  const [h, r] = withRepo();
  fs.writeFileSync(path.join(h, '.claude', 'settings.json'), JSON.stringify({ enabledPlugins: { 'ponytail@ponytail': true } }));
  setup(h, r, '--components', 'rules,ponytail,orchestration', '--targets', 'claude');
  const md = claudeMd(h);
  assert.ok(md.includes('Model routing') && !md.includes('Token-efficient working rules'));
  assert.equal(fs.existsSync(path.join(h, '.claude', 'skills', 'ponytail')), false);
});

test('skills are opt-in and installed on request', () => {
  const [h, r] = withRepo();
  setup(h, r, '--components', 'ponytail,caveman');
  assert.ok(fs.existsSync(path.join(h, '.claude', 'skills', 'ponytail', 'SKILL.md')));
  assert.ok(fs.existsSync(path.join(h, '.claude', 'skills', 'caveman', 'SKILL.md')));
});

test('token cap refuses and writes nothing', () => {
  const [h, r] = withRepo();
  const out = setup(h, r, '--components', 'rules,orchestration', '--targets', 'claude', '--max-added', '10');
  assert.match(out, /refusing: claude/);
  assert.equal(fs.existsSync(path.join(h, '.claude', 'CLAUDE.md')), false);
});

test('without --yes and with no answers (closed stdin) nothing is installed', () => {
  const [h, r] = withRepo();
  const out = run(h, '', 'setup', '--repo', r);
  assert.match(out, /nothing changed/);
  assert.equal(fs.existsSync(path.join(h, '.claude', 'CLAUDE.md')), false);
});

test('checkbox menu: typed numbers toggle items and drive the install', () => {
  const [h, r] = withRepo(); fs.mkdirSync(path.join(r, '.cursor'), { recursive: true });
  const out = run(h, '2\n\n\ny\n', 'setup', '--repo', r);
  assert.match(out, /\[x\] 2\. Agentic orchestration/);
  assert.ok(fs.existsSync(path.join(r, '.cursor', 'rules', 'token-kit.mdc')));
  assert.ok(fs.existsSync(path.join(h, '.claude', 'agents', 'opus-reviewer.md')));
});

test('first backup holds the user original, not our own write', () => {
  const [h, r] = withRepo();
  fs.writeFileSync(path.join(h, '.claude', 'CLAUDE.md'), 'my own rules\n');
  setup(h, r, '--components', 'rules,orchestration', '--targets', 'claude', '--force');
  assert.equal(fs.readFileSync(path.join(h, '.claude', 'CLAUDE.md.pre-token-kit'), 'utf8'), 'my own rules\n');
});

test('log lists changes; uninstall removes ours and keeps user content and edited files', () => {
  const [h, r] = withRepo();
  const f = path.join(h, '.claude', 'CLAUDE.md'); fs.writeFileSync(f, 'my own rules\n');
  setup(h, r, '--components', 'rules,orchestration,ponytail', '--targets', 'claude', '--force');
  assert.match(run(h, undefined, 'log'), /CLAUDE\.md/);
  fs.appendFileSync(path.join(h, '.claude', 'skills', 'ponytail', 'SKILL.md'), '\nmy edit\n');
  const out = run(h, undefined, 'uninstall');
  const t = fs.readFileSync(f, 'utf8');
  assert.ok(t.includes('my own rules') && !t.includes('token-kit'));
  assert.equal(fs.existsSync(path.join(h, '.claude', 'agents', 'opus-reviewer.md')), false);
  assert.ok(fs.existsSync(path.join(h, '.claude', 'skills', 'ponytail', 'SKILL.md')));
  assert.match(out, /left alone/);
});

test('components prints valid JSON with detection', () => {
  const [h, r] = withRepo(); fs.mkdirSync(path.join(r, '.windsurf'), { recursive: true });
  const j = JSON.parse(run(h, undefined, 'components', '--repo', r));
  assert.deepEqual(j.components.map((c) => c.id), ['rules', 'orchestration', 'ponytail', 'caveman', 'rtk', 'cleanup']);
  assert.equal(j.targets.find((t) => t.id === 'claude').detected, true);
  assert.equal(j.targets.find((t) => t.id === 'windsurf').detected, true);
  assert.equal(j.targets.find((t) => t.id === 'cline').detected, false);
});

test('RTK diff scanner flags supply-chain signals and ignores tests and docs', async () => {
  const { scanDiff, stableTags } = await import('./rtk-audit.mjs');
  const bad = 'diff --git a/build.rs b/build.rs\n+fn main(){}\ndiff --git a/Cargo.toml b/Cargo.toml\n+shady-crate = "1"\ndiff --git a/src/x.rs b/src/x.rs\n+let u = "https://evil.example/collect";\n+Command::new("sh");\n';
  const r = scanDiff(bad);
  assert.equal(r.verdict, 'REVIEW');
  assert.ok(r.high.some((x) => x.includes('evil.example')) && r.high.some((x) => x.includes('shady-crate')) && r.high.some((x) => x.includes('build.rs')));
  assert.ok(r.medium.some((x) => x.includes('process-spawning')));
  const quiet = 'diff --git a/tests/a_test.rs b/tests/a_test.rs\n+let u = "https://example.test/x"; Command::new("sh"); unsafe {}\ndiff --git a/README.md b/README.md\n+see https://foo.example/x\n';
  assert.equal(scanDiff(quiet).verdict, 'CLEAN');
  assert.deepEqual(stableTags('a\trefs/tags/v0.9.0\nb\trefs/tags/v0.10.0\nc\trefs/tags/dev-0.11.0-rc.1\n'), ['0.10.0', '0.9.0']);
});

test('existing unmarked routing section is detected: no duplicate block, agent still installed', () => {
  const [h, r] = withRepo();
  fs.writeFileSync(path.join(h, '.claude', 'CLAUDE.md'), '# model routing\n- Main session Sonnet.\n');
  const out = setup(h, r, '--components', 'orchestration');
  assert.match(out, /routing block skipped/);
  assert.ok(!claudeMd(h).includes('token-kit-routing'));
  assert.ok(fs.existsSync(path.join(h, '.claude', 'agents', 'opus-reviewer.md')));
});

test('uninstall reports RTK hook and install recorded in the log, with how to remove them', () => {
  const [h] = withRepo();
  fs.mkdirSync(path.join(h, '.token-kit'), { recursive: true });
  fs.writeFileSync(path.join(h, '.token-kit', 'log.jsonl'),
    JSON.stringify({ ts: 't', action: 'rtk-install', file: 'winget install --id rtk-ai.rtk' }) + '\n' + JSON.stringify({ ts: 't', action: 'rtk-hook', file: '/r/.github/hooks/rtk-rewrite.json' }) + '\n');
  const out = run(h, undefined, 'uninstall', '--dry-run');
  assert.match(out, /rtk init --uninstall --copilot/);
  assert.match(out, /winget uninstall rtk-ai\.rtk/);
});

test('a crash prints a pointer to FALLBACK.md and exits non-zero', () => {
  const [h, r] = withRepo();
  const blocker = path.join(h, 'file'); fs.writeFileSync(blocker, 'x');
  let out = '', code = 0;
  try { out = run(blocker, undefined, 'setup', '--yes', '--components', 'rules', '--targets', 'claude', '--repo', r); } catch (e) { code = e.status; out = e.stdout; }
  assert.match(out, /FALLBACK\.md/);
  assert.equal(code, 1);
});
