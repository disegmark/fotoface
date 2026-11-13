const clavesPublicidad = require("./clavesPublicidad");

function estaHabilitado() {
  return clavesPublicidad.hayAlguna("meta");
}

/** KPIs de campañas de Meta Ads (Facebook/Instagram) de los ultimos `dias`, vía Graph API Insights. */
async function obtenerMetricas(dias = 30) {
  const token = clavesPublicidad.obtenerToken("meta");
  const cuentaId = clavesPublicidad.obtenerCuentaId("meta");
  if (!token || !cuentaId) return null;

  const id = cuentaId.startsWith("act_") ? cuentaId : `act_${cuentaId}`;
  const datePreset = dias <= 7 ? "last_7d" : dias <= 14 ? "last_14d" : dias <= 30 ? "last_30d" : "last_90d";
  const campos = "impressions,reach,clicks,ctr,spend,cpc,cpm,actions";
  const url = `https://graph.facebook.com/v19.0/${id}/insights?fields=${campos}&date_preset=${datePreset}&access_token=${encodeURIComponent(token)}`;

  const respuesta = await fetch(url);
  const datos = await respuesta.json();
  if (!respuesta.ok) {
    throw new Error(datos?.error?.message || `Meta respondio ${respuesta.status}.`);
  }

  const fila = datos.data?.[0];
  if (!fila) {
    return { impresiones: 0, alcance: 0, clics: 0, ctr: 0, inversion: 0, cpc: 0, cpm: 0, conversiones: 0, dias };
  }

  const conversiones = (fila.actions || [])
    .filter((a) => ["lead", "purchase", "complete_registration", "onsite_conversion.messaging_conversation_started_7d"].includes(a.action_type))
    .reduce((s, a) => s + Number(a.value || 0), 0);

  return {
    impresiones: Math.round(Number(fila.impressions || 0)),
    alcance: Math.round(Number(fila.reach || 0)),
    clics: Math.round(Number(fila.clicks || 0)),
    ctr: Math.round(Number(fila.ctr || 0) * 100) / 100,
    inversion: Math.round(Number(fila.spend || 0) * 100) / 100,
    cpc: Math.round(Number(fila.cpc || 0) * 100) / 100,
    cpm: Math.round(Number(fila.cpm || 0) * 100) / 100,
    conversiones,
    dias,
  };
}

module.exports = { estaHabilitado, obtenerMetricas };
