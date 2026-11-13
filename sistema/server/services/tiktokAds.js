const clavesPublicidad = require("./clavesPublicidad");

function estaHabilitado() {
  return clavesPublicidad.hayAlguna("tiktok");
}

function formatearFecha(fecha) {
  return fecha.toISOString().slice(0, 10);
}

/** KPIs de campañas de TikTok Ads de los ultimos `dias`, vía TikTok Business API (Integrated Reports). */
async function obtenerMetricas(dias = 30) {
  const token = clavesPublicidad.obtenerToken("tiktok");
  const advertiserId = clavesPublicidad.obtenerCuentaId("tiktok");
  if (!token || !advertiserId) return null;

  const hoy = new Date();
  const desde = new Date(hoy.getTime() - dias * 24 * 60 * 60 * 1000);
  const metricas = ["impressions", "clicks", "ctr", "spend", "cpc", "cpm", "reach", "conversion"];

  const params = new URLSearchParams({
    advertiser_id: advertiserId,
    report_type: "BASIC",
    data_level: "AUCTION_ADVERTISER",
    dimensions: JSON.stringify(["advertiser_id"]),
    metrics: JSON.stringify(metricas),
    start_date: formatearFecha(desde),
    end_date: formatearFecha(hoy),
    page: "1",
    page_size: "10",
  });

  const respuesta = await fetch(`https://business-api.tiktok.com/open_api/v1.3/report/integrated/get/?${params}`, {
    headers: { "Access-Token": token },
  });
  const datos = await respuesta.json();
  if (!respuesta.ok || datos.code !== 0) {
    throw new Error(datos?.message || `TikTok respondio ${respuesta.status}.`);
  }

  const fila = datos.data?.list?.[0]?.metrics;
  if (!fila) {
    return { impresiones: 0, alcance: 0, clics: 0, ctr: 0, inversion: 0, cpc: 0, cpm: 0, conversiones: 0, dias };
  }

  return {
    impresiones: Math.round(Number(fila.impressions || 0)),
    alcance: Math.round(Number(fila.reach || 0)),
    clics: Math.round(Number(fila.clicks || 0)),
    ctr: Math.round(Number(fila.ctr || 0) * 100) / 100,
    inversion: Math.round(Number(fila.spend || 0) * 100) / 100,
    cpc: Math.round(Number(fila.cpc || 0) * 100) / 100,
    cpm: Math.round(Number(fila.cpm || 0) * 100) / 100,
    conversiones: Math.round(Number(fila.conversion || 0)),
    dias,
  };
}

module.exports = { estaHabilitado, obtenerMetricas };
