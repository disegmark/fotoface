/*
 * Credenciales de Twilio (Account SID, Auth Token, numero de WhatsApp),
 * cargables desde Dashboard -> Conexiones en vez de solo el .env. DB-first
 * con respaldo en variables de entorno, mismo patron que clavesMetaWhatsapp.js.
 * La API nunca devuelve el Auth Token completo.
 *
 * La autenticacion con API Key (TWILIO_API_KEY_SID/SECRET) queda fuera a
 * proposito: es un metodo avanzado que ya funciona solo por .env si esta
 * configurado, y no tiene sentido duplicarlo en el dashboard.
 */
const db = require("../db");

db.exec(`
  CREATE TABLE IF NOT EXISTS claves_twilio (
    id INTEGER PRIMARY KEY CHECK(id = 1),
    account_sid TEXT,
    auth_token TEXT,
    numero_whatsapp TEXT,
    actualizado_por TEXT,
    actualizado_en DATETIME DEFAULT (datetime('now', 'localtime'))
  );
`);
if (!db.prepare("SELECT 1 FROM claves_twilio WHERE id = 1").get()) {
  db.prepare("INSERT INTO claves_twilio (id) VALUES (1)").run();
}

function fila() {
  return db.prepare("SELECT * FROM claves_twilio WHERE id = 1").get();
}

function obtenerAccountSid() {
  return fila()?.account_sid || process.env.TWILIO_ACCOUNT_SID || null;
}

function obtenerAuthToken() {
  return fila()?.auth_token || process.env.TWILIO_AUTH_TOKEN || null;
}

function obtenerNumeroWhatsapp() {
  return fila()?.numero_whatsapp || process.env.TWILIO_WHATSAPP_NUMBER || null;
}

function enmascarar(valor) {
  return valor ? `••••${valor.slice(-4)}` : null;
}

function estado() {
  const guardada = fila();
  const authToken = obtenerAuthToken();
  return {
    configurado: Boolean(obtenerAccountSid() && authToken && obtenerNumeroWhatsapp()),
    origen: guardada?.auth_token ? "dashboard" : authToken ? "env" : null,
    account_sid: obtenerAccountSid(),
    auth_token: enmascarar(authToken),
    numero_whatsapp: obtenerNumeroWhatsapp(),
    actualizado_en: guardada?.actualizado_en || null,
    actualizado_por: guardada?.actualizado_por || null,
  };
}

/** Guarda (o borra, con valores vacios) las credenciales. */
function guardar({ account_sid, auth_token, numero_whatsapp }, usuario) {
  const accountSid = account_sid === undefined ? undefined : String(account_sid || "").trim() || null;
  const authToken = auth_token === undefined ? undefined : String(auth_token || "").trim() || null;
  const numero = numero_whatsapp === undefined ? undefined : String(numero_whatsapp || "").trim() || null;

  const actual = fila();
  db.prepare(
    `UPDATE claves_twilio SET account_sid = ?, auth_token = ?, numero_whatsapp = ?,
       actualizado_por = ?, actualizado_en = datetime('now', 'localtime') WHERE id = 1`
  ).run(
    accountSid === undefined ? actual?.account_sid ?? null : accountSid,
    authToken === undefined ? actual?.auth_token ?? null : authToken,
    numero === undefined ? actual?.numero_whatsapp ?? null : numero,
    usuario || null
  );
  return estado();
}

module.exports = { obtenerAccountSid, obtenerAuthToken, obtenerNumeroWhatsapp, estado, guardar };
