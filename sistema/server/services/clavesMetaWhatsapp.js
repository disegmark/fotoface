/*
 * Credenciales de la WhatsApp Cloud API de Meta (la misma que ya usa
 * server/services/metaWhatsapp.js para enviar/recibir mensajes), cargables
 * desde Dashboard -> Conexiones en vez de solo el .env. DB-first con
 * respaldo en variables de entorno, mismo patron que clavesIA.js y
 * clavesPublicidad.js. La API nunca devuelve el token completo.
 *
 * META_APP_SECRET y META_VERIFY_TOKEN quedan fuera a proposito: son
 * secretos de la app (no de la cuenta) usados para validar la firma del
 * webhook ya configurado en Meta, y cambiarlos a la ligera rompe ese
 * webhook; se siguen gestionando solo por .env.
 */
const db = require("../db");

db.exec(`
  CREATE TABLE IF NOT EXISTS claves_whatsapp_meta (
    id INTEGER PRIMARY KEY CHECK(id = 1),
    access_token TEXT,
    phone_number_id TEXT,
    waba_id TEXT,
    actualizado_por TEXT,
    actualizado_en DATETIME DEFAULT (datetime('now', 'localtime'))
  );
`);
if (!db.prepare("SELECT 1 FROM claves_whatsapp_meta WHERE id = 1").get()) {
  db.prepare("INSERT INTO claves_whatsapp_meta (id) VALUES (1)").run();
}

function fila() {
  return db.prepare("SELECT * FROM claves_whatsapp_meta WHERE id = 1").get();
}

function obtenerToken() {
  return fila()?.access_token || process.env.META_WHATSAPP_TOKEN || null;
}

function obtenerPhoneNumberId() {
  return fila()?.phone_number_id || process.env.META_PHONE_NUMBER_ID || null;
}

function obtenerWabaId() {
  return fila()?.waba_id || process.env.META_WABA_ID || null;
}

function enmascarar(valor) {
  return valor ? `••••${valor.slice(-4)}` : null;
}

function estado() {
  const guardada = fila();
  const token = obtenerToken();
  return {
    configurado: Boolean(token && obtenerPhoneNumberId()),
    origen: guardada?.access_token ? "dashboard" : token ? "env" : null,
    token: enmascarar(token),
    phone_number_id: obtenerPhoneNumberId(),
    waba_id: obtenerWabaId(),
    actualizado_en: guardada?.actualizado_en || null,
    actualizado_por: guardada?.actualizado_por || null,
  };
}

/** Guarda (o borra, con valores vacios) las credenciales. */
function guardar({ access_token, phone_number_id, waba_id }, usuario) {
  const token = access_token === undefined ? undefined : String(access_token || "").trim() || null;
  const phoneId = phone_number_id === undefined ? undefined : String(phone_number_id || "").trim() || null;
  const wabaId = waba_id === undefined ? undefined : String(waba_id || "").trim() || null;

  const actual = fila();
  db.prepare(
    `UPDATE claves_whatsapp_meta SET access_token = ?, phone_number_id = ?, waba_id = ?,
       actualizado_por = ?, actualizado_en = datetime('now', 'localtime') WHERE id = 1`
  ).run(
    token === undefined ? actual?.access_token ?? null : token,
    phoneId === undefined ? actual?.phone_number_id ?? null : phoneId,
    wabaId === undefined ? actual?.waba_id ?? null : wabaId,
    usuario || null
  );
  return estado();
}

module.exports = { obtenerToken, obtenerPhoneNumberId, obtenerWabaId, estado, guardar };
