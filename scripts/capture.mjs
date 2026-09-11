#!/usr/bin/env node
// 画面ボード用のスクリーンショット撮影。
//
//   node capture.mjs <board.config.mjs> [--only A1,A2] [--no-2x]
//
// 各画面を Playwright で開いて撮り、outDir に版（リビジョン）として貯める。
// 撮った画像が前の版と同じなら版は増えない。違っていたときだけ版が1つ上がる。
// この「版が上がったか」が、ボード側で古いコメントを Outdated にする根拠になる。
//
// 出力:
//   outDir/ID.rN.png, ID.rN@2x.png … 版ごとの画像
//   outDir/ID.png, ID@2x.png        … 最新版のコピー（単体で見たいとき用）
//   outDir/manifest.json            … 画面ごとの版の履歴
//   outDir/thumbs.json              … {ID: {版番号: webp(base64)}}

import {readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {resolve, join} from 'node:path';

const [configArg, ...flags] = process.argv.slice(2);
if (!configArg) {
  console.error('usage: node capture.mjs <board.config.mjs> [--only A1,A2] [--no-2x]');
  process.exit(1);
}

const configPath = resolve(configArg);
const config = (await import(pathToFileURL(configPath).href)).default;
const onlyFlag = flags.find((f) => f.startsWith('--only'));
const only = onlyFlag ? new Set((onlyFlag.split('=')[1] ?? flags[flags.indexOf(onlyFlag) + 1] ?? '').split(',').filter(Boolean)) : null;
const skip2x = flags.includes('--no-2x');

const outDir = resolve(configPath, '..', config.outDir ?? 'screens');
mkdirSync(outDir, {recursive: true});

const viewport = {width: 1280, height: 1000, ...(config.viewport ?? {})};
const maxHeight = config.maxHeight ?? 2600;
const settle = config.settle ?? 1200;
const afterRun = config.afterRun ?? 700;
const thumbWidth = config.thumbWidth ?? 1000;
const thumbQuality = config.thumbQuality ?? 0.72;

const readJson = (path, fallback) => {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return fallback;
  }
};

const manifestPath = join(outDir, 'manifest.json');
const thumbsPath = join(outDir, 'thumbs.json');
const sha1 = (buffer) => createHash('sha1').update(buffer).digest('hex');

/* ---------- これまでの版を読む ---------- */
const previousList = readJson(manifestPath, []);
const previous = new Map();
for (const entry of Array.isArray(previousList) ? previousList : []) previous.set(entry.id, entry);

// 古い形式（版を持たない manifest）や、素の ID.png しか無い状態からの引き継ぎ。
// 既にレビューされた画像を版1として扱わないと、初回の撮り直しで全画面が Outdated になってしまう。
function bootstrapRevisions(id, entry) {
  if (entry && Array.isArray(entry.revs) && entry.revs.length > 0) return entry.revs;
  const flat = join(outDir, id + '.png');
  if (!existsSync(flat)) return [];
  const archived = join(outDir, id + '.r1.png');
  if (!existsSync(archived)) copyFileSync(flat, archived);
  const retinaFlat = join(outDir, id + '@2x.png');
  const retinaArchived = join(outDir, id + '.r1@2x.png');
  if (existsSync(retinaFlat) && !existsSync(retinaArchived)) copyFileSync(retinaFlat, retinaArchived);
  return [{
    rev: 1,
    file: id + '.r1.png',
    retina: existsSync(retinaArchived) ? id + '.r1@2x.png' : null,
    hash: sha1(readFileSync(archived)),
    h: (entry && entry.h) || null,
    capturedAt: (entry && entry.capturedAt) || null,
  }];
}

const thumbsRaw = readJson(thumbsPath, {});
// 古い形式は {ID: webp}。版ごとの {ID: {1: webp}} に均す
const thumbs = {};
for (const [id, value] of Object.entries(thumbsRaw)) thumbs[id] = typeof value === 'string' ? {1: value} : value;

/* ---------- Playwright ---------- */
async function loadChromium() {
  const candidates = [config.playwrightModule, 'playwright', 'playwright-core'].filter(Boolean);
  const errors = [];
  for (const name of candidates) {
    try {
      const specifier = name.startsWith('/') || name.startsWith('.') ? pathToFileURL(resolve(name)).href : name;
      return (await import(specifier)).chromium;
    } catch (error) {
      errors.push(name + ': ' + error.message.split('\n')[0]);
    }
  }

  console.error('Playwright が見つかりません。次のいずれかで用意してください:');
  console.error('  1) プロジェクトに入っている場合: config の playwrightModule に絶対パスを書く');
  console.error('  2) 新規に入れる場合: npm i -D playwright && npx playwright install chromium');
  console.error(errors.map((e) => '  - ' + e).join('\n'));
  process.exit(1);
}

const chromium = await loadChromium();

async function launch() {
  const options = config.launch ?? {channel: 'chrome', headless: true};
  try {
    return await chromium.launch(options);
  } catch (error) {
    if (!options.channel) throw error;
    console.log('note: channel ' + options.channel + ' が使えないので同梱 Chromium で撮ります');
    return chromium.launch({...options, channel: undefined});
  }
}

const targets = config.screens.filter((screen) => !only || only.has(screen.id));
const browser = await launch();
const now = new Date().toISOString();
const captured = new Map();
const bumped = [];
const unchanged = [];

for (const screen of targets) {
  const url = typeof config.url === 'function' ? config.url(screen) : screen.url;
  const revs = bootstrapRevisions(screen.id, previous.get(screen.id));
  const latest = revs.length > 0 ? revs[revs.length - 1] : null;
  const nextRev = (latest ? latest.rev : 0) + 1;

  const shots = {};
  let failed = null;
  // 高さは等倍のときに1回だけ測って、Retina でも使い回す
  let plannedHeight = null;

  for (const [suffix, dpr] of skip2x ? [['', 1]] : [['', 1], ['@2x', 2]]) {
    const context = await browser.newContext({viewport, deviceScaleFactor: dpr, ...(config.contextOptions ?? {})});
    const page = await context.newPage();
    try {
      if (config.beforeEach) await config.beforeEach(page, screen);
      await page.goto(url, {waitUntil: 'networkidle'});
      await page.waitForTimeout(settle);
      if (screen.run) {
        await screen.run(page);
        await page.waitForTimeout(screen.wait ?? afterRun);
      }

      // 描画が始まるまで待つ。見つからなくても撮影は続ける（モーダルだけの画面などがあるため）
      if (config.ready) await page.waitForSelector(config.ready, {timeout: 15000}).catch(() => {});
      // document.fonts.ready はそのまま返すと直列化できないので真偽値にして待つ
      await page.evaluate(() => (document.fonts ? document.fonts.ready.then(() => true) : true)).catch(() => {});

      // 画面の高さに合わせてビューポートを伸ばす（fullPage だと sticky が二重に写る）。
      // 画面の高さいっぱいのレイアウトは内側でスクロールするので、
      // ドキュメントの高さだけでは足りない。内側のはみ出しを足して測る
      const measure = () => page.evaluate(() => {
        let overflow = 0;
        for (const el of document.querySelectorAll('*')) {
          const over = el.scrollHeight - el.clientHeight;
          if (over <= 4) continue;
          const style = getComputedStyle(el);
          if (style.overflowY === 'auto' || style.overflowY === 'scroll') overflow = Math.max(overflow, over);
        }

        return document.documentElement.scrollHeight + overflow;
      });

      if (plannedHeight === null) {
        // 伸ばすと中身の折り返しが変わることがあるので、落ち着くまで測り直す
        let height = viewport.height;
        for (let attempt = 0; attempt < 4; attempt++) {
          const raw = await measure();
          const measured = Math.max(viewport.height, Math.min(raw, maxHeight));
          if (measured === height) break;
          height = measured;
          await page.setViewportSize({width: viewport.width, height});
          await page.waitForTimeout(200);
          if (raw >= maxHeight) break;
        }

        plannedHeight = height;
      } else {
        await page.setViewportSize({width: viewport.width, height: plannedHeight});
      }

      await page.waitForTimeout(350);
      shots[suffix] = await page.screenshot({fullPage: false});
    } catch (error) {
      failed = error.message.split('\n')[0];
      console.log('失敗', screen.id + suffix, failed);
    }

    await context.close();
  }

  if (failed || !shots['']) {
    captured.set(screen.id, {revs, error: failed ?? '画像を取得できませんでした'});
    continue;
  }

  const hash = sha1(shots['']);
  if (latest && latest.hash === hash) {
    // 見た目が変わっていないので版は増やさない。コメントも Outdated にしない
    unchanged.push(screen.id);
    captured.set(screen.id, {revs, error: null});
    console.log('変更なし', screen.id, 'v' + latest.rev);
  } else {
    const file = screen.id + '.r' + nextRev + '.png';
    const retina = shots['@2x'] ? screen.id + '.r' + nextRev + '@2x.png' : null;
    writeFileSync(join(outDir, file), shots['']);
    if (retina) writeFileSync(join(outDir, retina), shots['@2x']);
    writeFileSync(join(outDir, screen.id + '.png'), shots['']);
    if (shots['@2x']) writeFileSync(join(outDir, screen.id + '@2x.png'), shots['@2x']);
    captured.set(screen.id, {revs: [...revs, {rev: nextRev, file, retina, hash, h: null, capturedAt: now}], error: null});
    bumped.push(screen.id + ' v' + nextRev);
    console.log('撮影', screen.id, 'v' + nextRev + (latest ? '（前の版から変更あり）' : ''));
  }
}

/* ---------- サムネイル（Chromium で webp に変換） ---------- */
const context = await browser.newContext();
const page = await context.newPage();
await page.goto('about:blank');

const toThumb = async (pngPath) => {
  const png = readFileSync(pngPath).toString('base64');
  return page.evaluate(
    async ([data, width, quality]) => {
      const image = new Image();
      image.src = 'data:image/png;base64,' + data;
      await image.decode();
      const scale = Math.min(1, width / image.naturalWidth);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(image.naturalWidth * scale);
      canvas.height = Math.round(image.naturalHeight * scale);
      canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
      return {webp: canvas.toDataURL('image/webp', quality).split(',')[1], w: image.naturalWidth, h: image.naturalHeight};
    },
    [png, thumbWidth, thumbQuality],
  );
};

/* ---------- manifest を書き直す ---------- */
const manifest = [];
for (const screen of config.screens) {
  const fallback = {revs: bootstrapRevisions(screen.id, previous.get(screen.id)), error: (previous.get(screen.id) || {}).error || null};
  const state = captured.get(screen.id) || fallback;
  const revs = state.revs || [];

  thumbs[screen.id] = thumbs[screen.id] || {};
  for (const rev of revs) {
    const pngPath = join(outDir, rev.file);
    if (!existsSync(pngPath)) continue;
    if (thumbs[screen.id][rev.rev] && rev.h) continue;
    const result = await toThumb(pngPath);
    thumbs[screen.id][rev.rev] = result.webp;
    // 赤入れは幅1000の座標系で持つので、高さもその比率に直しておく
    rev.h = Math.round(1000 * result.h / result.w);
    console.log('縮小', screen.id, 'v' + rev.rev, Math.round(result.webp.length * 0.75 / 1024) + 'KB');
  }

  // 使わなくなった版のサムネは捨てる
  const keep = new Set(revs.map((rev) => String(rev.rev)));
  for (const key of Object.keys(thumbs[screen.id])) if (!keep.has(key)) delete thumbs[screen.id][key];

  const latest = revs.length > 0 ? revs[revs.length - 1] : null;
  manifest.push({
    id: screen.id,
    g: screen.g,
    title: screen.title,
    note: screen.note ?? '',
    chips: screen.chips ?? '',
    anchor: screen.anchor ?? 'top',
    link: screen.link ?? (config.linkFor ? config.linkFor(screen) : null),
    rev: latest ? latest.rev : null,
    revs,
    file: latest ? latest.file : null,
    retina: latest ? latest.retina : null,
    h: latest ? latest.h : null,
    error: state.error || null,
  });
}

await context.close();
await browser.close();

// config から消えた画面のサムネは残さない
const known = new Set(config.screens.map((screen) => screen.id));
for (const id of Object.keys(thumbs)) if (!known.has(id)) delete thumbs[id];

writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
writeFileSync(thumbsPath, JSON.stringify(thumbs));

const total = Object.values(thumbs).reduce(
  (sum, byRev) => sum + Object.values(byRev).reduce((inner, value) => inner + value.length * 0.75, 0),
  0,
);
console.log('完了', manifest.filter((m) => m.file).length + '/' + manifest.length, '画面 / サムネ合計', Math.round(total / 1024 / 1024 * 10) / 10, 'MB');
if (bumped.length > 0) console.log('版が上がった画面:', bumped.join(', '));
if (unchanged.length > 0) console.log('変更なし:', unchanged.join(', '));
const broken = manifest.filter((m) => m.error);
if (broken.length > 0) console.log('未取得:', broken.map((m) => m.id + '(' + m.error + ')').join(', '));
