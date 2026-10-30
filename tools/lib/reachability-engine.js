'use strict';
// Headless execution of the actual asynchronous engine. Only presentation and
// input are supplied here; conditions, scoring and progression come from HTML.
const vm = require('vm');
const assert = require('assert/strict');
const { functionSource } = require('./branchmap-model');
const RUNTIME = ['runSteps', 'runScript', 'runVisitor', 'runFrameSeg', 'runScene',
  'runPlain', 'playNight', 'morningLetters', 'playEpilogue'];

function createRuntime(M) {
  const byId = new Map(M.objects.map(([o, loc]) => [loc.id, o]));
  let input, observed, frames, trace, seenThreads, prefix, prefixCursor, observations;
  const segmentCache = new Map();
  const element = { classList: { add() {}, remove() {} }, style: {}, hidden: false,
    querySelector() { return null; } };
  const noop = () => {};
  const ctx = { ...M.constants, STORY: M.S, FAST: true, BOT: false,
    app: element, pwrap: element, textEl: element, SAVE_KEY: 'save', THREAD_KEY: 'threads',
    NIGHT_KANJI: ['', '第一夜', '第二夜', '第三夜', '第四夜', '第五夜'],
    $: () => element, lsGet: () => seenThreads, lsSet: noop, snapshot: () => ({}),
    setPortrait: id => { ctx.G.pkey = id; }, vName: v => v.name,
    displayName: id => M.S.visitors[id]?.name || id, pickBeat: () => 'none',
    visitStep: st => { frames[frames.length - 1].step = M.locations.get(st)?.id || String(st); },
    observed: (o, key) => {
      const value = ctx.cond(o[key]);
      const hit = { source: M.locations.get(o), type: key, expression: o[key], value };
      observations.push(hit); observed?.(hit);
      return value;
    },
  };
  for (const name of ['guard', 'drawMeter', 'updateTest', 'setState', 'sfx', 'setFace',
    'setClock', 'setWeather', 'setFx', 'refreshName', 'showSong', 'showMeter', 'showOnly',
    'logSec', 'nightSummary', 'nightCard', 'showLetter', 'showEnding', 'beat', 'playAct',
    'wait', 'toast']) ctx[name] = noop;
  vm.createContext(ctx);
  const actual = [...Object.values(M.functions), ...['actText', 'hasMemo', 'collectMemo'].map(n => functionSource(M.html, n))];
  for (const name of RUNTIME) {
    let source = functionSource(M.html, name);
    // Instrumentation only: retain the engine's control flow and all mutations.
    if (name === 'runSteps') {
      assert(source.includes('    guard(t);'));
      source = source.replace('    guard(t);', '    guard(t); visitStep(st);');
      assert(source.includes('cond(st.if)'));
      source = source.replace('cond(st.if)', 'observed(st, "if")');
    }
    if (name === 'runVisitor') source = source.replace('cond(v.when)', 'observed(v, "when")');
    if (name === 'runScene') source = source.replace('cond(data.if)', 'observed(data, "if")');
    actual.push(source);
  }
  vm.runInContext(actual.join('\n'), ctx, { timeout: 1000 });
  for (const name of RUNTIME) {
    const fn = ctx[name];
    ctx[name] = async (...args) => {
      const frame = { name, args: args.map(a => M.locations.get(a)?.id || a), step: null };
      frames.push(frame);
      try {
        if (!prefix || !['runVisitor', 'runFrameSeg', 'runScene', 'runPlain'].includes(name)) return await fn(...args);
        const position = JSON.stringify(frames), before = JSON.stringify(encode(ctx.G));
        const cached = segmentCache.get(position);
        // Skip only a previously executed *complete* real-engine segment with
        // identical input state and the identical replay prefix. New edges and
        // independent witness replays always execute the actual functions.
        if (prefixCursor < prefix.length && cached && cached.before === before &&
          JSON.stringify(prefix.slice(prefixCursor, prefixCursor + cached.actions.length)) === JSON.stringify(cached.actions)) {
          prefixCursor += cached.actions.length; trace.push(...cached.actions);
          ctx.G = structuredClone(cached.after);
          for (const hit of cached.hits) { observations.push(hit); observed?.(hit); }
          return cached.result;
        }
        const start = trace.length, hitStart = observations.length;
        const result = await fn(...args);
        segmentCache.set(position, { before, after: structuredClone(ctx.G), result,
          actions: trace.slice(start), hits: observations.slice(hitStart) });
        return result;
      } finally { assert.equal(frames.pop(), frame); }
    };
  }
  // The filtering statements are copied verbatim from choose(), not modelled.
  const chooseSource = functionSource(M.html, 'choose');
  const begin = chooseSource.indexOf('  const shown =');
  const end = chooseSource.indexOf("  setState('choice');");
  assert(begin >= 0 && end > begin);
  vm.runInContext(`function visibleOptions(opts) { ${chooseSource.slice(begin, end)} return opts; }`, ctx);
  ctx.choose = async opts => {
    const stId = [...frames].reverse().find(f => f.name === 'runSteps').step;
    const st = byId.get(stId);
    assert(st?.choice || st?.acts, `選択位置が不明: ${stId}`);
    const originals = st.choice || st.acts;
    const pool = ctx.visibleOptions(opts);
    const actions = pool.map(o => ({ kind: 'choice', option: M.locations.get(originals[opts.indexOf(o)]).id }));
    const selected = prefixCursor < (prefix?.length || 0) ? prefix[prefixCursor++] :
      await input({ kind: 'choice', source: stId, actions, pool, originals });
    const index = actions.findIndex(a => a.option === selected.option);
    assert(index >= 0, `非表示カード: ${selected.option}`);
    trace.push(actions[index]);
    return pool[index];
  };
  ctx.showLine = async (who, text, meta) => {
    const word = String(text).match(/《([^》]*)》/)?.[1];
    if (!meta?.memo || !word || ctx.hasMemo(meta.memo)) return;
    const source = M.locations.get(meta).id;
    const actions = [false, true].map(take => ({ kind: 'memo', source, take }));
    const action = prefixCursor < (prefix?.length || 0) ? prefix[prefixCursor++] :
      await input({ kind: 'memo', source, memo: meta.memo, actions });
    assert(actions.some(a => JSON.stringify(a) === JSON.stringify(action)), `メモ再生不一致: ${source}`);
    trace.push(action);
    if (action.take) {
      const owner = meta.who || (who && who !== 'me' && who !== 'radio' ? who : ctx.G.seg?.id || '');
      ctx.collectMemo(meta, word, owner);
    }
  };
  const initial = () => ({ token: 0, state: 'title', night: 0, flags: new Set(), res: {},
    meters: {}, counts: {}, dj: 0, cat: 0, djAt2: null, seg: null, memos: [],
    revealed: new Set(), names: {}, djName: 'ナツメ', catName: '黒猫', pkey: 'none',
    log: [], ending: null, lastBeat: '' });
  const encode = value => {
    if (value instanceof Set) return [...value].sort();
    if (Array.isArray(value)) return value.map(encode);
    if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, encode(value[k])]));
    return value;
  };
  return {
    ctx,
    position: () => encode(frames),
    state: () => encode(ctx.G),
    trace: () => trace.slice(),
    async run(options) {
      ctx.G = initial(); frames = []; trace = [];
      prefix = options.prefix; prefixCursor = 0; observations = [];
      seenThreads = options.seenThreads || []; input = options.input; observed = options.observed;
      await ctx.playNight(1);
      assert.equal(prefixCursor, prefix?.length || 0, '探索の入力プレフィックスが余った');
      return { route: ctx.route(), routeKey: ctx.routeKey(), ending: ctx.G.ending,
        state: encode(ctx.G), trace: trace.slice(), seenThreads: seenThreads.slice() };
    },
  };
}
module.exports = { createRuntime, RUNTIME };
