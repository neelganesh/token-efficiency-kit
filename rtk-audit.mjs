// rtk-audit: live, heuristic audit of a newer RTK release against the release this kit reviewed.
// Network: git only (ls-remote, and a read-only blobless clone into a temp folder). Nothing from the clone is built or run.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export const REPO = 'https://github.com/rtk-ai/rtk';
const KNOWN_HOSTS = ['github.com', 'raw.githubusercontent.com', 'crates.io', 'docs.rs', 'rust-lang.org', 'www.rust-lang.org', 'shields.io', 'img.shields.io', 'rtk-ai.app', 'www.rtk-ai.app', 'brew.sh', 'microsoft.com', 'learn.microsoft.com', 'json-schema.org', 'example.com'];
const SENSITIVE = /(^|\/)(build\.rs|install\.sh|install\.ps1|Formula\/.*|\.github\/workflows\/.*release.*|src\/core\/telemetry.*|hooks\/.*\.sh)$/;
const HOOKY = /^(src\/hooks\/|hooks\/)/;
const NOT_DEP = new Set(['name', 'version', 'edition', 'license', 'description', 'authors', 'repository', 'homepage', 'readme', 'keywords', 'categories', 'rust-version', 'default', 'path', 'opt-level', 'lto', 'codegen-units', 'panic', 'strip', 'debug', 'publish', 'include', 'exclude', 'features', 'resolver', 'members']);
const git = (cwd, a, o = {}) => spawnSync('git', a, { cwd, encoding: 'utf8', maxBuffer: 512 * 1024 * 1024, timeout: 300000, ...o });
const semver = (v) => v.split('.').map(Number);
const cmp = (a, b) => { const x = semver(a), y = semver(b); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i]; return 0; };

export function stableTags(lsRemote) {
  return [...new Set([...lsRemote.matchAll(/refs\/tags\/v(\d+\.\d+\.\d+)$/gm)].map((m) => m[1]))].sort((a, b) => cmp(b, a));
}

// scan the added lines of a unified diff for supply-chain signals
export function scanDiff(diff) {
  const high = [], medium = [];
  const hosts = new Set(), deps = new Set(), files = new Set();
  let cur = '';
  const exec = {}, unsafe = {}, tele = {};
  for (const line of diff.split('\n')) {
    const h = line.match(/^diff --git a\/(.+?) b\/(.+)$/);
    if (h) { cur = h[2]; files.add(cur); continue; }
    if (!line.startsWith('+') || line.startsWith('+++')) continue;
    const code = !/\.(md|txt)$/.test(cur) && !/(^|\/)(tests?|test_isolation)\/|_test\.rs$/.test(cur);
    if (code) for (const m of line.matchAll(/https?:\/\/([a-z0-9.-]+\.[a-z]{2,})/gi)) { const host = m[1].toLowerCase(); if (!KNOWN_HOSTS.some((k) => host === k || host.endsWith('.' + k))) hosts.add(`${host} (${cur})`); }
    if (cur.endsWith('Cargo.toml')) { const d = line.match(/^\+\s*([a-z0-9_-]+)\s*=\s*(\{|")/); if (d && !NOT_DEP.has(d[1])) deps.add(d[1]); }
    if (code && cur.endsWith('.rs')) {
      if (/Command::new|process::Command|\bspawn\(|"sh"\s*,\s*"-c"|powershell|cmd\.exe/.test(line)) exec[cur] = (exec[cur] || 0) + 1;
      if (/\bunsafe\b/.test(line)) unsafe[cur] = (unsafe[cur] || 0) + 1;
    }
    if (code && /telemetry|analytics|device_hash|posthog|sentry|mixpanel/i.test(line)) tele[cur] = (tele[cur] || 0) + 1;
  }
  const sens = [...files].filter((f) => SENSITIVE.test(f));
  if (hosts.size) high.push(`new network hosts in code: ${[...hosts].join(', ')}`);
  if (deps.size) high.push(`new or changed dependencies: ${[...deps].join(', ')}`);
  if (sens.length) high.push(`sensitive files changed: ${sens.join(', ')}`);
  const teleFiles = Object.keys(tele);
  if (teleFiles.length) high.push(`telemetry-related lines added in: ${teleFiles.join(', ')}`);
  const hooks = [...files].filter((f) => HOOKY.test(f));
  if (hooks.length) medium.push(`hook/init code changed (${hooks.length} files): review what is written to your agent config`);
  if (Object.keys(exec).length) medium.push(`process-spawning lines added in: ${Object.keys(exec).join(', ')}`);
  if (Object.keys(unsafe).length) medium.push(`unsafe lines added in: ${Object.keys(unsafe).join(', ')}`);
  return { verdict: high.length ? 'REVIEW' : 'CLEAN', high, medium, filesChanged: files.size, sensitiveFiles: sens };
}

export function auditRelease({ base, tag, log }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rtk-audit-'));
  log(`cloning ${REPO} (read-only, blobless) into ${dir} ...`);
  const c = git(dir, ['clone', '--bare', '--filter=blob:none', '--quiet', REPO, 'r.git']);
  if (c.status !== 0) return { verdict: 'ERROR', high: [`clone failed: ${(c.stderr || '').trim().slice(0, 200)}`], medium: [], dir };
  const repo = path.join(dir, 'r.git');
  const diff = git(repo, ['diff', '-U0', `v${base}`, `v${tag}`, '--', '.', ':(exclude)*.md', ':(exclude)Cargo.lock']);
  if (diff.status !== 0) return { verdict: 'ERROR', high: [`diff failed: ${(diff.stderr || '').trim().slice(0, 200)}`], medium: [], dir };
  const r = scanDiff(diff.stdout);
  const sensitive = [];
  for (const chunk of diff.stdout.split(/^(?=diff --git )/m)) {
    const f = (chunk.match(/^diff --git a\/.+? b\/(.+)$/m) || [])[1] || '';
    if (SENSITIVE.test(f) || HOOKY.test(f) || f.endsWith('Cargo.toml')) sensitive.push(chunk);
  }
  fs.writeFileSync(path.join(dir, 'sensitive.diff'), sensitive.join('\n'));
  const report = `# RTK ${base} -> ${tag} heuristic audit\n\nVerdict: **${r.verdict}**\n\nFiles changed: ${r.filesChanged}\n\n## High-signal flags\n${r.high.map((x) => `- ${x}`).join('\n') || '- none'}\n\n## Medium flags\n${r.medium.map((x) => `- ${x}`).join('\n') || '- none'}\n\nRead \`sensitive.diff\` (${sensitive.length} hunks: hooks, build, install, telemetry, Cargo.toml) before trusting any verdict. This is a heuristic, not a security review.\n`;
  fs.writeFileSync(path.join(dir, 'report.md'), report);
  return { ...r, dir, base, tag };
}
