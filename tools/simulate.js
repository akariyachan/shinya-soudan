#!/usr/bin/env node
// 物語データを読み込み、ボット方針（ちょうどいいを6割）で全編を何度も通して、
// 結果・ルート・エンディングの分布と、条件式の使われ方の問題を調べる。
// node tools/simulate.js [回数] [ちょうどいいの割合]
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const srcs = [...html.matchAll(/<script src="(story\/[^"]+)"><\/script>/g)].map(m => m[1]);
const ctx = { window: {}, console };
vm.createContext(ctx);
for (const s of srcs) vm.runInContext(fs.readFileSync(path.join(ROOT, s), 'utf8'), ctx, { filename: s });
const S = ctx.window.STORY;

// エンジンの定数を index.html から読む
const grab = (re) => { const m = html.match(re); if (!m) throw new Error('not found ' + re); return m[1]; };
const IDS = eval(grab(/const IDS = (\[[^\]]+\]);/));
const TIES = eval('(' + grab(/const TIES = (\{[^;]+\});/) + ')');
const TIE_NAMES = eval(grab(/const TIE_NAMES = (\[[^\]]+\]);/));
const DJ_ROUTE_NEED = +grab(/DJ_ROUTE_NEED = (\d+)/), DJ_HIGH = +grab(/DJ_HIGH = (\d+)/), CAT_HIGH = +grab(/CAT_HIGH = (\d+)/), CONN_NEED = +grab(/CONN_NEED = (\d+)/);

const RUNS = +(process.argv[2] || 3000), P_GOOD = +(process.argv[3] || 0.6);
const problems = new Map();
const note = (k) => problems.set(k, (problems.get(k) || 0) + 1);

function play() {
  const G = { flags: new Set(), res: {}, meters: {}, counts: {}, dj: 0, djAt2: null, cat: 0, seg: null, memos: new Set() };
  const okId = (id) => G.res[id] === 'good' || G.res[id] === 'mid';
  const wakai = () => okId('mother') && okId('madam') && ['mother_letter', 'n4_bridge', 'sumie_coaster'].filter(f => G.flags.has(f)).length >= 2;
  const tieOn = (name) => {
    if (name === 'T4') return G.flags.has('kiri_job') && okId('salaryman') && okId('konbini');
    if (name === 'T6') return wakai();
    if (name === 'N1') return djroute();
    if (name === 'T7') { const other = okId('madam') || G.cat >= CAT_HIGH; return okId('grandpa') && other && (G.res.grandpa === 'good' || G.res.madam === 'good' || G.cat >= CAT_HIGH + 1); }
    const ids = TIES[name]; return ids.every(okId) && ids.some(id => G.res[id] === 'good');
  };
  const ties = () => TIE_NAMES.filter(tieOn);
  const route = () => {
    if (!G.res.konbini) note('route を湊の会話より前に参照: ' + (G.seg || '?'));
    const f = (k) => G.flags.has(k);
    if (f('mi_tell') && !f('mi_rush') && okId('ol')) return 'nanami';
    if (f('konbini_words')) return 'haruka';
    if (G.djAt2 != null && G.djAt2 >= DJ_ROUTE_NEED) return 'alone';
    if (okId('konbini')) return 'haruka';
    return 'alone';
  };
  function djroute() { return !!G.res.konbini && G.djAt2 != null && G.djAt2 >= DJ_ROUTE_NEED && route() === 'alone'; }
  const popJob = () => !!G.res.konbini && route() === 'haruka' && !G.flags.has('kiri_job');
  const designer = () => G.flags.has('kiri_job') || popJob();
  const drawLevel = () => !designer() ? 0 : (G.flags.has('hi_draw') && G.flags.has('mi_draw') ? 2 : 1);
  const evalTok = (tok) => {
    tok = tok.trim(); let neg = false; if (tok[0] === '!') { neg = true; tok = tok.slice(1).trim(); }
    let v, m;
    if ((m = tok.match(/^(good|mid|bad|ok):(\w+)$/))) { if (!G.res[m[2]] && m[2] !== (G.seg || '')) note(`${G.seg}: まだ結果のない ${m[2]} を参照`); v = m[1] === 'ok' ? okId(m[2]) : G.res[m[2]] === m[1]; }
    else if ((m = tok.match(/^tie:(T\d)$/))) v = tieOn(m[1]);
    else if ((m = tok.match(/^(dj|cat)\s*(>=|<=|>|<|==)\s*(-?\d+)$/))) { const a = G[m[1]], b = +m[3]; v = m[2] === '>=' ? a >= b : m[2] === '<=' ? a <= b : m[2] === '>' ? a > b : m[2] === '<' ? a < b : a === b; }
    else if (tok === 'conn') v = ties().length >= CONN_NEED;
    else if (tok === 'djhigh') v = G.dj >= DJ_HIGH;
    else if (tok === 'cathigh') v = G.cat >= CAT_HIGH;
    else if ((m = tok.match(/^route:(\w+)$/))) v = route() === m[1];
    else if ((m = tok.match(/^draw([012])$/))) v = drawLevel() === +m[1];
    else if (tok === 'sayno') v = G.flags.has('hi_no') || G.flags.has('mi_no');
    else if (tok === 'designer') v = designer();
    else if (tok === 'pop_job') v = popJob();
    else if (tok === 'wakai') { if (G.seg !== 'epilogue') note(G.seg + ': wakai をエピローグ前に参照'); v = wakai(); }
    else if (tok === 'djroute') { if (G.djAt2 == null) note(G.seg + ': djroute を確定前に参照'); v = djroute(); }
    else v = G.flags.has(tok);
    return neg ? !v : v;
  };
  const cond = (c) => String(c).split('|').some(or => or.split('&').every(evalTok));
  const pick = (opts) => {
    if (opts.every(o => o.free)) return opts[Math.floor(Math.random() * opts.length)];
    const good = opts.map((o, i) => (o.k === 'just' || (o.k === 'odd' && o.good !== false)) ? i : -1).filter(i => i >= 0);
    const bad = opts.map((o, i) => i).filter(i => !good.includes(i));
    if (good.length && (Math.random() < P_GOOD || !bad.length)) return opts[good[Math.floor(Math.random() * good.length)]];
    const pool = bad.length ? bad : opts.map((o, i) => i);
    return opts[pool[Math.floor(Math.random() * pool.length)]];
  };
  const apply = (c) => {
    if (c.set) [].concat(c.set).forEach(f => G.flags.add(f));
    if (typeof c.dj === 'number') G.dj += c.dj;
    if (typeof c.cat === 'number') G.cat += c.cat;
    if (G.seg && S.visitors[G.seg]) {
      const id = G.seg, cnt = G.counts[id]; let m = G.meters[id] || 0;
      const good = c.k === 'just' || (c.k === 'odd' && c.good !== false);
      cnt.n++; if (good) cnt.g++;
      if (typeof c.m === 'number') m += c.m; else if (c.k === 'near') m -= 2; else if (c.k === 'far') m += 2; else if (good) m = m > 0 ? Math.max(0, m - 2) : Math.min(0, m + 2);
      G.meters[id] = Math.max(-8, Math.min(8, m));
    }
  };
  const run = (steps) => {
    for (const st of steps || []) {
      if (Array.isArray(st)) { if (st[2] && st[2].memo && Math.random() < 0.7) G.memos.add(st[2].memo); continue; }
      if (typeof st === 'string' || !st) continue;
      if (st.acts) { const a = st.acts[Math.floor(Math.random() * st.acts.length)]; const r = run(a.r); if (r) return r; if (a.go) return a.go; continue; }
      if (st.choice) {
        let opts = st.choice.filter(o => (!o.memo || G.memos.has(o.memo)) && (!o.if || cond(o.if)));
        if (!opts.length) opts = st.choice;
        const c = pick(opts); apply(c); const r = run(c.r); if (r) return r; if (c.go) return c.go; continue; }
      if ('if' in st) { const r = run(cond(st.if) ? st.then : (st.else || [])); if (r) return r; continue; }
      if (st.go) return st.go;
      if (st.set) [].concat(st.set).forEach(f => G.flags.add(f));
      if (typeof st.dj === 'number') G.dj += st.dj;
      if (typeof st.cat === 'number') G.cat += st.cat;
    }
    return null;
  };
  const runScript = (sc) => { let l = 'start', g = 0; while (l && sc[l] && g++ < 300) { l = run(sc[l]); if (l && !sc[l]) note('存在しないラベル ' + l); } };
  const resultOf = (id) => {
    const c = G.counts[id] || { n: 0, g: 0 }, m = Math.abs(G.meters[id] || 0);
    if (c.n === 0) return 'mid';
    if (c.g >= c.n - 1 && m <= 2) return 'good';
    if (c.g <= Math.floor(c.n / 3) || m >= 5) return 'bad';
    return 'mid';
  };
  for (let n = 1; n <= 5; n++) {
    const N = S.nights[n]; if (!N) { note('第' + n + '夜なし'); continue; }
    G.seg = 'frame' + n; run(N.prologue);
    for (const seg of N.order) {
      G.seg = seg;
      if (seg === 'dj' || seg === 'cat') { if (N[seg]) runScript(N[seg].script); if (seg === 'dj' && n === 2) G.djAt2 = G.dj; continue; }
      if (N.scenes && N.scenes[seg]) { const sc = N.scenes[seg]; if (!sc.if || cond(sc.if)) runScript(sc.script); continue; }
      const v = S.visitors[seg]; if (!v) { note('相談者なし ' + seg); continue; }
      if (v.when && !cond(v.when)) continue;
      G.meters[seg] = 0; G.counts[seg] = { n: 0, g: 0 };
      runScript(v.script); G.res[seg] = resultOf(seg);
    }
    G.seg = 'frame' + n; run(N.monologue);
    for (const seg of N.after || []) { const sc = N.scenes && N.scenes[seg]; if (sc && (!sc.if || cond(sc.if))) runScript(sc.script); }
    run(N.morning);
  }
  const E = S.epilogue || {};
  G.seg = 'epilogue';
  run(E.intro);
  for (const g of ['people', 'future']) for (const id in (E[g] || {})) run(E[g][id][G.res[id] || 'mid']);
  const rt = route();
  if (E.life) run(E.life[rt]);
  for (const k of ties().concat(djroute() ? ['N1'] : [])) if (E.threads && E.threads[k]) run(E.threads[k]);
  run(E.dawn);
  const conn = ties().length >= CONN_NEED, djh = G.dj >= DJ_HIGH;
  const ending = djroute() && djh ? 'E' : conn && djh ? 'A' : conn ? 'B' : djh ? 'C' : 'D';
  if (E.endings && E.endings[ending]) run(E.endings[ending].script);
  return { G, rt: djroute() ? 'natsume' : rt, ending, ties: ties(), draw: drawLevel(), sayno: G.flags.has('hi_no') || G.flags.has('mi_no') };
}

const tally = {}; const add = (k, v) => { tally[k] = tally[k] || {}; tally[k][v] = (tally[k][v] || 0) + 1; };
let djSum = 0, tieSum = 0;
for (let i = 0; i < RUNS; i++) {
  const r = play();
  add('ending', r.ending); add('route', r.rt); add('route×ending', r.rt + '/' + r.ending); add('draw', r.draw); add('sayno', r.sayno);
  add('ties', r.ties.length);
  for (const id of IDS) add('res:' + id, r.G.res[id]);
  for (const f of ['ol_words', 'hi_draw', 'hi_no', 'hi_kozue', 'mi_draw', 'mi_tell', 'mi_rush', 'mi_no', 'konbini_words', 'salary_tell', 'musician_song', 'grandpa_call', 'grandpa_one', 'mother_letter', 'n4_bridge', 'kiri_job', 'kiri_ask', 'coaster', 'flower_draw', 'sumie_coaster', 'told_date', 'told_soft', 'keep_light', 'child_tell', 'freelance_no', 'madam_go']) add('flag', f + (r.G.flags.has(f) ? '' : ' ×'));
  djSum += r.G.dj; tieSum += r.ties.length;
}
const pct = (o) => Object.entries(o).sort().map(([k, v]) => `${k}:${(v * 100 / RUNS).toFixed(1)}%`).join('  ');
console.log(`${RUNS}回、ちょうどいい ${P_GOOD * 100}%`);
for (const k of Object.keys(tally)) if (k !== 'flag') console.log(`${k.padEnd(16)} ${pct(tally[k])}`);
console.log('flag            ' + Object.entries(tally.flag).filter(([k]) => !k.endsWith('×')).map(([k, v]) => `${k}:${(v * 100 / RUNS).toFixed(0)}%`).join(' '));
console.log(`平均 dj=${(djSum / RUNS).toFixed(1)}（基準 ${DJ_HIGH}）  平均の糸=${(tieSum / RUNS).toFixed(2)}（基準 ${CONN_NEED}）`);
if (problems.size) { console.log('■ 問題'); for (const [k, v] of problems) console.log(`  ${k}（${v}回）`); }
