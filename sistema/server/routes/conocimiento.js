const express = require("express");
const dns = require("dns").promises;
const net = require("net");
const conocimiento = require("../services/conocimiento");

const router = express.Router();

const MAX_ARCHIVO_BYTES = 12 * 1024 * 1024;
const error500 = (res, e) => {
  console.error(`[${new Date().toISOString()}] Error en conocimiento:`, e.message);
  res.status(500).json({ error: "No se pudo completar la operacion.", detalle: e.message });
};
const idValido = (req) => {
  const id = Number(req.params.id);
  return Number.isInteger(id) && id > 0 ? id : null;
};

router.get("/", (req, res) => {
  try {
    res.json({ documentos: conocimiento.listar(), estado: conocimiento.estado() });
  } catch (e) {
    error500(res, e);
  }
});

router.get("/:id", (req, res) => {
  const id = idValido(req);
  const doc = id && conocimiento.obtener(id);
  if (!doc) return res.status(404).json({ error: "Documento no encontrado." });
  res.json(doc);
});

router.post("/", (req, res) => {
  try {
    res.status(201).json(conocimiento.crear({ titulo: req.body?.titulo, texto: req.body?.texto, origen: "texto" }));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.put("/:id", (req, res) => {
  const id = idValido(req);
  if (!id) return res.status(400).json({ error: "Id invalido." });
  try {
    const doc = conocimiento.actualizar(id, {
      titulo: typeof req.body?.titulo === "string" ? req.body.titulo : undefined,
      texto: typeof req.body?.texto === "string" ? req.body.texto : undefined,
      activo: typeof req.body?.activo === "boolean" ? req.body.activo : undefined,
    });
    if (!doc) return res.status(404).json({ error: "Documento no encontrado." });
    res.json(doc);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.delete("/:id", (req, res) => {
  const id = idValido(req);
  if (!id || !conocimiento.eliminar(id)) return res.status(404).json({ error: "Documento no encontrado." });
  res.json({ ok: true });
});

// Archivo (PDF, Word, TXT, MD, CSV) enviado en base64 desde el navegador.
router.post("/archivo", async (req, res) => {
  try {
    const nombre = String(req.body?.nombre || "documento").slice(0, 120);
    const base64 = String(req.body?.base64 || "");
    const buffer = Buffer.from(base64, "base64");
    if (!buffer.length) return res.status(400).json({ error: "El archivo esta vacio." });
    if (buffer.length > MAX_ARCHIVO_BYTES) return res.status(400).json({ error: "El archivo supera los 12 MB." });

    const ext = (nombre.split(".").pop() || "").toLowerCase();
    let texto;
    if (ext === "pdf") {
      const pdfParse = require("pdf-parse/lib/pdf-parse.js");
      texto = (await pdfParse(buffer)).text;
    } else if (ext === "docx") {
      texto = (await require("mammoth").extractRawText({ buffer })).value;
    } else if (["txt", "md", "csv", "json"].includes(ext)) {
      texto = buffer.toString("utf8");
    } else {
      return res.status(400).json({ error: "Formato no soportado. Usa PDF, DOCX, TXT, MD o CSV." });
    }
    if (!conocimiento.limpiar(texto)) return res.status(400).json({ error: "No se pudo extraer texto del archivo (¿es un PDF escaneado?)." });
    res.status(201).json(conocimiento.crear({ titulo: nombre.replace(/\.[^.]+$/, ""), texto, origen: `archivo:${ext}` }));
  } catch (e) {
    res.status(400).json({ error: `No se pudo leer el archivo: ${e.message}` });
  }
});

const esIpPrivada = (ip) =>
  net.isIP(ip) === 4
    ? /^(10\.|127\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip)
    : /^(::1|fc|fd|fe80)/i.test(ip);

function htmlATexto(html) {
  return html
    .replace(/<(script|style|noscript|svg|nav|footer|header)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/[ \t]+/g, " ")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .join("\n");
}

// Importa el texto de una pagina publica (por ejemplo una pagina de servicios de la web).
router.post("/url", async (req, res) => {
  try {
    const url = new URL(String(req.body?.url || ""));
    if (!["http:", "https:"].includes(url.protocol)) return res.status(400).json({ error: "Solo se admiten URLs http(s)." });
    const direcciones = net.isIP(url.hostname) ? [{ address: url.hostname }] : await dns.lookup(url.hostname, { all: true });
    if (direcciones.some((d) => esIpPrivada(d.address))) return res.status(400).json({ error: "Esa direccion no esta permitida." });

    const r = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(20000), headers: { "User-Agent": "FotoFace/1.0" } });
    if (r.status >= 300 && r.status < 400) return res.status(400).json({ error: "La URL redirige a otra direccion; usa la URL final." });
    if (!r.ok) return res.status(400).json({ error: `La pagina respondio ${r.status}.` });
    const html = (await r.text()).slice(0, 2_000_000);
    const titulo = (html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] || url.hostname + url.pathname).trim();
    res.status(201).json(conocimiento.crear({ titulo, texto: htmlATexto(html), origen: `url:${url.hostname}` }));
  } catch (e) {
    res.status(400).json({ error: `No se pudo importar la pagina: ${e.message}` });
  }
});

module.exports = router;
