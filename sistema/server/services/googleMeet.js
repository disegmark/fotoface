const { google } = require("googleapis");
const googleOAuth = require("./googleOAuth");

/**
 * Crea un espacio de Google Meet ad-hoc (independiente del calendario) y
 * devuelve su link. Requiere que un usuario real haya autorizado la conexion
 * con Google desde el dashboard (ver googleOAuth.js) — las cuentas de
 * servicio no pueden crear espacios de Meet en cuentas de Gmail personales.
 */
async function crearEspacioReunion() {
  const cliente = googleOAuth.obtenerClienteAutorizado();
  if (!cliente) {
    return { exito: false, meetingUri: null, mensaje: "Google Meet no esta conectado todavia." };
  }

  try {
    const meet = google.meet({ version: "v2", auth: cliente });
    const { data } = await meet.spaces.create({ requestBody: {} });
    return { exito: true, meetingUri: data.meetingUri, meetingCode: data.meetingCode };
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error creando espacio de Google Meet:`, error.message);
    return { exito: false, meetingUri: null, mensaje: error.message };
  }
}

module.exports = { crearEspacioReunion };
