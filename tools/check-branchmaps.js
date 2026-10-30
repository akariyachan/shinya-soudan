#!/usr/bin/env node
'use strict';
// node tools/check-branchmaps.js [--mermaid=/absolute/path/to/mermaid/dist/mermaid.esm.mjs]
// 常時: この生成器が出すMermaidの限定文法を完全に検査（任意のMermaidのパーサーではない）。
// 追加: Mermaidを既に導入している環境では --mermaid で本体のparseも呼ぶ。依存は追加しない。
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const { pathToFileURL } = require('url');
const ROOT = path.resolve(__dirname, '..'), DIR = path.join(ROOT, 'docs/obsidian');
const list = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? list(path.join(dir, e.name)) : [path.join(dir, e.name)]);
const requirePath = (p, from) => assert(fs.existsSync(p), `リンク切れ: ${from} → ${p}`);
function requireHeading(destination, heading, from) {
  if (heading) assert(fs.readFileSync(destination, 'utf8').split('\n').some(line => /^#{1,6} /.test(line) && line.replace(/^#{1,6} /, '') === heading), `${from}: 見出しリンク切れ ${destination}#${heading}`);
}
function validateDiagram(text, source) {
  const lines = text.trim().split('\n');
  assert.equal(lines.shift(), 'flowchart TD', `${source}: 未対応の図種`);
  const ids = new Set(), edges = [], classes = [], defs = new Set(), styledEdges = new Set();
  for (const line of lines) {
    const s = line.trim();
    let m;
    if ((m = /^([A-Za-z][A-Za-z0-9_]*)\["([^"\n]*)"\]$/.exec(s)) || (m = /^([A-Za-z][A-Za-z0-9_]*)\{"([^"\n]*)"\}$/.exec(s)) || (m = /^([A-Za-z][A-Za-z0-9_]*)\(\["([^"\n]*)"\]\)$/.exec(s))) {
      assert(!ids.has(m[1]), `${source}: ノードID重複 ${m[1]}`); ids.add(m[1]);
      assert(m[2].length > 0 && !/[<>]/.test(m[2]), `${source}: 空／未エスケープのラベル`);
    } else if ((m = /^([A-Za-z][A-Za-z0-9_]*) (?:-->|-\.->)(?:\|"([^"|\n]*)"\|)? ([A-Za-z][A-Za-z0-9_]*)$/.exec(s))) edges.push([m[1], m[3]]);
    else if ((m = /^classDef ([A-Za-z][A-Za-z0-9_]*) stroke:#[0-9a-f]{6},stroke-width:[1-9]px;$/.exec(s))) defs.add(m[1]);
    else if ((m = /^classDef (unreachable) fill:#eeeeee,stroke:#888888,color:#555555,stroke-width:1px,stroke-dasharray:5 5;$/.exec(s))) defs.add(m[1]);
    else if ((m = /^linkStyle (0|[1-9][0-9]*) stroke:#888888,stroke-width:1px,stroke-dasharray:5 5;$/.exec(s))) {
      const index = Number(m[1]);
      assert(!styledEdges.has(index), `${source}: エッジ装飾重複 ${index}`); styledEdges.add(index);
    }
    else if ((m = /^class ([A-Za-z][A-Za-z0-9_,]*) ([A-Za-z][A-Za-z0-9_]*);$/.exec(s))) classes.push([m[1].split(','), m[2]]);
    else assert.fail(`${source}: Mermaid限定文法外／構文エラー: ${s}`);
  }
  for (const edge of edges) for (const id of edge) assert(ids.has(id), `${source}: 未定義ノード ${id}`);
  for (const index of styledEdges) assert(index < edges.length, `${source}: 未定義エッジ ${index}`);
  for (const [nodes, name] of classes) { assert(defs.has(name), `${source}: 未定義クラス ${name}`); for (const id of nodes) assert(ids.has(id), `${source}: 未定義ノード ${id}`); }
  return { nodes: ids.size, edges: edges.length };
}
function validateCanvas(canvas, source) {
  assert(Array.isArray(canvas.nodes) && Array.isArray(canvas.edges), `${source}: nodes / edges が必要`);
  const ids = new Set();
  for (const n of canvas.nodes) {
    assert(typeof n.id === 'string' && n.id && !ids.has(n.id), `${source}: ノードID重複／不正`); ids.add(n.id);
    for (const k of ['x', 'y', 'width', 'height']) assert(Number.isFinite(n[k]), `${source}: ${n.id}.${k} が数値でない`);
    assert(n.width > 0 && n.height > 0);
    assert(['group', 'file', 'text'].includes(n.type));
    if (n.type === 'file') { assert.equal(typeof n.file, 'string'); requirePath(path.resolve(ROOT, n.file), source); }
    if (n.type === 'text') assert.equal(typeof n.text, 'string');
    if (n.type === 'group') assert.equal(typeof n.label, 'string');
  }
  const edgeIds = new Set();
  for (const ed of canvas.edges) {
    assert(ed.id && !edgeIds.has(ed.id) && !ids.has(ed.id), `${source}: エッジID重複`); edgeIds.add(ed.id);
    assert(ids.has(ed.fromNode) && ids.has(ed.toNode), `${source}: 存在しない接続先`);
    for (const k of ['fromSide', 'toSide']) if (ed[k]) assert(['top', 'right', 'bottom', 'left'].includes(ed[k]));
    for (const k of ['fromEnd', 'toEnd']) if (ed[k]) assert(['none', 'arrow'].includes(ed[k]));
  }
  for (const group of canvas.nodes.filter(n => n.type === 'group')) assert(canvas.nodes.some(n => n.id !== group.id && n.x >= group.x && n.y >= group.y && n.x + n.width <= group.x + group.width && n.y + n.height <= group.y + group.height), `${source}: 空のグループ`);
}
async function main() {
  const diagrams = [];
  let jsonCount = 0;
  for (const file of list(DIR)) {
    const content = fs.readFileSync(file, 'utf8');
    if (/\.(canvas|json)$/.test(file)) { const json = JSON.parse(content); jsonCount++; if (file.endsWith('.canvas')) validateCanvas(json, file); }
    if (!file.endsWith('.md')) continue;
    assert.equal((content.match(/^```/gm) || []).length % 2, 0, `${file}: コードフェンス不一致`);
    for (const [index, block] of [...content.matchAll(/```mermaid\n([\s\S]*?)\n```/g)].entries()) {
      const source = `${path.relative(ROOT, file)} 図${index + 1}`;
      const stats = validateDiagram(block[1], source); diagrams.push({ text: block[1], source, ...stats });
      assert(stats.nodes <= 40, `${source}: ノードが多すぎる（${stats.nodes}）`);
    }
    for (const m of content.matchAll(/(?<!!)\[[^\]\n]*\]\(([^)]+)\)/g)) if (!/^https?:/.test(m[1])) {
      const [target, heading] = m[1].split('#'), destination = target ? path.resolve(path.dirname(file), target) : file;
      requirePath(destination, file); requireHeading(destination, heading, file);
    }
    for (const m of content.matchAll(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g)) {
      let target = m[1].split('#')[0]; if (!target) continue;
      if (!path.extname(target)) target += '.md';
      const destination = path.resolve(path.dirname(file), target);
      requirePath(destination, file);
      const heading = m[1].split('#')[1];
      requireHeading(destination, heading, file);
    }
  }
  const arg = process.argv.find(a => a.startsWith('--mermaid='));
  if (arg) {
    const mermaid = (await import(pathToFileURL(path.resolve(arg.slice(10))).href)).default;
    mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' });
    for (const d of diagrams) { try { assert(await mermaid.parse(d.text)); } catch (err) { throw new Error(`${d.source}: ${err.message}`); } }
    console.log(`Mermaid本体 parse: ${diagrams.length}図 OK`);
  }
  console.log(`限定文法・参照検査: Mermaid ${diagrams.length}図（最大${Math.max(...diagrams.map(d => d.nodes))}ノード）、Canvas/JSON ${jsonCount}ファイル、全ローカルリンク OK`);
}
if (require.main === module) main().catch(e => { console.error(e.message); process.exitCode = 1; });
module.exports = { validateDiagram, validateCanvas };
