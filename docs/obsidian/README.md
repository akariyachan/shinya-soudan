# Obsidianで分岐図を読む

> 自動生成：`node tools/generate-branchmaps.js`。実装の動作を記述。ネタバレを含みます。

最初に [[00_全体マップ]] または [[00_全体マップ.canvas]] を開いてください。

## 開き方

1. Obsidianの「保管庫としてフォルダを開く」で、このリポジトリのルートを開きます。
2. `docs/obsidian/00_全体マップ.md` をリーディングビューで開きます。Mermaidは標準機能で表示されます。
3. 自由に配置したい場合は `docs/obsidian/00_全体マップ.canvas` を開き、各夜のファイルカードから詳細へ進みます。Canvasも標準機能です。

CanvasのfileはVaultルートからの相対パスです。docs/obsidianだけを別Vaultへコピーする場合は、Canvasの各fileから `docs/obsidian/` を取り除いてください（元ソースへの相対リンクも調整が必要）。

## 再生成

リポジトリのルートで実行します。Node.jsの標準ライブラリだけを使用し、ネットワーク接続は不要です。

```sh
node tools/prove-reachability.js
node tools/prove-reachability.js --check
node tools/generate-branchmaps.js
node tools/generate-branchmaps.js --check
node tools/check-branchmaps.js
node tools/test-branchmaps.js
node tools/check-story.js --quiet
node tools/simulate.js 3000 0.6
```

prove-reachability.js は実エンジンでDFSとリプレイを行い、未到達行の形式証明を出力します。既定予算は状態100000件・正規化キー256MiBです。全木探索が未完了ならその旨と資源停止理由を明記し、未観測だけを根拠に到達不能とはしません。--check は全証拠列と証明を再検証します。証拠のソースハッシュが変わったら、先に証拠を再生成してください。

図の参考ランダム集計は既定が固定シード・3000周。`--runs=10000` で周数を増やせます（生成内容も変わります）。`--check` は既存資料と再生成結果が一致するかを検査し、書き換えません。`check-branchmaps.js` は生成器が使うMermaid構文の制限された文法、CanvasのJSON・ノード・矢印・リンク先、Markdownのローカルリンクを検査します。Mermaid本体での追加検査方法もそのツールの説明にあります。

生成時にCanvasも上書きされます。手で配置を変える場合は別名でコピーしてください。手書きの物語上の説明を変える場合は生成器を編集します。重要な判定／進行関数が変わると、古い注釈を出さないよう生成が停止します。

## 作成ファイル

- 00_全体マップ.md / .canvas：最初に読む俯瞰図
- nights/第一夜.md〜第五夜.md：進行、合流、選択と状態の表
- 10_ルートとED.md：人生、ナツメ、人物の糸、追加エピソード、最終ED
- 20_フラグ依存関係.md：フラグ・数値・メモの設定と参照
- 30_検証と要確認.md：全20条件側・全20ルート×EDの確定判定、再現手順、探索規模と形式証明
- details/条件索引.md：全if/when・set/addのソース位置
- data/branch-model.json：将来のテスト用の構造
- data/coverage.json：同期ランダムモデルの参考観測回数と代表経路
- data/reachability.json：実エンジンDFSの規模、形式証明、独立にリプレイ済みの具体的な選択列

詳細な解析限界は [[30_検証と要確認]] を参照してください。ゲーム本体、シナリオ、既存ツールには変更を加えません。
