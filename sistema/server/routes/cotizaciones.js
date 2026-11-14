const express = require("express");
const db = require("../db");
const googleCalendar = require("../services/googleCalendar");
const metaWhatsapp = require("../services/metaWhatsapp");
const twilioService = require("../services/twilio");
const conversacionesService = require("../services/conversaciones");

const router = express.Router();

const ESTADOS_VALIDOS = ["pendiente", "enviada", "en_revision", "reunion_agendada", "aceptada", "rechazada"];

function calcularResumen(cotizaciones) {
  const haceUnMes = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const haceDosMeses = Date.now() - 60 * 24 * 60 * 60 * 1000;

  const contarPeriodo = (predicado, desde, hasta) =>
    cotizaciones.filter((c) => {
      const t = new Date(c.creado_en).getTime();
      return predicado(c) && t >= desde && t < hasta;
    }).length;

  function tarjeta(predicado) {
    const actual = contarPeriodo(predicado, haceUnMes, Date.now() + 1);
    const anterior = contarPeriodo(predicado, haceDosMeses, haceUnMes);
    const variacion = anterior > 0 ? Math.round(((actual - anterior) / anterior) * 100) : actual > 0 ? 100 : 0;
    return { total: cotizaciones.filter(predicado).length, variacion };
  }

  return {
    generadas: tarjeta(() => true),
    en_revision: tarjeta((c) => c.estado === "en_revision"),
    reuniones_agendadas: tarjeta((c) => c.estado === "reunion_agendada"),
    cerradas: tarjeta((c) => c.estado === "aceptada"),
  };
}

function obtenerTodas() {
  const cotizaciones = db
    .prepare("SELECT * FROM cotizaciones ORDER BY creado_en DESC")
    .all()
    .map((c) => ({ ...c, es_demo: false }));
  return { es_demo: false, cotizaciones };
}

router.get("/", (req, res) => {
  try {
    const { es_demo, cotizaciones } = obtenerTodas();
    res.json({ es_demo, cotizaciones, resumen: calcularResumen(cotizaciones) });
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error obteniendo cotizaciones:`, error);
    res.status(500).json({ error: "No se pudieron obtener las cotizaciones.", detalle: error.message });
  }
});

router.post("/", (req, res) => {
  const { nombre_cliente, email, numero_telefono, servicio, monto, moneda, estado, notas, validez_dias } = req.body;

  if (!nombre_cliente || !servicio) {
    return res.status(400).json({ error: "El cliente y el servicio son requeridos." });
  }
  if (estado && !ESTADOS_VALIDOS.includes(estado)) {
    return res.status(400).json({ error: `Estado invalido. Debe ser uno de: ${ESTADOS_VALIDOS.join(", ")}` });
  }

  try {
    const dias = Number.isFinite(Number(validez_dias)) ? Number(validez_dias) : 14;
    const validezHasta = new Date(Date.now() + dias * 24 * 60 * 60 * 1000).toISOString();

    const resultado = db
      .prepare(
        `INSERT INTO cotizaciones (numero_telefono, nombre_cliente, email, servicio, monto, moneda, estado, notas, validez_hasta)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        numero_telefono || null,
        nombre_cliente,
        email || null,
        servicio,
        monto ? Number(monto) : null,
        moneda || "PEN",
        estado || "enviada",
        notas || null,
        validezHasta
      );

    const creada = db.prepare("SELECT * FROM cotizaciones WHERE id = ?").get(resultado.lastInsertRowid);
    res.status(201).json({ ...creada, es_demo: false });
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error creando cotizacion:`, error);
    res.status(500).json({ error: "No se pudo crear la cotizacion.", detalle: error.message });
  }
});

router.patch("/:id", (req, res) => {
  const { id } = req.params;
  const { estado, notas, monto } = req.body;

  if (String(id).startsWith("demo-")) {
    return res.status(400).json({ error: "No se puede editar una cotizacion de ejemplo." });
  }
  if (estado && !ESTADOS_VALIDOS.includes(estado)) {
    return res.status(400).json({ error: `Estado invalido. Debe ser uno de: ${ESTADOS_VALIDOS.join(", ")}` });
  }

  const existente = db.prepare("SELECT * FROM cotizaciones WHERE id = ?").get(id);
  if (!existente) {
    return res.status(404).json({ error: "No se encontro la cotizacion." });
  }

  try {
    db.prepare(
      `UPDATE cotizaciones SET
         estado = COALESCE(?, estado),
         notas = COALESCE(?, notas),
         monto = COALESCE(?, monto)
       WHERE id = ?`
    ).run(estado || null, notas ?? null, monto !== undefined ? Number(monto) : null, id);

    const actualizada = db.prepare("SELECT * FROM cotizaciones WHERE id = ?").get(id);
    res.json({ ...actualizada, es_demo: false });
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error actualizando cotizacion:`, error);
    res.status(500).json({ error: "No se pudo actualizar la cotizacion.", detalle: error.message });
  }
});

router.post("/:id/recordatorio", async (req, res) => {
  const { id } = req.params;

  if (String(id).startsWith("demo-")) {
    return res
      .status(400)
      .json({ error: "Esta es una cotizacion de ejemplo. Carga una cotización real para poder mandar recordatorios." });
  }

  const cotizacion = db.prepare("SELECT * FROM cotizaciones WHERE id = ?").get(id);
  if (!cotizacion) {
    return res.status(404).json({ error: "No se encontro la cotizacion." });
  }
  if (!cotizacion.numero_telefono) {
    return res.status(400).json({ error: "Esta cotizacion no tiene un numero de WhatsApp asociado." });
  }

  const conversacion = conversacionesService.obtenerConversacion(cotizacion.numero_telefono);
  const canal = conversacion?.canal || "meta";
  if (canal === "web") {
    return res.status(400).json({ error: "Este cliente escribio por el chat web: no hay un WhatsApp al que enviar el recordatorio." });
  }
  const proveedor = canal === "meta" ? metaWhatsapp : twilioService;
  const habilitado = canal === "meta" ? proveedor.estaHabilitado() : proveedor.estaHabilitadoEnvioSaliente();

  if (!habilitado) {
    return res.status(503).json({ error: "El envio saliente de WhatsApp no esta configurado para este canal." });
  }

  const monto = cotizacion.monto ? `${cotizacion.moneda || "PEN"} ${cotizacion.monto}` : "";
  const mensaje = `Hola ${cotizacion.nombre_cliente}, le escribimos para recordarle la cotización de *${cotizacion.servicio}*${monto ? ` por ${monto}` : ""}. Quedamos atentos ante cualquier consulta.`;

  try {
    await proveedor.enviarMensaje(cotizacion.numero_telefono, mensaje);
    res.json({ exito: true });
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error enviando recordatorio de cotizacion:`, error);
    res.status(502).json({ error: "No se pudo enviar el recordatorio.", detalle: error.message });
  }
});

router.post("/:id/reunion", async (req, res) => {
  const { id } = req.params;
  const { fecha_turno, modalidad } = req.body;

  if (String(id).startsWith("demo-")) {
    return res
      .status(400)
      .json({ error: "Esta es una cotizacion de ejemplo. Carga una cotización real para poder agendar reuniones." });
  }
  if (!fecha_turno || !["virtual", "presencial"].includes(modalidad)) {
    return res.status(400).json({ error: "Se requiere fecha_turno y una modalidad valida (virtual o presencial)." });
  }

  const cotizacion = db.prepare("SELECT * FROM cotizaciones WHERE id = ?").get(id);
  if (!cotizacion) {
    return res.status(404).json({ error: "No se encontro la cotizacion." });
  }

  try {
    const { id: googleEventId } = await googleCalendar.crearEvento({
      nombre_cliente: cotizacion.nombre_cliente,
      numero_telefono: cotizacion.numero_telefono || "Sin numero",
      fecha_turno,
      tipo_turno: `Reunión de seguimiento — ${cotizacion.servicio}`,
      modalidad,
      notas: cotizacion.notas,
    });

    const resultado = db
      .prepare(
        `INSERT INTO turnos (numero_telefono, nombre_paciente, fecha_turno, tipo_turno, estado, notas, google_event_id, modalidad)
         VALUES (?, ?, ?, ?, 'confirmado', ?, ?, ?)`
      )
      .run(
        cotizacion.numero_telefono || "Sin numero",
        cotizacion.nombre_cliente,
        fecha_turno,
        `Reunión de seguimiento — ${cotizacion.servicio}`,
        cotizacion.notas,
        googleEventId,
        modalidad
      );

    db.prepare("UPDATE cotizaciones SET estado = 'reunion_agendada', turno_id = ? WHERE id = ?").run(
      resultado.lastInsertRowid,
      id
    );

    const actualizada = db.prepare("SELECT * FROM cotizaciones WHERE id = ?").get(id);
    res.json({ ...actualizada, es_demo: false });
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error agendando reunion desde cotizacion:`, error);
    res.status(500).json({ error: "No se pudo agendar la reunion.", detalle: error.message });
  }
});

module.exports = router;
