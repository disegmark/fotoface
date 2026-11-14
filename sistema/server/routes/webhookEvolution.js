const express = require("express");
const rateLimit = require("express-rate-limit");
const db = require("../db");
const { procesarMensaje, construirMensajeBienvenida } = require("../services/claude");
const conversacionesService = require("../services/conversaciones");
const authService = require("../services/auth");
const socket = require("../services/socket");
const { extraerOrigen, limpiarTextoDeOrigen } = require("../utils/origen");

const router = express.Router();

const CANAL = "evolution";

/**
 * Este webhook no lo llama Evolution API directamente: lo llama un workflow
 * de n8n (n8n.ia.nom.pe) que recibe el mensaje de Evolution API, lo normaliza
 * a { telefono, mensaje, nombre } y lo reenvia aca. Lumi responde el texto;
 * n8n es quien despues llama a Evolution API para mandarlo por WhatsApp — este
 * servidor no tiene credenciales de Evolution API ni le envia nada directo.
 * Se valida con un secreto compartido (no hay firma criptografica como en
 * Twilio/Meta) via el header X-Webhook-Secret.
 */
function verificarSecretoCompartido(req, res, next) {
  const secreto = process.env.EVOLUTION_WEBHOOK_SECRET;
  if (!secreto) {
    console.error(
      `[${new Date().toISOString()}] EVOLUTION_WEBHOOK_SECRET no esta configurado: se rechaza el webhook de Evolution/n8n.`
    );
    return res.status(503).json({ error: "Canal Evolution API no configurado en el servidor." });
  }
  if (req.get("X-Webhook-Secret") !== secreto) {
    console.error(`[${new Date().toISOString()}] Secreto invalido en webhook de Evolution/n8n.`);
    return res.status(401).json({ error: "Secreto invalido." });
  }
  next();
}

/** Construye el mensaje de error generico usando el telefono humano configurado (nunca el numero del propio bot). */
function construirMensajeFallback() {
  const config = db
    .prepare("SELECT telefono_humano, telefono FROM configuracion_agencia LIMIT 1")
    .get();
  const numero = config?.telefono_humano || config?.telefono;
  return numero
    ? `Disculpa, estoy teniendo problemas tecnicos. Intenta de nuevo en unos minutos o comunícate al ${numero}.`
    : "Disculpa, estoy teniendo problemas tecnicos. Intenta de nuevo en unos minutos.";
}

const limitadorWebhook = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.body?.telefono || req.ip,
  handler: (req, res) => res.status(200).json({ mensajes: [construirMensajeFallback()] }),
});

router.post("/", limitadorWebhook, verificarSecretoCompartido, async (req, res) => {
  const timestamp = new Date().toISOString();
  const numeroTelefono = req.body?.telefono;
  let cuerpoMensaje = req.body?.mensaje;
  const nombre = req.body?.nombre;

  if (!numeroTelefono || !cuerpoMensaje) {
    console.error(`[${timestamp}] [Evolution] Webhook recibido sin telefono o mensaje.`, req.body);
    return res.status(400).json({ error: "Faltan los campos 'telefono' y/o 'mensaje'." });
  }

  const esContactoNuevo = !conversacionesService.existeConversacion(numeroTelefono);

  // Links de WhatsApp con texto pre-cargado terminado en "#CODIGO" (ej.
  // campañas de TikTok/LinkedIn) marcan el origen del contacto nuevo. Este
  // numero no corre campañas de Meta, pero se deja por consistencia (ej. un
  // link organico en la bio de Instagram con codigo propio).
  if (esContactoNuevo) {
    const origen = extraerOrigen(cuerpoMensaje);
    if (origen) {
      conversacionesService.actualizarOrigenContacto(numeroTelefono, origen);
      cuerpoMensaje = limpiarTextoDeOrigen(cuerpoMensaje) || "Hola";
    }
  }

  try {
    console.log(`[${timestamp}] [Evolution] Mensaje recibido de ${numeroTelefono}: "${cuerpoMensaje}"`);

    const resultadoInsert = db
      .prepare(
        `INSERT INTO mensajes_whatsapp (numero_telefono, contenido_mensaje, remitente, procesado)
         VALUES (?, ?, 'usuario', 0)`
      )
      .run(numeroTelefono, cuerpoMensaje);

    conversacionesService.tocarUltimoMensaje(numeroTelefono, CANAL);
    conversacionesService.reiniciarSeguimiento(numeroTelefono);
    if (nombre) conversacionesService.actualizarNombreContacto(numeroTelefono, nombre);

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
      conversacionesService.tocarUltimoMensaje(numeroTelefono, CANAL);
      socket.emitir(
        "mensaje:nuevo",
        db.prepare("SELECT * FROM mensajes_whatsapp WHERE id = ?").get(resultadoRespuesta.lastInsertRowid)
      );
      return res.status(200).json({ mensajes: [recuperacion.mensaje] });
    }

    const conversacion = conversacionesService.obtenerConversacion(numeroTelefono);
    if (conversacion.modo === "humano") {
      console.log(`[${timestamp}] [Evolution] Conversacion de ${numeroTelefono} en modo humano: no se llama a la IA.`);
      return res.status(200).json({ mensajes: [] });
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

    conversacionesService.tocarUltimoMensaje(numeroTelefono, CANAL);
    const mensajeAsistente = db
      .prepare("SELECT * FROM mensajes_whatsapp WHERE id = ?")
      .get(resultadoRespuesta.lastInsertRowid);
    socket.emitir("mensaje:nuevo", mensajeAsistente);

    res.status(200).json({ mensajes: mensajesSalida });
  } catch (error) {
    console.error(`[${timestamp}] [Evolution] Error procesando mensaje de ${numeroTelefono}:`, error);
    res.status(200).json({ mensajes: [construirMensajeFallback()] });
  }
});

module.exports = router;
