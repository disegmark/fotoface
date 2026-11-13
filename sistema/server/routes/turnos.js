const express = require("express");
const db = require("../db");
const twilioService = require("../services/twilio");

const router = express.Router();

const FECHA_REGEX = /^\d{4}-\d{2}-\d{2}$/;

router.get("/", (req, res) => {
  try {
    const turnos = db
      .prepare(`SELECT * FROM turnos ORDER BY fecha_turno ASC`)
      .all();
    res.json(turnos);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error obteniendo turnos:`, error);
    res.status(500).json({ error: "No se pudieron obtener los turnos.", detalle: error.message });
  }
});

router.get("/:fecha", (req, res) => {
  const { fecha } = req.params;

  if (!FECHA_REGEX.test(fecha)) {
    return res.status(400).json({ error: "La fecha debe tener el formato YYYY-MM-DD." });
  }

  try {
    const turnos = db
      .prepare(
        `SELECT * FROM turnos WHERE date(fecha_turno) = date(?) ORDER BY fecha_turno ASC`
      )
      .all(fecha);
    res.json(turnos);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error obteniendo turnos de ${fecha}:`, error);
    res.status(500).json({ error: "No se pudieron obtener los turnos.", detalle: error.message });
  }
});

router.post("/:id/llamar", async (req, res) => {
  const { id } = req.params;

  if (!twilioService.estaHabilitadaLaVoz()) {
    return res.status(503).json({
      error:
        "Las llamadas salientes no estan configuradas. Completa TWILIO_VOICE_NUMBER y PUBLIC_BASE_URL en el .env (requiere un numero de Twilio comprado, con capacidad de voz).",
    });
  }

  const turno = db.prepare("SELECT * FROM turnos WHERE id = ?").get(id);
  if (!turno) {
    return res.status(404).json({ error: "No se encontro el turno." });
  }
  if (!turno.numero_telefono) {
    return res.status(400).json({ error: "El turno no tiene un numero de telefono asociado." });
  }

  const baseUrl = process.env.PUBLIC_BASE_URL;
  if (!baseUrl) {
    return res.status(500).json({ error: "Falta PUBLIC_BASE_URL en el .env para construir la URL de la llamada." });
  }

  try {
    const llamada = await twilioService.iniciarLlamada(
      turno.numero_telefono,
      `${baseUrl}/api/voz/turno/${id}/inicio`
    );
    console.log(`[${new Date().toISOString()}] Llamada iniciada para turno ${id}: ${llamada.sid}`);
    res.json({ exito: true, sid: llamada.sid });
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error iniciando llamada para turno ${id}:`, error);
    res.status(502).json({ error: "No se pudo iniciar la llamada.", detalle: error.message });
  }
});

module.exports = router;
