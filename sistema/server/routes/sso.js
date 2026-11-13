const crypto = require("crypto");
const express = require("express");

// Entrada automatica a las apps integradas (ver client/src/lib/appsIntegradas.js):
// quien ya inicio sesion en el dashboard recibe un pase firmado de 30 segundos y
// la app lo canjea por su propia sesion (sin pedir clave). Cada app sigue siendo
// independiente: el pase solo sirve para el usuario de FotoFace en ESA app y la app lo
// rechaza para cualquier otro usuario. Sin el secreto de la app (>= 32
// caracteres) esta ruta no entrega nada y la app sigue pidiendo login manual.
const router = express.Router();

// id del dashboard -> app (id dentro del pase, direccion, ruta de canje y
// usuario de FotoFace en ella). Cada app tiene su PROPIO secreto (SSO_SECRET_<APP>):
// ninguna puede falsificar un pase para otra. Estas apps viven en el mismo VPS
// (*.ia.nom.pe) y ya las usan otros paneles (ej. cg360.ia.nom.pe) con su propia
// identidad; para que este dashboard entre con la identidad de FotoFace hace falta
// generar un secreto nuevo y registrar un usuario "fotoface" en cada app (no se
// reutilizan los secretos/usuarios de otros paneles).
const APPS = {
  repartos: {
    secreto: () => process.env.SSO_SECRET_REPARTOS || "",
    pase: "repartos",
    url: () => process.env.REPARTOS_URL || "https://repartos.ia.nom.pe",
    ruta: "/sso",
    usuario: () => process.env.SSO_USUARIO_REPARTOS || "fotoface",
  },
  "editor-videos": {
    secreto: () => process.env.SSO_SECRET_EDITOR_VIDEOS || "",
    pase: "editor-videos",
    url: () => process.env.EDITOR_VIDEOS_URL || "https://editorvideos.ia.nom.pe",
    ruta: "/sso",
    usuario: () => process.env.SSO_USUARIO_EDITOR_VIDEOS || "fotoface",
  },
  carruseles: {
    secreto: () => process.env.SSO_SECRET_CARRUSELES || "",
    pase: "carruseles",
    url: () => process.env.CARRUSEL_URL || "https://carruseles.ia.nom.pe",
    ruta: "/sso",
    usuario: () => process.env.SSO_USUARIO_CARRUSELES || "fotoface",
  },
  "convertir-video": {
    secreto: () => process.env.SSO_SECRET_CONVERTIR_VIDEO || "",
    pase: "convertir-video",
    url: () => process.env.CONVERTIR_VIDEO_URL || "https://convertidor.ia.nom.pe",
    ruta: "/sso",
    usuario: () => process.env.SSO_USUARIO_CONVERTIR_VIDEO || "fotoface",
  },
  "quitar-marca-agua": {
    secreto: () => process.env.SSO_SECRET_QUITAR_MARCA_AGUA || "",
    pase: "quitar-marca-agua",
    url: () => process.env.QUITAR_MARCA_AGUA_URL || "https://marca.ia.nom.pe",
    ruta: "/sso",
    usuario: () => process.env.SSO_USUARIO_QUITAR_MARCA_AGUA || "fotoface",
  },
  avatares: {
    secreto: () => process.env.SSO_SECRET_AVATARES || "",
    pase: "avatares",
    url: () => process.env.AVATARES_URL || "https://avatar.ia.nom.pe",
    ruta: "/sso",
    usuario: () => process.env.SSO_USUARIO_AVATARES || "fotoface@fotoface.pro",
  },
  catalogos: {
    secreto: () => process.env.SSO_SECRET_CATALOGOS || "",
    pase: "catalogos",
    url: () => process.env.CATALOGOS_URL || "https://catalogos.ia.nom.pe",
    ruta: "/api/auth/sso",
    extra: "&marca=fotoface",
    usuario: () => process.env.SSO_USUARIO_CATALOGOS || "fotoface@fotoface.pro",
  },
  presentaciones: {
    secreto: () => process.env.SSO_SECRET_SLIDES || "",
    pase: "slides",
    url: () => process.env.SLIDES_URL || "https://slides.ia.nom.pe",
    ruta: "/sso",
    usuario: () => process.env.SSO_USUARIO_SLIDES || "fotoface",
  },
  "convertir-formatos": {
    secreto: () => process.env.SSO_SECRET_CONVERTIR_FORMATOS || "",
    pase: "convertir-formatos",
    url: () => process.env.CONVERTIR_FORMATOS_URL || "https://convertir.ia.nom.pe",
    ruta: "/sso",
    usuario: () => process.env.SSO_USUARIO_CONVERTIR_FORMATOS || "fotoface",
  },
};

function firmarPase(secreto, app, usuario) {
  const cuerpo = Buffer.from(JSON.stringify({ app, u: usuario, exp: Date.now() + 30_000 })).toString("base64url");
  return `${cuerpo}.${crypto.createHmac("sha256", secreto).update(cuerpo).digest("base64url")}`;
}

router.get("/:app", (req, res) => {
  const app = Object.prototype.hasOwnProperty.call(APPS, req.params.app) ? APPS[req.params.app] : null;
  const secreto = app ? app.secreto() : "";
  if (!app || secreto.length < 32) return res.status(404).json({ error: "Entrada automática no disponible." });
  const base = app.url().replace(/\/+$/, "");
  res.set("Cache-Control", "no-store");
  res.redirect(`${base}${app.ruta}?t=${firmarPase(secreto, app.pase, app.usuario())}${app.extra || ""}`);
});

module.exports = router;
