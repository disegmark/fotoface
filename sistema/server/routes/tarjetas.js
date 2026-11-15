const express = require("express");
const tarjetas = require("../services/tarjetas");
const pagina = require("../services/tarjetaPagina");

// Panel: Dashboard -> Tarjetas (requiere sesion; se monta con requireAuth).
const router = express.Router();

function id(req) {
  return Number(req.params.id);
}

function manejar(fn) {
  return (req, res) => {
    try {
      const resultado = fn(req, res);
      if (resultado === null || resultado === false) return res.status(404).json({ error: "No se encontró la tarjeta." });
      if (resultado !== undefined && !res.headersSent) res.json(resultado);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  };
}

router.get(
  "/",
  manejar(() => ({ dominio: tarjetas.DOMINIO, vitrina: `https://${tarjetas.VITRINA_HOST}`, tipos: tarjetas.TIPOS, temas: tarjetas.TEMAS, tarjetas: tarjetas.listar() }))
);

router.get(
  "/sugerir-slug",
  manejar((req) => {
    const slug = req.query.slug ? String(req.query.slug).toLowerCase() : tarjetas.sugerirSlug(req.query.titulo);
    const error = tarjetas.validarSlug(slug);
    return { slug, error, disponible: !error && tarjetas.slugDisponible(slug, Number(req.query.excepto) || 0) };
  })
);

router.post(
  "/",
  manejar((req, res) => {
    res.status(201);
    return tarjetas.crear(req.body || {});
  })
);

router.get("/:id", manejar((req) => tarjetas.obtener(id(req))));
router.patch("/:id", manejar((req) => tarjetas.actualizar(id(req), req.body || {})));
router.post("/:id/duplicar", manejar((req) => tarjetas.duplicar(id(req))));
router.delete("/:id", manejar((req) => (tarjetas.eliminar(id(req)) ? { ok: true } : null)));

// Vista previa (funciona tambien en borrador). Base de rutas propia para que
// las fotos y la musica carguen con la sesion del panel.
router.get("/:id/vista", (req, res) => {
  const t = tarjetas.obtener(id(req));
  if (!t) return res.status(404).send(pagina.renderNoDisponible());
  const invitado = req.query.i ? tarjetas.invitadoPorToken(t.id, req.query.i) : null;
  res.set("Cache-Control", "no-store");
  res.type("html").send(
    pagina.renderTarjeta(t, {
      base: `/api/tarjetas/${t.id}/vista`,
      invitado,
      firmas: tarjetas.listarFirmas(t.id, true),
      vistaPrevia: true,
    })
  );
});
router.get("/:id/vista/media/:archivo", (req, res) => {
  const ruta = tarjetas.rutaArchivo(id(req), req.params.archivo);
  if (!ruta) return res.sendStatus(404);
  res.sendFile(ruta);
});
router.get("/:id/vista/evento.ics", (req, res) => {
  const t = tarjetas.obtener(id(req));
  const contenido = t && pagina.ics(t);
  if (!contenido) return res.sendStatus(404);
  res.type("text/calendar").attachment("evento.ics").send(contenido);
});

// Invitados
router.get("/:id/invitados", manejar((req) => tarjetas.listarInvitados(id(req))));
router.post(
  "/:id/invitados",
  manejar((req) => {
    const n = tarjetas.agregarInvitados(id(req), req.body?.invitados);
    return n === null ? null : { agregados: n, invitados: tarjetas.listarInvitados(id(req)) };
  })
);
router.patch("/:id/invitados/:inv", manejar((req) => tarjetas.actualizarInvitado(id(req), Number(req.params.inv), req.body || {}) && { ok: true }));
router.delete("/:id/invitados/:inv", manejar((req) => tarjetas.eliminarInvitado(id(req), Number(req.params.inv)) && { ok: true }));

// Confirmaciones
router.get("/:id/respuestas", manejar((req) => ({ resumen: tarjetas.resumenRespuestas(id(req)), respuestas: tarjetas.listarRespuestas(id(req)) })));
router.delete("/:id/respuestas/:r", manejar((req) => tarjetas.eliminarRespuesta(id(req), Number(req.params.r)) && { ok: true }));
router.get("/:id/respuestas.csv", (req, res) => {
  const t = tarjetas.obtener(id(req));
  if (!t) return res.sendStatus(404);
  const celda = (v) => {
    let s = String(v ?? "");
    if (/^[=+\-@]/.test(s)) s = `'${s}`; // evita formulas al abrir en Excel
    return `"${s.replace(/"/g, '""')}"`;
  };
  const filas = [["Nombre", "Asiste", "Personas", "Menú", "Celular", "Mensaje", "Grupo", "Fecha"]].concat(
    tarjetas
      .listarRespuestas(t.id)
      .map((r) => [r.nombre, r.asiste ? "Sí" : "No", r.cantidad, r.menu, r.telefono, r.mensaje, r.grupo, r.creado_en])
  );
  res.type("text/csv").attachment(`confirmaciones-${t.slug}.csv`).send("﻿" + filas.map((f) => f.map(celda).join(",")).join("\r\n"));
});

// Libro de firmas
router.get("/:id/firmas", manejar((req) => tarjetas.listarFirmas(id(req))));
router.patch("/:id/firmas/:f", manejar((req) => tarjetas.moderarFirma(id(req), Number(req.params.f), !!req.body?.aprobada) && { ok: true }));
router.delete("/:id/firmas/:f", manejar((req) => tarjetas.eliminarFirma(id(req), Number(req.params.f)) && { ok: true }));

// Subida de fotos y musica (base64; se monta con su propio limite de tamano).
const subida = express.Router();
subida.post("/:id/archivos", (req, res) => {
  try {
    const r = tarjetas.guardarArchivo(Number(req.params.id), req.body || {});
    if (!r) return res.status(404).json({ error: "No se encontró la tarjeta." });
    res.status(201).json(r);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = { router, subida };
