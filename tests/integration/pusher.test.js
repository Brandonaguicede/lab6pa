// Transporte Pusher (Vercel): autenticación de canal y publicación de mensajes con un cliente simulado.
const request = require('supertest');
const createApp = require('../../chat-server');

const cookie = 'lab_test_session=1';
const auth = {
  getUser: req => (req.headers.cookie || '').includes(cookie) ? { sub: 'google|ana', name: 'Ana', email: 'ana@example.com' } : null,
  login: (req, res) => res.redirect('/chat'), callback: (req, res) => res.redirect('/chat'), logout: (req, res) => res.redirect('/')
};

describe('transporte Pusher', () => {
  let triggered, app;
  beforeEach(() => {
    triggered = [];
    const client = {
      authorizeChannel: (socketId, channel) => ({ auth: `key:${socketId}:${channel}` }),
      trigger: async (...args) => { triggered.push(args); }
    };
    app = createApp({ auth, pusher: { client, key: 'pub', cluster: 'mt1' } }).app;
  });

  test('/api/config exige sesión y publica solo datos públicos', async () => {
    await request(app).get('/api/config').expect(401);
    const res = await request(app).get('/api/config').set('Cookie', cookie).expect(200);
    expect(res.body).toEqual({ transport: 'pusher', key: 'pub', cluster: 'mt1', channel: 'private-una-chat', event: 'Evento-Mensaje-Server' });
  });

  test('autoriza únicamente el canal del chat y solo con sesión', async () => {
    const send = channel => request(app).post('/api/pusher/auth').type('form').send({ socket_id: '1.2', channel_name: channel });
    await send('private-una-chat').expect(401);
    await send('private-una-chat').set('Cookie', cookie).expect(200);
    await send('private-otro').set('Cookie', cookie).expect(403);
  });

  test('publica mensajes validados con la identidad de la sesión', async () => {
    await request(app).post('/api/messages').send({ mensaje: 'hola' }).expect(401);
    await request(app).post('/api/messages').set('Cookie', cookie).send({ mensaje: 'hola', color: '#0b6b4c', nombre: 'Intruso' }).expect(204);
    expect(triggered).toHaveLength(1);
    const msg = JSON.parse(triggered[0][2]);
    expect(msg.nombre).toBe('Ana');
    expect(msg.mensaje).toContain('hola');
  });

  test('sin Pusher configurado usa Socket.IO', async () => {
    const plain = createApp({ auth, pusher: null }).app;
    const res = await request(plain).get('/api/config').set('Cookie', cookie).expect(200);
    expect(res.body).toEqual({ transport: 'socketio' });
    await request(plain).post('/api/messages').set('Cookie', cookie).expect(404);
  });
});
