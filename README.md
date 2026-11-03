# UNA Chat

**Responsable de esta versión:** Brandonaguicede

**Repositorio:** https://github.com/Brandonaguicede/lab6pa

**Despliegue en Vercel:** pendiente de configurar para este repositorio.

Chat de Express y Socket.IO con validación segura de mensajes y autenticación social mediante Auth0. El acceso a `/chat`, `/api/me` y la conexión Socket.IO requiere una sesión válida. El nombre mostrado en cada mensaje proviene de la identidad verificada, no del navegador.

## Configurar Auth0

1. Cree una cuenta personal en [Auth0](https://auth0.com/) y una aplicación **Regular Web Application**.
2. En **Authentication > Social**, habilite al menos una conexión social (por ejemplo Google) y actívela para esta aplicación. Si utiliza claves propias del proveedor, configure también el callback que Auth0 indique en el panel.
3. En la configuración de la aplicación añada estas URLs exactas, separadas por comas cuando haya más de una:

   | Campo de Auth0 | Local | Vercel |
   | --- | --- | --- |
   | Allowed Callback URLs | `http://localhost:3000/callback` | `https://SU-DOMINIO.vercel.app/callback` |
   | Allowed Logout URLs | `http://localhost:3000/` | `https://SU-DOMINIO.vercel.app/` |
   | Allowed Web Origins | `http://localhost:3000` | `https://SU-DOMINIO.vercel.app` |

4. Guarde los cambios. Copie **Domain**, **Client ID** y **Client Secret** a las variables de entorno del servidor. El Client Secret nunca debe estar en código del navegador ni en Git.

El inicio de sesión usa Authorization Code con PKCE, `state` y `nonce`. El servidor verifica la firma RS256 y los datos del token de identidad antes de establecer una cookie cifrada y HttpOnly. Si el usuario cancela o Auth0 devuelve un error, la página muestra un mensaje y permite reintentar.

## Ejecutar localmente

Requiere Node.js 22 o posterior.

```powershell
Copy-Item .env.example .env
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Complete `.env` con los datos personales de Auth0 y use el valor aleatorio generado como `SESSION_SECRET`. Luego:

```powershell
npm ci
npm start
```

Abra `http://localhost:3000`. Inicie sesión con la conexión social, compruebe que aparece su nombre en `/chat` y use **Cerrar sesión**. `.env` está excluido de Git.

## Desplegar en Vercel

1. Importe este repositorio en Vercel con la raíz del proyecto en `.`. `app.js` es la entrada de Express para Vercel.
2. Configure `AUTH0_DOMAIN`, `AUTH0_CLIENT_ID`, `AUTH0_CLIENT_SECRET`, `SESSION_SECRET` y `APP_BASE_URL` en las variables de entorno de **Production**. `APP_BASE_URL` debe ser el origen HTTPS exacto de su despliegue, sin barra final. Genere una clave de sesión distinta de la local.
3. Añada el dominio de Vercel a los tres campos de URLs permitidas de Auth0 indicados arriba y despliegue de nuevo.
4. Pruebe en Vercel iniciar sesión, regresar autenticado, ver la identidad y cerrar sesión. Repita la prueba de cancelación o error y guarde capturas como evidencia.

**Transporte del chat:** las funciones de Vercel no mantienen conexiones Socket.IO, así que el chat desplegado usa [Pusher Channels](https://pusher.com) (plan gratuito):

1. Cree una app de Channels en Pusher y copie `app_id`, `key`, `secret` y `cluster`.
2. Agréguelos en Vercel como `PUSHER_APP_ID`, `PUSHER_KEY`, `PUSHER_SECRET` y `PUSHER_CLUSTER`, y vuelva a desplegar.
3. El canal es privado (`private-una-chat`): `/api/pusher/auth` y `/api/messages` exigen la sesión de Auth0, y el servidor valida cada mensaje y le pone el nombre de la sesión. `PUSHER_SECRET` nunca llega al navegador; la `key` es pública por diseño.

En local, con esas variables vacías, se usa Socket.IO con `npm start`.

## Pruebas

```powershell
npm test
npm run test:integration
npx playwright test --project=chromium
```

Las pruebas integradas usan claves y sesiones de prueba; no requieren una cuenta real. Las pruebas de navegador arrancan un servidor de prueba. Las pruebas de Auth0 real y Vercel requieren las cuentas y variables de entorno del estudiante.

## Seguridad del chat heredada del Laboratorio 5

`libs/unalib.js` escapa texto, nombre y color. Las URLs de imagen o video admitidas se muestran como medios; los esquemas peligrosos y el HTML arbitrario se tratan como texto. Las pruebas unitarias, integradas y de navegador verifican estos casos.
