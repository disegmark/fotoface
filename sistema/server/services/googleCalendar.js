const { google } = require("googleapis");
const db = require("../db");
const googleOAuth = require("./googleOAuth");

function obtenerCalendarId() {
  const config = db.prepare("SELECT google_calendar_id FROM configuracion_agencia LIMIT 1").get();
  return config?.google_calendar_id || process.env.GOOGLE_CALENDAR_ID || null;
}

/** Cliente de Calendar listo para usar, o null si falta la conexion OAuth o el calendario a sincronizar. */
function obtenerCliente() {
  const auth = googleOAuth.obtenerClienteAutorizado();
  const calendarId = obtenerCalendarId();
  if (!auth || !calendarId) return null;
  return { calendar: google.calendar({ version: "v3", auth }), calendarId };
}

function estaHabilitado() {
  return Boolean(obtenerCliente());
}

// Debe coincidir con DURACION_TURNO_MINUTOS en claude.js (duracion de cada turno).
const DURACION_TURNO_MINUTOS = 30;

function construirEvento({ nombre_cliente, numero_telefono, fecha_turno, tipo_turno, modalidad, notas, meetLink }) {
  const inicio = new Date(fecha_turno);
  const fin = new Date(inicio.getTime() + DURACION_TURNO_MINUTOS * 60 * 1000);

  return {
    summary: `${tipo_turno} - ${nombre_cliente}${modalidad ? ` (${modalidad})` : ""}`,
    location: modalidad === "virtual" && meetLink ? meetLink : undefined,
    description: [
      `Cliente: ${nombre_cliente}`,
      `Telefono: ${numero_telefono}`,
      modalidad ? `Modalidad: ${modalidad}` : null,
      meetLink ? `Link de la reunion: ${meetLink}` : null,
      notas ? `Notas: ${notas}` : null,
    ]
      .filter(Boolean)
      .join("\n"),
    start: { dateTime: inicio.toISOString() },
    end: { dateTime: fin.toISOString() },
  };
}

/**
 * Devuelve { id, meetLink } — meetLink es el que se le pase en `turno.meetLink`
 * (generado aparte, ver googleMeet.js).
 */
async function crearEvento(turno) {
  const cliente = obtenerCliente();
  if (!cliente) return { id: null, meetLink: turno.meetLink || null };
  try {
    const { data } = await cliente.calendar.events.insert({
      calendarId: cliente.calendarId,
      requestBody: construirEvento(turno),
    });
    return { id: data.id, meetLink: turno.meetLink || null };
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error creando evento en Google Calendar:`, error.message);
    return { id: null, meetLink: turno.meetLink || null };
  }
}

async function actualizarEvento(googleEventId, turno) {
  const cliente = obtenerCliente();
  if (!cliente || !googleEventId) return;
  try {
    await cliente.calendar.events.update({
      calendarId: cliente.calendarId,
      eventId: googleEventId,
      requestBody: construirEvento(turno),
    });
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error actualizando evento en Google Calendar:`, error.message);
  }
}

async function eliminarEvento(googleEventId) {
  const cliente = obtenerCliente();
  if (!cliente || !googleEventId) return;
  try {
    await cliente.calendar.events.delete({ calendarId: cliente.calendarId, eventId: googleEventId });
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error eliminando evento en Google Calendar:`, error.message);
  }
}

/**
 * Devuelve los rangos ocupados (inicio/fin) de TODOS los eventos del calendario
 * en la fecha dada (incluye tanto los turnos generados por el sistema como
 * cualquier bloqueo/evento que la agencia haya puesto directo en Google
 * Calendar). Se usa para que la disponibilidad respete tambien esos bloqueos.
 */
async function obtenerEventosOcupados(fechaISO) {
  const cliente = obtenerCliente();
  if (!cliente) return [];
  try {
    const { data } = await cliente.calendar.events.list({
      calendarId: cliente.calendarId,
      timeMin: new Date(`${fechaISO}T00:00:00-05:00`).toISOString(),
      timeMax: new Date(`${fechaISO}T23:59:59-05:00`).toISOString(),
      singleEvents: true,
      orderBy: "startTime",
    });

    return (data.items || [])
      .filter((evento) => evento.status !== "cancelled" && evento.start?.dateTime && evento.end?.dateTime)
      .map((evento) => ({ inicio: new Date(evento.start.dateTime), fin: new Date(evento.end.dateTime) }));
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error consultando eventos de Google Calendar:`, error.message);
    return [];
  }
}

module.exports = {
  estaHabilitado,
  crearEvento,
  actualizarEvento,
  eliminarEvento,
  obtenerEventosOcupados,
};
