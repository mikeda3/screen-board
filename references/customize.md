# ボードを作り変える

config で足りるのは「言葉」と「並び」まで。項目そのものを変えたいときは `scripts/board.tpl.html` と `scripts/build-board.mjs` を触る。**元のスキルを直さず、プロジェクトに `.claude/skills/screen-board/` としてコピーしてから直す**のが安全。

## テンプレの構造

`scripts/board.tpl.html` は 1ファイルで完結している。

| 場所 | 中身 |
| --- | --- |
| 冒頭 `<style>` | 配色は `:root` の CSS 変数だけ。ライト／ダークの両方に同じ変数名で定義がある |
| `.rail` | 左レール（見出し・進捗メーター・未解決コメント数・グループ一覧・表示フィルター・書き出しボタン・注意書き） |
| `#cmdbar` | 撮り直しコマンドのコピー欄（`RECAPTURE` が `null` なら出ない） |
| `__CARDS__` | build-board.mjs が差し込むカード群。カード内の `.review` は空で、中身はスクリプトが組み立てる |
| `<dialog id="lb">` | 拡大表示・版の切り替え・赤入れツール |
| `<dialog id="export">` | Markdown 書き出し |
| `<script>` | 状態・保存・版・レビュー欄・赤入れ・拡大表示 |

差し込み口は `__TITLE__` `__KICKER__` `__HEADING__` `__LEAD__` `__LABEL_APPROVE__` `__LABEL_DONE__` `__F_HIDE_DONE__` `__PLACEHOLDER__` `__NOTES__` `__INTRO__` `__RAIL__` `__CARDS__` `__TOTAL__` `__PAYLOAD__` `__TITLES__` `__TITLE_JSON__` `__KEY__` `__RECAPTURE__`。build-board.mjs の `fills` と対応している。

## スクリプトの流れ

```
readLocal()            localStorage から復元（古い形式もここで読み替える）
  ↓
paint()                全カードを描き直す。1回で以下を全部やる
  ├ カードの画像       viewing.get(id) の版のサムネに差し替え
  ├ 赤入れ             marksOf(id, 版) を SVG に
  ├ renderReview(id)   未解決スレッド／履歴を組み立て
  ├ 進捗メーター       許可・済み・未解決コメント数
  └ renderCommand()    撮り直しコマンドの文面
  ↓
saveScreen(id) / saveThread(id, thread)   localStorage と db に書く
  ↓
db の onSnapshot（screens と threads の2本）が来たら state を上書きして paint()
```

`paint()` は全カードを毎回描き直す。状態を変えたら `paint()` を呼べばよく、差分更新は書かない。

## よくある作り変え

**チェックを増やす／減らす。** 今は2つ（`approve` / `done`）。build-board.mjs のカード生成にチェックボックスを足し、テンプレの `state` の初期値・`paint()`・`saveScreen()`・`applyFilter()`・進捗メーターにそのキーを足す。1つで足りるなら、カードから `done` のラベルを消して `paint()` の代入だけ残すのが手っ取り早い。

**スレッドに返信を付ける。** 今は1コメント＝1スレッド（`threads/{スレッドID}`）。返信を持たせるなら `threads/{id}/replies` のサブコレクションを足し、`threadNode()` に一覧と入力欄を追加する。`onSnapshot` も1本増える。

**誰が書いたか残す。** レールに「あなたの名前」入力（localStorage に保存）を置き、`saveThread()` の書き込みに `author` を足して `threadNode()` で出す。1人のレビュアーが順に見る用途なら不要。

**表示フィルターを増やす。** `<fieldset class="filter">` に radio を足し、`applyFilter()` に分岐を足す。今は「すべて」と「実装済みを除く」の2つだけ（絞り込みすぎると見落とすため意図的に減らしてある）。

**配色。** `:root` の変数だけ差し替える。`--accent`（許可）、`--done`（済み）、`--flag`（未解決コメントあり）、`--pen`（赤入れ）の4色が意味を持っている。ダーク側の定義（`@media (prefers-color-scheme: dark)` と `[data-theme='dark']`）も同じ変数名で揃える。

**カードの画像の見え方。** `.shot img { height: … }` が切り取る高さ、`object-position` が切り取る位置（画面ごとの `anchor: 'bottom'` は `[data-anchor="bottom"]` で下寄せにしている）。全体を入れたいなら `object-fit: contain`。

**リンクを複数出す。** `linkOf()` を配列対応にして、config の `link` に `[{href, label}, …]` を渡せるようにする。

## 保存されるデータ

localStorage（キーは `storageKey`）は画面ごとにまとめて持つ。

```js
{screens: {A1: {approved, done, marks, threads}}}

marks   = {"1": Mark[], "2": Mark[]}          // 版ごと
Mark    = {t: 'r', x, y, w, h}                // 四角
        | {t: 'p', d: [[x, y], …]}            // ペン
threads = [{id, rev, body, resolved, createdAt}]
```

db は2つのコレクションに分ける（スレッドを1件ずつ足し引きするため）。

| コレクション | ドキュメント |
| --- | --- |
| `screens/{画面ID}` | `{approved, done, marks: "…JSON…", updatedAt}` |
| `threads/{スレッドID}` | `{screen, rev, body, resolved, createdAt, updatedAt}` |

座標は**幅1000・高さは画像比率**の座標系。版ごとに持つので、撮り直して版が上がっても古い赤入れが新しい画像に乗らない。

## 版まわりの決めごと

- 版を上げるのは `capture.mjs`。等倍PNGの SHA-1 が前の版と違うときだけ `rev` を1つ増やす
- ボード側は版を作らない。`SHOTS[id].revs`（build 時に焼き込まれた版の一覧）を読むだけ
- `isOutdated(id, thread)` は `thread.rev < 最新版` の1行。GitHub の Outdated と同じで、**古いだけで消しはしない**
- レビュー欄に出るのは「最新版に付いた未解決」だけ。それ以外（解決済み・古い版）は履歴（`.rv-history`）に版ごとに並ぶ
- 版を持たなかった頃のデータは `readLocal()` と `screens` の `onSnapshot` で読み替える（`marks` の配列 → `{1: [...]}`、`comment` の文字列 → rev 1 のスレッド1件）。この読み替えは消さない

## 起動と縮退

起動時は localStorage を読んで即描画し、db が繋がったら `onSnapshot` で上書きする。db が無い環境（未宣言、権限なし、オフライン）でも単体で動き、左レールの表示が「このブラウザにのみ保存」に変わる。
