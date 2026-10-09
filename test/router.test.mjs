// Offline check of routing, retry/escalation policy and the secret gate. No LLM calls.
// Run: node --test test/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CLI = path.resolve(import.meta.dirname, '..', 'router', 'router.mjs');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'router-test-'));
const env = { ...process.env, ROUTER_HOME: path.join(dir, '.home') }; // isolate from the real ~/.claude/router
const run = (...a) => spawnSync('node', [CLI, ...a], { cwd: dir, encoding: 'utf8', env });
const json = r => JSON.parse(r.stdout);
const card = c => fs.writeFileSync(path.join(dir, '.router', 'tasks', `${c.id}.json`), JSON.stringify(c));
spawnSync('git', ['init', '-q'], { cwd: dir });

test('init creates config', () => {
  const r = run('init', '--profile', 'code', '--stack', 'python');
  assert.equal(r.status, 0, r.stderr);
  assert.equal(json(r).config.mode, 'normal');
  assert.ok(fs.readFileSync(path.join(dir, 'CLAUDE.md'), 'utf8').includes('<!-- router -->'));
  // fixed provider map so tests don't depend on the live one (project file wins over global)
  const t = n => ({ model: `m${n}` });
  fs.writeFileSync(path.join(dir, '.router', 'providers.json'), JSON.stringify({
    codex: { T1: t(1), T2: t(2), T3: t(3) }, gemini: { T1: t(1), T2: t(2), T3: t(3) },
    claude: { T1: 'haiku', orchestrator: 'sonnet', T4: 'opus', T5: 'fable' },
    prefer: { code: ['codex', 'gemini'], docs: ['gemini', 'codex'], creative: ['gemini', 'codex'] } }));
});

test('card without acceptance criteria is refused', () => {
  card({ id: 'c0', type: 'implement', files: ['a.py'], acceptance_criteria: [] });
  assert.notEqual(run('route', 'c0').status, 0);
});

test('routing: tiers, secrets, risk, classifier flag', () => {
  card({ id: 'c1', type: 'implement', difficulty: 0.4, files: ['a.py'], acceptance_criteria: ['x'] });
  let r = json(run('route', 'c1'));
  assert.equal(r.tier, 'T2'); assert.equal(r.executor, 'codex'); assert.equal(r.judge.by, 'claude');

  card({ id: 'c2', type: 'implement', difficulty: 0.4, files: ['a.py', 'b.py', 'c.py', 'd.py'], acceptance_criteria: ['x'] });
  assert.equal(json(run('route', 'c2')).tier, 'T3');

  card({ id: 'c3', type: 'implement', difficulty: 0.3, files: ['.env'], acceptance_criteria: ['x'] });
  r = json(run('route', 'c3')); assert.equal(r.executor, 'claude');

  card({ id: 'c4', type: 'implement', difficulty: 0.3, title: 'fix login flow', files: ['a.py'], acceptance_criteria: ['x'] });
  r = json(run('route', 'c4')); assert.equal(r.tier, 'T3'); assert.equal(r.judge.model, 'opus');

  card({ id: 'c5', type: 'write', files: ['lore/a.md'], acceptance_criteria: ['x'] });
  r = json(run('route', 'c5')); assert.equal(r.needs_classifier, true); assert.equal(r.executor, 'gemini');

  card({ id: 'c6', type: 'architecture', difficulty: 0.9, files: ['a.py'], acceptance_criteria: ['x'] });
  r = json(run('route', 'c6')); assert.equal(r.executor, 'claude'); assert.equal(r.model, 'opus');
});

test('eco mode keeps production at T1-T2 and never uses opus', () => {
  run('mode', 'eco');
  card({ id: 'e1', type: 'trivial', difficulty: 0.1, files: ['a.py'], acceptance_criteria: ['x'] });
  assert.equal(json(run('route', 'e1')).tier, 'T1');
  card({ id: 'e2', type: 'architecture', difficulty: 0.9, files: ['a.py'], acceptance_criteria: ['x'] });
  assert.equal(json(run('route', 'e2')).model, 'sonnet');
  run('mode', 'normal');
});

test('fail twice in normal -> escalate and auto-switch task to senior', () => {
  card({ id: 'n1', type: 'implement', difficulty: 0.4, files: ['a.py'], acceptance_criteria: ['x'] });
  run('route', 'n1');
  assert.equal(json(run('next', 'n1', '--verdict', 'fail', '--notes', 'a')).action, 'retry');
  const r = json(run('next', 'n1', '--verdict', 'fail', '--notes', 'b'));
  assert.equal(r.action, 'escalate'); assert.equal(r.mode, 'senior'); assert.equal(r.min_tier, 'T3');
  const r2 = json(run('route', 'n1'));
  assert.equal(r2.tier, 'T3'); assert.equal(r2.executor, 'gemini'); // avoids the failed executor
  run('next', 'n1', '--verdict', 'fail'); const r3 = json(run('next', 'n1', '--verdict', 'fail'));
  assert.equal(r3.min_tier, 'T4');
  assert.equal(json(run('route', 'n1')).executor, 'claude');
});

test('free pool is skipped when no free-tier key is set', () => {
  const p = path.join(dir, '.router', 'providers.json'); const prov = JSON.parse(fs.readFileSync(p, 'utf8'));
  prov.free = { T2: { model: 'free-t2' } }; prov.free_pool = { 'free-t2': [{ model: 'x/y', key: 'ROUTER_TEST_NO_SUCH_KEY' }] };
  prov.prefer.code = ['free', 'codex']; fs.writeFileSync(p, JSON.stringify(prov));
  card({ id: 'f1', type: 'implement', difficulty: 0.4, files: ['a.py'], acceptance_criteria: ['x'] });
  assert.equal(json(run('route', 'f1')).executor, 'codex');
  const env2 = { ...env, ROUTER_TEST_NO_SUCH_KEY: 'k' };
  const r = JSON.parse(spawnSync('node', [CLI, 'route', 'f1'], { cwd: dir, encoding: 'utf8', env: env2 }).stdout);
  assert.equal(r.executor, 'free'); assert.equal(r.model, 'free-t2');
});

test('apply-blocks: edit, create, tolerate trailing spaces, refuse out-of-scope and bad SEARCH', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'router-blocks-'));
  fs.writeFileSync(path.join(d, 'a.py'), 'def f():  \r\n    return 1\r\n');
  const apply = (text, files) => spawnSync('node', [CLI, 'apply-blocks', '--files', files], { cwd: d, encoding: 'utf8', input: text, env });
  const ok = apply('Sure:\n```\na.py\n<<<<<<< SEARCH\ndef f():\n    return 1\n=======\ndef f():\n    return 2\n>>>>>>> REPLACE\n```\nnew.py\n<<<<<<< SEARCH\n=======\nx = 1\n>>>>>>> REPLACE\nSUMMARY: done', 'a.py,new.py');
  assert.equal(ok.status, 0, ok.stdout + ok.stderr);
  assert.equal(fs.readFileSync(path.join(d, 'a.py'), 'utf8'), 'def f():\r\n    return 2\r\n'); // CRLF kept
  assert.equal(fs.readFileSync(path.join(d, 'new.py'), 'utf8'), 'x = 1\n');
  const bad = apply('b.py\n<<<<<<< SEARCH\n=======\nevil\n>>>>>>> REPLACE\na.py\n<<<<<<< SEARCH\nnope\n=======\nx\n>>>>>>> REPLACE', 'a.py');
  assert.equal(bad.status, 1);
  const r = JSON.parse(bad.stdout);
  assert.equal(r.errors.length, 2); assert.ok(!fs.existsSync(path.join(d, 'b.py')));
});

test('executor prompt: kind-specific role and project guidelines from .router/prompts', () => {
  assert.ok(fs.existsSync(path.join(dir, '.router', 'prompts', 'code.md'))); // created by init
  fs.writeFileSync(path.join(dir, '.router', 'prompts', 'code.md'), '<!-- ignored -->\nUse type hints everywhere.');
  fs.writeFileSync(path.join(dir, '.router', 'prompts', 'general.md'), 'Write in Polish.');
  card({ id: 'p1', type: 'implement', files: ['a.py'], acceptance_criteria: ['x'] });
  card({ id: 'p2', type: 'analysis', files: ['report.md'], acceptance_criteria: ['x'] });
  const code = run('prompt', 'p1').stdout, gen = run('prompt', 'p2').stdout;
  assert.match(code, /senior software engineer/); assert.match(code, /Use type hints everywhere/); assert.doesNotMatch(code, /ignored|Polish/);
  assert.match(gen, /senior analyst/); assert.match(gen, /Write in Polish/); assert.doesNotMatch(gen, /type hints/);
});

test('secret scanner blocks a key in text', () => {
  const r = run('scan', '--text', `aws = "${'AKIA' + 'IOSFODNN7EXAMPLE'}"`);
  assert.equal(r.status, 3);
  assert.equal(run('scan', '--text', 'nothing to see').status, 0);
});

test('stats aggregates verdicts', () => {
  const s = json(run('stats'));
  assert.ok(s.routes >= 6 && s.events > 0);
});
