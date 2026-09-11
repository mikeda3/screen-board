# screen-board

Claude Code 用スキル。実装画面や Storybook のストーリーをまとめて撮影し、コメント・赤入れ・進捗チェックができるレビュー用「画面ボード」を作って Artifact として公開する。

## インストール

そのマシンの全プロジェクトで使う:

```bash
git clone git@github.com:mikeda3/screen-board.git ~/.claude/skills/screen-board
```

特定のリポジトリだけで使う:

```bash
git clone git@github.com:mikeda3/screen-board.git .claude/skills/screen-board
```

SSH 鍵が無いマシンでは `https://github.com/mikeda3/screen-board.git` でも同じ。

次に Claude Code を開いたときから `/screen-board` で使える。更新は `git pull`。

## 必要なもの

- Node 18+
- Playwright（対象プロジェクトに入っていれば `board.config.mjs` の `playwrightModule` でそのパスを指す。無ければ `npm i -D playwright && npx playwright install chromium`）

使い方は [SKILL.md](SKILL.md)、設定は [references/config.md](references/config.md)。
