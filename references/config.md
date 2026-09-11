# board.config.mjs リファレンス

ESM のモジュールなので、上部でヘルパーを定義してよい。パスは全て config ファイルからの相対。

## トップレベル

| キー | 既定値 | 説明 |
| --- | --- | --- |
| `title` | `'画面ボード'` | タブ名、書き出し Markdown の見出し |
| `kicker` | `''` | 左上の小さいラベル |
| `heading` | `title` | 見出し。`\n` で改行 |
| `lead` | `''` | 見出しの下の1行 |
| `intro` | なし | 本文上部の説明文 |
| `routes` | `[]` | 説明カード `{tag, title, body}` の配列 |
| `notes` | `[]` | 左レール下部の注意書き。HTML を書ける（`<code>` など） |
| `storageKey` | `'screen-board:state'` | localStorage のキー。**ボードごとに変える**（同じキーだと別ボードの状態と混ざる） |
| `outDir` | `'screens'` | 画像・manifest.json・thumbs.json の置き場所 |
| `boardFile` | config と同じ場所の `board.html` | 出力先 |
| `groups` | 1グループ | `{id, name, desc}` の配列。ボードの並び順 |
| `screens` | 必須 | 下記 |
| `labels` | 日本語の既定値 | ラベル上書き（下記） |
| `recapture` | 自動 | ボード最上部に出す撮り直しコマンドの材料。`{cwd, config, scripts}` で上書き。既定は config のあるディレクトリ・config のファイル名・スキルの `scripts`。`false` でバーごと消える |

## labels

| キー | 既定値 | 出る場所 |
| --- | --- | --- |
| `approve` | `'実装許可'` | カードの1つ目のチェック、左レールの進捗メーター |
| `done` | `'実装済み'` | カードの2つ目のチェック、進捗メーター |
| `commentPlaceholder` | `'この画面で直したい点'` | コメント入力欄のプレースホルダー |
| `link` | `'開く'` | カードのリンク（画面ごとの `link` が `{href, label}` ならそちらが優先） |
| `filterHideDone` | `<done>を除く` | 表示フィルターの2つ目。省略時は `done` のラベルから作る |

レビュー欄の「未解決」「これまでの指摘」「解決」「コメントする」などはテンプレート側に直書き。変えるなら `references/customize.md`。

## 撮影まわり

| キー | 既定値 | 説明 |
| --- | --- | --- |
| `viewport` | `{width: 1280, height: 1000}` | 撮影時のビューポート。高さは実際の中身に合わせて自動で伸びる |
| `maxHeight` | `2600` | 伸ばす上限。長すぎるページを切る |
| `settle` | `1200` | ページを開いてから撮るまで(ms)。アニメーションや遅延読み込みがあるなら増やす |
| `ready` | なし | 描画完了の目印にするセレクタ（例 `'h1'`）。これが出るまで待ってから高さを測る。見つからなくても撮影は続く |
| `afterRun` | `700` | `run` のあと撮るまで(ms)。画面ごとに `wait` で上書きできる |
| `launch` | `{channel: 'chrome', headless: true}` | `chromium.launch` の引数。Chrome が無い環境は `{headless: true}` にして `npx playwright install chromium` |
| `playwrightModule` | なし | Playwright の import 先。プロジェクトの `node_modules/playwright/index.mjs` の絶対パスを書くと、追加インストール無しで動く |
| `contextOptions` | `{}` | `browser.newContext` の追加引数。`locale`、`storageState`（ログイン済み状態）、`colorScheme` など |
| `beforeEach` | なし | `async (page, screen) => {}`。全画面の前に走る。ログインや localStorage の仕込みに使う |
| `thumbWidth` | `1000` | ボードに埋め込むサムネの幅。拡大表示もこの画像を使う |
| `thumbQuality` | `0.72` | webp の品質。ボードが重いときに下げる |
| `url` | なし | `(screen) => string`。全画面で URL の作り方が同じときは、画面ごとの `url` の代わりにこれを書ける |
| `linkFor` | なし | `(screen) => string`。カードの「開く」リンクをまとめて決める |

## screens[]

| キー | 必須 | 説明 |
| --- | --- | --- |
| `id` | ○ | `A1` のような短いID。**コメント・赤入れの紐付けキーなので後から変えない** |
| `g` | ○ | 所属グループのID |
| `title` | ○ | カードの見出し。状態まで書く（例:「詳細 / 未保存の変更あり」） |
| `url` | ○※ | 撮影するURL。`config.url` を使うなら省略可 |
| `note` | | カードの説明文。レビューで見てほしい点 |
| `chips` | | カンマ区切りのタグ。使用コンポーネント名など |
| `link` | | カードの「開く」リンク。文字列、または `{href, label}` |
| `run` | | `async (page) => {}`。その状態を作る操作 |
| `wait` | | `run` のあと撮るまで(ms) |
| `anchor` | | カードのサムネイルの切り取り位置。既定は `'top'`。下部固定のバーやスナックバーが主役の画面は `'bottom'` にすると下端が見える |

## run の書き方

Playwright の `page` がそのまま渡る。安定しやすい順:

```js
// 役割と名前で取る（一番読みやすい）
run: async (page) => { await page.getByRole('button', {name: '削除'}).click(); },

// 複数の行を選ぶ
run: async (page) => {
  const boxes = page.locator('tbody input[type=checkbox]');
  await boxes.nth(0).click();
  await boxes.nth(1).click();
},

// UIから辿れない状態は localStorage / API モックで作る
run: async (page) => {
  await page.evaluate(() => localStorage.removeItem('fax-confirm-dismissed'));
  await page.reload();
},
```

`getByRole` で取れない、描画が遅くて落ちる、といったときは `page.waitForTimeout` を挟むか `wait` を伸ばす。撮影ログに `失敗 <ID>` と出たら、その画面だけ `--only` で撮り直す。

## URL の例

```js
// Storybook
const story = (id) => `http://127.0.0.1:6006/iframe.html?viewMode=story&id=${id}`;

// Next.js / Vite の開発サーバー
const page = (path) => `http://localhost:3000${path}`;

// ステージング（ログインが要るなら storageState を使う）
const stg = (path) => `https://stg.example.com${path}`;

// 静的HTML
const local = (name) => `file://${import.meta.dirname}/mock/${name}`;
```

ログインが要る画面は、一度手でログインした状態を保存して使い回す:

```bash
npx playwright open --save-storage=auth.json https://stg.example.com
```

```js
contextOptions: {storageState: '/絶対パス/auth.json'},  // 相対パスは実行時のカレントディレクトリ基準
```
