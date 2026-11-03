const crypto = require('node:crypto');

function config(env = process.env) {
  for (const name of ['AUTH0_DOMAIN', 'AUTH0_CLIENT_ID', 'AUTH0_CLIENT_SECRET', 'APP_BASE_URL', 'SESSION_SECRET']) {
    if (!env[name]) throw new Error(`Falta ${name}. Consulte .env.example.`);
  }
  const issuer = new URL(env.AUTH0_DOMAIN.startsWith('https://') ? env.AUTH0_DOMAIN : `https://${env.AUTH0_DOMAIN}`);
  const base = new URL(env.APP_BASE_URL);
  if (issuer.protocol !== 'https:' || issuer.pathname !== '/' || issuer.search || issuer.hash ||
      !['http:', 'https:'].includes(base.protocol) || (base.protocol === 'http:' && base.hostname !== 'localhost') ||
      base.pathname !== '/' || base.search || base.hash) throw new Error('Dominios de Auth0 o de la aplicación inválidos.');
  if (Buffer.byteLength(env.SESSION_SECRET) < 32) throw new Error('SESSION_SECRET debe tener al menos 32 bytes.');
  return { issuer: issuer.origin, base: base.origin, clientId: env.AUTH0_CLIENT_ID,
    clientSecret: env.AUTH0_CLIENT_SECRET, key: crypto.createHash('sha256').update(env.SESSION_SECRET).digest(),
    secure: base.protocol === 'https:' };
}

function seal(value, key) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64url');
}

function unseal(value, key) {
  try {
    const data = Buffer.from(value, 'base64url');
    if (data.length < 29) return null;
    const cipher = crypto.createDecipheriv('aes-256-gcm', key, data.subarray(0, 12));
    cipher.setAuthTag(data.subarray(12, 28));
    return JSON.parse(Buffer.concat([cipher.update(data.subarray(28)), cipher.final()]).toString());
  } catch { return null; }
}

function getCookie(req, name) {
  for (const part of (req.headers.cookie || '').split(';')) {
    const at = part.indexOf('=');
    if (at > 0 && part.slice(0, at).trim() === name) return part.slice(at + 1).trim();
  }
  return '';
}

function setCookie(res, name, value, maxAge, secure) {
  res.append('Set-Cookie', `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? '; Secure' : ''}`);
}

function equal(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

async function verifyIdToken(token, settings, nonce, fetcher = fetch) {
  if (typeof token !== 'string' || token.length > 16000) throw new Error('Token inválido.');
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Token inválido.');
  const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
  const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
  if (header.alg !== 'RS256' || typeof header.kid !== 'string') throw new Error('Algoritmo de firma no permitido.');
  const response = await fetcher(`${settings.issuer}/.well-known/jwks.json`, { signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error('No se pudo descargar la clave pública.');
  const jwks = await response.json();
  const jwk = Array.isArray(jwks.keys) && jwks.keys.find(k => k.kid === header.kid && k.kty === 'RSA' && (!k.use || k.use === 'sig'));
  if (!jwk) throw new Error('Clave de firma desconocida.');
  const key = crypto.createPublicKey({ key: jwk, format: 'jwk' });
  const signed = crypto.verify('RSA-SHA256', Buffer.from(`${parts[0]}.${parts[1]}`), key, Buffer.from(parts[2], 'base64url'));
  const now = Math.floor(Date.now() / 1000);
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!signed || claims.iss !== `${settings.issuer}/` || !aud.includes(settings.clientId) ||
      (aud.length > 1 && claims.azp !== settings.clientId) || !Number.isFinite(claims.exp) || claims.exp <= now ||
      !Number.isFinite(claims.iat) || claims.iat > now + 60 || (claims.nbf && claims.nbf > now + 60) ||
      !equal(claims.nonce, nonce) || typeof claims.sub !== 'string' || !claims.sub) throw new Error('Token no verificado.');
  return claims;
}

function createAuth(env = process.env, fetcher = fetch) {
  const settings = config(env);
  const callbackUrl = `${settings.base}/callback`;
  function getUser(req) {
    const session = unseal(getCookie(req, 'una_chat_session'), settings.key);
    if (!session || session.exp <= Math.floor(Date.now() / 1000) || typeof session.sub !== 'string') return null;
    return { sub: session.sub, name: session.name, email: session.email, picture: session.picture };
  }
  function login(req, res) {
    const state = crypto.randomBytes(32).toString('base64url');
    const nonce = crypto.randomBytes(32).toString('base64url');
    const verifier = crypto.randomBytes(32).toString('base64url');
    const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
    setCookie(res, 'una_chat_tx', seal({ state, nonce, verifier, exp: Date.now() + 600000 }, settings.key), 600, settings.secure);
    const url = new URL('/authorize', settings.issuer);
    for (const [key, value] of Object.entries({ response_type: 'code', client_id: settings.clientId,
      redirect_uri: callbackUrl, scope: 'openid profile email', state, nonce,
      code_challenge: challenge, code_challenge_method: 'S256' })) url.searchParams.set(key, value);
    res.redirect(url.href);
  }
  async function callback(req, res) {
    const tx = unseal(getCookie(req, 'una_chat_tx'), settings.key);
    setCookie(res, 'una_chat_tx', '', 0, settings.secure);
    if (req.query.error) return res.redirect(`/?auth_error=${req.query.error === 'access_denied' ? 'cancelled' : 'failed'}`);
    if (!tx || tx.exp < Date.now() || !equal(req.query.state, tx.state) || typeof req.query.code !== 'string')
      return res.redirect('/?auth_error=failed');
    try {
      const response = await fetcher(`${settings.issuer}/oauth/token`, { method: 'POST', signal: AbortSignal.timeout(8000),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'authorization_code', client_id: settings.clientId,
          client_secret: settings.clientSecret, code: req.query.code, redirect_uri: callbackUrl, code_verifier: tx.verifier }) });
      if (!response.ok) throw new Error('Error al intercambiar el código.');
      const tokens = await response.json();
      const claims = await verifyIdToken(tokens.id_token, settings, tx.nonce, fetcher);
      const exp = Math.min(claims.exp, Math.floor(Date.now() / 1000) + 43200);
      setCookie(res, 'una_chat_session', seal({ sub: claims.sub, name: claims.name || claims.nickname || 'Usuario',
        email: claims.email || '', picture: claims.picture || '', exp }, settings.key), exp - Math.floor(Date.now() / 1000), settings.secure);
      res.redirect('/chat');
    } catch (error) {
      console.error('Error de autenticación:', error.message);
      res.redirect('/?auth_error=failed');
    }
  }
  function logout(req, res) {
    setCookie(res, 'una_chat_session', '', 0, settings.secure);
    const url = new URL('/v2/logout', settings.issuer);
    url.searchParams.set('client_id', settings.clientId);
    url.searchParams.set('returnTo', `${settings.base}/`);
    res.redirect(url.href);
  }
  return { getUser, login, callback, logout };
}

module.exports = { createAuth, config, seal, unseal, verifyIdToken };
