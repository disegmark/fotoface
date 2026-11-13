const { google } = require("googleapis");
const db = require("../db");
const googleOAuth = require("./googleOAuth");

/** Acepta tanto el ID pelado como la URL completa de la planilla (lo mas natural para copiar/pegar). */
function extraerIdDePlanilla(valor) {
  if (!valor) return null;
  const match = valor.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : valor.trim();
}

function obtenerSheetId() {
  const config = db.prepare("SELECT google_sheets_id FROM configuracion_agencia LIMIT 1").get();
  return extraerIdDePlanilla(config?.google_sheets_id);
}

/** Cliente de Sheets listo para usar, o null si falta la conexion OAuth o el ID de la planilla. */
function obtenerCliente() {
  const auth = googleOAuth.obtenerClienteAutorizado();
  const spreadsheetId = obtenerSheetId();
  if (!auth || !spreadsheetId) return null;
  return { sheets: google.sheets({ version: "v4", auth }), spreadsheetId };
}

function estaHabilitado() {
  return Boolean(obtenerCliente());
}

/**
 * Nombre de la primera pestaña de la planilla (no asumimos que se llama
 * "Turnos": es comun confundir el nombre del ARCHIVO con el nombre de la
 * PESTAÑA interna, que por defecto Google Sheets deja como "Hoja 1").
 */
async function obtenerNombrePrimeraHoja(sheets, spreadsheetId) {
  const { data } = await sheets.spreadsheets.get({ spreadsheetId });
  return data.sheets?.[0]?.properties?.title || "Hoja 1";
}

/**
 * Agrega una fila con los datos del turno a la primera pestaña de la
 * planilla configurada (google_sheets_id en configuracion_agencia). La
 * planilla debe ser propiedad de la cuenta de Google conectada en Conexiones,
 * o estar compartida como Editor con ella. Falla en silencio: un problema con
 * Sheets nunca debe impedir que se agende el turno.
 */
async function agregarFilaTurno(turno) {
  const cliente = obtenerCliente();
  if (!cliente) return;
  try {
    const nombreHoja = await obtenerNombrePrimeraHoja(cliente.sheets, cliente.spreadsheetId);
    await cliente.sheets.spreadsheets.values.append({
      spreadsheetId: cliente.spreadsheetId,
      range: `${nombreHoja}!A:G`,
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      requestBody: {
        values: [
          [
            new Date().toLocaleString("es-PE", { timeZone: "America/Lima" }),
            turno.nombre_cliente || "",
            turno.numero_telefono || "",
            turno.fecha_turno || "",
            turno.tipo_turno || "",
            turno.modalidad || "",
            turno.notas || "",
          ],
        ],
      },
    });
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error agregando fila a Google Sheets:`, error.message);
  }
}

module.exports = { estaHabilitado, agregarFilaTurno };
