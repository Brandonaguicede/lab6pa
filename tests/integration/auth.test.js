const crypto = require('node:crypto');
const request = require('supertest');
const createApp = require('../../chat-server');
const { createAuth, config, verifyIdToken } = require('../../auth');

const env = {
  AUTH0_DOMAIN: 'tenant.example.auth0.com',
  AUTH0_CLIENT_ID: 'cliente-de-prueba',
  AUTH0_CLIENT_SECRET: 'secreto-solo-para-pruebas',
  APP_BASE_URL: 'http://localhost:3000',
  SESSION_SECRET: 'clave-de-prueba-de-32-bytes-completos-123456'
};
const keys = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const publicJwk = keys.publicKey.export({ format: 'jwk' });
publicJwk.kid = 'test-key';
publicJwk.use = 'sig';

function token(claims) {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: 'test-key' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const data = `${header}.${payload}`;
  return `${data}.${crypto.sign('RSA-SHA256', Buffer.from(data), keys.privateKey).toString('base64url')}`;
}

function cookieOf(response, name) {
  return response.headers['set-cookie'].find(value => value.startsWith(`${name}=`)).split(';')[0];
}

describe('autenticación social Auth0', () => {
  let nonce;
  const fetcher = async url => {
    if (url.endsWith('/oauth/token')) {
      const now = Math.floor(Date.now() / 1000);
      return { ok: true, json: async () => ({ id_token: token({ iss: 'https://tenant.example.auth0.com/',
        aud: env.AUTH0_CLIENT_ID, sub: 'google-oauth2|123', name: 'Ana', email: 'ana@example.com',
        nonce, iat: now, exp: now + 3600 }) }) };
    }
    if (url.endsWith('/.well-known/jwks.json')) return { ok: true, json: async () => ({ keys: [publicJwk] }) };
    throw new Error(`URL inesperada: ${url}`);
  };
  const server = createApp({ auth: createAuth(env, fetcher) });

  test('requiere variables y rechaza una clave de sesión corta', () => {
    expect(() => config({})).toThrow(/AUTH0_DOMAIN/);
    expect(() => config({ ...env, SESSION_SECRET: 'corta' })).toThrow(/32 bytes/);
  });

  test('login usa código, PKCE, state y nonce; callback crea sesión verificada', async () => {
    const login = await request(server.app).get('/login');
    expect(login.status).toBe(302);
    const url = new URL(login.headers.location);
    expect(url.pathname).toBe('/authorize');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('redirect_uri')).toBe('http://localhost:3000/callback');
    nonce = url.searchParams.get('nonce');
    const txCookie = cookieOf(login, 'una_chat_tx');
    const callback = await request(server.app).get(`/callback?code=ok&state=${url.searchParams.get('state')}`).set('Cookie', txCookie);
    expect(callback.status).toBe(302);
    expect(callback.headers.location).toBe('/chat');
    const sessionCookie = cookieOf(callback, 'una_chat_session');
    const chat = await request(server.app).get('/chat').set('Cookie', sessionCookie);
    expect(chat.status).toBe(200);
    const me = await request(server.app).get('/api/me').set('Cookie', sessionCookie);
    expect(me.body).toMatchObject({ name: 'Ana', email: 'ana@example.com' });
    expect(me.body).not.toHaveProperty('clientSecret');
    const logout = await request(server.app).get('/logout').set('Cookie', sessionCookie);
    expect(logout.headers.location).toContain('/v2/logout');
    expect(logout.headers['set-cookie'].join(' ')).toContain('Max-Age=0');
  });

  test('cancelación y state incorrecto muestran error reintentable sin sesión', async () => {
    const login = await request(server.app).get('/login');
    const txCookie = cookieOf(login, 'una_chat_tx');
    const cancelled = await request(server.app).get('/callback?error=access_denied').set('Cookie', txCookie);
    expect(cancelled.headers.location).toBe('/?auth_error=cancelled');
    const invalid = await request(server.app).get('/callback?code=ok&state=incorrecto').set('Cookie', txCookie);
    expect(invalid.headers.location).toBe('/?auth_error=failed');
    expect(invalid.headers['set-cookie'].some(value => value.startsWith('una_chat_session='))).toBe(false);
  });

  test('rechaza token firmado con nonce incorrecto', async () => {
    const now = Math.floor(Date.now() / 1000);
    await expect(verifyIdToken(token({ iss: 'https://tenant.example.auth0.com/', aud: env.AUTH0_CLIENT_ID,
      sub: 'google|1', nonce: 'otro', iat: now, exp: now + 3600 }), config(env), 'esperado', fetcher)).rejects.toThrow(/Token no verificado/);
  });
});
