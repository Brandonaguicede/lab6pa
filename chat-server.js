
const express = require('express');
const path = require('node:path');
const validation = require('./libs/unalib');
const { createAuth } = require('./auth');

const envPath = path.join(__dirname, '.env');
if (process.loadEnvFile && require('node:fs').existsSync(envPath)) process.loadEnvFile(envPath);

const CHANNEL = 'private-una-chat';
const EVENT = 'Evento-Mensaje-Server';

// Pusher se usa en Vercel, donde las funciones no mantienen conexiones Socket.IO.
function createPusher(env = process.env) {
  const { PUSHER_APP_ID: appId, PUSHER_KEY: key, PUSHER_SECRET: secret, PUSHER_CLUSTER: cluster } = env;
  if (!appId || !key || !secret || !cluster) return null;
  const Pusher = require('pusher');
  return { client: new Pusher({ appId, key, secret, cluster, useTLS: true }), key, cluster };
}

function createApp(options = {}) {
  const auth = options.auth || createAuth();
  const pusher = options.pusher === undefined ? createPusher() : options.pusher;
  const app = express();
  const http = require('node:http').createServer(app);
  const io = require('socket.io')(http);
  app.disable('x-powered-by');

  app.get('/', (req, res) => auth.getUser(req) ? res.redirect('/chat') : res.sendFile(path.join(__dirname, 'login.html')));
  app.get('/login', (req, res) => auth.login(req, res));
  app.get('/callback', (req, res) => Promise.resolve(auth.callback(req, res)).catch(error => {
    console.error('Error de autenticación:', error.message);
    res.redirect('/?auth_error=failed');
  }));
  app.get('/logout', (req, res) => auth.logout(req, res));
  app.get('/chat', (req, res) => auth.getUser(req)
    ? res.sendFile(path.join(__dirname, 'index.html')) : res.redirect('/?login_required=1'));
  app.get('/api/me', (req, res) => {
    const user = auth.getUser(req);
    if (!user) return res.status(401).json({ error: 'Debes iniciar sesión.' });
    res.json(user);
  });

  function buildMessage(user, raw) {
    let input;
    try { input = JSON.parse(raw); } catch { input = { mensaje: raw }; }
    if (!input || typeof input !== 'object') input = { mensaje: '' };
    return validation.validateMessage(JSON.stringify({
      nombre: user.name || user.email || 'Usuario', mensaje: input.mensaje, color: input.color
    }));
  }

  app.get('/api/config', (req, res) => {
    if (!auth.getUser(req)) return res.status(401).json({ error: 'Debes iniciar sesión.' });
    res.json(pusher ? { transport: 'pusher', key: pusher.key, cluster: pusher.cluster, channel: CHANNEL, event: EVENT }
      : { transport: 'socketio' });
  });
  if (pusher) {
    app.post('/api/pusher/auth', express.urlencoded({ extended: false, limit: '2kb' }), (req, res) => {
      if (!auth.getUser(req)) return res.status(401).json({ error: 'Debes iniciar sesión.' });
      const { socket_id: socketId, channel_name: channel } = req.body || {};
      if (channel !== CHANNEL || typeof socketId !== 'string') return res.status(403).json({ error: 'Canal no permitido.' });
      res.json(pusher.client.authorizeChannel(socketId, channel));
    });
    app.post('/api/messages', express.json({ limit: '8kb' }), async (req, res) => {
      const user = auth.getUser(req);
      if (!user) return res.status(401).json({ error: 'Debes iniciar sesión.' });
      try {
        await pusher.client.trigger(CHANNEL, EVENT, buildMessage(user, JSON.stringify(req.body || {})));
        res.status(204).end();
      } catch (error) {
        console.error('Error al enviar el mensaje:', error.message);
        res.status(502).json({ error: 'No se pudo enviar el mensaje.' });
      }
    });
  }

  io.use((socket, next) => {
    const user = auth.getUser(socket.request);
    if (!user) return next(new Error('Debes iniciar sesión para usar el chat.'));
    socket.data.user = user;
    next();
  });
  io.on('connection', socket => {
    socket.on('Evento-Mensaje-Server', raw => {
      const message = buildMessage(socket.data.user, raw);
      io.emit('Evento-Mensaje-Server', message);
    });
  });
  return { app, http, io };
}

module.exports = createApp;

if (require.main === module) {
  const port = process.env.PORT || 3000;
  createApp().http.listen(port, () => console.log(`UNA Chat en el puerto ${port}`));
}
