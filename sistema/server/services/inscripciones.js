/*
 * Inscripciones a cursos, talleres, asesorias o programas que ofrezca la
 * agencia. Lumi las registra desde el chat (herramienta registrar_inscripcion)
 * y el equipo las gestiona desde Dashboard -> Inscripciones.
 */
const db = require("../db");
const socket = require("./socket");
const conversacionesService = require("./conversaciones");
const googleSheets = require("./googleSheets");

const ESTADOS = ["pendiente", "pago_reportado", "confirmada", "cancelada"];

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function registrar({ numero_telefono, nombre, email, whatsapp, programa, detalle, notas }) {
  const nombreLimpio = String(nombre || "").trim();
  if (!nombreLimpio) {
    return { exito: false, mensaje: "Falta el nombre completo del interesado. Pidelo antes de registrar." };
  }
  const programaLimpio = String(programa || "").trim();
  if (!programaLimpio) {
    return { exito: false, mensaje: "Falta el programa (curso, taller o asesoria) al que se quiere inscribir." };
  }
  const emailLimpio = String(email || "").trim() || null;
  if (emailLimpio && !EMAIL_REGEX.test(emailLimpio)) {
    return { exito: false, mensaje: "El email no tiene un formato valido. Pidele al interesado que lo revise." };
  }

  // Evita duplicados: si ya hay una inscripcion activa del mismo contacto al
  // mismo programa, se actualiza en vez de crear otra.
  const existente = db
    .prepare(
      "SELECT id FROM inscripciones WHERE numero_telefono = ? AND programa = ? AND estado != 'cancelada' ORDER BY id DESC LIMIT 1"
    )
    .get(numero_telefono, programaLimpio);

  let id;
  if (existente) {
    db.prepare(
      `UPDATE inscripciones SET nombre = ?, email = COALESCE(?, email), whatsapp = COALESCE(?, whatsapp),
         detalle = COALESCE(?, detalle), notas = COALESCE(?, notas) WHERE id = ?`
    ).run(nombreLimpio, emailLimpio, whatsapp || null, detalle || null, notas || null, existente.id);
    id = existente.id;
  } else {
    id = db
      .prepare(
        `INSERT INTO inscripciones (numero_telefono, nombre, email, whatsapp, programa, detalle, notas)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(numero_telefono, nombreLimpio, emailLimpio, whatsapp || null, programaLimpio, detalle || null, notas || null)
      .lastInsertRowid;
  }

  conversacionesService.actualizarNombreContacto(numero_telefono, nombreLimpio);
  if (emailLimpio) {
    db.prepare("UPDATE contactos SET email = ? WHERE numero_telefono = ?").run(emailLimpio, numero_telefono);
  }
  socket.emitir("inscripcion:nueva", { id, programa: programaLimpio });

  // Respaldo opcional en Google Sheets, reutilizando la hoja de la agenda.
  googleSheets.agregarFilaTurno({
    nombre_cliente: nombreLimpio,
    numero_telefono: whatsapp || numero_telefono,
    fecha_turno: "",
    tipo_turno: `Inscripción: ${programaLimpio}${detalle ? ` (${detalle})` : ""}`,
    modalidad: "inscripcion",
    notas: [emailLimpio, notas].filter(Boolean).join(" · "),
  });

  return {
    exito: true,
    id_inscripcion: id,
    programa: programaLimpio,
    actualizada: Boolean(existente),
    mensaje: existente
      ? "Ya tenia una inscripcion a este programa; se actualizaron sus datos."
      : "Inscripcion registrada. El equipo la confirmara por WhatsApp.",
  };
}

function verDeContacto(numeroTelefono) {
  const inscripciones = db
    .prepare(
      `SELECT id, programa, detalle, estado, creado_en FROM inscripciones
       WHERE numero_telefono = ? AND estado != 'cancelada' ORDER BY id DESC`
    )
    .all(numeroTelefono);
  return { inscripciones };
}

function listar() {
  return db.prepare("SELECT * FROM inscripciones ORDER BY id DESC").all();
}

function actualizar(id, { estado, notas }) {
  const actual = db.prepare("SELECT id FROM inscripciones WHERE id = ?").get(id);
  if (!actual) return null;
  if (estado !== undefined && !ESTADOS.includes(estado)) {
    throw new Error(`Estado invalido. Debe ser uno de: ${ESTADOS.join(", ")}.`);
  }
  db.prepare("UPDATE inscripciones SET estado = COALESCE(?, estado), notas = COALESCE(?, notas) WHERE id = ?").run(
    estado ?? null,
    notas ?? null,
    id
  );
  return db.prepare("SELECT * FROM inscripciones WHERE id = ?").get(id);
}

module.exports = { ESTADOS, registrar, verDeContacto, listar, actualizar };
