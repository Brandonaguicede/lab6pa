// Genera las capturas JPG etiquetadas de evidencia a partir de la salida real de cada suite.
// Uso: node scripts/make-evidence.js
const { chromium } = require('@playwright/test');
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const out = path.resolve(root, '..', 'evidencias');
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const b64 = (f) => fs.readFileSync(f).toString('base64');

function run(cmd) {
  const r = spawnSync(cmd, { cwd: root, shell: true, encoding: 'utf8', env: { ...process.env, FORCE_COLOR: '0' } });
  // se omite el ruido de console.log de las pruebas para que la captura sea legible
  const text = (r.stdout + r.stderr).replace(/\x1b\[[0-9;]*m/g, '')
    .split('\n').filter((l) => l.trim() !== '' && !/^\s*(Es un[a]? (texto|video|imagen)!|\(node:\d+\)|\(Use `node)/.test(l))
    .join('\n');
  return { cmd, text, status: r.status };
}

const page = (label, title, body) => `<!doctype html><meta charset="utf-8"><style>
body{margin:0;background:#1e1e1e;font-family:Segoe UI,Arial,sans-serif;width:1200px}
.label{background:#0b6bcb;color:#fff;padding:14px 22px;font-size:26px;font-weight:700}
.sub{background:#124a8a;color:#dbeafe;padding:6px 22px;font-size:15px}
pre{margin:0;padding:18px 22px;color:#d4d4d4;font:14px/1.35 Consolas,monospace;white-space:pre-wrap}
.ok{color:#4ec9b0}.img{padding:14px 22px}.img img{width:1150px;border:2px solid #555;display:block;margin-bottom:12px}
.cap{color:#fff;font-size:18px;padding:0 22px 14px}.bad{background:#7a1f1f;color:#fff;padding:12px 22px;font-size:20px}
</style><div class="label">${label}</div><div class="sub">${title}</div>${body}`;

async function shot(browser, html, file) {
  const p = await browser.newPage({ viewport: { width: 1200, height: 400 } });
  await p.setContent(html);
  await p.screenshot({ path: path.join(out, file), type: 'jpeg', quality: 92, fullPage: true });
  await p.close();
}

(async () => {
  const browser = await chromium.launch();

  // Evidencia 1: script injection contra la version vulnerable (capturas tomadas por scripts/evidencia1.js)
  const alertText = fs.readFileSync(path.join(out, 'raw1_alert.txt'), 'utf8');
  await shot(browser, page('EVIDENCIA 1 - Inyección de scripts (Paso 2)', 'Versión vulnerable (antes de la corrección) - payload: &lt;script&gt;alert(\'Inyección de script\');&lt;/script&gt;',
    `<div class="img"><div class="cap">1) Payload escrito en el campo de texto del chat:</div><img src="data:image/png;base64,${b64(path.join(out, 'raw1_antes.png'))}">
    <div class="cap">2) Después de pulsar Send:</div><img src="data:image/png;base64,${b64(path.join(out, 'raw1_despues.png'))}"></div>
    <div class="bad">VULNERABLE: el navegador ejecutó el script y mostró alert("${esc(alertText)}") (capturado con page.on('dialog')).</div>`), 'evidencia1_inyeccion_scripts.jpg');

  const suites = [
    ['EVIDENCIA 2 - Pruebas unitarias (Paso 8)', 'npm test (Mocha) - test/test.js', 'npm test', 'evidencia2_pruebas_unitarias.jpg'],
    ['EVIDENCIA 3 - Pruebas de integración', 'npx jest tests/integration --runInBand --env=node --verbose --silent --reporters=default (Jest + Supertest + socket.io-client)', 'npx jest tests/integration --runInBand --env=node --verbose --silent --reporters=default', 'evidencia3_pruebas_integracion.jpg'],
    ['EVIDENCIA 5 - Escaneo Snyk (Paso 11)', 'snyk test - dependencias tras reparar críticas/altas', 'npx snyk test', 'evidencia5_snyk.jpg'],
    ['EVIDENCIA 4 - Pruebas end-to-end con Playwright', 'npx playwright test --project=chromium (frontend y backend reales)', 'npx playwright test --project=chromium', 'evidencia4_pruebas_e2e_playwright.jpg'],
  ];
  for (const [label, title, cmd, file] of suites) {
    const r = run(cmd);
    console.log(cmd, '-> exit', r.status);
    await shot(browser, page(label, title, `<pre><span class="ok">$ ${esc(cmd)}</span>\n${esc(r.text)}\n\n<span class="ok">exit code: ${r.status}</span></pre>`), file);
  }
  await browser.close();
})();
