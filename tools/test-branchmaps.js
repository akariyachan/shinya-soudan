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
assert.throws(() => validateDiagram('flowchart TD\n a["a"]\n linkStyle 0 stroke:#888888,stroke-width:1px,stroke-dasharray:5 5;', 'fixture'));

// 同じ式の別の位置・反対側まで到達不能にしていないかを確認する。
const readDoc = name => fs.readFileSync(path.join(M.ROOT, 'docs/obsidian', name), 'utf8');
const proof = JSON.parse(readDoc('data/reachability.json'));
const verification = readDoc('30_検証と要確認.md');
const index = readDoc('details/条件索引.md');
const model = JSON.parse(readDoc('data/branch-model.json'));
const idFor = i => `condition-${String(i + 1).padStart(2, '0')}`;
const statusFor = r => r.witness ? '到達可能（再現確認）' : '到達不能（論証）';
for (const c of model.conditions) {
  const line = index.split('\n').find(line => line.includes('`' + c.source.pointer + '`'));
  assert(line, `条件索引に欠落: ${c.source.id}`);
  const resultIndex = proof.conditionResults.findIndex(r => r.source.id === c.source.id && r.type === c.type);
  assert(line.includes(resultIndex < 0 ? '個別判定なし' : `#${idFor(resultIndex)}`), `${c.source.id}: 別の条件の判定が混入`);
}
proof.conditionResults.forEach((r, i) => {
  const id = idFor(i), status = statusFor(r);
  const parts = r.source.pointer.split('.');
  const night = parts[1] === 'nights' ? Number(parts[2]) : M.S.visitors[parts[2]]?.night;
  const filename = night ? `nights/${['', '第一夜', '第二夜', '第三夜', '第四夜', '第五夜'][night]}.md` : '10_ルートとED.md';
  const doc = readDoc(filename);
  const diagrams = [...doc.matchAll(/```mermaid\n([\s\S]*?)\n```/g)].map(m => m[1]).filter(d => d.includes(`${id} `));
  assert.equal(diagrams.length, 1, `${id}: 条件側を一度だけ図示する`);
  const d = diagrams[0], q = d.match(new RegExp(`(q\\d+)\\{"${id} `))[1];
  const edge = d.split('\n').filter(line => / (?:-->|-\.->)/.test(line));
  const edgeIndex = edge.findIndex(line => line.trim().startsWith(q + ' '));
  const target = edge[edgeIndex].trim().split(' ').at(-1);
  assert(edge[edgeIndex].includes(`${r.witness ? '-->' : '-.->'}|"${r.value}（`), `${id}: 条件側／線種`);
  assert(d.includes(`${target}["${status}"]`), `${id}: 状態ラベル`);
  const styled = d.split('\n').some(line => line.trim().startsWith('class ') && line.trim().endsWith(' unreachable;') && line.trim().split(' ')[1].split(',').includes(target));
  assert.equal(styled, !r.witness, `${id}: 到達可能な側をグレーにしない`);
  assert.equal(d.includes(`linkStyle ${edgeIndex} `), !r.witness, `${id}: エッジの色と破線`);
  assert(doc.includes(`[${status}](`) && doc.includes(`30_検証と要確認.md#${id})`), `${id}: 検証へのリンク`);
  const entry = verification.split(`### ${id}\n`)[1]?.split('\n### ')[0];
  assert(entry?.includes(r.source.pointer.replace(/^STORY\./, '')) && entry.includes(`${r.expression} = ${r.value}`) && entry.includes(status), `${id}: 検証先の位置・条件側・状態`);
});
assert.deepEqual(proof.conditionResults.filter(r => r.witness).map(r => r.witness).sort(), ['alone/A', 'alone/C']);
for (const file of ['10_ルートとED.md', '20_フラグ依存関係.md', '30_検証と要確認.md', 'details/条件索引.md', ...['第一夜', '第二夜', '第三夜', '第四夜', '第五夜'].map(n => `nights/${n}.md`)]) assert(readDoc(file).includes('## 到達性の凡例'), `${file}: 凡例`);
assert(readDoc('20_フラグ依存関係.md').includes('参照元（代表／判定関数） | 状態 |'));
assert(index.includes('条件 | 状態 |'));
console.log(`到達性${proof.conditionResults.length}条件側の図・状態列・根拠リンク、通常条件の非混同 OK`);

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
