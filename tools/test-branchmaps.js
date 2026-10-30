#!/usr/bin/env node
'use strict';
// 同期解析モデルの代表経路を、index.html の本物の非同期進行関数で再生する。
// DOM・音・待機はスタブ。ゲームの判定・進行関数そのものは置き換えない。
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { load, exits, functionSource } = require('./lib/branchmap-model');
const { validateDiagram, validateCanvas } = require('./check-branchmaps');
const M = load();
const coverage = JSON.parse(fs.readFileSync(path.join(M.ROOT, 'docs/obsidian/data/coverage.json'), 'utf8'));
assert.deepEqual(coverage.sourceHashes, M.sources, '生成元が古いので再生成してください');
assert.deepEqual(exits([{ if: 'x', then: [{ go: 'branch' }] }, { go: 'merge' }, { go: 'unreachable' }]).map(e => e.target).sort(), ['branch', 'merge']);
assert.deepEqual(exits([{ choice: [{ r: [{ end: true }], go: 'wrong' }, { r: [], go: 'next' }] }, { go: 'alsoWrong' }]).map(e => e.target).sort(), ['__end', 'next']);
assert.deepEqual(exits([{ acts: [{ r: [{ go: 'nested' }], go: 'wrong' }, { r: [], go: 'nested' }] }]).map(e => e.target), ['nested']);
assert.throws(() => validateDiagram('flowchart TD\n a["a"]\n a --> missing', 'fixture'));
assert.throws(() => validateCanvas({ nodes: [], edges: [{ id: 'e', fromNode: 'missing', toNode: 'x' }] }, 'fixture'));

async function replay(key, w) {
  const byId = new Map(M.objects.map(([o, loc]) => [loc.id, o]));
  let cursor = 0;
  const G = { token: 0, flags: new Set(), res: {}, meters: {}, counts: {}, dj: 0, cat: 0, djAt2: null, seg: null, memos: [], revealed: new Set(), names: {}, djName: 'ナツメ', catName: '黒猫' };
  const element = { classList: { add() {}, remove() {} }, style: {}, textContent: '', hidden: false };
  const noop = () => {};
  const ctx = { ...M.constants, STORY: M.S, G, FAST: true, BOT: true, app: element, pwrap: element, SAVE_KEY: 'save', THREAD_KEY: 'threads', NIGHT_KANJI: ['', '第一夜', '第二夜', '第三夜', '第四夜', '第五夜'], $: () => element,
    choose: async opts => {
      const expected = byId.get(w.choices[cursor++]);
      assert(expected, `${key}: 記録にない選択`);
      const shown = opts.filter(o => (!o.memo || G.memos.some(m => m.id === o.memo)) && (!o.if || ctx.cond(o.if)));
      const pool = shown.length ? shown : opts;
      const result = pool.find(o => o === expected || o.r === expected.r);
      assert(result, `${key}: ${w.choices[cursor - 1]} が表示されない`);
      return result;
    },
    showLine: async (who, text, meta) => { if (meta?.memo && !G.memos.some(m => m.id === meta.memo)) G.memos.push({ id: meta.memo }); },
    setPortrait: id => { G.pkey = id; },
    actText: a => a.t || a.a,
    pickBeat: () => 'none',
    vName: v => v.name,
    lsGet: k => k === 'threads' ? w.seenThreads : [],
    lsSet: noop, snapshot: () => ({}),
  };
  for (const n of ['guard', 'drawMeter', 'updateTest', 'setState', 'sfx', 'setFace', 'setClock', 'setWeather', 'setFx', 'refreshName', 'showSong', 'showMeter', 'showOnly', 'logSec', 'nightSummary', 'nightCard', 'showLetter', 'showEnding', 'beat', 'playAct', 'wait']) ctx[n] = noop;
  vm.createContext(ctx);
  const runtime = ['runSteps', 'runScript', 'runVisitor', 'runFrameSeg', 'runScene', 'runPlain', 'playNight', 'morningLetters', 'playEpilogue'];
  vm.runInContext([...Object.values(M.functions), ...runtime.map(n => functionSource(M.html, n))].join('\n'), ctx, { timeout: 1000 });
  await ctx.playNight(1);
  assert.equal(cursor, w.choices.length, `${key}: 選択数`);
  const clean = x => JSON.parse(JSON.stringify(x));
  assert.deepEqual(clean(G.res), clean(w.results), `${key}: 結果`);
  assert.deepEqual(clean(G.meters), clean(w.meters), `${key}: 距離`);
  assert.deepEqual(clean(G.counts), clean(w.counts), `${key}: 返答数`);
  assert.deepEqual([...G.flags].sort(), w.flags, `${key}: フラグ`);
  assert.deepEqual(clean(G.deep), w.deep, `${key}: 深い糸`);
  assert.equal(ctx.route(), w.route, `${key}: 人生`);
  assert.equal(ctx.routeKey(), w.routeKey, `${key}: ルート表示`);
  assert.equal(G.ending, w.ending, `${key}: ED`);
  for (const k of ['djAt2', 'dj', 'cat']) assert.equal(G[k], w[k], `${key}: ${k}`);
}
(async () => {
  for (const [key, w] of Object.entries(coverage.witnesses)) await replay(key, w);
  console.log(`解析の停止・合流、検査器のエラー検出 OK。実エンジン進行による代表${Object.keys(coverage.witnesses).length}経路の再生一致（A〜E）`);
})().catch(e => { console.error(e.stack); process.exitCode = 1; });
