const { Server } = require("socket.io");
const cookie = require("cookie");
const auth = require("./auth");

let io = null;

function inicializar(httpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: process.env.NODE_ENV === "production" ? true : ["http://localhost:5173", "http://127.0.0.1:5173"],
      credentials: true,
    },
  });

  // Solo clientes con sesion valida (misma cookie que usa el dashboard) pueden
  // conectarse: los eventos en vivo incluyen mensajes y datos de conversaciones.
  io.use((socket, next) => {
    const encabezadoCookie = socket.handshake.headers.cookie;
    const token = encabezadoCookie ? cookie.parse(encabezadoCookie)[auth.NOMBRE_COOKIE] : null;
    const payload = token ? auth.verificarToken(token) : null;

    if (!payload || !auth.buscarUsuarioPorId(payload.sub)) {
      return next(new Error("No autenticado"));
    }
    next();
  });

  return io;
}

/** Emite un evento a todos los clientes del dashboard conectados. No hace nada si aun no se inicializo. */
function emitir(evento, payload) {
  if (!io) return;
  io.emit(evento, payload);
}

module.exports = { inicializar, emitir };
