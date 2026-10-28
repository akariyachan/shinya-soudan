#!/usr/bin/env node
// 物語データの検証: node tools/check-story.js [--quiet]
// 構文・ラベル・条件式・話者・字数・経路ごとの最小字数/選択回数を調べる。
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const DIR = path.join(ROOT, 'story');
const ORDER = ['frame1.js', 'ol.js', 'student.js', 'frame2.js', 'konbini.js', 'salaryman.js', 'frame3.js', 'musician.js', 'grandpa.js', 'frame4.js', 'mother.js', 'child.js', 'frame5.js', 'freelance.js', 'madam.js', 'epilogue.js', 'epilogue2.js', 'epilogue3.js'];
const quiet = process.argv.includes('--quiet');

const ctx = { window: {}, console };
vm.createContext(ctx);
let errors = 0, warns = 0;
const err = (m) => { errors++; console.log('  ✗ ' + m); };
const warn = (m) => { warns++; if (!quiet) console.log('  △ ' + m); };

const files = fs.readdirSync(DIR).filter(f => f.endsWith('.js'));
const sorted = ORDER.filter(f => files.includes(f)).concat(files.filter(f => !ORDER.includes(f)).sort());
for (const f of sorted) {
  const code = fs.readFileSync(path.join(DIR, f), 'utf8');
  try { new vm.Script(code, { filename: f }).runInContext(ctx); }
  catch (e) { err(`${f}: ${e.message}`); }
}
const S = ctx.window.STORY;
for (const f of sorted) {
  const code = fs.readFileSync(path.join(DIR, f), 'utf8');
  for (const w of ['腕時計', '拓海', '宇佐美 拓海', '貴之']) if (code.includes(w)) err(`${f}: 使わない言葉「${w}」がある`);
}
if (!S) { console.log('window.STORY がありません'); process.exit(1); }

const IDS = ['ol', 'student', 'konbini', 'salaryman', 'musician', 'grandpa', 'mother', 'child', 'freelance', 'madam'];
const FACES = 'neutral tense sad tear smile warm laugh blush surprise angry closed sleepy shy'.split(' ');
const SFX = 'door phone pour tune rain thunder page clock'.split(' ');
const FX = 'dark candle none rain snow dawn'.split(' ');
const KINDS = ['near', 'far', 'just', 'odd'];
const STYLES = 'round neat pencil shaky receipt staff child brush sketch'.split(' ');
const SPEAKERS = new Set(IDS.concat(['me', 'dj', 'cat', 'radio']));

const len = (s) => String(s).replace(/\s/g, '').length;

function checkCond(c, where) {
  if (typeof c !== 'string') { err(`${where}: if は文字列で`); return; }
  for (const or of c.split('|')) for (let tok of or.split('&')) {
    tok = tok.trim(); if (tok.startsWith('!')) tok = tok.slice(1).trim();
    if (!tok) { err(`${where}: 空の条件 "${c}"`); continue; }
    let m;
    if ((m = tok.match(/^(good|mid|bad|ok):(\w+)$/))) { if (!IDS.includes(m[2])) err(`${where}: 不明なID ${m[2]}`); continue; }
    if ((m = tok.match(/^tie:T([1-8])$/))) continue;
    if (/^route:(nanami|haruka|alone)$/.test(tok)) continue;
    if (/^draw[012]$/.test(tok) || ['sayno', 'designer', 'pop_job', 'wakai'].includes(tok)) continue;
    if (/^route:/.test(tok)) { err(`${where}: 不明なルート "${tok}"`); continue; }
    if (/^(dj|cat)\s*(>=|<=|>|<|==)\s*-?\d+$/.test(tok)) continue;
    if (['conn', 'djhigh', 'cathigh', 'djroute'].includes(tok)) continue;
    if (/^[A-Za-z_]\w*$/.test(tok)) continue;
    err(`${where}: 条件式が読めない "${tok}"`);
  }
}

function checkSteps(steps, where, labels, ctxKind) {
  if (!Array.isArray(steps)) { err(`${where}: 配列ではない`); return; }
  steps.forEach((st, i) => {
    const w = `${where}[${i}]`;
    if (typeof st === 'string') { if (!st.trim()) warn(`${w}: 空文字`); return; }
    if (Array.isArray(st)) {
      if (st.length !== 2 || typeof st[0] !== 'string' || typeof st[1] !== 'string') { err(`${w}: セリフは ['話者','本文']`); return; }
      if (/^「.*」$/.test(st[1])) warn(`${w}: セリフに「」は不要`);
      return;
    }
    if (!st || typeof st !== 'object') { err(`${w}: 不明なステップ`); return; }
    const keys = Object.keys(st);
    if ('choice' in st) {
      if (!Array.isArray(st.choice) || st.choice.length < 2) { err(`${w}: choice は2枚以上`); return; }
      if (st.choice.length > 4) warn(`${w}: カードが5枚以上`);
      st.choice.forEach((c, j) => {
        const cw = `${w}.choice[${j}]`;
        if (!c.t) err(`${cw}: t がない`);
        else if (len(c.t) > 48) warn(`${cw}: カード文が長い(${len(c.t)}字)`);
        if (ctxKind === 'visitor' && !c.free && !KINDS.includes(c.k)) err(`${cw}: k が不正 (${c.k})`);
        if (c.k === 'odd' && c.good === false && typeof c.m !== 'number') err(`${cw}: odd good:false は m 必須`);
        if (!Array.isArray(c.r) || !c.r.length) err(`${cw}: r（反応）がない`);
        else checkSteps(c.r, cw + '.r', labels, ctxKind);
        if (c.go && !labels.includes(c.go)) err(`${cw}: go 先ラベル "${c.go}" がない`);
      });
      return;
    }
    if ('if' in st) {
      checkCond(st.if, w);
      if (!st.then) err(`${w}: then がない`); else checkSteps(st.then, w + '.then', labels, ctxKind);
      if (st.else) checkSteps(st.else, w + '.else', labels, ctxKind);
      return;
    }
    if ('go' in st) { if (!labels.includes(st.go)) err(`${w}: go 先ラベル "${st.go}" がない`); return; }
    for (const k of keys) {
      if (k === 'f') { if (!FACES.includes(st.f)) err(`${w}: 表情 "${st.f}" が不明`); }
      else if (k === 'say') { if (len(st.say) > 18) warn(`${w}: ひとことが長い "${st.say}"`); }
      else if (k === 'sfx') { if (!SFX.includes(st.sfx)) err(`${w}: sfx "${st.sfx}" が不明`); }
      else if (k === 'fx') { if (!FX.includes(st.fx)) err(`${w}: fx "${st.fx}" が不明`); }
      else if (k === 'show') { if (!(IDS.includes(st.show) || ['dj', 'cat', 'none'].includes(st.show))) err(`${w}: show "${st.show}" が不明`); }
      else if (['set', 'dj', 'cat', 'time', 'reveal', 'name', 'pause', 'end'].includes(k)) { /* ok */ }
      else if (k === 'free') { /* ok */ }
      else err(`${w}: 不明なキー "${k}"`);
    }
  });
}

// ランダムに経路をたどって字数と選択回数を測る
function simulate(script, runs) {
  let minChars = Infinity, maxChars = 0, sumChars = 0, minChoices = Infinity, maxChoices = 0;
  for (let r = 0; r < runs; r++) {
    let chars = 0, choices = 0, steps = 0, guard = 0;
    const run = (arr) => {
      for (let i = 0; i < arr.length; i++) {
        if (++steps > 5000) throw new Error('ステップが多すぎる（ループ？）');
        const st = arr[i];
        if (typeof st === 'string') chars += len(st);
        else if (Array.isArray(st)) chars += len(st[1]);
        else if (st.choice) {
          if (!st.choice.every(c => c.free)) choices++;
          const c = st.choice[Math.floor(Math.random() * st.choice.length)];
          const g = run(c.r || []); if (g) return g;
          if (c.go) return c.go;
        } else if (st.if) {
          const g = run(Math.random() < 0.5 ? st.then : (st.else || [])); if (g) return g;
        } else if (st.go) return st.go;
      }
      return null;
    };
    let label = 'start';
    while (label) { if (++guard > 200) throw new Error('ラベル移動が多すぎる'); label = run(script[label]); }
    minChars = Math.min(minChars, chars); maxChars = Math.max(maxChars, chars); sumChars += chars;
    minChoices = Math.min(minChoices, choices); maxChoices = Math.max(maxChoices, choices);
  }
  return { minChars, maxChars, avgChars: Math.round(sumChars / runs), minChoices, maxChoices };
}

function totalChars(x) {
  if (typeof x === 'string') return len(x);
  if (Array.isArray(x)) return x.reduce((a, b) => a + totalChars(b), 0);
  if (x && typeof x === 'object') return Object.entries(x).reduce((a, [k, v]) => a + (['img', 'id', 'k', 'f', 'go', 'set', 'if', 'sfx', 'fx', 'show', 'letterStyle', 'time'].includes(k) ? 0 : totalChars(v)), 0);
  return 0;
}

function checkScript(scr, where, kind) {
  if (!scr || !scr.start) { err(`${where}: script.start がない`); return null; }
  const labels = Object.keys(scr);
  for (const l of labels) checkSteps(scr[l], `${where}.${l}`, labels, kind);
  try { return simulate(scr, 400); } catch (e) { err(`${where}: ${e.message}`); return null; }
}

let grand = 0;
console.log('■ 相談者');
for (const id of IDS) {
  const v = S.visitors && S.visitors[id];
  if (!v) { err(`${id}: 未作成`); continue; }
  console.log(`- ${id} ${v.name || '?'}（第${v.night}夜）`);
  ['name', 'short', 'label', 'img', 'night'].forEach(k => { if (!v[k]) err(`${id}: ${k} がない`); });
  if (v.img && !fs.existsSync(path.join(ROOT, v.img))) err(`${id}: 画像 ${v.img} がない`);
  if (v.letterStyle && !STYLES.includes(v.letterStyle)) err(`${id}: letterStyle 不明`);
  const sim = checkScript(v.script, id, 'visitor');
  if (sim) {
    console.log(`    本文: 最小${sim.minChars}字 / 平均${sim.avgChars}字 / 最大${sim.maxChars}字、選択 ${sim.minChoices}〜${sim.maxChoices}回`);
    if (sim.minChars < 3000) warn(`${id}: 最小経路の本文が3000字未満`);
    if (sim.minChoices < 4) err(`${id}: 選択が4回未満の経路がある`);
  }
  for (const r of ['good', 'mid', 'bad']) {
    if (!v.outcome || !v.outcome[r]) err(`${id}: outcome.${r} がない`);
    if (v.when) checkCond(v.when, `${id}.when`);
    const L = v.letters && v.letters[r];
    if (!L || !L.text) { err(`${id}: letters.${r} がない`); continue; }
    const n = len(L.text);
    if (n < 400 || n > 760) warn(`${id}: 手紙 ${r} が ${n}字`);
    if (!quiet) console.log(`    手紙 ${r}: ${n}字`);
    for (const rt of ['nanami', 'haruka', 'alone']) {
      const L2 = v.letters[r + '_' + rt]; if (!L2) continue;
      const n2 = len(L2.text); if (n2 < 400 || n2 > 760) warn(`${id}: 手紙 ${r}_${rt} が ${n2}字`);
      if (!quiet) console.log(`    手紙 ${r}_${rt}: ${n2}字`);
    }
  }
  if (id === 'freelance') for (const r of ['good', 'mid', 'bad']) for (const rt of ['nanami', 'haruka', 'alone']) if (!v.letters || !v.letters[r + '_' + rt]) err(`freelance: letters.${r}_${rt} がない`);
  grand += totalChars(v);
}

console.log('■ 夜');
for (let n = 1; n <= 5; n++) {
  const N = S.nights && S.nights[n];
  if (!N) { err(`第${n}夜: 未作成`); continue; }
  ['title', 'sub', 'order', 'clock', 'prologue', 'monologue'].forEach(k => { if (!N[k]) err(`第${n}夜: ${k} がない`); });
  (N.order || []).forEach(o => { if (!IDS.includes(o) && o !== 'dj' && o !== 'cat' && !(N.scenes && N.scenes[o])) err(`第${n}夜: order に不明 ${o}`); });
  for (const [k, sc] of Object.entries(N.scenes || {})) {
    if (sc.if) checkCond(sc.if, `第${n}夜.scenes.${k}.if`);
    const s = checkScript(sc.script, `第${n}夜.scenes.${k}`, 'frame');
    if (s) console.log(`- 第${n}夜 場面 ${k}: 最小${s.minChars}字`);
  }
  for (const k of ['prologue', 'monologue', 'morning']) if (N[k]) checkSteps(N[k], `第${n}夜.${k}`, [], 'frame');
  if (N.dj) { const s = checkScript(N.dj.script, `第${n}夜.dj`, 'frame'); if (s) { console.log(`- 第${n}夜 ナツメ: 最小${s.minChars}字 選択${s.minChoices}回`); if (s.minChars < 1500) warn(`第${n}夜 ナツメが1500字未満`); } }
  else err(`第${n}夜: dj がない`);
  if (N.cat) { const s = checkScript(N.cat.script, `第${n}夜.cat`, 'frame'); if (s) console.log(`- 第${n}夜 猫: 最小${s.minChars}字`); }
  console.log(`- 第${n}夜 開店${totalChars(N.prologue)}字 / 独白${totalChars(N.monologue)}字 / 朝${totalChars(N.morning || [])}字`);
  grand += totalChars(N);
}

console.log('■ エピローグ');
const E = S.epilogue;
if (!E || !E.endings) err('エピローグ未作成');
else {
  checkSteps(E.intro || [], 'epilogue.intro', [], 'frame');
  checkSteps(E.dawn || [], 'epilogue.dawn', [], 'frame');
  const grp = { people: ['ol', 'salaryman', 'musician', 'grandpa', 'mother', 'madam'] };
  for (const k of ['T1', 'T3', 'T4', 'T6', 'T7', 'N1']) {
    const T = E.threads && E.threads[k];
    if (!T) { err(`epilogue.threads.${k} がない`); continue; }
    checkSteps(T, `epilogue.threads.${k}`, [], 'frame');
    console.log(`- 糸 ${k}: ${totalChars(T)}字`);
  }
  checkSteps(E.intro || [], 'epilogue.intro', [], 'frame');
  console.log(`- 夜明けの電話 ${totalChars(E.intro || [])}字 / 春の夜明け ${totalChars(E.dawn || [])}字`);
  for (const g of Object.keys(grp)) for (const id of grp[g]) {
    const p = E[g] && E[g][id];
    if (!p) { err(`epilogue.${g}.${id} がない`); continue; }
    for (const r of ['good', 'mid', 'bad']) { if (!p[r]) err(`epilogue.${g}.${id}.${r} がない`); else checkSteps(p[r], `epilogue.${g}.${id}.${r}`, [], 'frame'); }
  }
  for (const rt of ['nanami', 'haruka', 'alone']) {
    const L = E.life && E.life[rt];
    if (!L) { err(`epilogue.life.${rt} がない`); continue; }
    checkSteps(L, `epilogue.life.${rt}`, [], 'frame');
    console.log(`- 彼の物語 ${rt}: ${totalChars(L)}字（全分岐の合計）`);
    if (!E.routes || !E.routes[rt] || !E.routes[rt].name) err(`epilogue.routes.${rt}.name がない`);
  }
  for (const h of ['high', 'low']) for (const rt of ['nanami', 'haruka', 'alone', 'natsume']) { const k = h + '_' + rt, L = E.djLetter && E.djLetter[k]; if (!L) err(`djLetter.${k} がない`); else console.log(`- ナツメの手紙 ${k}: ${len(L.text)}字`); }
  for (const k of ['A', 'B', 'C', 'D', 'E']) {
    const en = E.endings[k];
    if (!en) { err(`ending ${k} がない`); continue; }
    checkSteps(en.script, `ending.${k}`, [], 'frame');
    const n = totalChars(en.script);
    console.log(`- エンディング${k}「${en.name}」: ${n}字`);
    if (n < 2000) warn(`ending ${k} が2000字未満`);
  }
  grand += totalChars(E);
}

console.log(`\n総文字数（story/ の本文概算）: 約${grand.toLocaleString()}字`);
console.log(errors ? `エラー ${errors} 件、注意 ${warns} 件` : `エラーなし（注意 ${warns} 件）`);
process.exit(errors ? 1 : 0);
