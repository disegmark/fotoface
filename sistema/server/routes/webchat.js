const express = require("express");
const rateLimit = require("express-rate-limit");
const db = require("../db");
const { procesarMensaje, construirMensajeBienvenida } = require("../services/claude");
const conversacionesService = require("../services/conversaciones");
const socket = require("../services/socket");

const router = express.Router();

const CANAL = "web";
const MAX_CARACTERES = 1000;
const ID_SESION_VALIDO = /^[A-Za-z0-9-]{16,64}$/;

const limitadorPorIp = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Demasiados mensajes. Intente de nuevo en un minuto." },
});

// Cada mensaje puede disparar una llamada a la IA (cuesta plata): ademas del
// limite por IP, se limita por sesion.
const limitadorPorSesion = rateLimit({
  windowMs: 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.body?.sesion || req.ip,
  message: { error: "Esta escribiendo muy rapido. Espere unos segundos e intente de nuevo." },
});

// Sesiones con una respuesta de IA en curso: evita que dos mensajes seguidos
// de la misma sesion se procesen en paralelo y mezclen el historial.
const sesionesOcupadas = new Set();

function numeroDeSesion(sesion) {
  if (typeof sesion !== "string" || !ID_SESION_VALIDO.test(sesion)) return null;
  return `web:${sesion}`;
}

function insertarMensaje(numero, contenido, remitente) {
  const resultado = db
    .prepare(
      `INSERT INTO mensajes_whatsapp (numero_telefono, contenido_mensaje, remitente, procesado, respuesta_ia)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(numero, contenido, remitente, remitente === "usuario" ? 0 : 1, remitente === "asistente" ? contenido : null);
  const mensaje = db.prepare("SELECT * FROM mensajes_whatsapp WHERE id = ?").get(resultado.lastInsertRowid);
  socket.emitir("mensaje:nuevo", mensaje);
  return mensaje;
}

function aRespuestaPublica(mensaje) {
  return { id: mensaje.id, remitente: mensaje.remitente, texto: mensaje.contenido_mensaje };
}

// Datos que el widget necesita para pintarse (nombre y saludo inicial).
router.get("/config", (req, res) => {
  const config = db.prepare("SELECT * FROM configuracion_agencia LIMIT 1").get();
  res.json({
    nombre: config.nombre_agencia,
    bienvenida: construirMensajeBienvenida(config),
  });
});

// Historial (sin `desde`) y mensajes nuevos (con `desde=<ultimo id conocido>`),
// que es como el visitante recibe las respuestas de un humano del dashboard.
router.get("/mensajes", limitadorPorIp, (req, res) => {
  const numero = numeroDeSesion(req.query.sesion);
  if (!numero) return res.status(400).json({ error: "Sesion invalida." });

  const desde = Number.parseInt(req.query.desde, 10) || 0;
  const mensajes = db
    .prepare(
      `SELECT id, remitente, contenido_mensaje FROM mensajes_whatsapp
       WHERE numero_telefono = ? AND id > ? ORDER BY id ASC LIMIT 100`
    )
    .all(numero, desde)
    .map((m) => ({ id: m.id, remitente: m.remitente, texto: m.contenido_mensaje }));

  const conversacion = conversacionesService.obtenerConversacion(numero);
  res.json({ mensajes, modo: conversacion?.modo || "ia" });
});

router.post("/mensaje", limitadorPorIp, limitadorPorSesion, async (req, res) => {
  const numero = numeroDeSesion(req.body?.sesion);
  if (!numero) return res.status(400).json({ error: "Sesion invalida." });

  const texto = typeof req.body?.texto === "string" ? req.body.texto.trim() : "";
  if (!texto) return res.status(400).json({ error: "El mensaje esta vacio." });
  if (texto.length > MAX_CARACTERES) {
    return res.status(400).json({ error: `El mensaje supera los ${MAX_CARACTERES} caracteres.` });
  }

  if (sesionesOcupadas.has(numero)) {
    return res.status(429).json({ error: "Estoy respondiendo su mensaje anterior, un momento por favor." });
  }
  sesionesOcupadas.add(numero);

  try {
    const esContactoNuevo = !conversacionesService.existeConversacion(numero);
    conversacionesService.obtenerOCrearConversacion(numero, CANAL);

    const mensajeUsuario = insertarMensaje(numero, texto, "usuario");
    conversacionesService.tocarUltimoMensaje(numero, CANAL);
    conversacionesService.reiniciarSeguimiento(numero);

    const conversacion = conversacionesService.obtenerConversacion(numero);
    if (conversacion.modo === "humano") {
      return res.json({ mensajes: [aRespuestaPublica(mensajeUsuario)], modo: "humano" });
    }

    const config = db.prepare("SELECT * FROM configuracion_agencia LIMIT 1").get();

    // Historial antes de guardar la bienvenida, para que la IA vea el mensaje
    // del visitante como ultimo turno (mismo criterio que en WhatsApp).
    const historial = db
      .prepare(
        `SELECT contenido_mensaje, remitente FROM mensajes_whatsapp
         WHERE numero_telefono = ? ORDER BY id DESC LIMIT 40`
      )
      .all(numero)
      .reverse();

    const respuestaIA = await procesarMensaje(numero, config, historial, esContactoNuevo);

    // El widget ya mostro la bienvenida al abrirse; se guarda igual para que
    // el historial del dashboard y el de la IA queden completos y en orden.
    if (esContactoNuevo) insertarMensaje(numero, construirMensajeBienvenida(config), "asistente");

    const mensajeAsistente = insertarMensaje(numero, respuestaIA, "asistente");
    db.prepare(
      `UPDATE mensajes_whatsapp SET procesado = 1
       WHERE numero_telefono = ? AND remitente = 'usuario' AND procesado = 0`
    ).run(numero);
    conversacionesService.tocarUltimoMensaje(numero, CANAL);

    // Procesar puede haber pasado la conversacion a modo humano (escalamiento).
    const modo = conversacionesService.obtenerConversacion(numero)?.modo || "ia";
    res.json({ mensajes: [aRespuestaPublica(mensajeAsistente)], modo });
  } catch (error) {
    console.error(`[${new Date().toISOString()}] [Web] Error procesando mensaje de ${numero}:`, error);
    res.status(500).json({ error: "Disculpe, estoy teniendo problemas tecnicos. Intente de nuevo en unos minutos." });
  } finally {
    sesionesOcupadas.delete(numero);
  }
});

module.exports = router;
