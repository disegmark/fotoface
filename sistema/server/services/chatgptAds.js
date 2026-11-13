const clavesPublicidad = require("./clavesPublicidad");

function estaHabilitado() {
  return clavesPublicidad.hayAlguna("chatgpt");
}

function rangoFechas(dias) {
  const hasta = new Date();
  const desde = new Date();
  desde.setDate(desde.getDate() - dias + 1);
  const formatear = (fecha) => fecha.toISOString().slice(0, 10);
  return { since: formatear(desde), until: formatear(hasta) };
}

/** KPIs de campañas de ChatGPT Ads de los ultimos `dias`, vía la Insights API de OpenAI Ads. */
async function obtenerMetricas(dias = 30) {
  const token = clavesPublicidad.obtenerToken("chatgpt");
  if (!token) return null;

  const { since, until } = rangoFechas(dias);
  const params = new URLSearchParams();
  params.append("aggregation_level", "account");
  params.append("time_granularity", "none");
  params.append("time_ranges[]", JSON.stringify({ type: "date_range", since, until, timezone: "America/Lima" }));
  ["impressions", "clicks", "spend", "ctr", "cpc", "cpm", "conversions"].forEach((campo) =>
    params.append("fields[]", campo)
  );

  const respuesta = await fetch(`https://api.ads.openai.com/v1/ad_account/insights?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const datos = await respuesta.json().catch(() => null);
  if (!respuesta.ok) {
    throw new Error(datos?.error?.message || `ChatGPT Ads respondio ${respuesta.status}.`);
  }

  const fila = datos?.data?.[0];
  if (!fila) {
    return { impresiones: 0, alcance: 0, clics: 0, ctr: 0, inversion: 0, cpc: 0, cpm: 0, conversiones: 0, dias };
  }

  return {
    impresiones: Math.round(Number(fila.impressions || 0)),
    // La Insights API de OpenAI Ads no expone "reach" (usuarios unicos); se deja en 0.
    alcance: 0,
    clics: Math.round(Number(fila.clicks || 0)),
    // ctr llega como proporcion (0.04 = 4%); se pasa a porcentaje como las demas plataformas.
    ctr: Math.round(Number(fila.ctr || 0) * 100 * 100) / 100,
    inversion: Math.round(Number(fila.spend || 0) * 100) / 100,
    cpc: Math.round(Number(fila.cpc || 0) * 100) / 100,
    cpm: Math.round(Number(fila.cpm || 0) * 100) / 100,
    conversiones: Math.round(Number(fila.conversions || 0)),
    dias,
  };
}

module.exports = { estaHabilitado, obtenerMetricas };
