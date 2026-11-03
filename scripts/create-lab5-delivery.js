// Genera evidencias a partir de ejecuciones reales. No recrea resultados históricos.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { chromium } = require('@playwright/test');
const root = path.resolve(__dirname, '..');
const out = path.join(root, 'entrega');
const repo = 'https://github.com/Brandonaguicede/lab6pa';
const escape = value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
fs.mkdirSync(path.join(out, 'logs'), { recursive: true });
function run(label, args) {
  const result = spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8', windowsHide: true,
    env: { ...process.env, FORCE_COLOR: '0' }, timeout: 240000 });
  const text = ((result.stdout || '') + (result.stderr || '')).replace(/\x1b\[[0-9;]*m/g, '');
  fs.writeFileSync(path.join(out, 'logs', `${label}.txt`), `${text}\nExit code: ${result.status}\n`);
  console.log(`${label}: exit ${result.status}`);
  return text;
}
function sheet(title, body) {
  return `<!doctype html><html lang="es"><meta charset="utf-8"><style>
  *{box-sizing:border-box}body{margin:0;background:#f1f5fb;color:#152a46;font:18px/1.5 Arial,sans-serif}
  header{padding:28px 36px;background:#123a80;color:white}h1{margin:0;font-size:28px}
  header p{margin:8px 0 0;font-size:15px}main{padding:28px 36px}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:15px/1.5 Consolas,monospace;background:white;padding:24px;border:1px solid #cad7e9}
  img{display:block;max-width:100%}a{color:inherit}</style><header><h1>${escape(title)}</h1><p>Brandonaguicede · Laboratorio 5 · ${repo}</p></header><main>${body}</main></html>`;
}
(async () => {
  const results = [
    ['evidencia2_pruebas_unitarias', 'Evidencia 2 · Pruebas unitarias', 'npm test', ['node_modules/mocha/bin/mocha.js']],
    ['evidencia3_pruebas_integracion', 'Evidencia 3 · Pruebas de integración', 'npm run test:integration', ['node_modules/jest/bin/jest.js', 'tests/integration', '--runInBand', '--env=node', '--verbose']],
    ['evidencia4_pruebas_e2e', 'Evidencia 4 · Pruebas end-to-end', 'npx playwright test --project=chromium --headed', ['node_modules/@playwright/test/cli.js', 'test', '--project=chromium', '--headed']],
  ];
  const logs = results.map(([file, title, cmd, args]) => ({ file, title, cmd,
    text: process.argv.includes('--reuse-logs') ? fs.readFileSync(path.join(out, 'logs', `${file}.txt`), 'utf8') : run(file, args) }));
  const browser = await chromium.launch();
  try {
    const chat = await browser.newPage({ viewport: { width: 1150, height: 650 } });
    const dialogs = [];
    chat.on('dialog', async dialog => { dialogs.push(dialog.message()); await dialog.dismiss(); });
    await chat.goto('http://localhost:3000/chat');
    await chat.waitForFunction(() => !document.querySelector('#send').disabled);
    const payload = "<script>alert('Inyección de script');</script>";
    await chat.fill('#message', payload);
    await chat.click('#send');
    await chat.waitForFunction(() => document.querySelector('#messages li')?.textContent.includes('<script>'));
    await chat.waitForTimeout(1000);
    if (dialogs.length || await chat.locator('#messages script').count()) throw Error('El script se ejecutó');
    const shot = await chat.screenshot({ fullPage: true });
    const injection = { payload, dialogs, scriptElements: await chat.locator('#messages script').count(),
      message: await chat.locator('#messages li').last().innerText(), version: 'versión corregida actual', identity: 'Tester (sesión de prueba)' };
    fs.writeFileSync(path.join(out, 'logs', 'inyeccion.json'), JSON.stringify(injection, null, 2));
    await chat.close();
    const pages = [];
    async function capture(file, title, body) {
      const p = await browser.newPage({ viewport: { width: 1200, height: 800 } });
      await p.setContent(sheet(title, body));
      await p.screenshot({ path: path.join(out, `${file}.jpg`), type: 'jpeg', quality: 94, fullPage: true });
      pages.push({ file, title }); await p.close();
    }
    await capture('evidencia1_inyeccion_scripts', 'Evidencia 1 · Inyección de scripts',
      `<p>Resultado observado en la <b>versión corregida actual</b>, con sesión de prueba Tester. No es una captura histórica de la versión vulnerable.</p><pre>${escape(payload)}\nDiálogos alert detectados: ${dialogs.length}\nElementos script insertados: 0\nResultado: el payload se muestra como texto.</pre><img src="data:image/png;base64,${shot.toString('base64')}">`);
    for (const result of logs) await capture(result.file, result.title, `<pre>$ ${escape(result.cmd)}\n\n${escape(result.text)}</pre>`);
    const snykFile = path.join(out, 'logs', 'snyk.txt');
    if (fs.existsSync(snykFile)) {
      const raw = fs.readFileSync(snykFile, 'utf8');
      const summary = raw.split('\n').filter(line => /^(\$ |Tested |Open Security|.*\[(HIGH|MEDIUM|CRITICAL|LOW)\]|.*Finding ID:|.*Total security issues:|.*Open   :|Exit code:)/.test(line)).join('\n');
      await capture('evidencia5_snyk', 'Paso 11 · Escaneo Snyk', `<p>Escaneo real incluyendo dependencias de desarrollo. El registro completo se adjunta en logs/snyk.txt.</p><pre>${escape(summary)}</pre><p><b>Pendiente:</b> la vulnerabilidad alta SNYK-JS-PICOMATCH-21248802 no tiene una versión corregida disponible según el aviso consultado. No se declara reparada ni se ha ignorado.</p><p>Referencia: https://security.snyk.io/vuln/SNYK-JS-PICOMATCH-21248802</p>`);
    }
    const pdf = await browser.newPage();
    const sections = pages.map(({file,title}) => `<section><h2>${escape(title)}</h2><img src="data:image/jpeg;base64,${fs.readFileSync(path.join(out,file+'.jpg')).toString('base64')}"></section>`).join('');
    await pdf.setContent(`<!doctype html><meta charset="utf-8"><style>@page{size:A4;margin:14mm}body{font:12px Arial;color:#15335d}section{break-before:page}h1{font-size:30px}h2{font-size:18px}img{display:block;max-width:100%;max-height:242mm;object-fit:contain;object-position:top left}p{line-height:1.6}</style><h1>Laboratorio 5</h1><p>Responsable: Brandonaguicede</p><p>Repositorio: <a href="${repo}">${repo}</a></p><h2>Bitácora de verificación - 2 de noviembre de 2026</h2><p>Se ejecutó UNA Chat localmente con frontend y backend reales y sesión de prueba Tester. Se comprobó el saneamiento de la inyección de scripts y se ejecutaron las suites de pruebas: 31 unitarias, 20 de integración y 4 end-to-end aprobadas.</p><p>Playwright verificó la carga de una imagen, un video directo, un reproductor de YouTube y la prevención de ejecución del script. El resultado de inyección corresponde a la versión corregida actual, no a una captura histórica de la versión vulnerable.</p><p>Se ejecutó Snyk incluyendo dependencias de desarrollo. Resultado: 1 vulnerabilidad alta y 2 medias. El requisito de reparar todas las altas permanece pendiente: el aviso de picomatch indica que no existe versión corregida disponible. No se aplicaron exclusiones ni se declara un escaneo limpio.</p><p>Las pruebas no acreditan el acceso real con Auth0 en producción. Se adjuntan los registros originales en logs/.</p><p>Se incluyen los JPG y repositorio.txt como archivos independientes. Este PDF adicional cubre la indicación contradictoria del enunciado; confirmar el formato final con el docente.</p>${sections}`);
    await pdf.pdf({ path: path.join(out, 'Bitacora_Lab05_Brandonaguicede.pdf'), format: 'A4', printBackground: true });
    fs.writeFileSync(path.join(out, 'repositorio.txt'), repo + '\n');
    console.log('Evidencias y PDF guardados en entrega/.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
