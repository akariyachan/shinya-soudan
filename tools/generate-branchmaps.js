#!/usr/bin/env node
'use strict';
// 依存ライブラリ不要。出力は決定的。--check は書き換えず差分を検出する。
const fs = require('fs');
const path = require('path');
const { load, extract, sample, functionSource, hash, ROOT } = require('./lib/branchmap-model');
const M = load(), A = extract(M), C = M.constants, S = M.S;
const OUT = 'docs/obsidian';
const check = process.argv.includes('--check');
const runArg = process.argv.find(a => a.startsWith('--runs='));
const runs = runArg ? Number(runArg.slice(7)) : 3000;
if (!Number.isInteger(runs) || runs < 1) throw new Error('--runs は正の整数');

// 手で意味を付けた図と、同期進行モデルの対応を点検した版。
// 関数本体が変わったら黙って旧説明を出さず、実装を再読して図・モデルを更新する。
const REVIEWED = {
  okId: '66122b5e90acc373bb6fce16f29eba5fbc77f99d471a33ac2095cdd4b82bad51',
  tieList: '6fe09d49b6c8387ec3c7143081c9328dba4430be31380fc56415fce9bbdcdea2',
  connHigh: 'b86917aa7e3429ca9e82f167d3cb7d0a2a46c45412f2c8e03e055d3abcb0801e',
  djHigh: '6e02613edb0436f27aa9d38cc482b3b583c6ad09f375e0f13ed8437f01c06a99',
  evalTok: '7cca0516cfab85a29b674450362b2b8cf783131f186b9762130b422ef66e6ecc',
  cond: 'd5acb2413f11b13badfeac2734392da1f3ab9a7d9ba80e347f9200b3489edd55',
  route: '344479c8034b72e74bea25c209d4cc351bc7f61474c102aa550002ff3995b3f9',
  djAt2High: '58dd3afa8d1a974622daddc4abf09ff3539f6df28823054bef586606982b5e18',
  djRoute: '22cb0a80f88ed920879ef4daff9aeaf33d2ebba78b032bcc7c1394df9f791196',
  routeKey: 'ebb9130d99cc7ef2e185d1b56bbdeeafb5289cf62d61d9123487632aba7f7470',
  tieOn: 'ac680dc4464017d96b66467caf188769ec97da6e0dcd5115882ebceeec34c520',
  popJob: 'a86cc83e6c4262834c42aae00e4117650e16cd316566b8dd1356d6fb462bf56a',
  designer: 'e0d4c310847eafde13fc6fd356acb6a05881e3e8700b3ce4c543a1a4c67c4b69',
  drawLevel: '5b2ca56eaedd8b0ede842a25faa27b38270b89fe0c98da17a1c8659eb79aadfd',
  wakai: 'a970707e0ae3d177b6ad82d20917c405164d517d6fbf309910a4cab3d483c11a',
  applyChoice: 'ae9814164d1220adcb70d1136edd3da2a11d8a2c0ac1b41c177ce05338416536',
  resultOf: '550f76613b88d207a17adec00cad8884666b3737f73c2045a0cccdc12b42cf9d',
  decideEnding: '211935d3cc28fc4d5077e77b9b6a5cfaf7a068a05268125856f800f886571cc0',
  runSteps: 'f3d2c939409e5edf2620c76bfc91419728f29c13931b8fb873e7951d8db732a9',
  runScript: '8a48fc39694b846e1941232e86f9b56a98e57e4a6710bb4b17e508aaaa99a855',
  runVisitor: 'f0084213af8e0e1202f56381bea004c39722489804723af4f6d1fcf12339acf2',
  runFrameSeg: 'dbe3909275091e87860841320e54aae2e1eee78d7abd347710670e1b8f9c8d6e',
  runScene: '6f7e131a55b4c7431d0f3c7a2669d4ca9038c5843ce636eff0980656df4279b2',
  runPlain: '3064810c7548d5265b7fd74afb0a11a35983e45efc9bb7c42df345f50e2934bd',
  playNight: 'bf5f26b11f078833881f5c74c5974e60eea6d25eec8a0f0167e899f48fc22157',
  morningLetters: '807f7f2e8e04201542b15905ce787452f7eb6776bd05dd5430b9058a446e97af',
  playEpilogue: '90b4067bc639982828d225fd10902e4556d769e52dd69c180892826019a65582',
};
for (const [n, digest] of Object.entries(REVIEWED)) if (hash(M.functions[n] || functionSource(M.html, n)) !== digest) throw new Error(`要確認: ${n} の実装が変わりました。図の注釈と進行モデルを確認して REVIEWED を更新してください。`);
const coverage = sample(M, A, runs);
const proofFile = path.join(ROOT, 'docs/obsidian/data/reachability.json');
if (!fs.existsSync(proofFile)) throw new Error('先に node tools/prove-reachability.js を実行してください。');
const proof = JSON.parse(fs.readFileSync(proofFile, 'utf8'));
for (const [file, digest] of Object.entries({ ...M.sources, ...proof.sourceHashes })) {
  if (proof.sourceHashes[file] !== digest || hash(fs.readFileSync(path.join(ROOT, file), 'utf8')) !== digest)
    throw new Error(`到達性の証拠が古い: ${file}。node tools/prove-reachability.js を再実行してください。`);
}
const files = new Map();
const kanji = ['', '第一夜', '第二夜', '第三夜', '第四夜', '第五夜'];
const e = s => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\|/g, '&#124;').replace(/\r?\n/g, ' ');
const cell = s => String(s ?? '—').replace(/\|/g, '&#124;').replace(/\n/g, '<br>');
const code = s => '`' + String(s) + '`';
const reproduce = id => `${code(`node tools/prove-reachability.js --replay=${id}`)}（${link(`${OUT}/data/reachability.json`, '選択列・メモ回収列・既読集合')} の ${code(`witnesses["${id}"]`)}）`;
const statusLabel = row => row.status === '到達不能（証明）' ? '到達不能（論証）' : row.witness ? '到達可能（再現確認）' : row.status;
const definite = row => `確定：${statusLabel(row)}。` + (row.witness ? reproduce(row.witness) : row.basis);
const short = (s, n = 26) => String(s || '').length > n ? String(s).slice(0, n - 1) + '…' : String(s || '');
const table = (heads, rows) => '\n' + [heads, heads.map(() => '---'), ...rows].map(r => '| ' + r.map(cell).join(' | ') + ' |').join('\n') + '\n';
let page = '';
const link = (target, label) => `[${label || target}](${path.posix.relative(path.posix.dirname(`${OUT}/${page}`), target)})`;
const ref = (source, full = false) => source ? `${link(source.file, source.file)} · ${code(full ? source.pointer : source.pointer.replace(/^STORY\./, ''))}` : '要確認';
const engine = n => { const index = M.html.indexOf(M.functions[n] || functionSource(M.html, n)); const line = M.html.slice(0, index).split('\n').length; return `${link('index.html', 'index.html')} L${line} ${code(n + '()')}`; };
const md = (file, title, build) => { page = file; files.set(`${OUT}/${file}`, `# ${title}\n\n> 自動生成：\`node tools/generate-branchmaps.js\`。実装の動作を記述。ネタバレを含みます。\n\n${build()}\n`); };
const diagram = lines => '\n```mermaid\nflowchart TD\n' + lines.join('\n') + '\n```\n';
const node = (id, text, kind = 'box') => `  ${id}${kind === 'choice' ? '{"' : kind === 'end' ? '(["' : '["'}${e(text)}${kind === 'choice' ? '"}' : kind === 'end' ? '"])' : '"]'}`;
const arrow = (a, b, label = '', dashed = false) => `  ${a} ${dashed ? '-.->' : '-->'}${label ? `|"${e(label)}"|` : ''} ${b}`;
const routeStyle = '  classDef route stroke:#b77c24,stroke-width:4px;';
const putJSON = (file, data) => files.set(`${OUT}/${file}`, JSON.stringify(data, null, 2) + '\n');
const person = id => S.visitors[id]?.name || (id === 'dj' ? 'ナツメ' : id === 'cat' ? '黒猫' : id);
const objFor = (N, id) => N.scenes?.[id] || (id === 'dj' || id === 'cat' ? N[id] : S.visitors[id]);
const titleFor = (N, id) => N.scenes?.[id]?.title || `${person(id)}（${id}）`;
const conditionsOf = prefix => A.conditions.filter(c => c.source.pointer.startsWith(prefix));
const flagNames = [...new Set(A.writes.filter(w => w.operation === 'set').map(w => w.state))].sort();
const flagConditions = f => A.conditions.filter(c => String(c.expression).split(/[&|]/).some(t => t.trim().replace(/^!\s*/, '') === f));
const flagFunctions = f => Object.entries(M.functions).filter(([, s]) => s.includes(`'${f}'`)).map(([n]) => n);
const flagsNoRead = flagNames.filter(f => !flagConditions(f).length && !flagFunctions(f).length);
// 式だけで結び付けない。同じ式でもソース位置・条件側ごとに判定が異なる。
const conditionRows = new Map(proof.conditionResults.map((r, i) => [r, `condition-${String(i + 1).padStart(2, '0')}`]));
const endingRows = new Map(proof.routeEndingResults.map(r => [r, `ending-${r.key.replace('/', '-')}`]));
const rowId = r => conditionRows.get(r) || endingRows.get(r);
const statusLink = r => link(`${OUT}/30_検証と要確認.md#${rowId(r)}`, statusLabel(r));
const verificationEntry = r => `\n### ${rowId(r)}\n\n${r.source ? `${ref(r.source)}。${code(`${r.expression} = ${r.value}`)}` : code(r.key)}\n\n${definite(r)}\n`;
const resultsFor = c => proof.conditionResults.filter(r => r.source.id === c.source.id && r.type === c.type);
const sideStatus = rows => rows.length ? rows.map(r => `${code(rowId(r))} ${code(`${r.expression} = ${r.value}`)}：${statusLink(r)}`).join('<br>') : '個別判定なし';
const legend = () => '\n## 到達性の凡例\n\nグレーの破線ノード・矢印＝**到達不能（論証）**。**到達可能（再現確認）**＝初期状態から実エンジンで再生済み。状態リンクから検証資料の該当見出しへ移動できます。判定は記載したソース位置とtrue／false側だけに適用します。通常色の図や「個別判定なし」は到達可能の保証ではありません。通常の破線は状態依存にも使います。\n';
const unreachableStyle = '  classDef unreachable fill:#eeeeee,stroke:#888888,color:#555555,stroke-width:1px,stroke-dasharray:5 5;';
function reachabilityView(rows, heading = '条件側の到達性') {
  if (!rows.length) return '';
  // 独立した条件を横に並べすぎるとObsidianで縮小されるため、最大3件ずつ。
  if (rows.length > 3) return Array.from({ length: Math.ceil(rows.length / 3) }, (_, i) => reachabilityView(rows.slice(i * 3, i * 3 + 3), `${heading}（${i + 1}）`)).join('');
  const lines = [], dead = [], edgeStyles = [];
  rows.forEach((r, i) => {
    const id = rowId(r), q = `q${i}`, s = `s${i}`, unreachable = r.status === '到達不能（証明）';
    const context = r.source.pointer.startsWith('STORY.epilogue.endings.') ? `ED ${r.source.pointer.split('.')[3]}` : r.source.pointer.replace(/^.*\.script\./, '').replace(/^STORY\.epilogue\.(people|life|threads)\./, '').split('.').slice(0, 2).join('.');
    lines.push(node(q, `${id} ${context}：${r.expression}`, 'choice'), node(s, statusLabel(r)), arrow(q, s, `${r.value}（${r.value ? 'then' : 'else／続行'}）`, unreachable));
    if (unreachable) { dead.push(s); edgeStyles.push(`  linkStyle ${i} stroke:#888888,stroke-width:1px,stroke-dasharray:5 5;`); }
  });
  if (dead.length) lines.push(unreachableStyle, `  class ${dead.join(',')} unreachable;`, ...edgeStyles);
  return `\n\n#### ${heading}\n\n移動先が同じ会話差分も、条件の片側として表示しています。図の番号は下表に対応します。\n${diagram(lines)}` +
    table(['番号・参照位置', '条件側', '状態・検証行'], rows.map(r => [code(rowId(r)) + '<br>' + ref(r.source), code(`${r.expression} = ${r.value}`), statusLink(r)]));
}

md('00_全体マップ.md', '深夜の相談室 — 全体マップ', () => {
  const lines = [];
  for (let n = 1; n <= 5; n++) {
    const N = S.nights[n], visitors = N.order.filter(id => S.visitors[id]).map(id => person(id) + (S.visitors[id].when ? '※' : ''));
    lines.push(node(`n${n}`, `${kanji[n]}：${visitors.join('・')}`));
    if (n > 1) lines.push(arrow(`n${n - 1}`, `n${n}`, '翌朝の手紙を経て'));
  }
  lines.push(node('gate4', '第四夜の差し替え'), node('haruka4', 'haruka：遥＋ひより'), node('nanami4', 'nanami：満月の空席＋停電の電話'), node('dj4', 'djroute：遥＋停電の歌'), node('alone4', 'alone・非DJ：遥＋停電の電話'));
  lines.push(arrow('n4', 'gate4', '', true), arrow('gate4', 'haruka4', 'route:haruka', true), arrow('gate4', 'nanami4', 'route:nanami', true), arrow('gate4', 'dj4', 'djroute', true), arrow('gate4', 'alone4', 'route:alone & !djroute', true));
  lines.push(node('epi', 'エピローグ：電話→第五夜の手紙→春→人生→深い糸→夜明け'), arrow('n5', 'epi'), node('ed', 'ED A〜E：糸の本数・最終dj・djroute', 'end'), arrow('epi', 'ed'));
  return `最初にこの図で夜の順番を確認し、気になる夜だけリンク先を開いてください。※の相談者は条件により来訪しません。各夜にナツメ・猫の場面、閉店後の独白、追加の短い場面があります。\n${diagram(lines)}\n` +
    kanji.slice(1).map((k, i) => `- [[nights/${k}|${k}]]：${S.nights[i + 1].sub}`).join('\n') +
    '\n- [[10_ルートとED|ルート・人物の糸・ED]]\n- [[20_フラグ依存関係|選択が後にどう響くか]]\n- [[30_検証と要確認|確定した到達性と再現手順]]\n- [[00_全体マップ.canvas|動かせるCanvas]]\n\n' +
    '## 読み方\n\n進行分岐はシーンやラベルの移動、状態分岐は数値・フラグによる表示や判定の変化、物語上の分岐は人物関係や人生の描写への影響です。進行は夜別図、状態は表と依存図、物語上の意味は根拠を添えた説明に分けています。\n\n実線＝進行、条件ラベル付き実線＝条件つき進行、破線＝状態への依存、ひし形＝選択・判定、太枠＝重要なルート判定、丸い終端＝終了。図中の選択番号は、元の `choice` / `acts` 配列の1始まりです。会話の全文は省き、同じ遷移先をまとめています。\n\n' +
    legend() + `## 実装上の要点\n\n- 人生の ${code('route()')} は七海／遥／ひとりの3種。ナツメは ${code('routeKey()')} が返す追加の表示キーで、人生はひとりです。EDとは別の軸です。\n- 第二夜は湊→ナツメ→梢の順。${code('djAt2')} はナツメの場面終了時に記録されるため、湊終了直後の人生判定は暫定です。\n- 第三夜の朝の ${code('kiri_ask → kiri_job')} を飛ばさず確認してください。\n- 第五夜の朝と手紙はエピローグの冒頭の電話の後です。\n\n進行の根拠：${engine('playNight')}、${engine('morningLetters')}、${engine('playEpilogue')}。設定資料の旧案より実装を優先しています。`;
});

function labelDiagram(sc) {
  const lines = [], ids = new Map(sc.labels.map((l, i) => [l, `l${i}`]));
  for (const l of sc.labels) lines.push(node(ids.get(l), `${sc.labelSummaries[l]}（${l}）`));
  lines.push(node('done', 'この場面を終了', 'end'));
  for (const [label, outs] of Object.entries(sc.transitions)) {
    const groups = new Map();
    for (const o of outs) { const key = o.target || '__end'; if (!groups.has(key)) groups.set(key, []); groups.get(key).push(o.guards.join(' & ') || '通常'); }
    const from = ids.get(label);
    let origin = from;
    if (groups.size > 1) { origin = `${from}q`; lines.push(node(origin, '選択／条件', 'choice'), arrow(from, origin)); }
    for (const [target, guards] of groups) {
      const unique = [...new Set(guards)];
      const labelText = groups.size > 1 ? short(unique.slice(0, 2).join(' / ') + (unique.length > 2 ? ' / …' : ''), 65) : '';
      lines.push(arrow(origin, ids.get(target) || 'done', labelText));
    }
  }
  return diagram(lines);
}
function effects(o, visitor) {
  const parts = [];
  if (o.set?.length) parts.push(o.set.join(', ') + ' ON');
  for (const k of ['dj', 'cat']) if (typeof o[k] === 'number') parts.push(`${k} ${o[k] >= 0 ? '+' : ''}${o[k]}`);
  if (visitor && !o.free && o.k) parts.push(`距離:${o.k}${o.meter != null ? ` m${o.meter >= 0 ? '+' : ''}${o.meter}` : ''}${o.good === false ? ' good:false' : ''}`);
  return parts.join(' / ') || '採点なし・直接の状態変更なし';
}
for (let n = 1; n <= 5; n++) md(`nights/${kanji[n]}.md`, `${kanji[n]} — ${S.nights[n].sub}`, () => {
  const N = S.nights[n], lines = [node('open', '開店前 prologue')];
  let prev = 'open', seq = 0;
  for (const id of N.order) {
    const data = objFor(N, id), cond = data?.when || data?.if, x = `p${++seq}`;
    if (cond) { const q = `${x}q`, merge = `${x}m`; lines.push(node(q, `${id} の実行条件`, 'choice'), arrow(prev, q), node(x, titleFor(N, id)), arrow(q, x, cond), node(merge, '合流'), arrow(x, merge), arrow(q, merge, `NOT (${cond})：スキップ`)); prev = merge; }
    else { lines.push(node(x, titleFor(N, id)), arrow(prev, x)); prev = x; }
    if (n === 2 && id === 'dj') { lines.push(node('fixed', `djAt2 ← dj：入口判定が確定`), arrow(prev, 'fixed'), '  class fixed route;', routeStyle); prev = 'fixed'; }
  }
  lines.push(node('mono', '閉店後 monologue'), arrow(prev, 'mono')); prev = 'mono';
  for (const id of N.after || []) { const data = N.scenes[id], x = `a${++seq}`; lines.push(node(x, `${titleFor(N, id)} after:${id}`), arrow(prev, x, data.if || '')); if (data.if) lines.push(arrow(prev, `${x}m`, `NOT (${data.if})`), node(`${x}m`, '合流'), arrow(x, `${x}m`)); prev = data.if ? `${x}m` : x; }
  lines.push(node('morning', n === 5 ? 'エピローグ冒頭の電話→翌朝と手紙' : '翌朝 morning→相談者の手紙'), arrow(prev, 'morning'));
  let text = `[[../00_全体マップ|全体へ]] · [[../10_ルートとED|判定の詳細]]\n${legend()}\n## この夜の進行\n${diagram(lines)}\n根拠：${ref(M.locations.get(N))} の ${code('order / after / prologue / monologue / morning')}。\n`;
  if (n === 2) text += `\n**確定タイミングに注意**：湊の結果が出た後でも、${code('djAt2')} はまだ null。ナツメ終了時に累積 ${code('dj')} を保存し、その後の ${code('route()')}／${code('djRoute()')} はその保存値を使います。後の dj 増減は入口を変えません。\n`;
  if (n === 3) text += `\n**朝の処理が仕事を確定**：${code('kiri_ask')} があれば ${code('morning')} の名刺受け渡しで ${code('kiri_job')} が立ちます。独白・after と朝の間で状態が違います。\n`;
  if (n === 4) text += '\n**第四夜の差し替え**：七海ルートでは遥が来ず、ひよりは遥ルートだけ。`alt4` と `kozue4` は順に条件評価されます。条件不成立は図の合流先へ進みます。\n';
  text += '\n## 場面ごとの分岐\n\nノードは短い場面の言葉とコード内のラベル名です。図の選択番号は該当choice/acts内の1始まり、表の先頭番号はscript全体でのカード群の通し番号（acts含む）です。ソース内位置で照合できます。同じ移動先は合流させています。表示条件の「制限なし」は、そのラベル・外側の条件を通ってカード群が実行されている場合を指します。状態を変える選択は表を優先して確認してください。全条件の正確な配列位置は [[../details/条件索引|条件索引]] と `data/branch-model.json` にあります。\n';
  const consequences = {
    1: '`ol_words` は七海の言葉と後の既読の描写、`hi_draw` は三好の絵を持ち続ける描写とdraw判定、`hi_song` は梢との歌・葉書の差分へつながります。独立した人生ルートはこの夜だけでは決まりません。',
    2: '`mi_tell / mi_rush / konbini_words` は三好の人生の優先判定へ、`coaster` は第三夜の桐島の仕事の話へつながります。梢の`musician_song`は以後の歌の差分で参照されます。',
    3: '`kiri_job` は仕事とT4へ、`kiri_ask` は翌朝の名刺受け渡しへつながります。`grandpa_call` は第四夜の澄江の戸口や鉢合わせの描写で参照され、澄江の第五夜の相談自体をスキップする条件ではありません。',
    4: '`mother_letter / n4_bridge` は第五夜の澄江の結果と合わせて和解の判定へ。`child_tell` は次の夜の未来の三好の相談に差分を作ります。ナツメの選択は最終djを積み上げますが、入口djAt2を変えません。',
    5: '`flower_draw` は澄江が絵を受け取る`sumie_coaster`へ、`told_date / told_soft` は人生エピローグの回想へつながります。`keep_light` はナツメルートの全カードでONになり、継続の回想に使われます。Eの判定はdjrouteと最終djです。',
  };
  text += `\n### 後の展開への影響\n\n${consequences[n]} 根拠と参照先は [[../20_フラグ依存関係|フラグ依存関係]]・[[../details/条件索引|全参照索引]] にあります。\n`;
  const ordered = [...N.order, ...(N.after || [])];
  for (const id of ordered) {
    const data = objFor(N, id); if (!data?.script) continue;
    const source = M.locations.get(data.script), sc = A.scripts.find(s => s.source.id === source.id);
    text += `\n### ${titleFor(N, id)}\n\n${ref(source)}${data.when || data.if ? `。実行条件：${code(data.when || data.if)}` : ''}。\n`;
    // 短い一本道の補助シーンは図を増やさず、状態の表だけを置く。
    if (sc.labels.length > 1) text += labelDiagram(sc);
    else text += '\n`start` → 場面終了。途中のカードは反応後に同じ流れへ合流します。\n';
    text += reachabilityView(proof.conditionResults.filter(r => r.source.id.startsWith(source.id + '.')));
    const choices = A.choices.filter(c => c.source.pointer.startsWith(source.pointer + '.'));
    const rows = [];
    choices.forEach((c, i) => {
      if (c.type === 'acts') return;
      const significant = c.options.some(o => o.set.length || o.dj != null || o.cat != null || o.go || o.if || o.memo);
      if (!significant) return;
      c.options.forEach(o => rows.push([`${i + 1}-${o.index + 1} ${short(o.text, 27)}`, [o.if, o.memo && `memo:${o.memo}`].filter(Boolean).map(code).join(' & ') || '制限なし', effects(o, !!S.visitors[id]), o.go ? code(o.go) : '反応後に続行／合流', code(o.source.pointer.replace(source.pointer + '.', ''))]));
    });
    if (rows.length) text += table(['選択群-カード・短い文言', '表示条件', '状態変化', '移動', 'ソース内位置'], rows);
    const acts = choices.filter(c => c.type === 'acts').length;
    const ordinary = choices.filter(c => c.type === 'choice' && !c.options.some(o => o.set.length || o.dj != null || o.cat != null || o.go || o.if || o.memo)).length;
    if (acts || ordinary) text += `\n簡略化：acts ${acts}群（採点なし）、直接の状態・移動指定がない通常カード ${ordinary}群（相談者なら距離・結果には影響）。共通の採点式は [[../10_ルートとED#相談結果 good / mid / bad|相談結果]]。\n`;
    const internal = conditionsOf(source.pointer + '.').filter(c => !A.choices.some(ch => ch.options.some(o => o.source.id === c.source.id)));
    if (internal.length) text += '\n参照する状態・条件：' + [...new Set(internal.map(c => code(c.expression)))].join('、') + '。会話差分も含み、すべてが移動分岐になるわけではありません。\n';
  }
  const plainConds = ['prologue', 'monologue', 'morning'].flatMap(k => conditionsOf(`STORY.nights.${n}.${k}`).map(c => [k, code(c.expression), code(c.source.pointer)]));
  if (plainConds.length) text += '\n## 開店前・独白・翌朝の状態参照\n' + table(['場面', '条件', 'ソース内位置'], plainConds);
  return text;
});

md('10_ルートとED.md', 'ルート・人物の糸・エンディング', () => {
  const lines = [node('r1', '七海への気持ちを尊重？', 'choice'), node('rn', '人生：nanami 七海'), node('r2', 'konbini_words？', 'choice'), node('rh', '人生：haruka 遥'), node('r3', `保存済み djAt2 ≥ ${C.DJ_ROUTE_NEED}？`, 'choice'), node('ra', '人生：alone ひとり'), node('r4', 'ok:konbini？', 'choice'), arrow('r1', 'rn', 'mi_tell & !mi_rush & ok:ol'), arrow('r1', 'r2', '上記以外'), arrow('r2', 'rh', 'あり'), arrow('r2', 'r3', 'なし'), arrow('r3', 'ra', 'はい'), arrow('r3', 'r4', 'いいえ／未保存'), arrow('r4', 'rh', 'はい'), arrow('r4', 'ra', 'いいえ'), routeStyle, '  class rn,rh,ra route;'];
  const dj = [node('life', 'route()：三好の人生'), node('snap', `第二夜ナツメ終了：djAt2 ← dj`), node('dq', `konbini結果あり & djAt2 ≥ ${C.DJ_ROUTE_NEED} & route() = alone`, 'choice'), node('dk', 'djRoute = true／routeKey = natsume'), node('normal', 'djRoute = false／routeKey = route()'), arrow('life', 'dq', '', true), arrow('snap', 'dq', '', true), arrow('dq', 'dk', '成立'), arrow('dq', 'normal', '不成立'), routeStyle, '  class dk route;'];
  const ed = [node('e0', `djRoute & dj ≥ ${C.DJ_HIGH}？`, 'choice'), node('e1', `T1〜T8 の成立数 ≥ ${C.CONN_NEED}？`, 'choice'), node('e2', `dj ≥ ${C.DJ_HIGH}？`, 'choice'), node('e3', `dj ≥ ${C.DJ_HIGH}？`, 'choice'), arrow('e0', 'E', 'はい：最優先'), arrow('e0', 'e1', 'いいえ'), arrow('e1', 'e2', 'はい'), arrow('e1', 'e3', 'いいえ'), arrow('e2', 'A', 'はい'), arrow('e2', 'B', 'いいえ'), arrow('e3', 'C', 'はい'), arrow('e3', 'D', 'いいえ'), ...Object.entries(C.ENDINGS).map(([k, v]) => node(k, `${k}：${v}`, 'end'))];
  const ties = C.TIE_NAMES.map(t => {
    const ids = C.TIES[t];
    const condition = ids ? `${ids.map(id => `ok:${id}`).join(' & ')} & うち1人以上good` : t === 'T4' ? 'kiri_job & ok:salaryman & ok:konbini' : t === 'T6' ? 'wakai' : `ok:grandpa & (ok:madam OR cat ≥ ${C.CAT_HIGH}) & (good:grandpa OR good:madam OR cat ≥ ${C.CAT_HIGH + 1})`;
    const meanings = { T1: '七海と桐島', T2: '七海と湊', T3: '陽向と梢', T4: 'コースターから仕事へ', T5: '遥とひより', T6: '遥と澄江の和解', T7: '源さんと千鶴の電話', T8: '三好の三つの夜' };
    return [t, meanings[t], code(condition)];
  });
  return `[[00_全体マップ|全体へ]]\n${legend()}\n## 三好の人生：route()\n\n上から先に成立した条件を採用します。${engine('route')}。第二夜の湊終了時は暫定、ナツメ終了後は入口の値が保存されます。関数は都度評価され、ルート文字列そのものを第二夜に保存する実装ではありません。\n${diagram(lines)}\n## ナツメ：djRoute() と routeKey()\n${diagram(dj)}\n根拠：${engine('djAt2High')}、${engine('djRoute')}、${engine('routeKey')}。${code('djAt2')} は第一夜と第二夜の累積値。現在の dj とは別です。\n\n## 最終ED：人生ルートと独立した判定\n${diagram(ed)}\n根拠：${engine('decideEnding')}。E が優先され、N1 は conn の本数に入りません。${code('keep_light')} はEの判定条件ではありません。ナツメ入口に入っても、最終djが低い場合はBまたはDです。alone/A・B・Cも到達可能（実エンジンで再生確認済み）。全ルート×EDの確定判定・選択列は [[30_検証と要確認#ルート×ED（全行・確定）|検証結果]] にあります。\n` +
    table(['ED', '到達条件'], [['E', `djRoute & dj ≥ ${C.DJ_HIGH}`], ['A', `!djRoute & conn & dj ≥ ${C.DJ_HIGH}`], ['B', `conn & dj < ${C.DJ_HIGH}`], ['C', `!djRoute & !conn & dj ≥ ${C.DJ_HIGH}`], ['D', `!conn & dj < ${C.DJ_HIGH}`]]) +
    `\n## 人物同士のつながり：T1〜T8・N1\n\n${engine('tieOn')}。${code('ok:ID')} はgoodまたはmid。未訪問の人物はokになりません。物語上の名称は ${link('story/BIBLE.md', 'BIBLE §6・§11')} と実装の ${code('epilogue.threads / life')} に対応します。\n` + table(['糸', '物語上のつながり', '成立条件'], [...ties, ['N1', 'ナツメ・店・番組の灯り', 'djRoute()（connには含めない）']]) +
    '\n### 七海・三好・仕事と歌\n\n関係図の矢印は対応する人物・状態を示します。成立条件は上表を参照してください。\n' +
    diagram([node('ol', '七海 ol'), node('salary', '桐島 salaryman'), node('mi', '湊 konbini（今）'), node('hi', '陽向 student（過去）'), node('kozue', '梢 musician'), node('future', '三好 freelance（未来）'), node('t8', 'T8：彼の三つの夜'), arrow('ol', 'salary', 'T1', true), arrow('ol', 'mi', 'T2', true), arrow('hi', 'kozue', 'T3', true), arrow('salary', 'mi', 'T4：仕事', true), arrow('hi', 't8', '', true), arrow('mi', 't8', '', true), arrow('future', 't8', '', true)]) +
    '\n### 家族・源さん・ナツメ\n' +
    diagram([node('haruka', '遥 mother'), node('child', 'ひより child'), node('sumie', '澄江 madam'), node('gen', '源さん grandpa'), node('chizuru', '千鶴の電話'), node('cat', '猫 cat'), node('dj', 'ナツメ dj'), node('light', '店と番組に届く人々'), arrow('haruka', 'child', 'T5', true), arrow('haruka', 'sumie', 'T6：wakai', true), arrow('gen', 'chizuru', 'T7', true), arrow('sumie', 'chizuru', 'T7の成立を支える結果', true), arrow('cat', 'chizuru', 'T7の成立を支える閾値', true), arrow('dj', 'light', 'N1：djRoute', true)]) +
    diagram([node('results', '相談結果 good / mid / bad'), node('flags', '仕事・和解・cat の状態'), node('ties', 'tieOn(T1〜T8)：成立数'), node('conn', `conn：${C.CONN_NEED}本以上`), node('deep', '深い糸：候補・既読で最大2本'), node('n1', 'N1：djRoute のとき必ず描く'), arrow('results', 'ties', '', true), arrow('flags', 'ties', '', true), arrow('ties', 'conn', '', true), arrow('ties', 'deep', '', true), arrow('n1', 'deep', 'natsume枠の1本', true)]) +
    `\n### 和解 wakai\n\n${code('ok:mother & ok:madam')} に加えて、${code('mother_letter / n4_bridge / sumie_coaster')} のうち2個以上。七海ルートでは遥が来ないためT5・T6は成立しません。根拠：${engine('wakai')}。\n\n## エピローグの順番と追加エピソード\n` +
    diagram([node('intro', 'intro：夜明けの電話'), node('letters', '第五夜の morning・相談者の手紙'), node('people', 'people：結果がある6人の春'), node('life', 'life[route()]：彼の人生'), node('deep', 'threads：最大2本'), node('dawn', 'dawn：djhigh で差分'), node('djletter', 'djLetter：high/low × routeKey'), node('ending', 'decideEnding→ED本文', 'end'), arrow('intro', 'letters'), arrow('letters', 'people'), arrow('people', 'life'), arrow('life', 'deep'), arrow('deep', 'dawn'), arrow('dawn', 'djletter'), arrow('djletter', 'ending')]) +
    `\n${engine('playEpilogue')}。peopleの対象は ${code('ol, salaryman, musician, grandpa, mother, madam')}。結果のない人物はスキップし、ある人物はそのgood/mid/badの本文を使います。人生は常に ${code('life[route()]')} で、ナツメも ${code('life.alone')} 内の差分です。\n` +
    table(['routeKey', '深い糸の候補（実装の優先順）', '枠'], Object.entries(C.DEEP_BY_ROUTE).map(([r, t]) => [r, t.join(' → '), r === 'natsume' ? 'N1必須＋成立候補から最大1本' : '成立候補から最大2本'])) +
    `\n候補は ${code('tieOn(k) && E.threads[k]')} で絞り、localStorage ${code('shinyaSoudanThreads')} の未読を先、既読を後へ並べます。単に糸が成立しただけでは、その周に深いエピソードが出るとは限りません。T2・T5・T8には独立のthreads本文がなく、人生側で描かれます。\n\nナツメの手紙は ${code('dj ≥ ' + C.DJ_HIGH)} でhigh／low、${code('routeKey()')} で4種類に分岐。該当キーがなければ ${code('high/low + G.route')}、さらにhigh/lowへフォールバックします。通常の相談者の手紙は ${code('結果_route()')} があれば優先し、なければ結果のみを使います（${engine('morningLetters')}）。\n\n## 相談結果 good / mid / bad\n\n${engine('applyChoice')}、${engine('resultOf')}。各相談者の開始時に距離m・返答数n・良い返答数gを0へ初期化します。\n\n- freeでない相談者カードだけ n を1加算。just、またはoddかつgoodがfalseでないカードは g も1加算。\n- 数値 m 指定があれば加算。なければnearは−2、farは＋2、良い返答は0へ最大2だけ近づく。毎回−8〜8に制限。\n- n=0 はmid。次に g ≥ n−1 かつ |m| ≤ 2 ならgood。次に g ≤ floor(n/3) または |m| ≥ 5 ならbad。残りはmid。goodの判定が先です。\n- actsは実エンジンでfree:trueへ変換され採点されません。freeでもset/dj/cat指定があれば適用されます。memoカードは回収済みのことばとif条件で表示され、採点は通常カードと同じです。\n\n## 仕事・人生への状態依存\n` +
    diagram([node('job', 'kiri_job または pop_job'), node('designer', 'designer：絵の仕事あり'), node('draw', 'hi_draw & mi_draw？', 'choice'), node('d2', 'draw2：絵本まで広がる仕事'), node('d1', 'draw1：販促・デザインの仕事'), node('d0', 'draw0：絵の仕事に就かない'), arrow('job', 'designer', '', true), arrow('designer', 'draw', 'あり'), arrow('designer', 'd0', 'なし'), arrow('draw', 'd2', '両方ON'), arrow('draw', 'd1', 'それ以外')]) +
    `\n${code('pop_job = konbini結果あり & route:haruka & !kiri_job')}。${code('sayno = hi_no OR mi_no')} は断る言葉の差分で、独立の人生ルートではありません。根拠：${engine('popJob')}、${engine('designer')}、${engine('drawLevel')}、${link('story/epilogue2.js', 'epilogue2.js の WORK_NOW / WORK_LATER')}、${link('story/BIBLE.md', 'BIBLE §3・§6')}。draw0の図は全人生共通の定義です。haruka内の到達不能な側は下の位置別の判定を参照してください。` +
    ['people', 'threads', 'life', 'endings'].map((part, i) => reachabilityView(proof.conditionResults.filter(r => r.source.pointer.startsWith(`STORY.epilogue.${part}.`)), ['春の本文の条件側', '深い糸の条件側', '人生本文の条件側', 'ED本文の条件側'][i])).join('') +
    '\n## ルート別EDの状態\n' + table(['routeKey / ED', '状態'], proof.routeEndingResults.map(r => [code(r.key), statusLink(r)])).trimEnd();
});

md('20_フラグ依存関係.md', 'フラグ・数値の依存関係', () => {
  const compactRefs = items => [...new Map(items.map(x => [x.file + '#' + x.pointer.replace(/\.(\d+|choice|r|then|else).*$/, ''), x])).values()].slice(0, 3).map(x => ref(x)).join('<br>');
  const rows = flagNames.filter(f => !flagsNoRead.includes(f)).map(f => {
    const writes = A.writes.filter(w => w.state === f), readers = flagConditions(f), funcs = flagFunctions(f);
    return [code(f), compactRefs(writes.map(w => w.source)), compactRefs(readers.map(c => c.source)) + (funcs.length ? '<br>' + funcs.map(engine).join('<br>') : ''), sideStatus(proof.conditionResults.filter(r => readers.some(c => c.source.id === r.source.id && c.type === r.type)))];
  });
  const flow1 = [node('q1', '第一夜・陽向への返答', 'choice'), node('hi', 'hi_draw ON'), node('q2', '第二夜・湊への返答', 'choice'), node('mi', 'mi_draw ON'), node('coast', 'coaster：湊の絵'), node('q3', '第三夜・作者を伝える？', 'choice'), node('ask', 'kiri_ask：本人へ確認'), node('job', 'kiri_job：仕事につながる'), node('pop', '遥ルート & !kiri_job → pop_job'), node('draw', 'designer & hi_draw & mi_draw → draw2'), node('future', '未来の仕事・人生の描写'), arrow('q1', 'hi', '該当カード', true), arrow('q2', 'mi', '該当カード', true), arrow('coast', 'q3', 'salaryman.work の条件', true), arrow('q3', 'job', '夜勤の方と伝える', true), arrow('q3', 'ask', '本人に聞く', true), arrow('ask', 'job', '第三夜の morning', true), arrow('job', 'draw', '', true), arrow('pop', 'draw', '', true), arrow('hi', 'draw', '', true), arrow('mi', 'draw', '', true), arrow('draw', 'future', '', true), arrow('job', 'future', 'draw1も含む', true)];
  const flow2 = [node('mother', '第四夜・遥の選択'), node('letter', 'mother_letter / n4_bridge'), node('flower', '第五夜・花を描く選択'), node('draw', 'flower_draw'), node('sumie', '澄江が絵を受け取る → sumie_coaster'), node('wakai', 'ok:mother & ok:madam & 3旗中2個以上'), node('t6', 'wakai → T6：和解の春'), arrow('mother', 'letter', '', true), arrow('flower', 'draw', '', true), arrow('draw', 'sumie', 'madam.art が参照', true), arrow('letter', 'wakai', '', true), arrow('sumie', 'wakai', '', true), arrow('wakai', 't6', '', true)];
  const numeric = [node('djchoices', '各夜のナツメ選択：dj加算・減算'), node('dj', 'dj：累積／初期0'), node('snapshot', `第二夜ナツメ終了→djAt2保存（≥${C.DJ_ROUTE_NEED}）`), node('entry', 'route・djRoute の入口'), node('final', `終幕 dj ≥ ${C.DJ_HIGH}：手紙・ED`), node('catchoices', '各夜の猫：cat加算・減算'), node('cat', `cat：初期0／cathigh ≥ ${C.CAT_HIGH}`), node('t7', `T7：cat ≥ ${C.CAT_HIGH}／≥${C.CAT_HIGH + 1} も参照`), arrow('djchoices', 'dj', '', true), arrow('dj', 'snapshot', '', true), arrow('snapshot', 'entry', '', true), arrow('dj', 'final', '', true), arrow('catchoices', 'cat', '', true), arrow('cat', 't7', '', true)];
  let text = `[[00_全体マップ|全体へ]]\n${legend()}\n矢印は因果の読み方です。実際の進行順は夜別図を参照してください。フラグはSetへの追加のみで、現在のシナリオに解除処理はありません。表は代表参照を最大3か所に絞り、全件は [[details/条件索引|条件・状態索引]] と ${link(`${OUT}/data/branch-model.json`, '機械可読モデル')} に残しています。\n\n## 絵を持ち続けることと仕事\n${diagram(flow1)}\n${code('hi_draw')} だけで仕事やdraw2は確定しません。${code('designer()')} は仕事の入口、${code('hi_draw & mi_draw')} はdraw2への追加条件です。コースターは ${code('konbini.script.regulars')} の選択で残り、${code('salaryman.script.work')} で仕事の話を開きます。物語の仕事差分は ${link('story/epilogue2.js', 'epilogue2.js WORK_NOW / WORK_LATER')}。\n\n## 遥・澄江の和解\n${diagram(flow2)}\n${code('sumie_coaster')} 単独では和解しません。${code('mother_letter')} または ${code('n4_bridge')}、両者の相談結果も必要です。根拠：${engine('wakai')}、${link('story/madam.js', 'madam.js art')}、${link('story/BIBLE.md', 'BIBLE §3・§11')}。\n\n## 数値・閾値\n${diagram(numeric)}\n各カードの増減量は夜別表に表示しています。dj・cat自体に上下限のクランプはありません。相談者の距離メーターだけ−8〜8です。実測した最終値の範囲は理論上の上下限ではありません。\n`;
  text += table(['状態', '設定・加算', '主な参照'], [['dj', 'applyChoice / runSteps の dj 数値を加算', `djhigh ≥ ${C.DJ_HIGH}、djRoute入口の保存元、各夜のdj閾値会話`], ['djAt2', '第二夜 runFrameSeg(dj) 終了時に dj を代入', `djAt2High ≥ ${C.DJ_ROUTE_NEED}。以後のdj増減で変わらない`], ['cat', '各夜の猫カードの数値を加算', `cathigh ≥ ${C.CAT_HIGH}、T7の二段階閾値 ${C.CAT_HIGH}/${C.CAT_HIGH + 1}`], ['meters / counts', '相談者ごとに初期化。距離・n・gを更新', 'resultOf → good/mid/bad → 手紙・糸・会話'], ['res[ID]', '相談者のscript終了後 resultOf(id)', 'good/mid/bad/ok、route、tieOn、peopleと手紙'], ['memos', '光ることばをタップしたとき回収。自動回収ではない', 'choice.memo が表示条件。通常カードの代替を増やす'], ['shinyaSoudanThreads', '見た深い糸を周回間で保存', '未読優先。人生ルートやED自体には影響しない']]);
  text += '\n## 設定箇所と参照箇所\n\n状態列は参照条件の特定位置・条件側に対する判定です。フラグそのものの設定可否を表すものではありません。\n' + table(['フラグ', '設定元（代表）', '参照元（代表／判定関数）', '状態'], rows);
  text += '\n## 設定されるが参照のないフラグ\n\n物語本文の文字列に名前があるだけのものは状態参照に数えません。以下は現行読み込みファイルと判定関数を調べた結果です。\n' + table(['フラグ', '設定箇所', '評価', '状態'], flagsNoRead.map(f => [code(f), A.writes.filter(w => w.state === f).map(w => ref(w.source)).join('<br>'), '参照箇所なし。保存・デバッグ表示には残る。削除していない', '個別判定なし']));
  const reserved = new Set(['conn', 'djhigh', 'cathigh', 'djroute', 'designer', 'pop_job', 'sayno', 'wakai', 'draw0', 'draw1', 'draw2']);
  const missing = [...new Set(A.conditions.flatMap(c => String(c.expression).split(/[&|]/).map(t => t.trim().replace(/^!\s*/, '')).filter(t => /^[A-Za-z_]\w*$/.test(t) && !reserved.has(t) && !flagNames.includes(t))))];
  text += '\n## 参照されるが設定元のない状態名\n\n' + (missing.length ? missing.map(code).join('、') + '：要確認。' : '通常フラグの条件トークンでは見つかりませんでした。route・draw・ok・tieなどの派生条件は、対応関数で計算されるためset元を持ちません。');
  text += '\n\n## メモと選択肢の依存\n\nことばを見ただけでは回収されません。タップして回収したとき、そのmemoを要求するカードが表示されます。`memo` と `if` が両方あれば両方が必要です。すべてのカードが非表示になった場合、実エンジンは元の全カードに戻すため、この例外も検証モデルに合わせています。\n' +
    table(['memo', '出現箇所', '参照するカード数'], A.memos.map(m => [code(m.memo), ref(m.source), A.choices.flatMap(c => c.options).filter(o => o.memo === m.memo).length]));
  text += reachabilityView(proof.conditionResults.filter(r => flagNames.includes(r.expression)), '通常フラグを参照する条件側');
  return text;
});

md('30_検証と要確認.md', '検証結果（確定）', () => {
  const X = proof.exploration, L = proof.stateSpaceLowerBound;
  let text = `[[00_全体マップ|全体へ]]\n${legend()}\n## 判定結果\n\n従来の「到達不能の疑い」「要確認」だった条件${proof.conditionResults.length}行はすべて確定しました。${proof.conditionResults.filter(r => r.status === '到達不能（証明）').length}行は到達不能（論証）、${proof.conditionResults.filter(r => r.status === '到達可能').length}行は到達可能（再現確認）です。ルート×ED全20行と、条件付きイベント全5行も下表で確定しています。\n\n${link(`${OUT}/data/reachability.json`, 'reachability.json')} にソースSHA-256、探索規模、形式証明の前提・有限領域検査、全再現列を保存しています。ゲーム本体・story・check-story.js・simulate.jsは変更していません。\n\n## 探索規模と完了状況\n`;
  text += table(['項目', '結果'], [
    ['探索', '実エンジンの非同期進行を使用したDFS。選択・メモ・終端で状態を記録し、間の決定的進行は1辺にまとめる。状態＝フラグ・全カウンタ・結果・メモ・継続位置・既読集合。同一状態を正規化した完全な文字列で重複除去（射影・数値の丸めなし）'],
    ['ユニーク状態数（実測）', X.uniqueStates],
    ['遷移数（列挙／実際に追跡）', `${X.transitions} / ${X.executedTransitions}。前者は展開した状態の全選択辺、後者はそのうち実行した辺。初期状態への入力列の再生は二重計上しない`],
    ['重複による合流／終端状態', `${X.mergedStates} / ${X.terminalStates}`],
    ['探索完了', X.completed ? '完了' : `未完了：${X.uniqueStates >= X.maxStates ? 'ユニーク状態数の上限' : '正規化キーのメモリ予算'}に到達。停止理由の原文はreachability.jsonに記録`],
    ['残った探索経路', X.pendingPaths],
    ['資源予算', `状態${X.maxStates}件、正規化キー${X.maxSerializedKeyBytes} bytes。実測キー${X.serializedKeyBytes} bytes（JSオブジェクト等のメモリは別）`],
    ['既読糸の初期根', `${X.initialThreadSets}集合を用意、${X.initialThreadSetsStarted}集合で探索開始。全根を走査したという意味ではない`],
    ['状態空間の構成的下限', `終端だけで少なくとも${L.minimumTerminalStates}状態。全状態数の算出値ではない`],
  ]);
  text += `\n完全状態の終端数だけでも予算を大幅に超えるため、この環境の予算内では全木探索を完了できませんでした。${L.argument}\n\n**未到達だったという事実だけで到達不能とは判定していません。** 未到達行はコードからの形式的論証にフォールバックし、実関数の有限領域検査と制御フローの前提をassertで検証しました。route/popJob/designer/drawLevelは${proof.proofs.routeWords.cases}ケース、badとtieの矛盾は${proof.proofs.badTie.cases}ケース、decideEndingは全8個のBoolean入力を検査しています。数値は関数が区別する閾値の同値類を使います。対象関数のハッシュが変わると証明を停止します。\n\n## 条件側の確定判定（全行）\n\nfalseはelse側（本文がなければ何もせず続行）。「到達可能」は表示可能なカードとメモ回収／未回収を含む全選択列を、実際の非同期進行関数で初期状態から独立にリプレイ済みです。\n`;
  text += proof.conditionResults.map(verificationEntry).join('');
  text += '\n## ルート×ED（全行・確定）\n\nroute()のaloneとrouteKey()のnatsumeを区別します。alone/A・B・Cも到達可能です。A/Cの再現列は第二夜DJ終了時djAt2=2、終幕dj=20。AはT1/T3/T6/T7の4本、Cは0本です。\n';
  text += table(['routeKey / ED', '参考ランダム観測周数', '確定判定・根拠／再現手順'], proof.routeEndingResults.map(r => [code(r.key), coverage.combinations[r.key] || 0, statusLink(r)]));
  text += proof.routeEndingResults.map(verificationEntry).join('');
  text += '\n## 条件で実行・スキップされるイベント（全行・確定）\n';
  text += table(['イベント', '条件', '実行', 'スキップ', '参照'], proof.eventResults.map(r => [r.id, code(r.expression), definite(r.sides[0]), definite(r.sides[1]), ref(r.source)]));
  text += `\n## 再現・再生成\n\n${'```sh'}\nnode tools/prove-reachability.js\nnode tools/prove-reachability.js --check\nnode tools/prove-reachability.js --replay=alone/A\nnode tools/prove-reachability.js --replay=alone/C\nnode tools/generate-branchmaps.js\nnode tools/generate-branchmaps.js --check\n${'```'}\n\n${code('--max-states=100000')} と ${code('--max-key-bytes=268435456')} が探索の既定予算です。増減できますが、停止時点・実測件数も変わります。同じソースと予算からのJSON・資料生成は決定的です。証拠とソースのハッシュが合わない場合、生成器は古い判定の再利用を拒否します。\n\nJSONの各witnessは初期seenThreads、全actions（カードIDと各メモのtake）、文言付きchoices、最終state、実際に評価した条件側を持ちます。番号や確率だけに依存せず、表示される選択列そのものを再生します。カードの非表示、余った入力、最終状態の不一致はエラーです。\n\n## 対象と検証範囲\n\n${proof.scope}\n\nHTMLから読み込む現行storyだけを対象とし、v0/・v1/・tools/old/は除外します。runSteps/runScript/runVisitor/runFrameSeg/runScene/runPlain/playNight/morningLetters/playEpilogueはindex.htmlから関数本体を読み込みます。追加した観測フックとUI入力以外は実装の処理を実行し、既存の同期進行モデルを到達性の証明には使いません。既存モデルのランダム列は到達候補としてのみ利用し、すべて実エンジンでリプレイし直しています。\n\nDOM描画、クリック座標、音、待ち時間、改変したセーブ、過去版のセーブ互換性は対象外です。ブラウザーのUI操作を網羅したという主張はしていません。未完了のDFSから全木網羅を主張することもありません。\n\n## コードから確定した補足\n\n- ${code('dj_candle')} は設定元があり、条件／判定関数での参照は0件です。\n- harukaのdraw0やbad本文中の対応tieは、上記の証明により現行実装で到達不能です。作者の意図は判定に含めません。\n- 第二夜DJ終了時にdjAt2が保存され、第三夜の朝にkiri_jobが追加される場合があります。時点を混同せずに状態を記録します。\n- BIBLE §12-5の閾値9/18と現行実装の入口${C.DJ_ROUTE_NEED}・終幕${C.DJ_HIGH}には差があります。到達性の根拠には実装の値を使います。\n\n## 既存ツールと参考集計\n\ncheck-story.jsは構文・ラベル・形式・字数検査、simulate.jsは参考集計です。既存ツールは変更していません。generate-branchmaps.jsの固定シード${coverage.seed}・${coverage.runs}周の集計も参考値として残します。観測数0を到達不能の根拠にはしません。coverage.jsonの同期モデルと、今回のreachability.jsonの実エンジン探索・リプレイ・形式証明を区別してください。\n`;
  text += table(['ED', '参考ランダム観測周数', '確定判定・再現手順'], Object.entries(C.ENDINGS).map(([ending, name]) => {
    const row = proof.routeEndingResults.find(r => r.key.endsWith('/' + ending) && r.witness);
    return [ending + ' ' + name, coverage.endings[ending] || 0, definite(row)];
  }));
  return text.trimEnd();
});

md('details/条件索引.md', '条件・状態索引（詳細参照用）', () => {
  let text = '[[../00_全体マップ|全体へ]] · [[../20_フラグ依存関係|依存関係へ]]\n' + legend() + '\n図を読むときはこの一覧を飛ばせます。元の配列へ戻るための全件索引です。配列番号は0始まり。条件両側の数は同期ランダムモデル上の参考評価回数で、0は到達不能を意味しません。従来未確定だった全20条件側の確定判定と再現手順は [[../30_検証と要確認|検証結果（確定）]] と reachability.json にあります。\n\n## if / when の全参照\n';
  text += table(['ソースと配列位置', '条件', '状態', 'true参考回数', 'false参考回数'], A.conditions.map(c => [ref(c.source, true), code(c.expression), sideStatus(resultsFor(c)), coverage.hits[`${c.source.id}:${c.type}:true`] || 0, coverage.hits[`${c.source.id}:${c.type}:false`] || 0]));
  text += '\n## set / dj / cat の全設定\n' + table(['ソースと配列位置', '状態', '操作', '値'], A.writes.map(w => [ref(w.source, true), code(w.state), w.operation, w.value]));
  text += '\n## エンジンでの通常フラグ参照\n' + table(['フラグ', '判定関数', '状態'], flagNames.filter(f => flagFunctions(f).length).map(f => [code(f), flagFunctions(f).map(engine).join('<br>'), '個別判定なし']));
  return text;
});

// Canvas はリポジトリをVaultルートにしたときのファイルパス。
const canvas = { nodes: [], edges: [] };
for (let n = 1; n <= 5; n++) {
  const x = (n - 1) * 520;
  canvas.nodes.push({ id: `group${n}`, type: 'group', x, y: 0, width: 480, height: 390, label: kanji[n], color: String(n) });
  canvas.nodes.push({ id: `night${n}`, type: 'file', file: `${OUT}/nights/${kanji[n]}.md`, x: x + 30, y: 55, width: 420, height: 150 });
  const N = S.nights[n];
  canvas.nodes.push({ id: `note${n}`, type: 'text', x: x + 30, y: 230, width: 420, height: 130, text: `${N.sub}\n\n${N.order.filter(id => S.visitors[id]).map(person).join('・')}\n閉店後：${(N.after || []).map(id => N.scenes[id].title).join('・')}` });
  if (n > 1) canvas.edges.push({ id: `flow${n}`, fromNode: `night${n - 1}`, fromSide: 'right', toNode: `night${n}`, toSide: 'left', toEnd: 'arrow', label: '翌朝を経て' });
}
canvas.nodes.push({ id: 'epiGroup', type: 'group', x: 2600, y: 0, width: 600, height: 390, label: 'エピローグ', color: '6' });
canvas.nodes.push({ id: 'epi', type: 'file', file: `${OUT}/10_ルートとED.md`, subpath: '#エピローグの順番と追加エピソード', x: 2630, y: 55, width: 540, height: 150 });
canvas.nodes.push({ id: 'epiNote', type: 'text', x: 2630, y: 230, width: 540, height: 130, text: '電話 → 第五夜の朝と手紙 → 人々の春\n→ 三好の人生 → 深い糸（最大2本）\n→ 夜明け・ナツメの手紙 → ED A〜E' });
canvas.edges.push({ id: 'flowEpi', fromNode: 'night5', fromSide: 'right', toNode: 'epi', toSide: 'left', toEnd: 'arrow', label: '第五夜の閉店後' });
for (const [i, file] of ['00_全体マップ.md', '20_フラグ依存関係.md', '30_検証と要確認.md'].entries()) canvas.nodes.push({ id: `reference${i}`, type: 'file', file: `${OUT}/${file}`, x: 300 + i * 700, y: 500, width: 580, height: 160 });
canvas.nodes.push({ id: 'reachabilityLegend', type: 'text', x: 2400, y: 500, width: 800, height: 230, text: '## 到達性の凡例\n\n詳細資料のグレー破線＝到達不能（論証）。到達可能（再現確認）＝実エンジンで再生済み。状態リンクで検証行へ移動。通常色は到達可能の保証ではありません。\n\nこのCanvasは夜・エピローグの順序だけを表示します。条件の片側の判定は各ファイルカードから確認してください。\n\n[[docs/obsidian/30_検証と要確認|検証結果と再現手順]]' });
putJSON('00_全体マップ.canvas', canvas);
const safeA = { ...A, scripts: A.scripts };
putJSON('data/branch-model.json', { schemaVersion: 1, sourceHashes: M.sources, constants: C, engineFunctions: M.functions, ...safeA });
putJSON('data/coverage.json', { schemaVersion: 1, sourceHashes: M.sources, ...coverage });

md('README.md', 'Obsidianで分岐図を読む', () => `最初に [[00_全体マップ]] または [[00_全体マップ.canvas]] を開いてください。\n${legend()}\n## 開き方\n\n1. Obsidianの「保管庫としてフォルダを開く」で、このリポジトリのルートを開きます。\n2. ${code(OUT + '/00_全体マップ.md')} をリーディングビューで開きます。Mermaidは標準機能で表示されます。\n3. 自由に配置したい場合は ${code(OUT + '/00_全体マップ.canvas')} を開き、各夜のファイルカードから詳細へ進みます。Canvasも標準機能です。\n\nCanvasのfileはVaultルートからの相対パスです。docs/obsidianだけを別Vaultへコピーする場合は、Canvasの各fileから ${code(OUT + '/')} を取り除いてください（元ソースへの相対リンクも調整が必要）。\n\n## 再生成\n\nリポジトリのルートで実行します。Node.jsの標準ライブラリだけを使用し、ネットワーク接続は不要です。\n\n${'```sh'}\nnode tools/prove-reachability.js\nnode tools/prove-reachability.js --check\nnode tools/generate-branchmaps.js\nnode tools/generate-branchmaps.js --check\nnode tools/check-branchmaps.js\nnode tools/test-branchmaps.js\nnode tools/check-story.js --quiet\nnode tools/simulate.js 3000 0.6\n${'```'}\n\nprove-reachability.js は実エンジンでDFSとリプレイを行い、未到達行の形式証明を出力します。既定予算は状態100000件・正規化キー256MiBです。全木探索が未完了ならその旨と資源停止理由を明記し、未観測だけを根拠に到達不能とはしません。--check は全証拠列と証明を再検証します。証拠のソースハッシュが変わったら、先に証拠を再生成してください。\n\n図の参考ランダム集計は既定が固定シード・3000周。${code('--runs=10000')} で周数を増やせます（生成内容も変わります）。${code('--check')} は既存資料と再生成結果が一致するかを検査し、書き換えません。${code('check-branchmaps.js')} は生成器が使うMermaid構文の制限された文法、CanvasのJSON・ノード・矢印・リンク先、Markdownのローカルリンクを検査します。Mermaid本体での追加検査方法もそのツールの説明にあります。\n\n生成時にCanvasも上書きされます。手で配置を変える場合は別名でコピーしてください。手書きの物語上の説明を変える場合は生成器を編集します。重要な判定／進行関数が変わると、古い注釈を出さないよう生成が停止します。\n\n## 作成ファイル\n\n- 00_全体マップ.md / .canvas：最初に読む俯瞰図\n- nights/第一夜.md〜第五夜.md：進行、合流、選択と状態の表\n- 10_ルートとED.md：人生、ナツメ、人物の糸、追加エピソード、最終ED\n- 20_フラグ依存関係.md：フラグ・数値・メモの設定と参照\n- 30_検証と要確認.md：全20条件側・全20ルート×EDの確定判定、再現手順、探索規模と形式証明\n- details/条件索引.md：全if/when・set/addのソース位置\n- data/branch-model.json：将来のテスト用の構造\n- data/coverage.json：同期ランダムモデルの参考観測回数と代表経路\n- data/reachability.json：実エンジンDFSの規模、形式証明、独立にリプレイ済みの具体的な選択列\n\n詳細な解析限界は [[30_検証と要確認]] を参照してください。ゲーム本体、シナリオ、既存ツールには変更を加えません。`);

for (const [file, content] of files) {
  const full = path.join(ROOT, file);
  if (check) {
    if (!fs.existsSync(full) || fs.readFileSync(full, 'utf8') !== content) throw new Error(`再生成差分あり: ${file}`);
  } else { fs.mkdirSync(path.dirname(full), { recursive: true }); fs.writeFileSync(full, content); }
}
console.log(`${check ? '一致確認' : '生成'}: ${files.size}ファイル、${A.scripts.length} scripts、${A.conditions.length}条件、${runs}周（ED ${Object.keys(coverage.endings).sort().join('/')}）`);
