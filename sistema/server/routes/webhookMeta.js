const express = require("express");
const rateLimit = require("express-rate-limit");
const db = require("../db");
const { procesarMensaje, construirMensajeBienvenida } = require("../services/claude");
const metaWhatsapp = require("../services/metaWhatsapp");
const conversacionesService = require("../services/conversaciones");
const authService = require("../services/auth");
const socket = require("../services/socket");
const { extraerOrigen, limpiarTextoDeOrigen } = require("../utils/origen");

const router = express.Router();

const limitadorWebhook = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const primerMensaje = req.body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    return primerMensaje?.from || req.ip;
  },
  handler: (req, res) => res.sendStatus(200),
});

// Meta llama a este endpoint con un GET al configurar el webhook, para
// confirmar que el servidor es dueño de la URL.
router.get("/", (req, res) => {
  const modo = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (modo === "subscribe" && metaWhatsapp.verificarWebhookToken(token)) {
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
});

router.post("/", limitadorWebhook, async (req, res) => {
  const timestamp = new Date().toISOString();

  if (!metaWhatsapp.verificarFirma(req.rawBody, req.get("X-Hub-Signature-256"))) {
    console.error(`[${timestamp}] Firma invalida en webhook de Meta.`);
    return res.sendStatus(401);
  }

  // Meta espera un 200 rapido; se reconoce primero y se procesa despues.
  res.sendStatus(200);

  let mensajesEntrantes;
  try {
    mensajesEntrantes = metaWhatsapp.extraerMensajesEntrantes(req.body);
  } catch (error) {
    console.error(`[${timestamp}] Error parseando webhook de Meta:`, error);
    return;
  }

  for (const { wamid, numeroTelefono, texto: textoOriginal, nombre } of mensajesEntrantes) {
    let texto = textoOriginal;
    try {
      // Meta reintenta el mismo webhook (hasta 7 dias) si no recibe un ack a
      // tiempo; sin esto, un reintento generaria una respuesta duplicada.
      if (wamid && db.prepare("SELECT 1 FROM mensajes_whatsapp WHERE wamid = ?").get(wamid)) {
        console.log(`[${timestamp}] [Meta] Mensaje ${wamid} ya procesado, se omite (reintento de Meta).`);
        continue;
      }

      console.log(`[${timestamp}] [Meta] Mensaje recibido de ${numeroTelefono}: "${texto}"`);

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

      conversacionesService.tocarUltimoMensaje(numeroTelefono, "meta");
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
        conversacionesService.tocarUltimoMensaje(numeroTelefono, "meta");
        socket.emitir(
          "mensaje:nuevo",
          db.prepare("SELECT * FROM mensajes_whatsapp WHERE id = ?").get(resultadoRespuesta.lastInsertRowid)
        );
        await metaWhatsapp.enviarMensaje(numeroTelefono, recuperacion.mensaje);
        continue;
      }

      const mensajeUsuario = db
        .prepare("SELECT * FROM mensajes_whatsapp WHERE id = ?")
        .get(resultadoInsert.lastInsertRowid);
      socket.emitir("mensaje:nuevo", mensajeUsuario);

      const conversacion = conversacionesService.obtenerConversacion(numeroTelefono);
      if (conversacion.modo === "humano") {
        console.log(`[${timestamp}] [Meta] Conversacion de ${numeroTelefono} en modo humano: no se llama a la IA.`);
        continue;
      }

      const config = db.prepare("SELECT * FROM configuracion_agencia LIMIT 1").get();

      // El historial se arma ANTES de insertar la bienvenida, para que la IA
      // siga viendo al mensaje del cliente como el ultimo turno (si no, la
      // conversacion quedaria terminando en un turno "assistant").
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
        await metaWhatsapp.enviarMensaje(numeroTelefono, mensajeBienvenida);
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

      conversacionesService.tocarUltimoMensaje(numeroTelefono, "meta");
      const mensajeAsistente = db
        .prepare("SELECT * FROM mensajes_whatsapp WHERE id = ?")
        .get(resultadoRespuesta.lastInsertRowid);
      socket.emitir("mensaje:nuevo", mensajeAsistente);

      await metaWhatsapp.enviarMensaje(numeroTelefono, respuestaIA);
    } catch (error) {
      console.error(`[${timestamp}] [Meta] Error procesando mensaje de ${numeroTelefono}:`, error);
      try {
        await metaWhatsapp.enviarMensaje(
          numeroTelefono,
          "Disculpa, estoy teniendo problemas tecnicos. Intenta de nuevo en unos minutos."
        );
      } catch (errorEnvio) {
        console.error(`[${timestamp}] [Meta] Ademas fallo el envio del mensaje de error:`, errorEnvio.message);
      }
    }
  }
});

module.exports = router;
