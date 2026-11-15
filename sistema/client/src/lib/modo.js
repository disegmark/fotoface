// En tarjetas.fotoface.pro el panel muestra solo el proyecto de Tarjetas
// digitales. Para probarlo en local: abrir con ?modo=tarjetas una vez.
function detectar() {
  if (/^tarjetas\./i.test(window.location.hostname)) return true;
  try {
    const q = new URLSearchParams(window.location.search).get("modo");
    if (q) sessionStorage.setItem("modo", q);
    return sessionStorage.getItem("modo") === "tarjetas";
  } catch {
    return false;
  }
}

export const MODO_TARJETAS = detectar();
