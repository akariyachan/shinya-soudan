'use strict';
// index.html の実際の判定関数を利用する。ブラウザーの描画・待機だけを省く。
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const ROOT = path.resolve(__dirname, '../..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const hash = s => crypto.createHash('sha256').update(s).digest('hex');

function functionSource(html, name) {
  const re = new RegExp(`(?:async )?function ${name}\\(`);
  const m = re.exec(html);
  if (!m) throw new Error(`エンジン関数が見つかりません: ${name}`);
  let i = html.indexOf('{', m.index), depth = 0, quote = null;
  for (; i < html.length; i++) {
    const c = html[i], next = html[i + 1];
    if (quote) { if (c === '\\') i++; else if (c === quote) quote = null; continue; }
    if ('\'"`'.includes(c)) { quote = c; continue; }
    if (c === '/' && next === '/') { i = html.indexOf('\n', i); continue; }
    if (c === '/' && next === '*') { i = html.indexOf('*/', i + 2) + 1; continue; }
    if (c === '{') depth++;
    if (c === '}' && --depth === 0) return html.slice(m.index, i + 1);
  }
  throw new Error(`関数の終端が不明: ${name}`);
}

function load() {
  const html = read('index.html'), ctx = { window: {} };
  vm.createContext(ctx);
  const files = [...html.matchAll(/<script src="(story\/[^"/]+\.js)"><\/script>/g)].map(m => m[1]);
  if (!files.length) throw new Error('story の読み込み順を取得できません');
  const locations = new WeakMap(), objects = [];
  const annotate = (v, file, pointer) => {
    if (!v || typeof v !== 'object') return;
    if (!locations.has(v)) { const loc = { file, pointer, id: `${file}#${pointer}` }; locations.set(v, loc); objects.push([v, loc]); }
    for (const [k, x] of Object.entries(v)) annotate(x, file, `${pointer}.${k}`);
  };
  for (const file of files) {
    vm.runInContext(read(file), ctx, { filename: file, timeout: 1000 });
    annotate(ctx.window.STORY, file, 'STORY');
  }
  const S = ctx.window.STORY;
  const constants = {};
  for (const name of ['IDS', 'TIES', 'TIE_NAMES', 'DEEP_TIES', 'DEEP_BY_ROUTE', 'DJ_ROUTE_NEED', 'DJ_HIGH', 'CAT_HIGH', 'CONN_NEED', 'ENDINGS']) {
    const m = html.match(new RegExp(`\\b${name} = ([^;\\n]+?)(?:;|, [A-Z_]+ =)`));
    if (!m) throw new Error(`定数の形式を要確認: ${name}`);
    constants[name] = vm.runInNewContext(`(${m[1]})`, {}, { timeout: 1000 });
  }
  const names = ['okId', 'tieOn', 'tieList', 'route', 'djAt2High', 'djRoute', 'routeKey', 'popJob', 'designer', 'drawLevel', 'wakai', 'connHigh', 'djHigh', 'evalTok', 'cond', 'applyChoice', 'resultOf', 'decideEnding'];
  const functions = Object.fromEntries(names.map(n => [n, functionSource(html, n)]));
  const engineCtx = { ...constants, G: {}, drawMeter() {}, updateTest() {} };
  vm.createContext(engineCtx);
  vm.runInContext(Object.values(functions).join('\n'), engineCtx, { timeout: 1000 });
  const E = Object.fromEntries(names.map(n => [n, engineCtx[n]]));
  const sources = Object.fromEntries(['index.html', ...files, 'story/BIBLE.md', 'DIRECTION.md', 'tools/check-story.js', 'tools/simulate.js'].map(f => [f, hash(read(f))]));
  return { ROOT, html, S, files, locations, objects, constants, functions, E, engineCtx, sources };
}

function extract(M) {
  const { S, locations, objects } = M;
  const scripts = [], conditions = [], choices = [], writes = [], memos = [], jumps = [];
  const loc = v => locations.get(v);
  for (const [o, source] of objects) {
    if (Array.isArray(o)) {
      if (o[2] && o[2].memo && typeof o[1] === 'string') memos.push({ memo: o[2].memo, word: (o[1].match(/《([^》]+)》/) || [])[1], source });
      continue;
    }
    for (const key of ['if', 'when']) if (key in o) conditions.push({ expression: typeof o[key] === 'string' ? o[key] : '要確認: 関数条件', type: key, source });
    if (o.script && !Array.isArray(o.script)) scripts.push({ source: loc(o.script), labels: Object.keys(o.script), script: o.script });
    if (o.choice || o.acts) choices.push({ type: o.acts ? 'acts' : 'choice', source, options: (o.choice || o.acts).map((c, i) => ({ index: i, text: c.t || c.a, k: c.k, free: !!o.acts || !!c.free, set: [].concat(c.set || []), dj: c.dj, cat: c.cat, meter: c.m, good: c.good, memo: c.memo, if: c.if, go: c.go, source: loc(c) })) });
    if (o.set) for (const flag of [].concat(o.set)) writes.push({ state: flag, operation: 'set', value: true, source });
    for (const key of ['dj', 'cat']) if (typeof o[key] === 'number') writes.push({ state: key, operation: 'add', value: o[key], source });
    if (o.go || o.end) jumps.push({ target: o.end ? '__end' : o.go, source });
  }
  // ここでの可到達性は条件と状態を無視したラベル間の構造だけ。
  const scriptsData = scripts.map(({ source, labels, script }) => {
    const transitions = {};
    for (const label of labels) transitions[label] = exits(script[label]);
    const reachable = new Set(), todo = ['start'];
    while (todo.length) { const l = todo.pop(); if (reachable.has(l) || !transitions[l]) continue; reachable.add(l); for (const x of transitions[l]) if (x.target) todo.push(x.target); }
    const labelSummaries = Object.fromEntries(labels.map(l => [l, script[l].find(st => st && !Array.isArray(st) && typeof st.say === 'string')?.say || '場面']));
    return { source, labels, labelSummaries, transitions, structurallyUnreachable: labels.filter(l => !reachable.has(l)) };
  });
  return { conditions, choices, writes, memos, jumps, scripts: scriptsData,
    nights: Object.entries(S.nights).map(([n, N]) => ({ night: +n, title: N.title, order: N.order, after: N.after || [], source: loc(N), events: [...N.order, ...(N.after || [])].map(id => ({ id, condition: (N.scenes?.[id]?.if || S.visitors[id]?.when || null) })) })),
    visitors: Object.entries(S.visitors).map(([id, v]) => ({ id, name: v.name, night: v.night, when: v.when, source: loc(v) })) };
}

// runSteps と同じ return/go/end の伝播。条件の真偽は確定しない。
function exits(steps) {
  let result = [{ target: null, guards: [] }];
  for (const st of steps || []) {
    if (!st || typeof st !== 'object' || Array.isArray(st)) continue;
    let branches;
    if (st.choice || st.acts) {
      branches = (st.choice || st.acts).flatMap((c, i) => exits(c.r).map(e => ({ target: e.target || c.go || null, guards: [...(c.if ? [c.if] : []), ...(c.memo ? [`memo:${c.memo}`] : []), `選択${i + 1}`, ...e.guards] })));
      if (new Set(branches.map(b => b.target)).size === 1) branches = [{ target: branches[0].target, guards: [] }];
    } else if ('if' in st) {
      branches = [...exits(st.then).map(e => ({ target: e.target, guards: [String(st.if), ...e.guards] })), ...exits(st.else).map(e => ({ target: e.target, guards: [`NOT (${st.if})`, ...e.guards] }))];
      // 両側が同じ場所へ進む条件（会話差分など）は制御図に持ち込まない。
      if (new Set(branches.map(b => b.target)).size === 1) branches = [{ target: branches[0].target, guards: [] }];
    }
    else if (st.go || st.end) branches = [{ target: st.go || '__end', guards: [] }];
    else continue;
    result = result.flatMap(r => r.target ? [r] : branches.map(b => ({ target: b.target, guards: [...r.guards, ...b.guards] })));
    result = [...new Map(result.map(r => [JSON.stringify(r), r])).values()];
  }
  return result;
}

function sample(M, model, runs = 3000, seed = 20261031) {
  const { S, locations, E, engineCtx, constants: C } = M;
  let rng = seed >>> 0;
  const random = () => { rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0; return rng / 4294967296; };
  const hits = {}, endings = {}, routes = {}, combinations = {}, skipped = {}, displayedThreads = {}, witnesses = {}, boundaries = {}, issues = new Set();
  const hit = k => { hits[k] = (hits[k] || 0) + 1; };
  const increment = (map, k) => { map[k] = (map[k] || 0) + 1; };
  const where = o => locations.get(o).id;
  const profiles = [0.15, 0.6, 0.95];
  for (let run = 0; run < runs; run++) {
    const G = { flags: new Set(), res: {}, meters: {}, counts: {}, dj: 0, cat: 0, djAt2: null, seg: null, memos: new Set() };
    engineCtx.G = G;
    let budget = 0;
    const trace = [], events = [];
    const test = (obj, key) => {
      const value = E.cond(obj[key]); hit(`${where(obj)}:${key}:${value}`); return value;
    };
    const apply = (c, act) => E.applyChoice(act ? { ...c, free: true } : c);
    const pick = (opts, all, st) => {
      if (!opts.length) { issues.add(`全カード非表示時の全件復帰: ${where(st)}`); opts = all; }
      const good = opts.filter(c => c.k === 'just' || c.k === 'odd' && c.good !== false);
      const bad = opts.filter(c => !good.includes(c));
      const pool = opts.every(o => o.free) || st.acts ? opts : good.length && (random() < profiles[run % profiles.length] || !bad.length) ? good : bad.length ? bad : opts;
      const c = pool[Math.floor(random() * pool.length)];
      hit(`${where(c)}:selected`); trace.push(where(c)); return c;
    };
    const steps = arr => {
      for (const st of arr || []) {
        if (++budget > 20000) throw new Error('シミュレーションが上限超過');
        if (Array.isArray(st)) { if (st[2]?.memo && random() < 0.7) { G.memos.add(st[2].memo); hit(`${where(st)}:memo`); } continue; }
        if (!st || typeof st !== 'object') continue;
        if (st.acts || st.choice) {
          const all = st.acts || st.choice;
          const opts = all.filter(c => (!c.memo || G.memos.has(c.memo)) && (!c.if || test(c, 'if')));
          const c = pick(opts, all, st); apply(c, !!st.acts);
          const r = steps(c.r); if (r) return r;
          if (c.go) return c.go; continue;
        }
        if ('if' in st) { const r = steps(test(st, 'if') ? st.then : st.else); if (r) return r; continue; }
        if (st.go) return st.go;
        if (st.end) return '__end';
        if (st.set) [].concat(st.set).forEach(f => G.flags.add(f));
        for (const k of ['dj', 'cat']) if (typeof st[k] === 'number') G[k] += st[k];
      }
      return null;
    };
    const script = sc => {
      let label = 'start', guard = 0;
      while (label && sc[label] && guard++ < 300) { hit(`${where(sc)}:label:${label}`); label = steps(sc[label]); }
      if (guard >= 300) issues.add(`ラベル移動の上限: ${where(sc)}`);
    };
    const scene = (id, sc) => {
      if (sc.if && !test(sc, 'if')) { increment(skipped, id); events.push({ id, skipped: true }); return; }
      G.seg = { type: 'scene', id }; events.push({ id }); script(sc.script); G.seg = null;
    };
    const plain = arr => { G.seg = { type: 'frame', id: 'frame' }; steps(arr); G.seg = null; };
    const morning = N => plain(N.morning);
    for (let n = 1; n <= 5; n++) {
      const N = S.nights[n]; plain(N.prologue);
      for (const id of N.order) {
        if (id === 'dj' || id === 'cat') {
          if (!N[id]) continue;
          G.seg = { type: id, id }; script(N[id].script);
          if (id === 'dj' && n === 2) G.djAt2 = G.dj;
          G.seg = null;
        } else if (N.scenes?.[id]) scene(id, N.scenes[id]);
        else {
          const v = S.visitors[id];
          if (!v) throw new Error(`未定義のイベント ${id}`);
          if (v.when && !test(v, 'when')) { increment(skipped, id); events.push({ id, skipped: true }); continue; }
          G.seg = { type: 'visitor', id }; G.meters[id] = 0; G.counts[id] = { n: 0, g: 0 }; events.push({ id });
          script(v.script); G.res[id] = E.resultOf(id); G.seg = null;
        }
      }
      plain(N.monologue);
      for (const id of N.after || []) if (N.scenes?.[id]) scene(id, N.scenes[id]);
      if (n < 5) morning(N);
    }
    const epi = S.epilogue;
    plain(epi.intro); morning(S.nights[5]);
    for (const id of ['ol', 'salaryman', 'musician', 'grandpa', 'mother', 'madam']) if (G.res[id] && epi.people?.[id]) { G.seg = { type: 'epi', id }; steps(epi.people[id][G.res[id]]); G.seg = null; }
    const route = E.route(); plain(epi.life?.[route]);
    const rk = E.routeKey(), tied = (C.DEEP_BY_ROUTE[rk] || C.DEEP_TIES).filter(k => E.tieOn(k) && epi.threads?.[k]);
    // 既読集合を固定シードで変える。localStorage の全順列の網羅ではない。
    const seen = C.DEEP_TIES.filter(() => random() < 0.5);
    const candidates = tied.filter(k => !seen.includes(k)).concat(tied.filter(k => seen.includes(k)));
    const deep = rk === 'natsume' && epi.threads?.N1 ? ['N1', ...candidates.slice(0, 1)] : candidates.slice(0, 2);
    for (const k of deep) { increment(displayedThreads, k); plain(epi.threads[k]); }
    plain(epi.dawn);
    const ending = E.decideEnding(); plain(epi.endings[ending].script);
    increment(endings, ending); increment(routes, rk); increment(combinations, `${rk}/${ending}`);
    const witnessKey = `${rk}/${ending}`;
    if (!witnesses[witnessKey]) witnesses[witnessKey] = { run, profile: profiles[run % profiles.length], choices: trace, events, seenThreads: seen, deep, flags: [...G.flags].sort(), results: G.res, meters: G.meters, counts: G.counts, djAt2: G.djAt2, dj: G.dj, cat: G.cat, ties: E.tieList(), draw: E.drawLevel(), route, routeKey: rk, ending };
    for (const key of ['dj', 'cat', 'djAt2']) {
      if (!boundaries[key]) boundaries[key] = { min: G[key], max: G[key] };
      boundaries[key].min = Math.min(boundaries[key].min, G[key]); boundaries[key].max = Math.max(boundaries[key].max, G[key]);
    }
  }
  const unseenConditions = model.conditions.flatMap(c => [true, false].filter(b => !hits[`${c.source.id}:${c.type}:${b}`]).map(value => ({ ...c, value })));
  const unseenOptions = model.choices.flatMap(c => c.options.filter(o => !hits[`${o.source.id}:selected`]));
  const unseenLabels = model.scripts.flatMap(sc => sc.labels.filter(l => !hits[`${sc.source.id}:label:${l}`]).map(label => ({ source: sc.source, label })));
  return { method: '抽出した実エンジン判定関数 + 同期進行モデル。UI・実時間を省略。実ブラウザーの到達証明ではない。', seed, runs, profiles, memoProbability: 0.7, seenThreadPolicy: '各周、各糸を確率0.5で既読にする', endings, routes, combinations, skipped, displayedThreads, boundaries, witnesses, hits, unseenConditions, unseenOptions, unseenLabels, issues: [...issues] };
}
module.exports = { load, extract, sample, exits, functionSource, hash, read, ROOT };
