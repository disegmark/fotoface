const express = require("express");
const db = require("../db");
const conversacionesService = require("../services/conversaciones");
const twilioService = require("../services/twilio");
const metaWhatsapp = require("../services/metaWhatsapp");
const ycloud = require("../services/ycloud");
const socket = require("../services/socket");

const router = express.Router();

const PROVEEDORES_POR_CANAL = {
  meta: {
    servicio: metaWhatsapp,
    estaHabilitado: () => metaWhatsapp.estaHabilitado(),
    mensajeError: "El envio saliente por WhatsApp Cloud API (Meta) no esta configurado. Completalo en Conexiones.",
  },
  ycloud: {
    servicio: ycloud,
    estaHabilitado: () => ycloud.estaHabilitado(),
    mensajeError: "El envio saliente por YCloud no esta configurado. Completalo en Conexiones.",
  },
  twilio: {
    servicio: twilioService,
    estaHabilitado: () => twilioService.estaHabilitadoEnvioSaliente(),
    mensajeError: "El envio saliente de WhatsApp (Twilio) no esta configurado. Completalo en Conexiones.",
  },
};

router.get("/", (req, res) => {
  try {
    res.json(conversacionesService.listarConversaciones());
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error listando conversaciones:`, error);
    res.status(500).json({ error: "No se pudieron obtener las conversaciones.", detalle: error.message });
  }
});

router.get("/:numero/mensajes", (req, res) => {
  try {
    const mensajes = db
      .prepare(
        `SELECT * FROM mensajes_whatsapp WHERE numero_telefono = ? ORDER BY id ASC`
      )
      .all(req.params.numero);
    res.json(mensajes);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error obteniendo mensajes de conversacion:`, error);
    res.status(500).json({ error: "No se pudieron obtener los mensajes.", detalle: error.message });
  }
});

router.post("/:numero/control", (req, res) => {
  const { modo } = req.body;
  if (!["ia", "humano"].includes(modo)) {
    return res.status(400).json({ error: 'El campo "modo" debe ser "ia" o "humano".' });
  }

  try {
    const conversacion = conversacionesService.cambiarModo(req.params.numero, modo);
    socket.emitir("conversacion:actualizada", conversacion);
    res.json(conversacion);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error cambiando control de conversacion:`, error);
    res.status(500).json({ error: "No se pudo cambiar el control de la conversacion.", detalle: error.message });
  }
});

router.post("/:numero/mensajes", async (req, res) => {
  const { texto } = req.body;
  const numero = req.params.numero;

  if (!texto || typeof texto !== "string" || !texto.trim()) {
    return res.status(400).json({ error: "El campo 'texto' es requerido." });
  }

  const conversacion = conversacionesService.obtenerConversacion(numero);
  const canal = conversacion?.canal || "twilio";
  const proveedor = PROVEEDORES_POR_CANAL[canal] || PROVEEDORES_POR_CANAL.twilio;

  if (!proveedor.estaHabilitado()) {
    return res.status(503).json({ error: proveedor.mensajeError });
  }

  try {
    await proveedor.servicio.enviarMensaje(numero, texto);

    const resultado = db
      .prepare(
        `INSERT INTO mensajes_whatsapp (numero_telefono, contenido_mensaje, remitente, procesado)
         VALUES (?, ?, 'humano', 1)`
      )
      .run(numero, texto);

    conversacionesService.tocarUltimoMensaje(numero);

    const mensaje = db.prepare("SELECT * FROM mensajes_whatsapp WHERE id = ?").get(resultado.lastInsertRowid);
    socket.emitir("mensaje:nuevo", mensaje);

    res.status(201).json(mensaje);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error enviando mensaje humano:`, error);
    res.status(502).json({ error: "No se pudo enviar el mensaje por WhatsApp.", detalle: error.message });
  }
});

module.exports = router;
