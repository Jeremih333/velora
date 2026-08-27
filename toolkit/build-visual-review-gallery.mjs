import { readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { format, resolveConfig } from 'prettier';

const root = resolve(import.meta.dirname, '..');
const evidenceRoot = resolve(root, 'docs/ui/evidence');
const output = resolve(evidenceRoot, 'review.html');
const states = (await readdir(evidenceRoot, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory() && /^ui-\d{2}$/.test(entry.name))
  .map((entry) => entry.name)
  .sort();

if (states.length !== 46) {
  throw new Error(`Expected 46 UI evidence directories, found ${states.length}.`);
}

const cards = states
  .map((state) => {
    const phoneFigure =
      state === 'ui-06'
        ? '<figure><figcaption>Phone</figcaption><div class="na">На телефоне сортировка скрыта намеренно. Проверь состояние на планшете и desktop.</div></figure>'
        : `<figure><figcaption>Phone</figcaption><a href="./${state}/actual-iphone.png" target="_blank"><img loading="lazy" src="./${state}/actual-iphone.png" alt="${state}: phone"></a></figure>`;
    return `
      <article class="state" data-state="${state}">
        <header>
          <h2>${state.toUpperCase()}</h2>
          <div class="decision" role="group" aria-label="Решение для ${state}">
            <button type="button" data-value="PASS">PASS</button>
            <button type="button" data-value="FAIL">FAIL</button>
            <button type="button" data-value="OPEN">СБРОС</button>
          </div>
        </header>
        <div class="shots">
          <figure><figcaption>Reference</figcaption><a href="./${state}/expected.jpg" target="_blank"><img loading="lazy" src="./${state}/expected.jpg" alt="${state}: reference"></a></figure>
          ${phoneFigure}
          <figure><figcaption>Tablet</figcaption><a href="./${state}/actual-tablet.png" target="_blank"><img loading="lazy" src="./${state}/actual-tablet.png" alt="${state}: tablet"></a></figure>
          <figure><figcaption>Desktop</figcaption><a href="./${state}/actual-desktop.png" target="_blank"><img loading="lazy" src="./${state}/actual-desktop.png" alt="${state}: desktop"></a></figure>
          <figure><figcaption>Phone diff</figcaption><a href="./${state}/diff-iphone.png" target="_blank"><img loading="lazy" src="./${state}/diff-iphone.png" alt="${state}: phone diff"></a></figure>
        </div>
        <label>Комментарий<textarea rows="2" placeholder="Что поправить или почему состояние принято"></textarea></label>
      </article>`;
  })
  .join('\n');

const html = `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>VeloraAI — visual review 46/46</title>
  <style>
    :root { color-scheme: dark; font-family: Inter, system-ui, sans-serif; background:#090a0c; color:#f5f5f4; }
    * { box-sizing:border-box; }
    body { margin:0; background:linear-gradient(180deg,#111317,#08090b 35rem); }
    .top { position:sticky; top:0; z-index:2; display:flex; flex-wrap:wrap; align-items:center; gap:12px; padding:14px clamp(14px,3vw,36px); background:rgba(9,10,12,.94); border-bottom:1px solid #303238; backdrop-filter:blur(16px); }
    h1 { margin:0 auto 0 0; font-size:clamp(18px,3vw,28px); }
    .summary { color:#b5b8bf; font-variant-numeric:tabular-nums; }
    button { min-height:40px; padding:8px 14px; border:1px solid #454850; border-radius:999px; background:#1b1d22; color:inherit; font-weight:700; cursor:pointer; }
    button:hover { border-color:#d7d9de; }
    .export { background:#f4f4f3; color:#111214; }
    main { display:grid; gap:18px; padding:18px clamp(10px,2vw,28px) 64px; }
    .state { padding:16px; border:1px solid #303238; border-radius:20px; background:#15171b; box-shadow:0 16px 45px rgba(0,0,0,.2); }
    .state[data-result="PASS"] { border-color:#397a5b; }
    .state[data-result="FAIL"] { border-color:#a94b57; }
    .state header { display:flex; align-items:center; gap:12px; margin-bottom:14px; }
    h2 { margin:0 auto 0 0; font-size:17px; letter-spacing:.08em; }
    .decision { display:flex; flex-wrap:wrap; gap:6px; }
    .state[data-result="PASS"] [data-value="PASS"] { background:#286443; border-color:#4da578; }
    .state[data-result="FAIL"] [data-value="FAIL"] { background:#7b2936; border-color:#d55b6d; }
    .shots { display:grid; grid-template-columns:repeat(5,minmax(160px,1fr)); gap:10px; overflow-x:auto; padding-bottom:6px; scrollbar-width:thin; }
    figure { margin:0; min-width:0; }
    figcaption { margin:0 0 6px; color:#b5b8bf; font-size:13px; }
    img { display:block; width:100%; height:360px; object-fit:contain; object-position:top center; border:1px solid #303238; border-radius:12px; background:#050607; }
    .na { display:grid; place-items:center; width:100%; height:360px; padding:20px; border:1px dashed #454850; border-radius:12px; background:#0e0f12; color:#b5b8bf; text-align:center; }
    label { display:grid; gap:6px; margin-top:12px; color:#c8cad0; font-size:13px; }
    textarea { width:100%; resize:vertical; padding:10px 12px; border:1px solid #383b42; border-radius:12px; background:#0e0f12; color:#f5f5f4; font:inherit; }
    @media (max-width:720px) { .shots { grid-template-columns:repeat(5,76vw); } img { height:62vh; } .state header { align-items:flex-start; } }
  </style>
</head>
<body>
  <header class="top">
    <h1>VeloraAI · visual review 46/46</h1>
    <span class="summary" aria-live="polite"></span>
    <button class="export" type="button">Скачать результат</button>
  </header>
  <main>${cards}</main>
  <script>
    const storageKey = 'velora-visual-review-v2-20260826';
    const saved = JSON.parse(localStorage.getItem(storageKey) || '{}');
    const states = [...document.querySelectorAll('.state')];
    function render() {
      for (const state of states) {
        const value = saved[state.dataset.state] || { result: 'OPEN', comment: '' };
        state.dataset.result = value.result;
        state.querySelector('textarea').value = value.comment || '';
      }
      const counts = { PASS: 0, FAIL: 0, OPEN: 0 };
      for (const state of states) counts[state.dataset.result] += 1;
      document.querySelector('.summary').textContent = 'PASS ' + counts.PASS + ' · FAIL ' + counts.FAIL + ' · OPEN ' + counts.OPEN;
      localStorage.setItem(storageKey, JSON.stringify(saved));
    }
    document.addEventListener('click', (event) => {
      const button = event.target.closest('[data-value]');
      if (!button) return;
      const state = button.closest('.state');
      saved[state.dataset.state] = { result: button.dataset.value, comment: state.querySelector('textarea').value };
      render();
    });
    document.addEventListener('input', (event) => {
      if (!(event.target instanceof HTMLTextAreaElement)) return;
      const state = event.target.closest('.state');
      saved[state.dataset.state] = { result: state.dataset.result || 'OPEN', comment: event.target.value };
      localStorage.setItem(storageKey, JSON.stringify(saved));
    });
    document.querySelector('.export').addEventListener('click', () => {
      const result = { generatedAt: new Date().toISOString(), releaseCandidate: 'local-2026-08-26', states: saved };
      const link = document.createElement('a');
      link.href = URL.createObjectURL(new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' }));
      link.download = 'velora-visual-review.json';
      link.click();
      URL.revokeObjectURL(link.href);
    });
    render();
  </script>
</body>
</html>`;

const prettierConfig = (await resolveConfig(output)) ?? {};
await writeFile(output, await format(html, { ...prettierConfig, filepath: output }), 'utf8');
process.stdout.write(`Visual review gallery written: ${output}\n`);
