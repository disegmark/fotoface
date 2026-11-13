const twilio = require("twilio");
const clavesTwilio = require("../services/clavesTwilio");

/**
 * Rechaza requests que no vengan realmente de Twilio (evita que cualquiera
 * pueda simular webhooks falsos, de WhatsApp o de voz). Si no hay Auth Token
 * configurado (ni en Conexiones ni en el .env), se omite (no hay nada contra
 * que validar).
 */
function verificarFirmaTwilio(req, res, next) {
  const authToken = clavesTwilio.obtenerAuthToken();
  if (!authToken) return next();

  const firma = req.get("X-Twilio-Signature");
  const url = `${req.protocol}://${req.get("host")}${req.originalUrl}`;
  const esValido = twilio.validateRequest(authToken, firma, url, req.body);

  if (!esValido) {
    console.error(`[${new Date().toISOString()}] Firma de Twilio invalida en ${req.originalUrl}.`);
    return res.status(403).send("Firma invalida.");
  }
  next();
}

module.exports = verificarFirmaTwilio;
