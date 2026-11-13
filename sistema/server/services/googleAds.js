const clavesPublicidad = require("./clavesPublicidad");

function estaHabilitado() {
  return clavesPublicidad.hayAlguna("google");
}

function rangoGAQL(dias) {
  if (dias <= 7) return "LAST_7_DAYS";
  if (dias <= 30) return "LAST_30_DAYS";
  return "LAST_90_DAYS";
}

/** KPIs de campañas de Google Ads de los ultimos `dias`, vía Google Ads API (GAQL). */
async function obtenerMetricas(dias = 30) {
  const token = clavesPublicidad.obtenerToken("google");
  const developerToken = clavesPublicidad.obtenerTokenExtra("google");
  const customerId = clavesPublicidad.obtenerCuentaId("google")?.replace(/-/g, "");
  if (!token || !developerToken || !customerId) return null;

  const query = `
    SELECT metrics.impressions, metrics.clicks, metrics.ctr, metrics.cost_micros,
           metrics.average_cpc, metrics.conversions
    FROM customer
    WHERE segments.date DURING ${rangoGAQL(dias)}
  `;

  const respuesta = await fetch(`https://googleads.googleapis.com/v17/customers/${customerId}/googleAds:search`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "developer-token": developerToken,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  });
  const datos = await respuesta.json();
  if (!respuesta.ok) {
    throw new Error(datos?.error?.message || `Google Ads respondio ${respuesta.status}.`);
  }

  const fila = datos.results?.[0]?.metrics;
  if (!fila) {
    return { impresiones: 0, alcance: 0, clics: 0, ctr: 0, inversion: 0, cpc: 0, cpm: 0, conversiones: 0, dias };
  }

  const impresiones = Math.round(Number(fila.impressions || 0));
  const inversion = Number(fila.costMicros || 0) / 1e6;

  return {
    impresiones,
    // Google Ads no expone "alcance" (usuarios unicos) a nivel de cuenta sin
    // reportes de audiencia aparte; se deja en 0 en vez de aproximar.
    alcance: 0,
    clics: Math.round(Number(fila.clicks || 0)),
    ctr: Math.round(Number(fila.ctr || 0) * 100 * 100) / 100,
    inversion: Math.round(inversion * 100) / 100,
    cpc: Math.round((Number(fila.averageCpc || 0) / 1e6) * 100) / 100,
    cpm: impresiones > 0 ? Math.round((inversion / impresiones) * 1000 * 100) / 100 : 0,
    conversiones: Math.round(Number(fila.conversions || 0)),
    dias,
  };
}

module.exports = { estaHabilitado, obtenerMetricas };
