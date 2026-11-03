// Entrada de Express para el despliegue en Vercel.
// Vercel detecta la entrada buscando un módulo que importe express, por eso se importa aquí
// aunque la aplicación se construya en chat-server.js.
require('express');
const createApp = require('./chat-server');

module.exports = createApp().app;
