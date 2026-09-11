---
name: screen-board
description: 実装画面やStorybookのストーリーをまとめて撮影し、コメント・赤入れ・進捗チェックができるレビュー用「画面ボード」を作って Artifact として公開する。画面ボード／スクリーンショット一覧／レビューボードを作りたいとき、複数画面をまとめて関係者にレビューしてもらいたいとき、Figmaや実装に起こす画面の棚卸しをしたいときに使う。撮り直し・再公開の運用もこのスキルに従う。
---

# 画面ボード

実装済みの画面（Storybook のストーリー、開発サーバーのページ、ステージング）をまとめて撮影し、1枚のレビュー用ボードにして Artifact で公開する。レビュアーはブラウザだけで、画面ごとに**コメント**・**赤入れ**（ペン／四角）・**チェック**（例: 実装許可／実装済み）を残せる。表示フィルターは「すべて」と「実装済みを除く」の2つで、作り終えた画面を伏せて残りだけを見られる。結果は Markdown に書き出せる。

```
board.config.mjs ──capture.mjs──▶ screens/*.png + manifest.json + thumbs.json
                                        │
                                   build-board.mjs
                                        ▼
                                   board.html ──Artifact──▶ 共有URL（コメントは db に同期）
```

## 使う場面

- 何十画面かをまとめてレビューしてもらい、修正点を画面単位で回収したい
- 実装 → Figma、実装 → デザインレビュー、リニューアル前後の比較など、画面の棚卸しが要る
- レビューの進み具合（許可した／作り終えた）を関係者と共有したい

1〜2画面だけならボードは要らない。スクリーンショットを直接見せたほうが速い。

## 前提

- Node 18+
- Playwright（プロジェクトに入っていればそれを使う。無ければ `npm i -D playwright && npx playwright install chromium`）
- 撮影対象が URL で開けること（`file://` でも可）。ローカルの開発サーバーは撮影中ずっと起動しておく

## 手順

### 1. 画面を洗い出して config を書く

`assets/board.config.example.mjs` を作業ディレクトリにコピーして `board.config.mjs` を作り、埋める。フィールドの詳細は `references/config.md`。

ボードの価値は**カードに添えるメモ**で決まる。ただ撮るだけにせず、画面ごとに次を書く:

- `title` — レビュアーが探せる名前（「詳細 / 未保存の変更あり」のように状態まで書く）
- `note` — その画面で見てほしい点、仕様上の注意
- `chips` — 使っているコンポーネント名など、後工程で効くタグ
- `run` — その状態を作る操作（モーダルを開く、行を選ぶ、エラーを出す）
- `anchor: 'bottom'` — 下端のバーやスナックバーが主役の画面。カードのサムネを下寄せで切る

グループ（A/B/C…）は画面の並び順そのものになる。ユーザーの目的（Figma に起こす順、レビューの流れ）に合わせて並べる。

### 2. 撮影

```bash
node ~/.claude/skills/screen-board/scripts/capture.mjs board.config.mjs
```

- `--only A1,A2` で撮り直す画面を絞れる（1画面直しただけのときはこれ）
- `outDir` に版ごとの `ID.rN.png` / `ID.rN@2x.png`、最新版のコピー `ID.png` / `ID@2x.png`、`manifest.json`、`thumbs.json` が出る
- 撮った画像が前の版と同じなら「変更なし」と出て版は増えない。違えば「v2（前の版から変更あり）」と出る
- 失敗した画面はログに出て manifest に `error` が残る。`run` のセレクタを直して `--only` で撮り直す
- 描画待ちが足りないときは config の `settle` を伸ばすか、`ready` に描画完了の目印のセレクタを書く

### 3. 組み立て

```bash
node ~/.claude/skills/screen-board/scripts/build-board.mjs board.config.mjs
```

`board.html`（既定では config と同じ場所）ができる。タイトルやメモを直しただけならこれだけ流せばよく、撮り直しは要らない。

### 4. 公開

Artifact ツールで `board.html` を publish する。**必ず `capabilities: {db: {}}` を付ける** — これが無いとコメントが各自のブラウザにしか残らず、こちらから回収できない。

```
Artifact(file_path: "…/board.html", capabilities: {db: {}}, favicon: "🗂️",
         description: "レビュー用の画面ボード")
```

公開後、URL をユーザーに渡す。詳しくは `references/publish.md`。

### 5. レビューを回収して直す

1. レビュアーが各カードにコメント（1件ずつ積み上がる）・赤入れ・チェックを入れる。直ったものはレビュアー側で「解決」、間違えたものは「削除」
2. 「コメントを書き出す」で Markdown を出してもらう。1行が1コメントで、`[v1 / 未解決 / Outdated]` のように版と状態が付く。または `read_db` でこちらから読む（`references/publish.md`）
3. 実装を直す → `capture.mjs --only <直した画面>` → `build-board.mjs` → **同じ file_path（別セッションなら同じ url）で再公開**
4. ボード最上部の「撮り直しコマンド」をそのままレビュアーから渡してもらえば、2〜3はコピペで済む

再公開してもコメント・チェックは db 側に画面IDで残るので消えない。ただし**画面IDを付け替えると状態が迷子になる**ので、IDは最初に決めたら変えない。画面を足すときは末尾に新しいIDを足す。

## 版（リビジョン）と Outdated

GitHub のプルリクエストのレビューと同じ考え方で動く。

- `capture.mjs` は撮った画像を前の版とハッシュで比べ、**違っていたときだけ版を1つ上げる**（`ID.r2.png`）。見た目が変わらなければ版は増えず、コメントもそのまま残る
- コメントは**書いた時点の版に紐づく**。版が上がると、それ以前のコメントは Outdated になり、カードのレビュー欄から履歴へ移る。レビュー欄は最新版に付いた未解決のコメントだけになるので、直したあとはまっさらな状態で見直せる
- 赤入れも**版ごと**に持つ。撮り直しても古い版の赤入れが新しい画像に残らない
- 「修正の履歴を見る」で版ごとの指摘と赤入れを遡れる。「この版を見る」でその当時の画像に戻せる
- カード画像の上の `v1 / v2` で版を切り替えられる

db の持ち方:

| コレクション | 内容 |
| --- | --- |
| `screens/{ID}` | `approved` / `done` / `marks`（`{"版番号": [...]}` のJSON文字列） |
| `threads/{スレッドID}` | `screen` / `rev` / `body` / `resolved` / `createdAt` |

版を持たない古いボードから移すときは、既存の `comment` を rev 1 のスレッドに、`marks` の配列を `{"1": [...]}` に読み替える（ボード側にも読み替えは入っているが、`write_db` でこちら側から移しておくと確実）。

## 注意

- Artifact の上限は 16MB。サムネイルは webp（幅1000）で埋め込むので35画面で約3MB。超えそうなら `thumbWidth` / `thumbQuality` を下げる
- ボード最上部に撮り直しコマンドのコピー欄が出る。未解決コメントがある画面だけを `--only` に入れた形と、全画面の形を切り替えられる。レビュアーからそのまま渡してもらえる
- カードの「開く」リンクはローカル開発サーバーを指すことが多い。その場合はレビュアーの手元では開けないので、`notes` にその旨を書いておく
- 赤入れは幅1000の座標系で、版ごとに保存される。撮り直して版が上がれば新しい画像には何も乗らない
- 画面の高さいっぱいのレイアウト（`height: 100dvh` で内側スクロール）でも、内側のはみ出しを測って縦に伸ばして撮る
- 撮影は `channel: 'chrome'`（実機の Chrome）が既定。無い環境では config の `launch` を `{headless: true}` にして `npx playwright install chromium` を実行する

## ファイル

| パス | 用途 |
| --- | --- |
| `scripts/capture.mjs` | Playwright で撮影し、manifest.json / thumbs.json を作る |
| `scripts/build-board.mjs` | manifest + thumbs からボード HTML を組み立てる |
| `scripts/board.tpl.html` | ボードのテンプレート（CSS・操作ロジック） |
| `assets/board.config.example.mjs` | config の雛形。コピーして使う |
| `references/config.md` | config の全フィールドと書き方の例 |
| `references/publish.md` | 公開・再公開・コメント回収の運用 |
| `references/customize.md` | 項目やラベルを変えたいときにテンプレのどこを触るか |

## 別の環境で使う

このディレクトリごとコピーすれば動く（依存は Node と Playwright だけ）。

- そのマシンの全プロジェクトで使う: `~/.claude/skills/screen-board/`
- 特定のリポジトリだけで使う: そのリポジトリの `.claude/skills/screen-board/`

会社が変わる場合は、`assets/board.config.example.mjs` のラベル（実装許可／実装済み）をそのチームの言葉に置き換えてから配ると馴染みやすい。
