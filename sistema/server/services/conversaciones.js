const db = require("../db");

function existeConversacion(numeroTelefono) {
  return Boolean(db.prepare("SELECT 1 FROM conversaciones WHERE numero_telefono = ?").get(numeroTelefono));
}

function obtenerOCrearConversacion(numeroTelefono, canal = "twilio") {
  const existente = db.prepare("SELECT * FROM conversaciones WHERE numero_telefono = ?").get(numeroTelefono);
  if (existente) return existente;

  db.prepare(`INSERT INTO conversaciones (numero_telefono, canal) VALUES (?, ?)`).run(numeroTelefono, canal);
  db.prepare(`INSERT OR IGNORE INTO contactos (numero_telefono) VALUES (?)`).run(numeroTelefono);
  return db.prepare("SELECT * FROM conversaciones WHERE numero_telefono = ?").get(numeroTelefono);
}

function tocarUltimoMensaje(numeroTelefono, canal = "twilio") {
  obtenerOCrearConversacion(numeroTelefono, canal);
  db.prepare(
    `UPDATE conversaciones SET ultimo_mensaje_en = datetime('now', 'localtime') WHERE numero_telefono = ?`
  ).run(numeroTelefono);
}

/** Se llama cada vez que el cliente vuelve a escribir, para que un futuro silencio arranque de nuevo la secuencia de seguimiento (12h/24h/48h). */
function reiniciarSeguimiento(numeroTelefono) {
  db.prepare("UPDATE conversaciones SET etapa_seguimiento = 0 WHERE numero_telefono = ?").run(numeroTelefono);
}

function cambiarModo(numeroTelefono, modo) {
  if (!["ia", "humano"].includes(modo)) {
    throw new Error(`Modo invalido: ${modo}`);
  }
  obtenerOCrearConversacion(numeroTelefono);
  db.prepare("UPDATE conversaciones SET modo = ? WHERE numero_telefono = ?").run(modo, numeroTelefono);
  return db.prepare("SELECT * FROM conversaciones WHERE numero_telefono = ?").get(numeroTelefono);
}

function actualizarNombreContacto(numeroTelefono, nombre) {
  if (!nombre) return;
  db.prepare(`INSERT OR IGNORE INTO contactos (numero_telefono) VALUES (?)`).run(numeroTelefono);
  db.prepare(
    `UPDATE contactos SET nombre = ?, actualizado_en = datetime('now', 'localtime')
     WHERE numero_telefono = ? AND (nombre IS NULL OR nombre = '')`
  ).run(nombre, numeroTelefono);
}

/** Guarda el codigo de origen (campaña/plataforma) de un contacto nuevo. Solo se setea una vez (no se pisa despues). */
function actualizarOrigenContacto(numeroTelefono, origen) {
  if (!origen) return;
  db.prepare(`INSERT OR IGNORE INTO contactos (numero_telefono) VALUES (?)`).run(numeroTelefono);
  db.prepare(
    `UPDATE contactos SET origen = ?, actualizado_en = datetime('now', 'localtime')
     WHERE numero_telefono = ? AND origen IS NULL`
  ).run(origen, numeroTelefono);
}

function listarConversaciones() {
  return db
    .prepare(
      `SELECT
         conv.numero_telefono,
         conv.modo,
         conv.estado,
         conv.canal,
         conv.ultimo_mensaje_en,
         cont.nombre,
         (SELECT contenido_mensaje FROM mensajes_whatsapp m
            WHERE m.numero_telefono = conv.numero_telefono
            ORDER BY m.id DESC LIMIT 1) AS ultimo_mensaje,
         (SELECT remitente FROM mensajes_whatsapp m
            WHERE m.numero_telefono = conv.numero_telefono
            ORDER BY m.id DESC LIMIT 1) AS ultimo_remitente
       FROM conversaciones conv
       LEFT JOIN contactos cont ON cont.numero_telefono = conv.numero_telefono
       ORDER BY conv.ultimo_mensaje_en DESC`
    )
    .all();
}

function obtenerConversacion(numeroTelefono) {
  return db
    .prepare(
      `SELECT conv.*, cont.nombre
       FROM conversaciones conv
       LEFT JOIN contactos cont ON cont.numero_telefono = conv.numero_telefono
       WHERE conv.numero_telefono = ?`
    )
    .get(numeroTelefono);
}

module.exports = {
  existeConversacion,
  obtenerOCrearConversacion,
  tocarUltimoMensaje,
  reiniciarSeguimiento,
  cambiarModo,
  actualizarNombreContacto,
  actualizarOrigenContacto,
  listarConversaciones,
  obtenerConversacion,
};
