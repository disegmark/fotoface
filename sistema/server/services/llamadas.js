const Anthropic = require("@anthropic-ai/sdk");

const clavesIA = require("./clavesIA");

const MODEL = "claude-haiku-5-5";
// Cliente creado al usarse: la clave puede venir del dashboard o del .env.
function cliente() {
  return new Anthropic({ apiKey: clavesIA.obtenerClave("claude") });
}

const OPCIONES = ["CONFIRMA", "CANCELA", "REPROGRAMA", "NO_ENTENDIDO"];

const SYSTEM_CLASIFICACION = `Estas clasificando la respuesta hablada (transcripta) de un cliente a la pregunta "¿confirma su asistencia a su turno?" durante una llamada telefonica automatica.

Responder con UNA SOLA PALABRA, sin explicacion ni puntuacion:
- CONFIRMA: si dice que si, que confirma, que ahi estara, etc.
- CANCELA: si dice que no puede ir, que cancele el turno, que no asistira.
- REPROGRAMA: si pide cambiar la fecha/hora del turno.
- NO_ENTENDIDO: si la respuesta es ambigua, no tiene que ver, o esta vacia/incomprensible.`;

/**
 * Clasifica la respuesta hablada (ya transcripta por Twilio) del cliente
 * durante una llamada de confirmacion de turno.
 */
async function clasificarRespuestaConfirmacion(textoHablado) {
  if (!textoHablado || !textoHablado.trim()) return "NO_ENTENDIDO";

  try {
    const response = await cliente().messages.create({
      model: MODEL,
      max_tokens: 10,
      system: SYSTEM_CLASIFICACION,
      messages: [{ role: "user", content: textoHablado }],
    });

    const bloqueTexto = response.content.find((bloque) => bloque.type === "text");
    const clasificacion = (bloqueTexto?.text || "").trim().toUpperCase();
    return OPCIONES.includes(clasificacion) ? clasificacion : "NO_ENTENDIDO";
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error clasificando respuesta de llamada:`, error.message);
    return "NO_ENTENDIDO";
  }
}

module.exports = { clasificarRespuestaConfirmacion };
