const twilio = require("twilio");
const clavesTwilio = require("./clavesTwilio");

const API_KEY_SID = process.env.TWILIO_API_KEY_SID;
const API_KEY_SECRET = process.env.TWILIO_API_KEY_SECRET;
const NUMERO_VOZ = process.env.TWILIO_VOICE_NUMBER;
const VOZ_NEURAL = "Polly.Mia-Neural";
const IDIOMA_VOZ = "es-MX";

/**
 * Se crea un cliente nuevo en cada llamada (en vez de uno cacheado al
 * arrancar) porque las credenciales pueden cambiar en caliente desde
 * Dashboard -> Conexiones, sin reiniciar el servidor.
 */
function crearCliente() {
  const accountSid = clavesTwilio.obtenerAccountSid();
  const authToken = clavesTwilio.obtenerAuthToken();
  // Autenticacion clasica: Account SID (AC...) + Auth Token.
  if (accountSid && authToken) {
    return twilio(accountSid, authToken);
  }
  // Autenticacion con API Key (SK... + secret, solo por .env): tambien
  // requiere el Account SID (AC...) para saber sobre que cuenta operar.
  if (API_KEY_SID && API_KEY_SECRET && accountSid) {
    return twilio(API_KEY_SID, API_KEY_SECRET, { accountSid });
  }
  return null;
}

/** Acepta un mensaje o una lista de mensajes; cada uno se envia como un WhatsApp separado. */
function generarTwiml(mensajes) {
  const respuesta = new twilio.twiml.MessagingResponse();
  const lista = Array.isArray(mensajes) ? mensajes : [mensajes];
  for (const mensaje of lista) {
    if (mensaje) respuesta.message(mensaje);
  }
  return respuesta.toString();
}

function estaHabilitadoEnvioSaliente() {
  return Boolean(crearCliente() && clavesTwilio.obtenerNumeroWhatsapp());
}

function conPrefijoWhatsapp(numero) {
  return numero.startsWith("whatsapp:") ? numero : `whatsapp:${numero}`;
}

/**
 * Envia un mensaje de WhatsApp fuera del ciclo webhook/TwiML, via la API REST
 * de Twilio. Necesario para que un agente humano pueda responder desde el
 * dashboard en cualquier momento (no solo como respuesta sincronica a un mensaje entrante).
 */
async function enviarMensaje(numeroTelefonoDestino, texto) {
  if (!estaHabilitadoEnvioSaliente()) {
    throw new Error(
      "El envio saliente de WhatsApp no esta configurado (falta TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN, o TWILIO_ACCOUNT_SID + TWILIO_API_KEY_SID + TWILIO_API_KEY_SECRET, y TWILIO_WHATSAPP_NUMBER)."
    );
  }

  return crearCliente().messages.create({
    from: conPrefijoWhatsapp(clavesTwilio.obtenerNumeroWhatsapp()),
    to: conPrefijoWhatsapp(numeroTelefonoDestino),
    body: texto,
  });
}

/** Valida las credenciales contra la API de Twilio (sin enviar ningun mensaje). */
async function probar() {
  const cliente = crearCliente();
  if (!cliente) {
    return { ok: false, mensaje: "Faltan credenciales (Account SID + Auth Token)." };
  }
  try {
    const cuenta = await cliente.api.accounts(clavesTwilio.obtenerAccountSid()).fetch();
    return { ok: true, mensaje: `Conectado a la cuenta "${cuenta.friendlyName}" (${cuenta.status}).` };
  } catch (error) {
    return { ok: false, mensaje: error.message };
  }
}

function estaHabilitadaLaVoz() {
  return Boolean(crearCliente() && NUMERO_VOZ);
}

/**
 * Inicia una llamada saliente. `urlTwiml` debe ser una URL publica que
 * devuelva el TwiML inicial de la llamada (que decir, que escuchar, etc.).
 */
async function iniciarLlamada(numeroTelefonoDestino, urlTwiml) {
  if (!estaHabilitadaLaVoz()) {
    throw new Error(
      "Las llamadas salientes no estan configuradas (falta TWILIO_VOICE_NUMBER, un numero de Twilio con capacidad de voz)."
    );
  }

  return crearCliente().calls.create({
    from: NUMERO_VOZ,
    to: numeroTelefonoDestino,
    url: urlTwiml,
  });
}

/**
 * Arma el TwiML de un turno de la llamada: dice `textoDecir` y, si se pasa
 * `urlSiguiente`, escucha la respuesta hablada del cliente y la manda a esa URL.
 * Si no se pasa `urlSiguiente`, termina la llamada despues de hablar.
 */
function generarTwimlVoz(textoDecir, urlSiguiente) {
  const respuesta = new twilio.twiml.VoiceResponse();

  if (urlSiguiente) {
    const gather = respuesta.gather({
      input: "speech",
      language: IDIOMA_VOZ,
      speechTimeout: "auto",
      action: urlSiguiente,
      method: "POST",
    });
    gather.say({ voice: VOZ_NEURAL, language: IDIOMA_VOZ }, textoDecir);
    // Si no se detecta respuesta, Twilio sigue de largo hasta aca.
    respuesta.say(
      { voice: VOZ_NEURAL, language: IDIOMA_VOZ },
      "No pudimos escuchar su respuesta. Puede confirmarnos por WhatsApp cuando guste. Hasta luego."
    );
    respuesta.hangup();
  } else {
    respuesta.say({ voice: VOZ_NEURAL, language: IDIOMA_VOZ }, textoDecir);
    respuesta.hangup();
  }

  return respuesta.toString();
}

module.exports = {
  generarTwiml,
  enviarMensaje,
  probar,
  estaHabilitadoEnvioSaliente,
  estaHabilitadaLaVoz,
  iniciarLlamada,
  generarTwimlVoz,
};
