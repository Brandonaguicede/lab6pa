const { test, expect } = require('@playwright/test');

const IMAGEN = 'https://interactive-examples.mdn.mozilla.net/media/cc0-images/elephant-660-480.jpg';
const VIDEO_MP4 = 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4';
const VIDEO_YT = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
const SCRIPT = "<script>alert('Inyección de script');</script>";

async function enviar(page, texto) {
  await page.getByPlaceholder('Escriba un mensaje').fill(texto);
  await page.getByRole('button', { name: 'Enviar' }).click();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/chat');
  await expect(page.getByText('Tester')).toBeVisible();
});

test('muestra una imagen y termina de cargar', async ({ page }) => {
  await enviar(page, IMAGEN);
  const img = page.locator('#messages li img');
  await expect(img).toBeVisible();
  await expect(img).toHaveAttribute('src', IMAGEN);
  await expect.poll(() => img.evaluate((el) => el.complete && el.naturalWidth > 0)).toBe(true);
});

test('muestra un reproductor de video directo y carga el contenido', async ({ page }) => {
  await enviar(page, VIDEO_MP4);
  const video = page.locator('#messages li video');
  await expect(video).toBeVisible();
  await expect.poll(() => video.evaluate((el) => el.readyState), { timeout: 20000 }).toBeGreaterThanOrEqual(1);
  expect(await video.evaluate((el) => el.duration)).toBeGreaterThan(0);
});

test('muestra el reproductor de YouTube embebido y carga el contenido', async ({ page }) => {
  await enviar(page, VIDEO_YT);
  const iframe = page.locator('#messages li iframe');
  await expect(iframe).toBeVisible();
  await expect(iframe).toHaveAttribute('src', 'https://www.youtube.com/embed/dQw4w9WgXcQ');
  // el iframe termina de cargar su documento
  await expect.poll(() => page.frames().some((f) => f.url().includes('youtube.com/embed/dQw4w9WgXcQ')), { timeout: 20000 }).toBe(true);
});

test('un script inyectado no se ejecuta y el mensaje queda saneado', async ({ page }) => {
  const dialogos = [];
  page.on('dialog', async (dialog) => {
    dialogos.push(dialog.message());
    await dialog.dismiss();
  });

  await enviar(page, SCRIPT);

  const mensaje = page.locator('#messages li').last();
  await expect(mensaje).toContainText('<script>');       // se ve como texto plano
  await expect(page.locator('#messages li script')).toHaveCount(0);
  await page.waitForTimeout(1000);
  expect(dialogos).toEqual([]);                           // el alert nunca se disparo
});
