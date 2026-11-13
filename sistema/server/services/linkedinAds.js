const clavesPublicidad = require("./clavesPublicidad");

function estaHabilitado() {
  return clavesPublicidad.hayAlguna("linkedin");
}

function formatearFecha(fecha) {
  return { day: fecha.getUTCDate(), month: fecha.getUTCMonth() + 1, year: fecha.getUTCFullYear() };
}

/** KPIs de campañas de LinkedIn Ads de los ultimos `dias`, vía LinkedIn Marketing API (adAnalytics). */
async function obtenerMetricas(dias = 30) {
  const token = clavesPublicidad.obtenerToken("linkedin");
  const cuentaId = clavesPublicidad.obtenerCuentaId("linkedin");
  if (!token || !cuentaId) return null;

  const hoy = new Date();
  const desde = new Date(hoy.getTime() - dias * 24 * 60 * 60 * 1000);
  const inicio = formatearFecha(desde);
  const fin = formatearFecha(hoy);

  const params = new URLSearchParams({ q: "analytics", pivot: "ACCOUNT", timeGranularity: "ALL" });
  params.append("dateRange.start.day", inicio.day);
  params.append("dateRange.start.month", inicio.month);
  params.append("dateRange.start.year", inicio.year);
  params.append("dateRange.end.day", fin.day);
  params.append("dateRange.end.month", fin.month);
  params.append("dateRange.end.year", fin.year);
  params.append("accounts[0]", `urn:li:sponsoredAccount:${cuentaId}`);
  params.append("fields", "impressions,clicks,costInLocalCurrency,externalWebsiteConversions");

  const respuesta = await fetch(`https://api.linkedin.com/rest/adAnalytics?${params}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "LinkedIn-Version": "202401",
      "X-Restli-Protocol-Version": "2.0.0",
    },
  });
  const datos = await respuesta.json();
  if (!respuesta.ok) {
    throw new Error(datos?.message || `LinkedIn respondio ${respuesta.status}.`);
  }

  const fila = datos.elements?.[0];
  if (!fila) {
    return { impresiones: 0, alcance: 0, clics: 0, ctr: 0, inversion: 0, cpc: 0, cpm: 0, conversiones: 0, dias };
  }

  const impresiones = Math.round(Number(fila.impressions || 0));
  const clics = Math.round(Number(fila.clicks || 0));
  const inversion = Number(fila.costInLocalCurrency || 0);

  return {
    impresiones,
    // LinkedIn no expone alcance (usuarios unicos) en este reporte; se deja en 0.
    alcance: 0,
    clics,
    ctr: clics > 0 && impresiones > 0 ? Math.round((clics / impresiones) * 100 * 100) / 100 : 0,
    inversion: Math.round(inversion * 100) / 100,
    cpc: clics > 0 ? Math.round((inversion / clics) * 100) / 100 : 0,
    cpm: impresiones > 0 ? Math.round((inversion / impresiones) * 1000 * 100) / 100 : 0,
    conversiones: Math.round(Number(fila.externalWebsiteConversions || 0)),
    dias,
  };
}

module.exports = { estaHabilitado, obtenerMetricas };
