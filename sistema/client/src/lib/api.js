const BASE_URL = "/api";

async function manejarRespuesta(respuesta) {
  const datos = await respuesta.json().catch(() => null);
  if (!respuesta.ok) {
    if (respuesta.status === 401 && !respuesta.url.endsWith("/auth/login") && !respuesta.url.endsWith("/auth/me")) {
      window.location.href = "/login";
    }
    const mensaje = (datos && datos.error) || "Ocurrio un error inesperado.";
    throw new Error(mensaje);
  }
  return datos;
}

export async function obtenerMensajes() {
  const respuesta = await fetch(`${BASE_URL}/mensajes`);
  return manejarRespuesta(respuesta);
}

export async function llamarParaConfirmar(idTurno) {
  const respuesta = await fetch(`${BASE_URL}/turnos/${idTurno}/llamar`, { method: "POST" });
  return manejarRespuesta(respuesta);
}

export async function obtenerTurnos() {
  const respuesta = await fetch(`${BASE_URL}/turnos`);
  return manejarRespuesta(respuesta);
}

export async function obtenerTurnosPorFecha(fecha) {
  const respuesta = await fetch(`${BASE_URL}/turnos/${fecha}`);
  return manejarRespuesta(respuesta);
}

export async function obtenerConfiguracion() {
  const respuesta = await fetch(`${BASE_URL}/configuracion`);
  return manejarRespuesta(respuesta);
}

export async function actualizarConfiguracion(datos) {
  const respuesta = await fetch(`${BASE_URL}/configuracion`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(datos),
  });
  return manejarRespuesta(respuesta);
}

export async function obtenerConversaciones() {
  const respuesta = await fetch(`${BASE_URL}/conversaciones`);
  return manejarRespuesta(respuesta);
}

export async function obtenerMensajesConversacion(numeroTelefono) {
  const respuesta = await fetch(`${BASE_URL}/conversaciones/${encodeURIComponent(numeroTelefono)}/mensajes`);
  return manejarRespuesta(respuesta);
}

export async function cambiarControlConversacion(numeroTelefono, modo) {
  const respuesta = await fetch(
    `${BASE_URL}/conversaciones/${encodeURIComponent(numeroTelefono)}/control`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ modo }),
    }
  );
  return manejarRespuesta(respuesta);
}

export async function enviarMensajeHumano(numeroTelefono, texto) {
  const respuesta = await fetch(
    `${BASE_URL}/conversaciones/${encodeURIComponent(numeroTelefono)}/mensajes`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ texto }),
    }
  );
  return manejarRespuesta(respuesta);
}

export async function obtenerEstadisticas() {
  const respuesta = await fetch(`${BASE_URL}/estadisticas`);
  return manejarRespuesta(respuesta);
}

export async function obtenerEstadisticasDetalle() {
  const respuesta = await fetch(`${BASE_URL}/estadisticas/detalle`);
  return manejarRespuesta(respuesta);
}

export async function obtenerAgentesMCP() {
  const respuesta = await fetch(`${BASE_URL}/agentes`);
  return manejarRespuesta(respuesta);
}

export async function obtenerConfiguracionMCP() {
  const respuesta = await fetch(`${BASE_URL}/agentes/config`);
  return manejarRespuesta(respuesta);
}

export async function agregarAgenteMCP(datos) {
  const respuesta = await fetch(`${BASE_URL}/agentes/config`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(datos),
  });
  return manejarRespuesta(respuesta);
}

export async function eliminarAgenteMCP(nombre) {
  const respuesta = await fetch(`${BASE_URL}/agentes/config/${encodeURIComponent(nombre)}`, {
    method: "DELETE",
  });
  return manejarRespuesta(respuesta);
}

export async function cambiarHabilitadoAgenteMCP(nombre, habilitado) {
  const respuesta = await fetch(`${BASE_URL}/agentes/config/${encodeURIComponent(nombre)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ habilitado }),
  });
  return manejarRespuesta(respuesta);
}

export async function iniciarSesion(email, password) {
  const respuesta = await fetch(`${BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  return manejarRespuesta(respuesta);
}

export async function solicitarCodigoPorEmail(email) {
  const respuesta = await fetch(`${BASE_URL}/auth/recuperar/solicitar-email`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  return manejarRespuesta(respuesta);
}

export async function restablecerPassword({ email, codigo, nueva_password }) {
  const respuesta = await fetch(`${BASE_URL}/auth/recuperar/restablecer`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, codigo, nueva_password }),
  });
  return manejarRespuesta(respuesta);
}

export async function cerrarSesion() {
  const respuesta = await fetch(`${BASE_URL}/auth/logout`, { method: "POST" });
  return manejarRespuesta(respuesta);
}

export async function obtenerSesionActual() {
  const respuesta = await fetch(`${BASE_URL}/auth/me`);
  return manejarRespuesta(respuesta);
}

export async function obtenerUsuarios() {
  const respuesta = await fetch(`${BASE_URL}/usuarios`);
  return manejarRespuesta(respuesta);
}

export async function actualizarTelefonoUsuario(id, telefono) {
  const respuesta = await fetch(`${BASE_URL}/usuarios/${id}/telefono`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ telefono }),
  });
  return manejarRespuesta(respuesta);
}

export async function crearUsuario(datos) {
  const respuesta = await fetch(`${BASE_URL}/usuarios`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(datos),
  });
  return manejarRespuesta(respuesta);
}

export async function eliminarUsuario(id) {
  const respuesta = await fetch(`${BASE_URL}/usuarios/${id}`, { method: "DELETE" });
  return manejarRespuesta(respuesta);
}

export async function obtenerVentas() {
  const respuesta = await fetch(`${BASE_URL}/ventas`);
  return manejarRespuesta(respuesta);
}

export async function actualizarPipelineContacto(numeroTelefono, datos) {
  const respuesta = await fetch(`${BASE_URL}/ventas/${encodeURIComponent(numeroTelefono)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(datos),
  });
  return manejarRespuesta(respuesta);
}

export async function obtenerContactos() {
  const respuesta = await fetch(`${BASE_URL}/contactos`);
  return manejarRespuesta(respuesta);
}

export async function obtenerEstadoGoogle() {
  const respuesta = await fetch(`${BASE_URL}/integraciones/google/estado`);
  return manejarRespuesta(respuesta);
}

export async function desconectarGoogle() {
  const respuesta = await fetch(`${BASE_URL}/integraciones/google/desconectar`, { method: "POST" });
  return manejarRespuesta(respuesta);
}

export async function obtenerAnaliticaGoogle(dias = 30) {
  const respuesta = await fetch(`${BASE_URL}/integraciones/google/analytics?dias=${dias}`);
  return manejarRespuesta(respuesta);
}

export const obtenerCredencialesGoogleOAuth = () =>
  fetch(`${BASE_URL}/integraciones/google/oauth-config`).then(manejarRespuesta);
export const guardarCredencialesGoogleOAuth = (datos) => {
  const enviar = (ruta, metodo, cuerpo) =>
    fetch(`${BASE_URL}${ruta}`, {
      method: metodo,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cuerpo),
    }).then(manejarRespuesta);
  return enviar("/integraciones/google/oauth-config", "PUT", datos);
};

async function enviarJson(ruta, metodo, cuerpo) {
  const respuesta = await fetch(`${BASE_URL}${ruta}`, {
    method: metodo,
    headers: { "Content-Type": "application/json" },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  return manejarRespuesta(respuesta);
}

// --- Base de conocimiento ---
export const listarConocimiento = () => fetch(`${BASE_URL}/conocimiento`).then(manejarRespuesta);
export const obtenerDocConocimiento = (id) => fetch(`${BASE_URL}/conocimiento/${id}`).then(manejarRespuesta);
export const crearDocConocimiento = (datos) => enviarJson("/conocimiento", "POST", datos);
export const actualizarDocConocimiento = (id, datos) => enviarJson(`/conocimiento/${id}`, "PUT", datos);
export const eliminarDocConocimiento = (id) => enviarJson(`/conocimiento/${id}`, "DELETE");
export const importarUrlConocimiento = (url) => enviarJson("/conocimiento/url", "POST", { url });
export async function subirArchivoConocimiento(archivo) {
  const base64 = await new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onload = () => resolve(String(lector.result).split(",")[1] || "");
    lector.onerror = () => reject(new Error("No se pudo leer el archivo."));
    lector.readAsDataURL(archivo);
  });
  return enviarJson("/conocimiento/archivo", "POST", { nombre: archivo.name, base64 });
}

// --- Inscripciones (cursos, talleres, asesorias) ---
export const obtenerInscripciones = () => fetch(`${BASE_URL}/inscripciones`).then(manejarRespuesta);
export const actualizarInscripcion = (id, datos) => enviarJson(`/inscripciones/${id}`, "PATCH", datos);

// --- Claves de IA (DeepSeek, ChatGPT, Claude, OpenRouter) ---
export const obtenerClavesIA = () => fetch(`${BASE_URL}/configuracion/ia`).then(manejarRespuesta);
export const guardarClaveIA = (proveedor, datos) => enviarJson(`/configuracion/ia/${proveedor}`, "PUT", datos);
export const probarClaveIA = (proveedor) => enviarJson(`/configuracion/ia/${proveedor}/probar`, "POST", {});

// --- Claves de publicidad (Meta Ads, TikTok Ads) ---
export const obtenerClavesPublicidad = () => fetch(`${BASE_URL}/publicidad/estado`).then(manejarRespuesta);
export const guardarClavePublicidad = (plataforma, datos) => enviarJson(`/publicidad/${plataforma}`, "PUT", datos);
export const probarClavePublicidad = (plataforma) => enviarJson(`/publicidad/${plataforma}/probar`, "POST", {});
export const obtenerMetricasPublicidad = (plataforma, dias = 30) =>
  fetch(`${BASE_URL}/publicidad/${plataforma}/metricas?dias=${dias}`).then(manejarRespuesta);

// --- WhatsApp Business (Meta Cloud API): credenciales, cuenta y plantillas ---
export const obtenerEstadoWhatsappMeta = () => fetch(`${BASE_URL}/integraciones/whatsapp-meta/estado`).then(manejarRespuesta);
export const guardarCredencialesWhatsappMeta = (datos) => enviarJson("/integraciones/whatsapp-meta", "PUT", datos);
export const probarWhatsappMeta = () => enviarJson("/integraciones/whatsapp-meta/probar", "POST", {});
export const obtenerCuentaWhatsappMeta = () => fetch(`${BASE_URL}/integraciones/whatsapp-meta/cuenta`).then(manejarRespuesta);
export const obtenerPlantillasWhatsappMeta = () => fetch(`${BASE_URL}/integraciones/whatsapp-meta/plantillas`).then(manejarRespuesta);
export const crearPlantillaWhatsappMeta = (datos) => enviarJson("/integraciones/whatsapp-meta/plantillas", "POST", datos);
export const eliminarPlantillaWhatsappMeta = (nombre) =>
  enviarJson(`/integraciones/whatsapp-meta/plantillas/${encodeURIComponent(nombre)}`, "DELETE");

// --- WhatsApp Business (Twilio): credenciales ---
export const obtenerEstadoTwilio = () => fetch(`${BASE_URL}/integraciones/twilio/estado`).then(manejarRespuesta);
export const guardarCredencialesTwilio = (datos) => enviarJson("/integraciones/twilio", "PUT", datos);
export const probarTwilio = () => enviarJson("/integraciones/twilio/probar", "POST", {});

// --- WhatsApp Business (YCloud): credenciales ---
export const obtenerEstadoYcloud = () => fetch(`${BASE_URL}/integraciones/ycloud/estado`).then(manejarRespuesta);
export const guardarCredencialesYcloud = (datos) => enviarJson("/integraciones/ycloud", "PUT", datos);
export const probarYcloud = () => enviarJson("/integraciones/ycloud/probar", "POST", {});

// --- Marketing (campañas con código de origen) ---
export const obtenerCampanas = () => fetch(`${BASE_URL}/marketing`).then(manejarRespuesta);
export const crearCampana = (datos) => enviarJson("/marketing", "POST", datos);
export const actualizarCampana = (id, datos) => enviarJson(`/marketing/${id}`, "PATCH", datos);

// --- Oficina (cotizaciones) ---
export const obtenerCotizaciones = () => fetch(`${BASE_URL}/cotizaciones`).then(manejarRespuesta);
export const crearCotizacion = (datos) => enviarJson("/cotizaciones", "POST", datos);
export const actualizarCotizacion = (id, datos) => enviarJson(`/cotizaciones/${id}`, "PATCH", datos);
export const enviarRecordatorioCotizacion = (id) => enviarJson(`/cotizaciones/${id}/recordatorio`, "POST", {});
export const agendarReunionCotizacion = (id, datos) => enviarJson(`/cotizaciones/${id}/reunion`, "POST", datos);

// --- Pedidos de impresion (FotoFace) ---
export const obtenerPedidos = () => fetch(`${BASE_URL}/pedidos`).then(manejarRespuesta);
export const crearPedido = (datos) => enviarJson(`/pedidos`, "POST", datos);
export const actualizarPedido = (id, datos) => enviarJson(`/pedidos/${id}`, "PATCH", datos);
export const enviarPedidoAReparto = (id) => fetch(`${BASE_URL}/pedidos/${id}/reparto`, { method: "POST" }).then(manejarRespuesta);
