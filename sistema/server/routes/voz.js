const express = require("express");
const db = require("../db");
const twilioService = require("../services/twilio");
const { clasificarRespuestaConfirmacion } = require("../services/llamadas");
const { cancelarTurno } = require("../services/claude");
const { formatearLargo } = require("../utils/fechas");
const verificarFirmaTwilio = require("../middleware/verificarTwilio");

const router = express.Router();

function obtenerTurno(id) {
  return db.prepare("SELECT * FROM turnos WHERE id = ?").get(id);
}

function agregarNota(idTurno, nota) {
  db.prepare(
    `UPDATE turnos SET notas = CASE WHEN notas IS NULL OR notas = '' THEN ? ELSE notas || char(10) || ? END WHERE id = ?`
  ).run(nota, nota, idTurno);
}

function obtenerNombreAgencia() {
  return db.prepare("SELECT nombre_agencia FROM configuracion_agencia LIMIT 1").get()?.nombre_agencia || "la agencia";
}

// Twilio llama esto apenas se atiende la llamada saliente.
router.post("/turno/:id/inicio", verificarFirmaTwilio, (req, res) => {
  const turno = obtenerTurno(req.params.id);
  res.set("Content-Type", "text/xml");

  if (!turno) {
    return res
      .status(200)
      .send(twilioService.generarTwimlVoz("No pudimos encontrar los datos de este turno. Disculpe las molestias."));
  }

  const pregunta = `Hola, le hablamos de ${obtenerNombreAgencia()} para confirmar su turno del ${formatearLargo(
    turno.fecha_turno
  )}, para ${turno.tipo_turno || "su consulta"}. ¿Confirma su asistencia? Puede responder si o no.`;

  res
    .status(200)
    .send(twilioService.generarTwimlVoz(pregunta, `/api/voz/turno/${req.params.id}/respuesta`));
});

// Twilio llama esto con la transcripcion de lo que dijo el cliente.
router.post("/turno/:id/respuesta", verificarFirmaTwilio, async (req, res) => {
  const timestamp = new Date().toISOString();
  const idTurno = req.params.id;
  const textoHablado = req.body.SpeechResult || "";
  res.set("Content-Type", "text/xml");

  const turno = obtenerTurno(idTurno);
  if (!turno) {
    return res.status(200).send(twilioService.generarTwimlVoz("No pudimos encontrar los datos de este turno."));
  }

  console.log(`[${timestamp}] [Voz] Turno ${idTurno} - cliente dijo: "${textoHablado}"`);

  const clasificacion = await clasificarRespuestaConfirmacion(textoHablado);
  console.log(`[${timestamp}] [Voz] Turno ${idTurno} clasificado como: ${clasificacion}`);

  let respuestaFinal;

  switch (clasificacion) {
    case "CONFIRMA":
      agregarNota(idTurno, `Confirmado telefonicamente el ${new Date().toLocaleString("es-PE")}.`);
      respuestaFinal = "Perfecto, su turno queda confirmado. ¡Que tenga muy buen dia!";
      break;
    case "CANCELA":
      await cancelarTurno({ id_turno: Number(idTurno) });
      respuestaFinal = "Entendido, hemos cancelado su turno. Si desea reagendar, puede escribirnos por WhatsApp cuando guste.";
      break;
    case "REPROGRAMA":
      agregarNota(idTurno, "Pidio reprogramar por llamada telefonica.");
      respuestaFinal =
        "Entendido, para reprogramar su turno le pedimos que nos escriba por WhatsApp, asi le buscamos un nuevo horario. ¡Gracias!";
      break;
    default:
      respuestaFinal = "Disculpe, no logramos entender su respuesta. Puede confirmarnos por WhatsApp cuando guste. ¡Gracias!";
  }

  res.status(200).send(twilioService.generarTwimlVoz(respuestaFinal));
});

module.exports = router;
