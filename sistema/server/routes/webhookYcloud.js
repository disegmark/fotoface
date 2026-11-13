const express = require("express");
const rateLimit = require("express-rate-limit");
const db = require("../db");
const { procesarMensaje, construirMensajeBienvenida } = require("../services/claude");
const ycloud = require("../services/ycloud");
const conversacionesService = require("../services/conversaciones");
const authService = require("../services/auth");
const socket = require("../services/socket");
const { extraerOrigen, limpiarTextoDeOrigen } = require("../utils/origen");

const router = express.Router();

const CANAL = "ycloud";

const limitadorWebhook = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const primerMensaje = req.body?.whatsappInboundMessage;
    return primerMensaje?.from || req.ip;
  },
  handler: (req, res) => res.sendStatus(200),
});

router.post("/", limitadorWebhook, async (req, res) => {
  const timestamp = new Date().toISOString();

  if (!ycloud.verificarFirma(req.rawBody, req.get("YCloud-Signature"))) {
    console.error(`[${timestamp}] Firma invalida en webhook de YCloud.`);
    return res.sendStatus(401);
  }

  // YCloud reintenta si no recibe un 200 rapido; se reconoce primero y se procesa despues.
  res.sendStatus(200);

  let mensajesEntrantes;
  try {
    mensajesEntrantes = ycloud.extraerMensajesEntrantes(req.body);
  } catch (error) {
    console.error(`[${timestamp}] Error parseando webhook de YCloud:`, error);
    return;
  }

  for (const { wamid, numeroTelefono, texto: textoOriginal, nombre } of mensajesEntrantes) {
    let texto = textoOriginal;
    try {
      if (wamid && db.prepare("SELECT 1 FROM mensajes_whatsapp WHERE wamid = ?").get(wamid)) {
        console.log(`[${timestamp}] [YCloud] Mensaje ${wamid} ya procesado, se omite (reintento).`);
        continue;
      }

      console.log(`[${timestamp}] [YCloud] Mensaje recibido de ${numeroTelefono}: "${texto}"`);

      const esContactoNuevo = !conversacionesService.existeConversacion(numeroTelefono);

      // Links de WhatsApp con texto pre-cargado terminado en "#CODIGO" (ej.
      // campañas de TikTok/LinkedIn) marcan el origen del contacto nuevo. Se
      // limpia el tag para que no le llegue crudo a Lumi ni ensucie el historial.
      if (esContactoNuevo) {
        const origen = extraerOrigen(texto);
        if (origen) {
          conversacionesService.actualizarOrigenContacto(numeroTelefono, origen);
          texto = limpiarTextoDeOrigen(texto) || "Hola";
        }
      }

      const resultadoInsert = db
        .prepare(
          `INSERT INTO mensajes_whatsapp (numero_telefono, contenido_mensaje, remitente, procesado, wamid)
           VALUES (?, ?, 'usuario', 0, ?)`
        )
        .run(numeroTelefono, texto, wamid || null);

      conversacionesService.tocarUltimoMensaje(numeroTelefono, CANAL);
      conversacionesService.reiniciarSeguimiento(numeroTelefono);
      if (nombre) conversacionesService.actualizarNombreContacto(numeroTelefono, nombre);

      // Si quien escribe es un usuario del dashboard pidiendo recuperar su
      // contraseña, se responde directo con el codigo (sin pasar por Lumi).
      const recuperacion = await authService.intentarRecuperacionPorWhatsapp(numeroTelefono, texto);
      if (recuperacion) {
        const resultadoRespuesta = db
          .prepare(
            `INSERT INTO mensajes_whatsapp (numero_telefono, contenido_mensaje, remitente, procesado, respuesta_ia)
             VALUES (?, ?, 'asistente', 1, ?)`
          )
          .run(numeroTelefono, recuperacion.mensaje, recuperacion.mensaje);
        conversacionesService.tocarUltimoMensaje(numeroTelefono, CANAL);
        socket.emitir(
          "mensaje:nuevo",
          db.prepare("SELECT * FROM mensajes_whatsapp WHERE id = ?").get(resultadoRespuesta.lastInsertRowid)
        );
        await ycloud.enviarMensaje(numeroTelefono, recuperacion.mensaje);
        continue;
      }

      const mensajeUsuario = db
        .prepare("SELECT * FROM mensajes_whatsapp WHERE id = ?")
        .get(resultadoInsert.lastInsertRowid);
      socket.emitir("mensaje:nuevo", mensajeUsuario);

      const conversacion = conversacionesService.obtenerConversacion(numeroTelefono);
      if (conversacion.modo === "humano") {
        console.log(`[${timestamp}] [YCloud] Conversacion de ${numeroTelefono} en modo humano: no se llama a la IA.`);
        continue;
      }

      const config = db.prepare("SELECT * FROM configuracion_agencia LIMIT 1").get();

      const historial = db
        .prepare(
          `SELECT contenido_mensaje, remitente FROM mensajes_whatsapp
           WHERE numero_telefono = ? ORDER BY id DESC LIMIT 40`
        )
        .all(numeroTelefono)
        .reverse();

      const respuestaIA = await procesarMensaje(numeroTelefono, config, historial, esContactoNuevo);

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
        await ycloud.enviarMensaje(numeroTelefono, mensajeBienvenida);
      }

      const resultadoRespuesta = db
        .prepare(
          `INSERT INTO mensajes_whatsapp (numero_telefono, contenido_mensaje, remitente, procesado, respuesta_ia)
           VALUES (?, ?, 'asistente', 1, ?)`
        )
        .run(numeroTelefono, respuestaIA, respuestaIA);

      db.prepare(
        `UPDATE mensajes_whatsapp SET procesado = 1
         WHERE numero_telefono = ? AND remitente = 'usuario' AND procesado = 0`
      ).run(numeroTelefono);

      conversacionesService.tocarUltimoMensaje(numeroTelefono, CANAL);
      const mensajeAsistente = db
        .prepare("SELECT * FROM mensajes_whatsapp WHERE id = ?")
        .get(resultadoRespuesta.lastInsertRowid);
      socket.emitir("mensaje:nuevo", mensajeAsistente);

      await ycloud.enviarMensaje(numeroTelefono, respuestaIA);
    } catch (error) {
      console.error(`[${timestamp}] [YCloud] Error procesando mensaje de ${numeroTelefono}:`, error);
      try {
        await ycloud.enviarMensaje(
          numeroTelefono,
          "Disculpa, estoy teniendo problemas tecnicos. Intenta de nuevo en unos minutos."
        );
      } catch (errorEnvio) {
        console.error(`[${timestamp}] [YCloud] Ademas fallo el envio del mensaje de error:`, errorEnvio.message);
      }
    }
  }
});

module.exports = router;
