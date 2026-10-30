#!/usr/bin/env node
'use strict';
// No dependencies. Search uses the actual asynchronous HTML engine, including
// memo collection and choice visibility. Replays never assign game state.
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const { load, extract, sample, hash, ROOT } = require('./lib/branchmap-model');
const { createRuntime } = require('./lib/reachability-engine');
const { certify } = require('./lib/reachability-proofs');

const M = load(), A = extract(M);
const FILE = path.join(ROOT, 'docs/obsidian/data/reachability.json');
const arg = name => process.argv.find(a => a.startsWith(`--${name}=`))?.split('=')[1];
const MAX_STATES = Number(arg('max-states') || 100000);
const MAX_KEY_BYTES = Number(arg('max-key-bytes') || 256 * 1024 * 1024);
assert(Number.isSafeInteger(MAX_STATES) && MAX_STATES > 0);
assert(Number.isSafeInteger(MAX_KEY_BYTES) && MAX_KEY_BYTES > 0);
const runtime = createRuntime(M);
const conditionKey = c => `${c.source.id}:${c.type}:${c.value}`;
const targets = sample(M, A).unseenConditions;
// Guard counters inside runScript are irrelevant only because the current
// label graphs have no cycles. Reject new cyclic content rather than merging
// different hidden guardN values at the same input position.
for (const script of A.scripts) {
  const active = new Set(), done = new Set();
  const visit = label => {
    assert(!active.has(label), `循環scriptには継続位置の拡張が必要: ${script.source.id}/${label}`);
    if (done.has(label) || !script.transitions[label]) return;
    active.add(label);
    for (const edge of script.transitions[label]) if (edge.target) visit(edge.target);
    active.delete(label); done.add(label);
  };
  visit('start');
}
const findings = {}, witnesses = {};
const byId = new Map(M.objects.map(([o, loc]) => [loc.id, o]));
const sources = { ...M.sources,
  'tools/prove-reachability.js': hash(fs.readFileSync(__filename, 'utf8')),
  'tools/lib/reachability-engine.js': hash(fs.readFileSync(path.join(__dirname, 'lib/reachability-engine.js'), 'utf8')),
  'tools/lib/reachability-proofs.js': hash(fs.readFileSync(path.join(__dirname, 'lib/reachability-proofs.js'), 'utf8')),
  'tools/lib/branchmap-model.js': hash(fs.readFileSync(path.join(__dirname, 'lib/branchmap-model.js'), 'utf8')) };

async function replay(id, actions, seenThreads = []) {
  let cursor = 0;
  const hits = new Set();
  const result = await runtime.run({ seenThreads,
    observed: c => hits.add(conditionKey(c)),
    input: event => {
      const action = actions[cursor++];
      assert(event.actions.some(a => JSON.stringify(a) === JSON.stringify(action)), `${id}: 再現列不一致 ${cursor}`);
      return action;
    },
  });
  assert.equal(cursor, actions.length, `${id}: 再現列が余った`);
  return { result, hits };
}

async function saveWitness(id, run) {
  const replayed = await replay(id, run.trace, run.seenThreads);
  assert.deepEqual(replayed.result, run, `${id}: 実エンジン再生の最終状態が不一致`);
  const { trace, ...rest } = run;
  witnesses[id] = { ...rest, actions: trace, replayVerified: true,
    evaluatedConditions: [...replayed.hits].sort(),
    choices: trace.filter(a => a.kind === 'choice').map(a => {
      const option = byId.get(a.option);
      return { source: a.option, text: option.t || runtime.ctx.actText(option) };
    }) };
  for (const c of targets) if (replayed.hits.has(conditionKey(c))) findings[conditionKey(c)] ||= id;
}

// Known sample paths are only witness candidates; every one is replayed through
// actual progression, and they do not contribute to exhaustive-search counts.
async function seedWitnesses() {
  for (const [key, w] of Object.entries(sample(M, A).witnesses)) {
    let cursor = 0;
    const run = await runtime.run({ seenThreads: w.seenThreads,
      input: e => {
        if (e.kind === 'memo') return e.actions[1];
        const wanted = w.choices[cursor++];
        const action = e.actions.find(a => a.option === wanted);
        assert(action, `${key} #${cursor}: wanted ${wanted}, shown ${JSON.stringify(e.actions)}`);
        return action;
      },
    });
    assert.equal(`${run.routeKey}/${run.ending}`, key);
    await saveWitness(key, run);
  }
  // Directed candidates for the rare alone combinations: djAt2=2 followed by
  // maximal late DJ replies. The choices still go through real input filtering.
  for (const highConnection of [true, false]) for (const highDJ of [true, false]) {
    let early = 0;
    const run = await runtime.run({ input: e => {
      if (e.kind === 'memo') return e.actions[1];
      const options = e.actions.map((a, i) => ({ a, o: byId.get(a.option), shown: e.pool[i] }));
      let candidates = options;
      if (runtime.ctx.G.seg?.type === 'dj') {
        const n = runtime.ctx.G.night;
        if (n <= 2) {
          const wanted = early++ === 0 ? 2 : 0;
          candidates = options.filter(({ o }) => o.dj === wanted);
        } else {
          const values = options.map(({ o }) => o.dj ?? 0);
          const wanted = (highDJ ? Math.max : Math.min)(...values);
          candidates = options.filter(({ o }) => (o.dj ?? 0) === wanted);
        }
      } else if (runtime.ctx.G.seg?.id === 'konbini') {
        candidates = options.filter(({ o }) => !o.set && ['near', 'far'].includes(o.k));
      } else {
        const good = o => o.k === 'just' || o.k === 'odd' && o.good !== false;
        candidates = options.filter(({ o }) => highConnection ? good(o) : ['near', 'far'].includes(o.k));
        if (highConnection) {
          const relevant = options.filter(({ o }) => [].concat(o.set || []).some(f => ['mother_letter', 'n4_bridge', 'sumie_coaster'].includes(f)));
          if (relevant.length) candidates = relevant;
        }
      }
      return (candidates[0] || options[0]).a;
    } });
    const key = `${run.routeKey}/${run.ending}`;
    if (!witnesses[key]) await saveWitness(key, run);
  }
}

async function lowerBound() {
  const w = witnesses['alone/C'];
  assert(w && w.actions.filter(a => a.kind === 'choice').every(a => !byId.get(a.option).memo));
  const memoBits = w.actions.filter(a => a.kind === 'memo').length;
  const last = new Map();
  w.actions.forEach((a, i) => {
    if (a.kind !== 'choice') return;
    const id = a.option.match(/#STORY\.visitors\.([^.]+)\.script\./)?.[1], o = byId.get(a.option);
    if (id && o.k && !o.free) last.set(id, i);
  });
  const effectFree = o => {
    if (!o || typeof o !== 'object') return true;
    if (!Array.isArray(o) && ['set', 'dj', 'cat', 'choice', 'acts'].some(k => k in o)) return false;
    return Object.values(o).every(effectFree);
  };
  const factors = [];
  for (const [id, index] of last) {
    const original = w.actions[index], options = byId.get(original.option.slice(0, original.option.lastIndexOf('.')));
    if (!effectFree(byId.get(original.option))) continue;
    const signatures = new Map();
    const otherState = state => {
      const copy = JSON.parse(JSON.stringify(state)); delete copy.meters[id]; delete copy.counts[id];
      return JSON.stringify(copy);
    };
    for (const option of options) {
      // Keep the memo bits independent of every selected counter variant.
      if (option.memo || !effectFree(option)) continue;
      const actions = w.actions.slice(); actions[index] = { kind: 'choice', option: M.locations.get(option).id };
      let run;
      try { run = (await replay(`lower-bound/${id}`, actions, w.seenThreads)).result; }
      catch (error) { if (error.code === 'ERR_ASSERTION') continue; throw error; }
      if (otherState(run.state) === otherState(w.state)) {
        const counter = { meter: run.state.meters[id], count: run.state.counts[id] };
        signatures.set(JSON.stringify(counter), { ...counter, option: M.locations.get(option).id });
      }
    }
    if (signatures.size > 1) factors.push({ visitor: id, variants: [...signatures.values()], replayVerified: true });
  }
  const minimumTerminalStates = 2 ** memoBits * 2 ** M.constants.DEEP_TIES.length * factors.reduce((n, f) => n * f.variants.length, 1);
  return { baseline: 'alone/C', memoBits, initialThreadSets: 2 ** M.constants.DEEP_TIES.length,
    counterFactors: factors, minimumTerminalStates,
    argument: '固定された通常カード列と全カウンタ差分にmemo必須カードがないため、各メモの回収／未回収は独立。末尾の無副作用カード差分は当該来訪者の距離／返答数以外の最終状態が同一であることを実エンジンで確認。過去の距離／返答数は後続のゲーム判定に読まれず（結果だけが読まれる）、来訪者は再来しないので差分を直積にできる。既読糸64集合は進行の最後の表示選択だけに影響する。これは全状態数ではなく、厳密状態の終端数の構成的な下限。' };
}

async function search() {
  const PRUNE = {}, LIMIT = {};
  const seen = new Set();
  // Every initial persistent-thread subset; order is irrelevant to includes().
  const roots = Array.from({ length: 2 ** M.constants.DEEP_TIES.length }, (_, mask) =>
    M.constants.DEEP_TIES.filter((_, i) => mask & (1 << i)));
  const pending = roots.slice().reverse().map(seenThreads => ({ actions: [], seenThreads }));
  const stats = { algorithm: 'DFS, exact state memoization; deterministic replay from initial state',
    checkpoints: 'choice / memo / terminal; deterministic engine progression is contracted into edges',
    maxStates: MAX_STATES, maxSerializedKeyBytes: MAX_KEY_BYTES, serializedKeyBytes: 0,
    initialThreadSets: roots.length, initialThreadSetsStarted: 0, uniqueStates: 0, transitions: 0, executedTransitions: 0,
    transitionDefinition: 'transitions = enumerated outgoing input edges of expanded states; executedTransitions = those actually followed, excluding replay prefixes',
    mergedStates: 0, terminalStates: 0, runs: 0, completed: false };
  let stopped = false;
  let limitReason;
  while (pending.length && !stopped) {
    const task = pending.pop();
    const hits = new Set();
    const visit = actions => {
      // Exact canonical strings, including flags/counters/memos/results and
      // continuation position. No hash collisions or counter saturation.
      const key = JSON.stringify([task.seenThreads, runtime.position(), runtime.state(), actions]);
      if (seen.has(key)) { stats.mergedStates++; throw PRUNE; }
      const bytes = Buffer.byteLength(key);
      if (seen.size >= MAX_STATES || stats.serializedKeyBytes + bytes > MAX_KEY_BYTES) {
        limitReason = seen.size >= MAX_STATES ? `unique-state resource budget ${MAX_STATES}` : `serialized-key memory budget ${MAX_KEY_BYTES} bytes`;
        throw LIMIT;
      }
      stats.serializedKeyBytes += bytes;
      seen.add(key); stats.uniqueStates++;
    };
    try {
      stats.runs++;
      if (!task.actions.length) stats.initialThreadSetsStarted++;
      if (task.actions.length) stats.executedTransitions++;
      const run = await runtime.run({ seenThreads: task.seenThreads, prefix: task.actions,
        observed: c => hits.add(conditionKey(c)),
        input: e => {
          visit(e.actions);
          stats.transitions += e.actions.length;
          stats.executedTransitions++;
          const prefix = runtime.trace();
          for (let i = e.actions.length - 1; i >= 1; i--)
            pending.push({ actions: [...prefix, e.actions[i]], seenThreads: task.seenThreads });
          return e.actions[0];
        },
      });
      visit([]); stats.terminalStates++;
      const key = `${run.routeKey}/${run.ending}`;
      if (!witnesses[key] || targets.some(c => hits.has(conditionKey(c)) && !findings[conditionKey(c)]))
        await saveWitness(!witnesses[key] ? key : `search-${stats.runs}`, run);
    } catch (error) {
      if (error === LIMIT) { stopped = true; pending.push(task); }
      else if (error !== PRUNE) throw error;
    }
    if (stats.runs % 1000 === 0) console.error(`探索: ${stats.uniqueStates} states, ${stats.transitions} transitions, ${pending.length} pending`);
  }
  stats.completed = !stopped && pending.length === 0;
  stats.pendingPaths = pending.length;
  stats.stopReason = stats.completed ? null : `${limitReason} exhausted; full-tree exploration NOT completed`;
  assert(stats.executedTransitions <= stats.transitions);
  return stats;
}

async function main() {
  const replayId = arg('replay');
  if (replayId || process.argv.includes('--check')) {
    const report = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    assert.deepEqual(report.sourceHashes, sources, '証拠の生成元が変わりました。先に探索を再実行してください');
    const checked = new Map();
    for (const id of replayId ? [replayId] : Object.keys(report.witnesses)) {
      const w = report.witnesses[id]; assert(w, `再現列がありません: ${id}`);
      const { result: run, hits } = await replay(id, w.actions, w.seenThreads);
      // VM arrays have a different prototype from arrays parsed by Node. The
      // canonical serialized state is the cross-realm equality criterion.
      assert.equal(JSON.stringify(run.state), JSON.stringify(w.state));
      assert.equal(`${run.routeKey}/${run.ending}`, `${w.routeKey}/${w.ending}`);
      assert.deepEqual([...hits].sort(), w.evaluatedConditions);
      checked.set(id, hits);
      if (replayId) console.log(JSON.stringify({ witness: id, replayVerified: true, route: run.route, routeKey: run.routeKey,
        ending: run.ending, djAt2: run.state.djAt2, dj: run.state.dj, ties: runtime.ctx.tieList(),
        choices: w.choices.length, memos: run.state.memos.length }, null, 2));
    }
    if (!replayId) {
      const { proofs, proofFor } = certify(M, A);
      assert.deepEqual(report.proofs, proofs);
      assert.deepEqual(report.conditionResults.map(conditionKey), targets.map(conditionKey));
      for (const r of report.conditionResults) {
        if (r.witness) assert(checked.get(r.witness).has(conditionKey(r)));
        else assert(report.exploration.completed || r.proof === proofFor(r));
      }
      for (const r of report.routeEndingResults) {
        if (r.witness) {
          const w = report.witnesses[r.witness]; assert.equal(`${w.routeKey}/${w.ending}`, r.key);
        } else {
          const [rk, ed] = r.key.split('/');
          assert(ed === 'E' && rk !== 'natsume' || rk === 'natsume' && ['A', 'C'].includes(ed));
        }
      }
      for (const r of report.eventResults) for (const side of r.sides)
        assert(checked.get(side.witness).has(conditionKey({ source: r.source, type: byId.get(r.source.id).when ? 'when' : 'if', value: side.value })));
      console.log(`証拠検査OK: ${checked.size}列を実エンジンで再生、条件20行・ルート×ED20行・イベント5行と形式証明を再検証`);
    }
    return;
  }
  await seedWitnesses();
  const stateSpaceLowerBound = await lowerBound();
  console.error(`厳密状態の終端数の構成的下限: ${stateSpaceLowerBound.minimumTerminalStates}`);
  const exploration = await search();
  const { proofs, proofFor } = certify(M, A);
  const conditionResults = targets.map(c => {
    const witness = findings[conditionKey(c)];
    const proof = proofFor(c);
    if (witness) {
      assert(!proof, `形式証明とリプレイが矛盾: ${conditionKey(c)}`);
      return { ...c, status: '到達可能', witness };
    }
    assert(exploration.completed || proof, `証明のない未確定行: ${conditionKey(c)}`);
    return { ...c, status: '到達不能（証明）', proof: exploration.completed ? 'exhaustive' : proof,
      basis: exploration.completed ? '全状態空間の探索が完了し、一度も満たされない。' : proofs[proof].reason };
  });
  const routeEndingResults = [];
  for (const routeKey of ['nanami', 'haruka', 'alone', 'natsume']) for (const ending of Object.keys(M.constants.ENDINGS)) {
    const key = `${routeKey}/${ending}`;
    if (witnesses[key]) routeEndingResults.push({ key, status: '到達可能', witness: key });
    else {
      assert(ending === 'E' && routeKey !== 'natsume' || routeKey === 'natsume' && ['A', 'C'].includes(ending), `未確定の組み合わせ: ${key}`);
      routeEndingResults.push({ key, status: '到達不能（証明）', proof: 'endingPriority', basis: proofs.endingPriority.reason });
    }
  }
  const eventResults = A.nights.flatMap(n => n.events.filter(e => e.condition).map(e => {
    const obj = M.S.nights[n.night].scenes?.[e.id] || M.S.visitors[e.id];
    const source = M.locations.get(obj), type = obj.when ? 'when' : 'if';
    return { id: e.id, source, expression: e.condition,
      sides: [true, false].map(value => {
        const key = conditionKey({ source, type, value });
        const witness = Object.keys(witnesses).find(id => witnesses[id].evaluatedConditions.includes(key));
        assert(witness, `イベント${e.id}の${value}側のリプレイ証拠なし`);
        return { value, status: '到達可能', witness };
      }) };
  }));
  const report = { schemaVersion: 1, sourceHashes: sources, exploration, stateSpaceLowerBound,
    scope: '正常な初期状態からの選択肢とメモ回収／未回収。既読糸64集合を初期根として用意。UIの描画・待機・音はスタブ。ゲームの条件・採点・非同期進行は実エンジン。改変セーブ・DOMや実時間は対象外。',
    fallback: exploration.completed ? null : '完全状態を保持するDFSが明示的な資源予算に到達。全探索による非到達証明は主張せず、未到達行だけを実関数の有限領域検査と制御フローの形式的論証で証明。',
    conditionResults, routeEndingResults, eventResults, proofs, witnesses };
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(exploration, null, 2));
  console.log(`確定: 条件${conditionResults.length}行、ルート×ED ${routeEndingResults.length}行、イベント${eventResults.length}行。到達経路はすべて実エンジンで独立にリプレイ済み。`);
}
if (require.main === module) main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
