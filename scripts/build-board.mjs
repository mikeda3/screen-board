#!/usr/bin/env node
// manifest.json + thumbs.json から画面ボードの HTML を組み立てる。
//
//   node build-board.mjs <board.config.mjs> [出力先.html]
//
// 撮り直さずにタイトルやメモだけ直したいときは、config を書き換えてこれだけ流す。

import {readFileSync, writeFileSync} from 'node:fs';
import {pathToFileURL, fileURLToPath} from 'node:url';
import {resolve, join, dirname} from 'node:path';

const [configArg, outArg] = process.argv.slice(2);
if (!configArg) {
  console.error('usage: node build-board.mjs <board.config.mjs> [out.html]');
  process.exit(1);
}

const configPath = resolve(configArg);
const config = (await import(pathToFileURL(configPath).href)).default;
const outDir = resolve(configPath, '..', config.outDir ?? 'screens');
const templatePath = join(dirname(fileURLToPath(import.meta.url)), 'board.tpl.html');

const manifest = JSON.parse(readFileSync(join(outDir, 'manifest.json'), 'utf8')).filter((entry) => entry.file);
const thumbsRaw = JSON.parse(readFileSync(join(outDir, 'thumbs.json'), 'utf8'));
const thumbs = {};
for (const [id, value] of Object.entries(thumbsRaw)) thumbs[id] = typeof value === 'string' ? {1: value} : value;

const labels = {
  approve: '実装許可',
  done: '実装済み',
  commentPlaceholder: 'この画面で直したい点',
  link: '開く',
  ...(config.labels ?? {}),
};
labels.filterHideDone = labels.filterHideDone ?? labels.done + 'を除く';

const escape = (value) =>
  String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const chipList = (chips) => {
  const items = String(chips ?? '').split(',').map((chip) => chip.trim()).filter(Boolean);
  return items.length === 0 ? '' : '<ul class="chips">' + items.map((chip) => '<li>' + escape(chip) + '</li>').join('') + '</ul>';
};

const linkOf = (entry) => {
  if (!entry.link) return '';
  const href = typeof entry.link === 'string' ? entry.link : entry.link.href;
  const label = typeof entry.link === 'string' ? labels.link : (entry.link.label ?? labels.link);
  if (!href) return '';
  return '<a class="story" href="' + escape(href) + '" target="_blank" rel="noreferrer">' + escape(label) + '</a>';
};

const groups = config.groups ??
  [...new Set(manifest.map((entry) => entry.g ?? ''))].map((id) => ({id, name: id || (config.title ?? '画面'), desc: ''}));
const rail = [];
const sections = [];

for (const group of groups) {
  const items = manifest.filter((entry) => (entry.g ?? '') === group.id);
  if (items.length === 0) continue;

  rail.push(
    '<li><a href="#g-' + escape(group.id) + '"><span class="rail-id">' + escape(group.id) + '</span>' +
    '<span class="rail-name">' + escape(group.name) + '</span>' +
    '<span class="rail-count" data-group-count="' + escape(group.id) + '"><b>0</b>·<em>0</em>/' + items.length + '</span></a></li>',
  );

  const cards = items.map((entry) => {
    const id = entry.id;
    const revs = entry.revs ?? [];
    const tabs = revs.length < 2
      ? ''
      : '<div class="revtabs" data-revtabs="' + escape(id) + '">' +
        revs.map((rev) =>
          '<button type="button" data-rev="' + rev.rev + '" aria-pressed="false">v' + rev.rev + '</button>').join('') +
        '</div>';

    return `<article class="card" id="s-${escape(id)}" data-id="${escape(id)}" data-group="${escape(group.id)}">
  <div class="shot-wrap">
    ${tabs}
    <button class="shot" type="button" data-open="${escape(id)}" aria-label="${escape(entry.title)} を拡大">
      <img data-thumb="${escape(id)}" alt="${escape(entry.title)}" loading="lazy"${entry.anchor === 'bottom' ? ' data-anchor="bottom"' : ''}>
      <svg class="marks" data-marks="${escape(id)}" viewBox="0 0 1000 ${entry.h ?? 780}" aria-hidden="true"></svg>
    </button>
  </div>
  <div class="meta">
    <div class="meta-head"><span class="sid">${escape(id)}</span><h3>${escape(entry.title)}</h3><span class="revnow" data-revnow="${escape(id)}"></span></div>
    ${entry.note ? '<p class="note">' + escape(entry.note) + '</p>' : ''}
    ${chipList(entry.chips)}
    <div class="review" data-review="${escape(id)}"></div>
    <div class="card-foot">
      <div class="flags">
        <label class="flag approve"><input type="checkbox" data-approve="${escape(id)}"><span>${escape(labels.approve)}</span></label>
        <label class="flag built"><input type="checkbox" data-done="${escape(id)}"><span>${escape(labels.done)}</span></label>
      </div>
      <span class="mark-count" data-mark-count="${escape(id)}" hidden></span>
      ${linkOf(entry)}
    </div>
  </div>
</article>`;
  });

  sections.push(`<section class="group" id="g-${escape(group.id)}">
  <header class="group-head"><span class="gid">${escape(group.id)}</span><div><h2>${escape(group.name)}</h2>${group.desc ? '<p>' + escape(group.desc) + '</p>' : ''}</div><span class="gcount">${items.length}画面</span></header>
  <div class="grid">${cards.join('')}</div>
</section>`);
  }

const notes = (config.notes ?? []).map((note) => '    <p class="rail-note">' + note + '</p>').join('\n');

const routes = (config.routes ?? [])
  .map((route) => `        <div class="route">
          <span class="tag">${escape(route.tag ?? '')}</span>
          <h3>${escape(route.title)}</h3>
          <p>${escape(route.body)}</p>
        </div>`)
  .join('\n');

const intro = config.intro || routes
  ? `    <div class="intro">
${config.intro ? '      <p>' + escape(config.intro) + '</p>' : ''}
${routes ? '      <div class="routes">\n' + routes + '\n      </div>' : ''}
    </div>`
  : '';

const payload = Object.fromEntries(
  manifest.map((entry) => [
    entry.id,
    {
      title: entry.title,
      rev: entry.rev ?? 1,
      revs: (entry.revs ?? []).map((rev) => ({
        rev: rev.rev,
        h: rev.h ?? entry.h ?? 780,
        at: rev.capturedAt ?? null,
        src: 'data:image/webp;base64,' + (thumbs[entry.id]?.[rev.rev] ?? ''),
      })),
    },
  ]),
);
const titles = Object.fromEntries(manifest.map((entry) => [entry.id, entry.title]));

const home = process.env.HOME ?? '';
const tilde = (value) => (home && value.startsWith(home) ? '~' + value.slice(home.length) : value);
const scriptDir = dirname(fileURLToPath(import.meta.url));
const recapture = config.recapture === false ? null : {
  cwd: tilde(config.recapture?.cwd ?? dirname(configPath)),
  config: config.recapture?.config ?? configPath.split('/').pop(),
  scripts: tilde(config.recapture?.scripts ?? scriptDir),
};

const title = config.title ?? '画面ボード';
const fills = {
  __TITLE__: escape(title),
  __KICKER__: escape(config.kicker ?? ''),
  __HEADING__: escape(config.heading ?? title).replace(/\n/g, '<br>'),
  __LEAD__: escape(config.lead ?? ''),
  __LABEL_APPROVE__: escape(labels.approve),
  __LABEL_DONE__: escape(labels.done),
  __F_HIDE_DONE__: escape(labels.filterHideDone),
  __PLACEHOLDER__: escape(labels.commentPlaceholder),
  __NOTES__: notes,
  __INTRO__: intro,
  __RAIL__: rail.join(''),
  __CARDS__: sections.join(''),
  __TITLE_JSON__: JSON.stringify(title),
  __PAYLOAD__: JSON.stringify(payload),
  __TITLES__: JSON.stringify(titles),
  __KEY__: config.storageKey ?? 'screen-board:state',
  __RECAPTURE__: JSON.stringify(recapture),
};

let html = readFileSync(templatePath, 'utf8').replaceAll('__TOTAL__', String(manifest.length));
for (const [key, value] of Object.entries(fills)) html = html.replaceAll(key, () => value);

const outPath = outArg ? resolve(outArg) : resolve(dirname(configPath), config.boardFile ?? 'board.html');
writeFileSync(outPath, html);

const mb = Math.round(html.length / 1024 / 1024 * 100) / 100;
const revTotal = manifest.reduce((sum, entry) => sum + (entry.revs?.length ?? 1), 0);
console.log('組み立て完了', manifest.length + '画面 /', revTotal + '版', mb + 'MB', '→', outPath);
if (mb > 12) console.log('警告: Artifact の上限は16MB。thumbWidth か thumbQuality を下げて撮り直してください。');
