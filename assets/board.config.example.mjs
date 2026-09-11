// 画面ボードの設定。このファイルをコピーして board.config.mjs を作る。
// パスは全てこのファイルからの相対。

// 撮影対象のURLの作り方（プロジェクトに合わせて書き換える）
const story = (id) => `http://127.0.0.1:6006/iframe.html?viewMode=story&id=${id}`;
// const page = (path) => `http://localhost:3000${path}`;

export default {
  /* ---------- ボードの見出し ---------- */
  title: '○○ 画面ボード',            // タブ名・書き出しの見出し
  kicker: 'レビュー用',               // 左上の小さいラベル
  heading: '○○\n画面ボード',          // 改行は \n
  lead: 'レビューする画面の一覧。',
  intro: 'このボードの目的と見方を1〜2文で。',
  routes: [                          // 進め方カード。不要なら消す
    {tag: '進め方 1', title: '見出し', body: '説明'},
  ],
  notes: [                           // 左レールの注意書き（HTML可）
    '気づいた点は各カードのコメント欄へ。直したら「解決」。画面を撮り直すと、それ以前の指摘は履歴に移ります。',
    '「Storybookで開く」はローカルの開発サーバー起動中のみ開けます。',
  ],

  /* ---------- 保存と出力 ---------- */
  storageKey: 'xxx-board:state',     // localStorage のキー。ボードごとに変える
  outDir: 'screens',                 // 画像と manifest の置き場所
  // boardFile: 'board.html',        // 出力先（既定: このファイルと同じ場所の board.html）

  // ボード最上部に出す「撮り直しコマンド」。既定はこの config の場所から自動で作る
  // recapture: {cwd: '~/work/xxx', config: 'board.config.mjs', scripts: '~/.claude/skills/screen-board/scripts'},
  // recapture: false,               // バーごと消す

  /* ---------- 撮影 ---------- */
  viewport: {width: 1280, height: 1000},
  maxHeight: 2600,                   // これ以上長い画面は切る
  settle: 1200,                      // ページを開いてから撮るまで(ms)
  // ready: '[data-testid="page"]',  // これが出るまで待ってから高さを測る
  // launch: {channel: 'chrome', headless: true},
  // playwrightModule: '/path/to/repo/node_modules/playwright/index.mjs',
  // contextOptions: {locale: 'ja-JP', storageState: '/絶対パス/auth.json'},
  // beforeEach: async (page, screen) => { /* ログインなど */ },
  thumbWidth: 1000,                  // 埋め込むサムネの幅。ボードが重いときは下げる
  thumbQuality: 0.72,

  /* ---------- ラベル（チームの言葉に合わせる） ---------- */
  labels: {
    approve: '実装許可',              // 1つ目のチェック
    done: '実装済み',                 // 2つ目のチェック
    commentPlaceholder: 'この画面で直したい点',
    link: 'Storybookで開く',
    // filterHideDone: '実装済みを除く',  // 既定は done から作る
  },

  /* ---------- 画面 ---------- */
  groups: [
    {id: 'A', name: '一覧', desc: 'グループの説明。何をする場所か。'},
    {id: 'B', name: '詳細', desc: ''},
  ],

  screens: [
    {
      id: 'A1',                      // 一度決めたら変えない（コメント・版の紐付けキー）
      g: 'A',
      title: '一覧 / 初期表示',        // 状態まで書く
      url: story('pages-list--default'),
      note: 'レビューで見てほしい点や仕様のメモ',
      chips: 'Tabs, Search, Pagination',
      link: story('pages-list--default'),   // カードの「開く」リンク。不要なら省略
    },
    {
      id: 'A2',
      g: 'A',
      title: '一覧 / 削除の確認',
      url: story('pages-list--default'),
      note: '取り消せる操作なのでキャンセル左／削除右',
      // その状態を作る操作。Playwright の page が渡る
      run: async (page) => {
        await page.locator('tbody input[type=checkbox]').first().click();
        await page.getByRole('button', {name: '削除'}).click();
      },
      wait: 700,                     // run のあと撮るまで(ms)
    },
    {
      id: 'A3',
      g: 'A',
      title: '一覧 / 一括選択バー',
      url: story('pages-list--default'),
      anchor: 'bottom',              // 下端が主役の画面はサムネを下寄せで切る
      run: async (page) => page.locator('tbody input[type=checkbox]').first().click(),
    },
  ],
};
