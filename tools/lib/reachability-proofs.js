'use strict';
// Formal fallback certificates. These are implications over the real predicate
// functions plus checked control-flow premises, NOT failed random observations.
const assert = require('assert/strict');
const vm = require('vm');
const { exits, functionSource, hash } = require('./branchmap-model');

// These function bodies were read when establishing the proof premises. A
// future change must be reviewed, rather than silently extending a certificate.
const REVIEWED = {
  "okId": "66122b5e90acc373bb6fce16f29eba5fbc77f99d471a33ac2095cdd4b82bad51",
  "tieOn": "ac680dc4464017d96b66467caf188769ec97da6e0dcd5115882ebceeec34c520",
  "tieList": "6fe09d49b6c8387ec3c7143081c9328dba4430be31380fc56415fce9bbdcdea2",
  "route": "344479c8034b72e74bea25c209d4cc351bc7f61474c102aa550002ff3995b3f9",
  "djAt2High": "58dd3afa8d1a974622daddc4abf09ff3539f6df28823054bef586606982b5e18",
  "djRoute": "22cb0a80f88ed920879ef4daff9aeaf33d2ebba78b032bcc7c1394df9f791196",
  "routeKey": "ebb9130d99cc7ef2e185d1b56bbdeeafb5289cf62d61d9123487632aba7f7470",
  "popJob": "a86cc83e6c4262834c42aae00e4117650e16cd316566b8dd1356d6fb462bf56a",
  "designer": "e0d4c310847eafde13fc6fd356acb6a05881e3e8700b3ce4c543a1a4c67c4b69",
  "drawLevel": "5b2ca56eaedd8b0ede842a25faa27b38270b89fe0c98da17a1c8659eb79aadfd",
  "wakai": "a970707e0ae3d177b6ad82d20917c405164d517d6fbf309910a4cab3d483c11a",
  "connHigh": "b86917aa7e3429ca9e82f167d3cb7d0a2a46c45412f2c8e03e055d3abcb0801e",
  "djHigh": "6e02613edb0436f27aa9d38cc482b3b583c6ad09f375e0f13ed8437f01c06a99",
  "evalTok": "7cca0516cfab85a29b674450362b2b8cf783131f186b9762130b422ef66e6ecc",
  "cond": "d5acb2413f11b13badfeac2734392da1f3ab9a7d9ba80e347f9200b3489edd55",
  "applyChoice": "ae9814164d1220adcb70d1136edd3da2a11d8a2c0ac1b41c177ce05338416536",
  "resultOf": "550f76613b88d207a17adec00cad8884666b3737f73c2045a0cccdc12b42cf9d",
  "decideEnding": "211935d3cc28fc4d5077e77b9b6a5cfaf7a068a05268125856f800f886571cc0",
  "runSteps": "f3d2c939409e5edf2620c76bfc91419728f29c13931b8fb873e7951d8db732a9",
  "runScript": "8a48fc39694b846e1941232e86f9b56a98e57e4a6710bb4b17e508aaaa99a855",
  "runVisitor": "f0084213af8e0e1202f56381bea004c39722489804723af4f6d1fcf12339acf2",
  "runFrameSeg": "dbe3909275091e87860841320e54aae2e1eee78d7abd347710670e1b8f9c8d6e",
  "runScene": "6f7e131a55b4c7431d0f3c7a2669d4ca9038c5843ce636eff0980656df4279b2",
  "runPlain": "3064810c7548d5265b7fd74afb0a11a35983e45efc9bb7c42df345f50e2934bd",
  "playNight": "bf5f26b11f078833881f5c74c5974e60eea6d25eec8a0f0167e899f48fc22157",
  "morningLetters": "807f7f2e8e04201542b15905ce787452f7eb6776bd05dd5430b9058a446e97af",
  "playEpilogue": "90b4067bc639982828d225fd10902e4556d769e52dd69c180892826019a65582"
};

function certify(M, A) {
  for (const [name, digest] of Object.entries(REVIEWED))
    assert.equal(hash(M.functions[name] || functionSource(M.html, name)), digest, `形式証明の再点検が必要: ${name}`);
  const { S, E, engineCtx, constants: C } = M;
  const domains = [undefined, 'bad', 'mid', 'good'];
  assert.equal(C.TIES.T1.join(','), 'ol,salaryman');
  assert.equal(C.TIES.T3.join(','), 'student,musician');
  const flags = ['mi_tell', 'mi_rush', 'konbini_words', 'kiri_job', 'hi_draw', 'mi_draw'];
  let routeCases = 0, tieCases = 0;
  const state = (res = {}, on = [], cat = 0, djAt2 = null) => ({ flags: new Set(on), res, cat, djAt2, dj: 0 });
  // Complete Boolean domains and comparison equivalence classes: the only
  // numeric read in route/popJob/designer/drawLevel is djAt2 >= DJ_ROUTE_NEED.
  for (let mask = 0; mask < 2 ** flags.length; mask++) for (const ol of domains)
    for (const konbini of domains) for (const djAt2 of [null, C.DJ_ROUTE_NEED - 1, C.DJ_ROUTE_NEED]) {
      const on = flags.filter((_, i) => mask & (1 << i));
      engineCtx.G = state({ ol, konbini }, on, 0, djAt2); routeCases++;
      if (on.includes('konbini_words')) assert.notEqual(E.route(), 'alone');
      if (konbini && E.route() === 'haruka') {
        assert(E.designer()); assert.notEqual(E.drawLevel(), 0);
        if (E.drawLevel() !== 2) assert.equal(E.drawLevel(), 1);
        if (!on.includes('kiri_job')) assert(E.popJob());
      }
    }
  for (const other of domains) for (const kiri of [false, true])
    for (const cat of [C.CAT_HIGH - 1, C.CAT_HIGH, C.CAT_HIGH + 1]) {
      for (const [person, tie, res] of [
        ['ol', 'T1', { salaryman: other }], ['salaryman', 'T4', { konbini: other }],
        ['musician', 'T3', { student: other }], ['grandpa', 'T7', { madam: other }],
      ]) {
        engineCtx.G = state({ ...res, [person]: 'bad' }, kiri ? ['kiri_job'] : [], cat);
        assert.equal(E.tieOn(tie), false); tieCases++;
      }
    }

  // Check the premises used to extend these local implications to whole runs.
  const routeFlags = ['mi_tell', 'mi_rush', 'konbini_words'];
  const routeWrites = A.writes.filter(w => routeFlags.includes(w.state));
  assert(routeWrites.every(w => w.source.pointer.startsWith('STORY.visitors.konbini.')));
  const visits = Object.values(S.nights).flatMap(n => n.order).filter(id => id === 'konbini');
  assert.equal(visits.length, 1); assert(S.nights[2].order.includes('konbini'));
  for (const n of [3, 4, 5]) assert(!S.nights[n].order.includes('ol'));
  assert.equal(S.visitors.mother.night, 4);
  assert(!S.visitors.konbini.when);
  assert.equal(S.visitors.child.when, 'route:haruka');
  for (const [script, label, index] of [[S.visitors.child.script, 'kitchen', 2],
    [S.visitors.child.script, 'futon', 3], [S.visitors.freelance.script, 'h1', 17],
    [S.visitors.freelance.script, 'h3', 3]]) {
    assert.equal(script[label][index].if, 'draw2');
    assert.equal(script[label][index].else[0].if, 'draw1');
  }
  const progression = ['runSteps', 'runScript', 'runVisitor', 'runFrameSeg', 'runScene', 'runPlain', 'playNight', 'morningLetters', 'playEpilogue']
    .map(n => functionSource(M.html, n)).join('\n');
  assert(!/G\.flags\.(?:delete|clear)\(/.test(progression));
  assert(!/G\.res\s*=|delete G\.res|G\.res\.\w+\s*=/.test(progression));
  assert.equal((progression.match(/G\.res\[id\] = resultOf\(id\)/g) || []).length, 1);
  assert.equal((progression.match(/G\.djAt2 = G\.dj/g) || []).length, 1);
  assert(functionSource(M.html, 'runFrameSeg').includes("type === 'dj' && G.night === 2"));
  assert(S.nights[5].order.includes('dj'));
  assert(Object.values(S.nights).flatMap(n => n.order).filter(id => id === 'mother').length === 1);
  assert(Object.values(S.nights).flatMap(n => n.order).filter(id => id === 'child').length === 1);
  assert(A.conditions.every(c => typeof c.expression === 'string' && !c.expression.includes('関数条件')));
  // Story content is declarative, with no executable per-step callbacks.
  assert(!M.objects.some(([o]) => Object.values(o).some(v => typeof v === 'function')));

  const mother = S.visitors.mother.script.start[39];
  assert.equal(mother.if, 'route:haruka');
  assert.equal(mother.then[6].if, 'kiri_job');
  assert.equal(mother.then[6].else[0].if, 'pop_job');
  assert.equal(mother.else[0].if, 'route:nanami | djroute');
  assert.equal(mother.else[0].else[0].if, 'konbini_words');

  // The actual go/end graph preserves route across these scenes. All incoming
  // edges to h1/h3, a3 and quiet are checked, including nested choice returns.
  const checkDispatch = (script, expected) => {
    assert.deepEqual(JSON.parse(JSON.stringify(exits(script.start))), expected);
  };
  checkDispatch(S.visitors.freelance.script, [
    { target: 'h1', guards: ['route:haruka'] },
    { target: 'n1', guards: ['NOT (route:haruka)', 'route:nanami'] },
    { target: 'a1', guards: ['NOT (route:haruka)', 'NOT (route:nanami)'] },
  ]);
  for (const [label, next] of [['h1', 'h2'], ['h2', 'h3'], ['a1', 'a2'], ['a2', 'a3']])
    assert.deepEqual(exits(S.visitors.freelance.script[label]), [{ target: next, guards: [] }]);
  const incoming = (script, label) => Object.keys(script).filter(k => exits(script[k]).some(e => e.target === label)).sort();
  assert.deepEqual(incoming(S.visitors.freelance.script, 'h1'), ['start']);
  assert.deepEqual(incoming(S.visitors.freelance.script, 'h3'), ['h2']);
  assert.deepEqual(incoming(S.visitors.freelance.script, 'a3'), ['a2']);
  const miyoshi = S.nights[5].scenes.miyoshi.script;
  checkDispatch(miyoshi, [
    { target: 'nanami', guards: ['route:nanami'] },
    { target: 'haruka', guards: ['NOT (route:nanami)', 'route:haruka'] },
    { target: 'quiet', guards: ['NOT (route:nanami)', 'NOT (route:haruka)'] },
  ]);
  assert.deepEqual(incoming(miyoshi, 'quiet'), ['start']);

  const dj5 = S.nights[5].dj.script;
  checkDispatch(dj5, [{ target: 'keep', guards: ['djroute'] }, { target: 'letter', guards: ['NOT (djroute)'] }]);
  const keepIndex = dj5.keep.findIndex(st => st.choice);
  assert(keepIndex >= 0);
  assert(dj5.keep.slice(0, keepIndex).every(st => typeof st !== 'object' || Array.isArray(st) || !['choice', 'acts', 'if', 'go', 'end'].some(k => k in st)));
  assert(dj5.keep[keepIndex].choice.every(c => [].concat(c.set || []).includes('keep_light')));
  const epi = functionSource(M.html, 'playEpilogue');
  for (const text of ["const r = G.res[id]", 'runSteps(p[r] || [])', 'G.route = route()',
    'E.life && E.life[G.route]', "rk === 'natsume' && has('N1')", 'E.threads[k]']) assert(epi.includes(text));
  // N1 is not a candidate in any other route, nor a normal candidate in the
  // natsume list: it is emitted exclusively by the mandatory-natsume branch.
  assert(Object.values(C.DEEP_BY_ROUTE).every(list => !list.includes('N1')));
  assert(Object.keys(C.DEEP_BY_ROUTE).sort().join() === 'alone,haruka,nanami,natsume');

  const endingTruthTable = [];
  for (const djroute of [false, true]) for (const conn of [false, true]) for (const djhigh of [false, true]) {
    const ending = vm.runInNewContext(`(${M.functions.decideEnding})()`, {
      djRoute: () => djroute, connHigh: () => conn, djHigh: () => djhigh,
    });
    if (djroute && djhigh) assert.equal(ending, 'E');
    if (!djroute) assert.notEqual(ending, 'E');
    endingTruthTable.push({ djroute, conn, djhigh, ending });
  }
  const proofs = {
    routeWords: { reason: 'konbini_words=trueならroute()はnanamiまたはharuka。対象位置の外側条件／a系ラベル／N1・ED Eはaloneを必要とするため矛盾。', cases: routeCases },
    harukaDraw: { reason: '対象時点ではkonbiniの結果が確定済み。harukaならkiri_jobまたはpopJob()が成立しdesigner=true、drawLevelは1か2。draw2=falseのelseでは必ずdraw1=true。', cases: routeCases },
    motherPop: { reason: '外側がroute:haruka=trueかつkiri_job=false。konbini結果は確定済みなので実popJob()の3条件がすべて真。', cases: routeCases },
    badTie: { reason: 'people[id][G.res[id]]からbad本文が選ばれる。その糸のtieOn()は同じidのok（goodまたはmid）を必須とするため矛盾。', cases: tieCases },
    quiet: { reason: 'quietへの唯一の入口はstartでroute:nanami/harukaの両方がfalseの場合。route()の値域は3種類なので必ずalone。途中にrouteを変える書き込みはない。' },
    keep: { reason: 'N1はrouteKey=natsume（djRoute=true）でのみ表示。routeは第二夜DJ終了後に固定。第五夜DJのstart→keepを必ず通り、keepの全カードがkeep_lightを設定し、解除処理はない。' },
    endingPriority: { reason: '実decideEnding()の全Boolean入力を検査。djRouteかつdjhighなら最優先でE。EにはdjRouteが必須。routeKeyの定義からnatsume以外/Eおよびnatsume/A・Cは矛盾。', truthTable: endingTruthTable },
  };
  const proofFor = c => {
    const p = c.source.pointer, x = c.expression, b = c.value;
    if (b && x === 'konbini_words' && /(?:visitors\.mother|script\.a3|threads\.N1|endings\.E)/.test(p)) return 'routeWords';
    if ((!b && ['draw1', 'designer'].includes(x) || b && x === 'draw0') && /(?:visitors\.(child|freelance)|life\.haruka)/.test(p)) return 'harukaDraw';
    if (!b && x === 'pop_job' && p.includes('visitors.mother')) return 'motherPop';
    if (b && /^tie:T/.test(x) && /people\.(ol|salaryman|musician|grandpa)\.bad/.test(p)) return 'badTie';
    if (!b && x === 'route:alone' && p.includes('miyoshi.script.quiet')) return 'quiet';
    if (!b && x === 'keep_light' && p.includes('threads.N1')) return 'keep';
    return null;
  };
  return { proofs, proofFor, routeCases, tieCases };
}
module.exports = { certify };
