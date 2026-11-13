const { google } = require("googleapis");
const db = require("../db");
const googleOAuth = require("./googleOAuth");

function obtenerPropertyId() {
  const config = db.prepare("SELECT ga4_property_id FROM configuracion_agencia LIMIT 1").get();
  return config?.ga4_property_id || null;
}

function estaHabilitado() {
  return Boolean(obtenerPropertyId() && googleOAuth.estaConectado());
}

/**
 * Trae los KPIs de "Atraccion" de los ultimos `dias` desde la Google Analytics
 * Data API (GA4): sesiones/trafico organico, usuarios unicos e impresiones de
 * alcance. Devuelve null si no esta conectado o falta el Property ID.
 */
async function obtenerMetricasAtraccion(dias = 30) {
  const propertyId = obtenerPropertyId();
  const cliente = googleOAuth.obtenerClienteAutorizado();
  if (!propertyId || !cliente) return null;

  const analyticsdata = google.analyticsdata({ version: "v1beta", auth: cliente });

  const [general, organico] = await Promise.all([
    analyticsdata.properties.runReport({
      property: `properties/${propertyId}`,
      requestBody: {
        dateRanges: [{ startDate: `${dias}daysAgo`, endDate: "today" }],
        metrics: [{ name: "sessions" }, { name: "totalUsers" }, { name: "screenPageViews" }],
      },
    }),
    analyticsdata.properties.runReport({
      property: `properties/${propertyId}`,
      requestBody: {
        dateRanges: [{ startDate: `${dias}daysAgo`, endDate: "today" }],
        dimensions: [{ name: "sessionDefaultChannelGroup" }],
        metrics: [{ name: "sessions" }],
      },
    }),
  ]);

  const fila = general.data.rows?.[0]?.metricValues || [];
  const sesiones = Number(fila[0]?.value || 0);
  const usuarios = Number(fila[1]?.value || 0);
  const vistas = Number(fila[2]?.value || 0);

  const sesionesOrganicas = (organico.data.rows || [])
    .filter((f) => /organic/i.test(f.dimensionValues?.[0]?.value || ""))
    .reduce((s, f) => s + Number(f.metricValues?.[0]?.value || 0), 0);

  return {
    sesiones_totales: sesiones,
    visitas_unicas: usuarios,
    paginas_vistas: vistas,
    trafico_organico: sesionesOrganicas,
    dias,
  };
}

module.exports = { estaHabilitado, obtenerMetricasAtraccion, obtenerPropertyId };
