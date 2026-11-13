// Codigos conocidos -> nombre legible. No es una lista cerrada: cualquier
// codigo #ALGO se acepta y se guarda tal cual (para campañas nuevas sin tener
// que tocar el codigo), pero si coincide con uno de estos se muestra bonito.
const ORIGENES_CONOCIDOS = {
  TT: "TikTok",
  LI: "LinkedIn",
  IG: "Instagram",
  FB: "Facebook",
  GADS: "Google Ads",
  WEB: "Sitio web",
};

// El link de WhatsApp lleva un texto pre-cargado que termina en "#CODIGO"
// (ej: "Hola, quiero info #TT"). Solo se busca al final del mensaje para
// minimizar falsos positivos con un hashtag real que un cliente escriba.
const PATRON_ORIGEN = /\s*#([A-Za-z0-9_-]{2,20})\s*$/;

/** Extrae el codigo de origen (si hay) del primer mensaje de un contacto nuevo. */
function extraerOrigen(texto) {
  if (!texto) return null;
  const match = texto.match(PATRON_ORIGEN);
  return match ? match[1].toUpperCase() : null;
}

/** Devuelve el texto sin el tag de origen, para no confundir al modelo ni ensuciar el historial. */
function limpiarTextoDeOrigen(texto) {
  if (!texto) return texto;
  return texto.replace(PATRON_ORIGEN, "").trim();
}

function nombreLegible(codigo) {
  if (!codigo) return "Directo";
  return ORIGENES_CONOCIDOS[codigo] || codigo;
}

module.exports = { extraerOrigen, limpiarTextoDeOrigen, nombreLegible };
