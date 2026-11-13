const express = require("express");
const rateLimit = require("express-rate-limit");
const db = require("../db");
const { procesarMensaje, construirMensajeBienvenida } = require("../services/claude");
const { generarTwiml } = require("../services/twilio");
const conversacionesService = require("../services/conversaciones");
const authService = require("../services/auth");
const socket = require("../services/socket");
const { extraerOrigen, limpiarTextoDeOrigen } = require("../utils/origen");
const verificarFirmaTwilio = require("../middleware/verificarTwilio");

const router = express.Router();

/** Construye el mensaje de error generico usando el telefono humano configurado (nunca el numero del propio bot). */
function construirMensajeFallback() {
  const config = db
    .prepare("SELECT telefono_humano, telefono FROM configuracion_agencia LIMIT 1")
    .get();
  const numero = config?.telefono_humano || config?.telefono;
  return numero
    ? `Disculpa, estoy teniendo problemas tecnicos. Intenta de nuevo en unos minutos o comunicate al ${numero}.`
    : "Disculpa, estoy teniendo problemas tecnicos. Intenta de nuevo en unos minutos.";
}

const limitadorWebhook = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const from = (req.body && req.body.From) || req.ip;
    return from;
  },
  handler: (req, res) => {
    res.set("Content-Type", "text/xml");
    res.status(200).send(generarTwiml(construirMensajeFallback()));
  },
});

router.post("/whatsapp", limitadorWebhook, verificarFirmaTwilio, async (req, res) => {
  const timestamp = new Date().toISOString();
  let cuerpoMensaje = req.body.Body;
  const numeroCrudo = req.body.From;

  if (!cuerpoMensaje || !numeroCrudo) {
    console.error(`[${timestamp}] Webhook de Twilio recibido sin Body o From.`, req.body);
    res.set("Content-Type", "text/xml");
    return res.status(200).send(generarTwiml(construirMensajeFallback()));
  }

  const numeroTelefono = numeroCrudo.replace("whatsapp:", "");
  const esContactoNuevo = !conversacionesService.existeConversacion(numeroTelefono);

  // Links de WhatsApp con texto pre-cargado terminado en "#CODIGO" (ej.
  // campañas de TikTok/LinkedIn) marcan el origen del contacto nuevo. Se
  // limpia el tag para que no le llegue crudo a Lumi ni ensucie el historial.
  if (esContactoNuevo) {
    const origen = extraerOrigen(cuerpoMensaje);
    if (origen) {
      conversacionesService.actualizarOrigenContacto(numeroTelefono, origen);
      cuerpoMensaje = limpiarTextoDeOrigen(cuerpoMensaje) || "Hola";
    }
  }

  try {
    console.log(`[${timestamp}] Mensaje recibido de ${numeroTelefono}: "${cuerpoMensaje}"`);

    const resultadoInsert = db
      .prepare(
        `INSERT INTO mensajes_whatsapp (numero_telefono, contenido_mensaje, remitente, procesado)
         VALUES (?, ?, 'usuario', 0)`
      )
      .run(numeroTelefono, cuerpoMensaje);

    conversacionesService.tocarUltimoMensaje(numeroTelefono);
    conversacionesService.reiniciarSeguimiento(numeroTelefono);
    const mensajeUsuario = db
      .prepare("SELECT * FROM mensajes_whatsapp WHERE id = ?")
      .get(resultadoInsert.lastInsertRowid);
    socket.emitir("mensaje:nuevo", mensajeUsuario);

    // Si quien escribe es un usuario del dashboard pidiendo recuperar su
    // contraseña, se responde directo con el codigo (sin pasar por Lumi).
    const recuperacion = await authService.intentarRecuperacionPorWhatsapp(numeroTelefono, cuerpoMensaje);
    if (recuperacion) {
      const resultadoRespuesta = db
        .prepare(
          `INSERT INTO mensajes_whatsapp (numero_telefono, contenido_mensaje, remitente, procesado, respuesta_ia)
           VALUES (?, ?, 'asistente', 1, ?)`
        )
        .run(numeroTelefono, recuperacion.mensaje, recuperacion.mensaje);
      conversacionesService.tocarUltimoMensaje(numeroTelefono);
      socket.emitir(
        "mensaje:nuevo",
        db.prepare("SELECT * FROM mensajes_whatsapp WHERE id = ?").get(resultadoRespuesta.lastInsertRowid)
      );
      res.set("Content-Type", "text/xml");
      return res.status(200).send(generarTwiml(recuperacion.mensaje));
    }

    const conversacion = conversacionesService.obtenerConversacion(numeroTelefono);

    if (conversacion.modo === "humano") {
      console.log(
        `[${timestamp}] Conversacion de ${numeroTelefono} en modo humano: no se llama a la IA.`
      );
      res.set("Content-Type", "text/xml");
      return res.status(200).send(generarTwiml());
    }

    const config = db.prepare("SELECT * FROM configuracion_agencia LIMIT 1").get();

    const historial = db
      .prepare(
        `SELECT contenido_mensaje, remitente FROM mensajes_whatsapp
         WHERE numero_telefono = ?
         ORDER BY id DESC LIMIT 40`
      )
      .all(numeroTelefono)
      .reverse();

    console.log(`[${timestamp}] Llamando a Claude para ${numeroTelefono}...`);
    const respuestaIA = await procesarMensaje(numeroTelefono, config, historial, esContactoNuevo);

    const mensajesSalida = [];

    if (esContactoNuevo) {
      const mensajeBienvenida = construirMensajeBienvenida(config);
      const resultadoBienvenida = db
        .prepare(
          `INSERT INTO mensajes_whatsapp (numero_telefono, contenido_mensaje, remitente, procesado, respuesta_ia)
           VALUES (?, ?, 'asistente', 1, ?)`
        )
        .run(numeroTelefono, mensajeBienvenida, mensajeBienvenida);
      socket.emitir(
        "mensaje:nuevo",
        db.prepare("SELECT * FROM mensajes_whatsapp WHERE id = ?").get(resultadoBienvenida.lastInsertRowid)
      );
      mensajesSalida.push(mensajeBienvenida);
    }

    const resultadoRespuesta = db
      .prepare(
        `INSERT INTO mensajes_whatsapp (numero_telefono, contenido_mensaje, remitente, procesado, respuesta_ia)
         VALUES (?, ?, 'asistente', 1, ?)`
      )
      .run(numeroTelefono, respuestaIA, respuestaIA);
    mensajesSalida.push(respuestaIA);

    db.prepare(
      `UPDATE mensajes_whatsapp SET procesado = 1
       WHERE numero_telefono = ? AND remitente = 'usuario' AND procesado = 0`
    ).run(numeroTelefono);

    conversacionesService.tocarUltimoMensaje(numeroTelefono);
    const mensajeAsistente = db
      .prepare("SELECT * FROM mensajes_whatsapp WHERE id = ?")
      .get(resultadoRespuesta.lastInsertRowid);
    socket.emitir("mensaje:nuevo", mensajeAsistente);

    res.set("Content-Type", "text/xml");
    res.status(200).send(generarTwiml(mensajesSalida));
  } catch (error) {
    console.error(`[${timestamp}] Error procesando mensaje de ${numeroTelefono}:`, error);
    res.set("Content-Type", "text/xml");
    res.status(200).send(generarTwiml(construirMensajeFallback()));
  }
});

module.exports = router;
