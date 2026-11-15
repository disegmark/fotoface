const BASE = "/api/tarjetas";

async function pedir(url, opciones = {}) {
  const r = await fetch(url, {
    ...opciones,
    headers: opciones.body ? { "Content-Type": "application/json" } : undefined,
    body: opciones.body ? JSON.stringify(opciones.body) : undefined,
  });
  const datos = await r.json().catch(() => null);
  if (!r.ok) {
    if (r.status === 401) window.location.href = "/login";
    throw new Error((datos && datos.error) || "Ocurrió un error inesperado.");
  }
  return datos;
}

export const listarTarjetas = () => pedir(BASE);
export const obtenerTarjeta = (id) => pedir(`${BASE}/${id}`);
export const crearTarjeta = (datos) => pedir(BASE, { method: "POST", body: datos });
export const actualizarTarjeta = (id, datos) => pedir(`${BASE}/${id}`, { method: "PATCH", body: datos });
export const duplicarTarjeta = (id) => pedir(`${BASE}/${id}/duplicar`, { method: "POST" });
export const eliminarTarjeta = (id) => pedir(`${BASE}/${id}`, { method: "DELETE" });
export const sugerirSlug = ({ titulo, slug, excepto }) =>
  pedir(`${BASE}/sugerir-slug?${new URLSearchParams({ ...(titulo ? { titulo } : {}), ...(slug ? { slug } : {}), ...(excepto ? { excepto } : {}) })}`);

export const listarInvitados = (id) => pedir(`${BASE}/${id}/invitados`);
export const agregarInvitados = (id, invitados) => pedir(`${BASE}/${id}/invitados`, { method: "POST", body: { invitados } });
export const actualizarInvitado = (id, inv, datos) => pedir(`${BASE}/${id}/invitados/${inv}`, { method: "PATCH", body: datos });
export const eliminarInvitado = (id, inv) => pedir(`${BASE}/${id}/invitados/${inv}`, { method: "DELETE" });

export const listarRespuestas = (id) => pedir(`${BASE}/${id}/respuestas`);
export const eliminarRespuesta = (id, r) => pedir(`${BASE}/${id}/respuestas/${r}`, { method: "DELETE" });

export const listarFirmas = (id) => pedir(`${BASE}/${id}/firmas`);
export const moderarFirma = (id, f, aprobada) => pedir(`${BASE}/${id}/firmas/${f}`, { method: "PATCH", body: { aprobada } });
export const eliminarFirma = (id, f) => pedir(`${BASE}/${id}/firmas/${f}`, { method: "DELETE" });

export const urlMedia = (id, archivo) => `${BASE}/${id}/vista/media/${encodeURIComponent(archivo)}`;

/** Reduce fotos grandes en el navegador (máx. 1920 px, JPEG) antes de subirlas. */
async function prepararImagen(file) {
  const bitmap = await createImageBitmap(file);
  const escala = Math.min(1, 1920 / Math.max(bitmap.width, bitmap.height));
  if (escala === 1 && file.size < 1.5 * 1024 * 1024) return { tipo_mime: file.type, blob: file };
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * escala);
  canvas.height = Math.round(bitmap.height * escala);
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise((ok) => canvas.toBlob(ok, "image/jpeg", 0.86));
  return { tipo_mime: "image/jpeg", blob };
}

function aBase64(blob) {
  return new Promise((ok, mal) => {
    const lector = new FileReader();
    lector.onload = () => ok(String(lector.result).split(",")[1]);
    lector.onerror = mal;
    lector.readAsDataURL(blob);
  });
}

export async function subirArchivo(id, file) {
  const esImagen = file.type.startsWith("image/");
  const { tipo_mime, blob } = esImagen ? await prepararImagen(file) : { tipo_mime: file.type || "audio/mpeg", blob: file };
  const base64 = await aBase64(blob);
  return pedir(`${BASE}/${id}/archivos`, { method: "POST", body: { tipo_mime, base64 } });
}
