// Pruebas de integracion: backend (express + socket.io) colaborando con una-lib.
const request = require('supertest');
const { io: Client } = require('socket.io-client');
const createApp = require('../../chat-server');
const unalib = require('../../libs/unalib');

const EVENTO = 'Evento-Mensaje-Server';
const cookie = 'lab_test_session=1';
const auth = {
  getUser: req => (req.headers.cookie || '').includes(cookie) ? { sub: 'google|ana', name: 'Ana', email: 'ana@example.com' } : null,
  login: (req, res) => res.redirect('/chat'),
  callback: (req, res) => res.redirect('/chat'),
  logout: (req, res) => res.redirect('/')
};

describe('integracion backend + una-lib', () => {
  let server, url;

  beforeAll((done) => {
    server = createApp({ auth });
    server.http.listen(0, () => {
      url = 'http://localhost:' + server.http.address().port;
      done();
    });
  });

  afterAll((done) => {
    server.io.close(() => done());
  });

  // envia un mensaje por Socket.IO (la entrada real del backend) y espera la respuesta
  function enviar(mensaje, extra) {
    return new Promise((resolve, reject) => {
      const socket = Client(url, { transports: ['websocket'], forceNew: true, extraHeaders: { Cookie: cookie } });
      socket.on('connect_error', reject);
      socket.on(EVENTO, (msg) => {
        socket.close();
        resolve(JSON.parse(msg));
      });
      socket.on('connect', () => {
        socket.emit(EVENTO, JSON.stringify(Object.assign({ nombre: 'Ana', mensaje, color: '#336699' }, extra)));
      });
    });
  }

  test('sin sesion no se puede abrir el chat ni consultar la identidad', async () => {
    expect((await request(server.http).get('/chat')).status).toBe(302);
    expect((await request(server.http).get('/api/me')).status).toBe(401);
  });

  test('sin sesion Socket.IO rechaza la conexion', async () => {
    const socket = Client(url, { transports: ['websocket'], forceNew: true, reconnection: false });
    const message = await new Promise(resolve => socket.on('connect_error', error => resolve(error.message)));
    socket.close();
    expect(message).toMatch(/iniciar sesión/);
  });

  test('GET /chat responde 200 con la pagina del chat solo con sesion', async () => {
    const res = await request(server.http).get('/chat').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/html/);
    expect(res.text).toContain('UNA Chat');
    const me = await request(server.http).get('/api/me').set('Cookie', cookie);
    expect(me.body.name).toBe('Ana');
  });

  test('URL de imagen valida: el backend la acepta y devuelve una etiqueta <img>', async () => {
    const r = await enviar('https://example.com/foto.png');
    expect(r.mensaje).toBe(unalib.getImageTag('https://example.com/foto.png'));
    expect(r.mensaje).toMatch(/^<img src="https:\/\/example\.com\/foto\.png"/);
    expect(r.nombre).toBe('Ana');
  });

  test('URL de video de YouTube valida: el backend devuelve el reproductor iframe', async () => {
    const r = await enviar('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    expect(r.mensaje).toBe(unalib.getEmbeddedCode('https://www.youtube.com/watch?v=dQw4w9WgXcQ'));
    expect(r.mensaje).toContain('https://www.youtube.com/embed/dQw4w9WgXcQ');
  });

  test('URL de video directo (mp4): el backend devuelve un reproductor <video>', async () => {
    const r = await enviar('https://example.com/clip.mp4');
    expect(r.mensaje).toMatch(/^<video controls/);
  });

  test('script: el backend devuelve el contenido saneado, sin etiquetas ejecutables', async () => {
    const r = await enviar("<script>alert('Inyección de script');</script>");
    expect(r.mensaje).not.toContain('<script');
    expect(r.mensaje).toContain('&lt;script&gt;');
  });

  test('URL no permitida (javascript:) se trata como texto escapado', async () => {
    const r = await enviar('javascript:alert(1)//x.png');
    expect(r.mensaje).not.toMatch(/<img|<iframe|<video/);
  });

  test('nombre y color maliciosos son saneados por el backend', async () => {
    const r = await enviar('hola', { nombre: '<img src=x onerror=alert(1)>', color: "red;'><script>" });
    expect(r.nombre).not.toContain('<');
    expect(r.color).toBe('#000000');
  });

  test('el backend realmente invoca validateMessage de una-lib', async () => {
    const espia = jest.spyOn(unalib, 'validateMessage');
    await enviar('texto plano');
    expect(espia).toHaveBeenCalledTimes(1);
    espia.mockRestore();
  });

  test('un mensaje que no es JSON no rompe el servidor', async () => {
    const socket = Client(url, { transports: ['websocket'], forceNew: true, extraHeaders: { Cookie: cookie } });
    const r = await new Promise((resolve) => {
      socket.on(EVENTO, (msg) => { socket.close(); resolve(JSON.parse(msg)); });
      socket.on('connect', () => socket.emit(EVENTO, '<script>alert(1)</script>'));
    });
    expect(r.mensaje).not.toContain('<script');
  });

  test('el nombre del mensaje procede de la sesion y no del cliente', async () => {
    const r = await enviar('hola', { nombre: 'Intruso' });
    expect(r.nombre).toBe('Ana');
  });
});
