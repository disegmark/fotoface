const { google } = require("googleapis");
const db = require("../db");
const googleOAuth = require("./googleOAuth");

function obtenerSitio() {
  const config = db.prepare("SELECT search_console_site FROM configuracion_agencia LIMIT 1").get();
  return config?.search_console_site || null;
}

function estaHabilitado() {
  return Boolean(obtenerSitio() && googleOAuth.estaConectado());
}

function formatearFecha(fecha) {
  return fecha.toISOString().slice(0, 10);
}

/**
 * Trae impresiones, clics, CTR y posicion promedio de los ultimos `dias`
 * desde la Search Console API, mas las 5 palabras clave con mas clics.
 * Devuelve null si no esta conectado o falta el sitio configurado.
 */
async function obtenerMetricasBusqueda(dias = 30) {
  const sitio = obtenerSitio();
  const cliente = googleOAuth.obtenerClienteAutorizado();
  if (!sitio || !cliente) return null;

  const searchconsole = google.searchconsole({ version: "v1", auth: cliente });
  const hoy = new Date();
  const desde = new Date(hoy.getTime() - dias * 24 * 60 * 60 * 1000);

  const [resumen, palabrasClave] = await Promise.all([
    searchconsole.searchanalytics.query({
      siteUrl: sitio,
      requestBody: { startDate: formatearFecha(desde), endDate: formatearFecha(hoy) },
    }),
    // rowLimit alto solo para poder contar cuantas palabras clave distintas
    // posicionaron en el periodo; la API ya devuelve ordenado por clics.
    searchconsole.searchanalytics.query({
      siteUrl: sitio,
      requestBody: {
        startDate: formatearFecha(desde),
        endDate: formatearFecha(hoy),
        dimensions: ["query"],
        rowLimit: 1000,
      },
    }),
  ]);

  const fila = resumen.data.rows?.[0];
  const filasPalabras = palabrasClave.data.rows || [];

  return {
    impresiones: Math.round(fila?.impressions || 0),
    clics: Math.round(fila?.clicks || 0),
    ctr: fila?.ctr ? Math.round(fila.ctr * 1000) / 10 : 0,
    posicion_promedio: fila?.position ? Math.round(fila.position * 10) / 10 : null,
    palabras_clave_top: filasPalabras.slice(0, 5).map((r) => ({
      termino: r.keys?.[0] || "",
      clics: Math.round(r.clicks || 0),
      impresiones: Math.round(r.impressions || 0),
    })),
    palabras_clave_posicionadas: filasPalabras.length,
    dias,
  };
}

module.exports = { estaHabilitado, obtenerMetricasBusqueda, obtenerSitio };
