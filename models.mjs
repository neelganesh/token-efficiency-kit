// models: list models live (Claude) and set defaults. OPTIONAL and isolated: delete this file to keep the kit fully offline.
// Network use: one GET to Anthropic's documented /v1/models, only with --live and after you confirm. The key is read from
// the ANTHROPIC_API_KEY environment variable only; it is never stored, printed or sent anywhere else.
import fs from 'node:fs';
import path from 'node:path';

const API = process.env.KIT_ANTHROPIC_URL || 'https://api.anthropic.com';
const FAMILIES = ['fable', 'opus', 'sonnet', 'haiku'];
const rd = (p) => { try { return fs.readFileSync(p, 'utf8'); } catch { return ''; } };

export async function listAnthropic(key) {
  const host = new URL(API).hostname;
  if (!['api.anthropic.com', '127.0.0.1', 'localhost'].includes(host)) throw new Error(`refusing to send a key to ${host}`);
  const out = []; let after = null;
  for (let i = 0; i < 5; i++) {
    const u = new URL('/v1/models', API);
    u.searchParams.set('limit', '100');
    if (after) u.searchParams.set('after_id', after);
    const res = await fetch(u, { headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' }, redirect: 'error', signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`models API returned HTTP ${res.status}`);
    const j = await res.json();
    out.push(...(j.data || []).map((m) => ({ id: m.id, name: m.display_name || m.id })));
    if (!j.has_more) break;
    after = j.last_id;
  }
  return out;
}

// the API lists newest first, so the first match per family is the newest
export const newestByFamily = (models) => Object.fromEntries(FAMILIES.map((f) => [f, models.find((m) => m.id.includes(f))]).filter(([, m]) => m));

function save(file, obj, dry, log) {
  if (dry) return log(`[dry-run] write ${file}`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (fs.existsSync(file) && !fs.existsSync(file + '.pre-token-kit')) fs.copyFileSync(file, file + '.pre-token-kit');
  fs.writeFileSync(file, JSON.stringify(obj, null, 2) + '\n');
  log(`wrote ${file} (backup: ${file}.pre-token-kit if it existed)`);
}
function loadJson(file) { const t = rd(file); if (!t) return {}; try { return JSON.parse(t); } catch { throw new Error(`${file} is not plain JSON; edit it by hand`); } }

async function claude({ HOME, args, log, ask, say }) {
  const flag = (f) => args.includes(f);
  const file = path.join(HOME, '.claude', 'settings.json');
  const s = loadJson(file); s.env ||= {};
  if (s.env.ANTHROPIC_BASE_URL) return log(`skip: ANTHROPIC_BASE_URL is set (${s.env.ANTHROPIC_BASE_URL}); a gateway may not accept these model names`);
  log(`current: model=${s.model || '(default)'} subagent=${s.env.CLAUDE_CODE_SUBAGENT_MODEL || '(inherit)'}`);
  let main = 'sonnet', sub = 'haiku';
  if (flag('--live')) {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) return log('--live needs ANTHROPIC_API_KEY in your environment (the kit never reads keys from files). Without --live the aliases below are already dynamic.');
    if (!(await ask(`Send ONE read-only request (GET /v1/models) to ${new URL(API).host} using ANTHROPIC_API_KEY from your environment?`))) return log('cancelled, nothing sent');
    const models = await listAnthropic(key);
    const fam = newestByFamily(models);
    log(`${models.length} models available to this key. Newest per family:`);
    for (const [f, m] of Object.entries(fam)) log(`  ${f.padEnd(7)} ${m.id}  (${m.name})`);
    if (!flag('--yes')) {
      log('Aliases (sonnet, opus, haiku) always resolve to the newest model, so they never go stale. Pinning a full ID freezes it.');
      main = (await say(`Main model [${main}] (alias or full ID):`)) || main;
      sub = (await say(`Subagent model [${sub}] (alias or full ID):`)) || sub;
    }
  }
  const valid = (v) => /^[A-Za-z0-9._\-[\]]+$/.test(v);
  if (!valid(main) || !valid(sub)) return log('invalid model name; nothing written');
  if (!(await ask(`Set model=${main} and CLAUDE_CODE_SUBAGENT_MODEL=${sub} in ${file}?`))) return log('nothing written');
  s.model = main; s.env.CLAUDE_CODE_SUBAGENT_MODEL = sub;
  save(file, s, flag('--dry-run'), log);
  log('Applies to NEW sessions. Check with /model, then measure.');
}

async function copilot({ HOME, args, log, ask, say }) {
  const opt = (f) => { const i = args.indexOf(f); return i > -1 ? args[i + 1] : null; };
  const file = path.join(process.env.COPILOT_HOME || path.join(HOME, '.copilot'), 'settings.json');
  const s = loadJson(file);
  log(`current Copilot CLI model: ${s.model || '(default)'}`);
  log('GitHub documents no API to list the models of your plan, so the kit will not guess one. Run /model in Copilot CLI to see yours (IDs such as claude-sonnet-5.5, or auto), then give one here.');
  let id = opt('--model');
  if (!id && !args.includes('--yes')) id = await say('Model ID to set (or auto):');
  if (!id) return log('no model given; nothing written');
  if (!/^[A-Za-z0-9._\-*]+$/.test(id)) return log('invalid model ID; nothing written');
  if (!(await ask(`Set model=${id} in ${file}? (VS Code Copilot Chat uses its model picker; this file is for Copilot CLI)`))) return log('nothing written');
  s.model = id;
  save(file, s, args.includes('--dry-run'), log);
  log('Repo-wide allowlists (.github/allowed_models.txt) and managed defaults are admin policy; this command does not touch them.');
}

export async function modelsSetup(ctx) {
  const { args, say, log } = ctx;
  let tool = args.includes('--tool') ? args[args.indexOf('--tool') + 1] : null;
  if (!tool && !args.includes('--yes')) tool = (await say('Which tool? claude or copilot:')).toLowerCase();
  if (tool === 'claude') return claude(ctx);
  if (tool === 'copilot') return copilot(ctx);
  log('usage: node kit.mjs models --tool claude|copilot [--live] [--model ID] [--yes] [--dry-run]');
}
