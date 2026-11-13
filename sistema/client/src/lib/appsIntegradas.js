// Apps independientes integradas en el dashboard (mismo patron que
// cg360.ia.nom.pe). Cada una vive en su propio subdominio del VPS; aqui solo
// se declara en que seccion aparece y que URL abre. El orden del arreglo es
// el orden de las subsecciones en el menu lateral.
//
// Cada app tiene su propio login. Para que este dashboard entre sin pedir
// clave (inicio de sesion automatico) hace falta generar un secreto nuevo
// (SSO_SECRET_<APP> en el .env) y registrar un usuario "fotoface" en esa app —
// ver server/routes/sso.js. Hasta entonces, estos enlaces simplemente abren
// la app y piden su login normal.
// `pestanaNueva: true` = abrir fuera del dashboard en vez de embeber.
export const APPS_INTEGRADAS = [
  {
    id: "repartos",
    seccion: "pedidos",
    nombre: "Repartos",
    descripcion: "Mapa en vivo de repartidores y entregas de FotoFace: enlaces de rastreo para el repartidor y de ubicación para el cliente, ETA y ruta.",
    url: "https://repartos.ia.nom.pe/",
    sso: true,
  },
  {
    id: "avatares",
    seccion: "marketing",
    nombre: "Avatares en vivo",
    descripcion: "Avatar con IA que transmite 24/7 por YouTube y Facebook, atiende el chat y promociona servicios. Estadísticas de conversión por directo.",
    url: "https://avatar.ia.nom.pe/",
    sso: true,
  },
  {
    id: "carruseles",
    seccion: "marketing",
    nombre: "Carruseles",
    descripcion: "Editor de carruseles para Instagram, Facebook, LinkedIn y TikTok. Exporta PNG, JPG y PDF.",
    url: "https://carruseles.ia.nom.pe/",
    sso: true,
  },
  {
    id: "convertir-video",
    seccion: "marketing",
    nombre: "Convertir video",
    descripcion: "Convierte y comprime video; el resultado se guarda en Google Drive.",
    url: "https://convertidor.ia.nom.pe/",
    sso: true,
  },
  {
    id: "quitar-marca-agua",
    seccion: "marketing",
    nombre: "Quitar marca de agua",
    descripcion: "Elimina marcas de agua de videos con previa y exportación en HD; los archivos se guardan en Google Drive.",
    url: "https://marca.ia.nom.pe/",
    sso: true,
  },
  {
    id: "catalogos",
    seccion: "marketing",
    nombre: "Catálogos virtuales",
    descripcion: "Catálogos tipo revista (flipbook) para compartir con clientes y prospectos.",
    url: "https://catalogos.ia.nom.pe/dashboard",
    sso: true,
  },
  {
    id: "editor-videos",
    seccion: "marketing",
    nombre: "Editor de videos",
    descripcion: "Edita videos en línea: sube clips, imágenes y música a una línea de tiempo, corta, agrega texto y exporta en MP4 (o solo audio en MP3). Procesa varios videos a la vez.",
    url: "https://editorvideos.ia.nom.pe/",
    // Entra sin pedir clave: el dashboard emite un pase (/api/sso/<id>) que la app canjea por su sesion.
    sso: true,
  },
  {
    id: "presentaciones",
    seccion: "oficina",
    nombre: "Slides",
    descripcion: "Generador de diapositivas con IA (propuestas, material de clases y presentaciones).",
    url: "https://slides.ia.nom.pe/",
    sso: true,
  },
  {
    id: "convertir-formatos",
    seccion: "oficina",
    nombre: "Convertir documentos",
    descripcion: "Convierte documentos e imágenes entre formatos (Word, Excel, PowerPoint, PDF).",
    url: "https://convertir.ia.nom.pe/",
    sso: true,
  },
];

// Nombre de la primera subseccion (el contenido propio del dashboard) en las
// secciones que tienen apps. Las secciones que no estan aqui son solo de
// apps: abren directamente la primera.
export const SUBSECCION_NATIVA = {
  pedidos: "Pedidos",
  marketing: "Campañas",
  oficina: "Cotizaciones",
};

/** Direccion para abrir la app: por el pase de entrada automatica si lo admite, o su URL directa. */
export function urlDeApp(app) {
  return app.sso ? `/api/sso/${app.id}` : app.url;
}

export function appsDeSeccion(seccion) {
  return APPS_INTEGRADAS.filter((app) => app.seccion === seccion);
}

/** Subseccion efectiva: en secciones solo de apps, sin app elegida se abre la primera. */
export function resolverSeccion(seccionActiva) {
  const [seccion, appId = null] = seccionActiva.split(":");
  if (!appId && !SUBSECCION_NATIVA[seccion]) {
    const primera = appsDeSeccion(seccion)[0];
    if (primera) return { seccion, appId: primera.id };
  }
  return { seccion, appId };
}
