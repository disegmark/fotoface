/*
 * Tarjetas virtuales interactivas (bodas, bautizos, cumpleanos, aniversarios...).
 * El equipo las arma a pedido desde Dashboard -> Tarjetas. Cada tarjeta vive en
 * su propio subdominio: <slug>.fotoface.pro (Caddy con TLS a demanda pregunta a
 * /api/tarjetas-tls/verificar si el subdominio existe antes de emitir el
 * certificado). Tambien responde en /t/<slug> para la vista previa.
 *
 * El contenido de la tarjeta (portada, lugares, agenda, regalos...) se guarda
 * como JSON en tarjetas.datos; los archivos (fotos, musica) en
 * server/data/tarjetas/<id>/.
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const db = require("../db");
const socket = require("./socket");

const DOMINIO = (process.env.TARJETAS_DOMINIO || "fotoface.pro").toLowerCase();
const DIR_ARCHIVOS = path.join(__dirname, "..", "data", "tarjetas");

const TIPOS = {
  boda: "Boda",
  bautizo: "Bautizo",
  primera_comunion: "Primera comunión",
  cumpleanos: "Cumpleaños",
  quince: "Quince años",
  aniversario: "Aniversario",
  baby_shower: "Baby shower",
  graduacion: "Graduación",
  celebracion: "Celebración",
};
const ESTADOS = ["borrador", "publicada", "archivada"];

// Subdominios que nunca pueden ser tarjetas.
const RESERVADOS = new Set(
  "www api app admin mail correo smtp imap pop ftp sistema panel dashboard web blog tienda shop static cdn assets media ns ns1 ns2 dev test staging demo soporte ayuda fotoface tarjetas t".split(
    " "
  )
);

const TIPOS_ARCHIVO = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "audio/mpeg": ".mp3",
  "audio/mp4": ".m4a",
  "audio/x-m4a": ".m4a",
  "audio/ogg": ".ogg",
};
const MAX_IMAGEN = 6 * 1024 * 1024;
const MAX_AUDIO = 12 * 1024 * 1024;

function texto(valor, max = 2000) {
  const t = String(valor ?? "").trim();
  return t ? t.slice(0, max) : "";
}

function token(bytes = 9) {
  return crypto.randomBytes(bytes).toString("base64url");
}

function normalizarWhatsapp(valor) {
  const d = String(valor || "").replace(/[^\d]/g, "");
  if (!d) return null;
  if (d.length === 9 && d.startsWith("9")) return `51${d}`;
  return d.length >= 8 && d.length <= 15 ? d : null;
}

/** Convierte "José & María" en "jose-y-maria"; valida como etiqueta DNS. */
function sugerirSlug(valor) {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, "y")
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 40);
}

function validarSlug(slug) {
  if (!/^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/.test(slug || "")) {
    return "El subdominio debe tener de 3 a 40 caracteres: letras minúsculas, números y guiones (sin tildes ni espacios, y sin guion al inicio o al final).";
  }
  if (slug.includes("--")) return "El subdominio no puede tener dos guiones seguidos.";
  if (RESERVADOS.has(slug)) return `"${slug}" está reservado. Elige otro subdominio.`;
  return null;
}

function urlPublica(slug) {
  return `https://${slug}.${DOMINIO}`;
}

/** Extrae el slug si el host es <slug>.<DOMINIO>; null en cualquier otro caso. */
function slugDeHost(host) {
  const h = String(host || "").toLowerCase().split(":")[0];
  if (!h.endsWith(`.${DOMINIO}`)) return null;
  const sub = h.slice(0, -(DOMINIO.length + 1));
  if (!sub || sub.includes(".") || RESERVADOS.has(sub)) return null;
  return sub;
}

function parsear(fila) {
  if (!fila) return null;
  let datos = {};
  try {
    datos = JSON.parse(fila.datos || "{}");
  } catch {
    datos = {};
  }
  return { ...fila, datos, url: urlPublica(fila.slug), tipo_nombre: TIPOS[fila.tipo] || fila.tipo };
}

function resumenRespuestas(tarjetaId) {
  return db
    .prepare(
      `SELECT
         COUNT(*) AS respuestas,
         COALESCE(SUM(CASE WHEN asiste = 1 THEN cantidad ELSE 0 END), 0) AS asistentes,
         COALESCE(SUM(CASE WHEN asiste = 0 THEN 1 ELSE 0 END), 0) AS no_asisten
       FROM tarjeta_respuestas WHERE tarjeta_id = ?`
    )
    .get(tarjetaId);
}

function listar() {
  const filas = db.prepare("SELECT * FROM tarjetas ORDER BY (estado = 'archivada'), COALESCE(fecha_evento, '9999') ASC, id DESC").all();
  return filas.map((f) => {
    const t = parsear(f);
    const invitados = db.prepare("SELECT COUNT(*) AS n, COALESCE(SUM(pases),0) AS pases FROM tarjeta_invitados WHERE tarjeta_id = ?").get(f.id);
    const firmas = db.prepare("SELECT COUNT(*) AS n FROM tarjeta_firmas WHERE tarjeta_id = ?").get(f.id);
    return {
      id: t.id,
      slug: t.slug,
      url: t.url,
      tipo: t.tipo,
      tipo_nombre: t.tipo_nombre,
      titulo: t.titulo,
      cliente_nombre: t.cliente_nombre,
      fecha_evento: t.fecha_evento,
      estado: t.estado,
      visitas: t.visitas,
      foto: t.datos?.portada?.foto || null,
      invitados: invitados.n,
      pases: invitados.pases,
      firmas: firmas.n,
      ...resumenRespuestas(f.id),
    };
  });
}

function obtener(id) {
  return parsear(db.prepare("SELECT * FROM tarjetas WHERE id = ?").get(id));
}

function obtenerPorSlug(slug) {
  return parsear(db.prepare("SELECT * FROM tarjetas WHERE slug = ?").get(String(slug || "").toLowerCase()));
}

function slugDisponible(slug, exceptoId = 0) {
  return !db.prepare("SELECT 1 FROM tarjetas WHERE slug = ? AND id != ?").get(slug, exceptoId);
}

/** Contenido inicial segun el tipo de evento, para que la tarjeta nazca completa. */
function datosIniciales(tipo, titulo) {
  const base = {
    tema: { boda: "marfil", aniversario: "marfil", bautizo: "cielo", primera_comunion: "cielo", baby_shower: "rubor", quince: "rubor", cumpleanos: "fiesta", graduacion: "noche", celebracion: "salvia" }[tipo] || "marfil",
    portada: { antetitulo: "", titulo, subtitulo: "", foto: null },
    apertura: { activa: true, estilo: "sobre", sello: "" },
    musica: { archivo: null, titulo: "" },
    mensaje: "",
    familia: [],
    lugares: [],
    agenda: [],
    vestimenta: { activa: false, titulo: "Código de vestimenta", texto: "" },
    galeria: [],
    regalos: { activa: false, texto: "", cuentas: [], yape: "", lista_url: "" },
    rsvp: { activa: true, modo: "abierto", fecha_limite: "", menu: [], nota: "" },
    firmas: { activa: true, moderar: false },
    hashtag: "",
    cierre: "",
  };
  const textos = {
    boda: { antetitulo: "¡Nos casamos!", mensaje: "Con la bendición de Dios y de nuestros padres, tenemos el honor de invitarte a celebrar nuestra unión.", cierre: "¡Te esperamos para celebrar juntos!" },
    bautizo: { antetitulo: "Mi bautizo", mensaje: "Con mucha alegría queremos compartir contigo el día en que recibiré el sacramento del bautismo." },
    primera_comunion: { antetitulo: "Mi primera comunión", mensaje: "Te invito a acompañarme en este día tan especial en que recibiré a Jesús por primera vez." },
    cumpleanos: { antetitulo: "¡Estás invitado a mi cumpleaños!", mensaje: "Ven a celebrar conmigo un año más de vida." },
    quince: { antetitulo: "Mis quince años", mensaje: "Hay momentos inolvidables que se atesoran en el corazón para siempre. Por eso quiero que compartas conmigo esta noche tan especial." },
    aniversario: { antetitulo: "Celebramos nuestro aniversario", mensaje: "Gracias por ser parte de nuestra historia. Queremos celebrar contigo este nuevo año juntos." },
    baby_shower: { antetitulo: "Baby shower", mensaje: "Un pequeño milagro está por llegar y queremos celebrarlo contigo." },
    graduacion: { antetitulo: "¡Me gradúo!", mensaje: "Después de mucho esfuerzo llegó el gran día. Acompáñame a celebrarlo." },
    celebracion: { antetitulo: "Estás invitado", mensaje: "Queremos compartir contigo este momento especial." },
  }[tipo] || {};
  base.portada.antetitulo = textos.antetitulo || "";
  base.mensaje = textos.mensaje || "";
  base.cierre = textos.cierre || "¡Te esperamos!";
  return base;
}

function crear(entrada) {
  const tipo = TIPOS[entrada.tipo] ? entrada.tipo : "boda";
  const titulo = texto(entrada.titulo, 120);
  if (!titulo) throw new Error("Falta el título de la tarjeta (por ejemplo: José & María).");
  const slug = texto(entrada.slug, 40).toLowerCase() || sugerirSlug(titulo);
  const error = validarSlug(slug);
  if (error) throw new Error(error);
  if (!slugDisponible(slug)) throw new Error(`El subdominio ${slug}.${DOMINIO} ya está en uso.`);
  const datos = datosIniciales(tipo, titulo);
  const info = db
    .prepare(
      `INSERT INTO tarjetas (slug, tipo, titulo, cliente_nombre, cliente_whatsapp, fecha_evento, datos, clave_anfitrion, pedido_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      slug,
      tipo,
      titulo,
      texto(entrada.cliente_nombre, 120) || null,
      normalizarWhatsapp(entrada.cliente_whatsapp),
      texto(entrada.fecha_evento, 20) || null,
      JSON.stringify(datos),
      token(12),
      Number(entrada.pedido_id) || null
    );
  socket.emitir("tarjeta:actualizada", { id: info.lastInsertRowid });
  return obtener(info.lastInsertRowid);
}

/* ---------- Saneado del JSON de contenido (todo lo que llega del panel) ---------- */

const TEMAS = ["marfil", "salvia", "rubor", "cielo", "noche", "terracota", "fiesta", "lavanda"];

function lista(valor, max, fn) {
  return (Array.isArray(valor) ? valor : []).slice(0, max).map(fn).filter(Boolean);
}

function urlSegura(valor) {
  const u = texto(valor, 600);
  return /^https?:\/\//i.test(u) ? u : "";
}

function archivoPropio(valor) {
  const v = texto(valor, 80);
  return /^[a-zA-Z0-9_-]+\.(jpg|png|webp|mp3|m4a|ogg)$/.test(v) ? v : null;
}

function sanearDatos(d = {}) {
  const p = d.portada || {};
  const a = d.apertura || {};
  const m = d.musica || {};
  const v = d.vestimenta || {};
  const r = d.regalos || {};
  const rs = d.rsvp || {};
  const f = d.firmas || {};
  return {
    tema: TEMAS.includes(d.tema) ? d.tema : "marfil",
    portada: {
      antetitulo: texto(p.antetitulo, 120),
      titulo: texto(p.titulo, 120),
      subtitulo: texto(p.subtitulo, 200),
      foto: archivoPropio(p.foto),
    },
    apertura: { activa: a.activa !== false, estilo: ["sobre", "telon"].includes(a.estilo) ? a.estilo : "sobre", sello: texto(a.sello, 6) },
    musica: { archivo: archivoPropio(m.archivo), titulo: texto(m.titulo, 120) },
    mensaje: texto(d.mensaje, 1500),
    familia: lista(d.familia, 12, (x) => (texto(x?.nombres, 400) ? { rol: texto(x.rol, 60), nombres: texto(x.nombres, 400) } : null)),
    lugares: lista(d.lugares, 6, (x) =>
      texto(x?.nombre, 120)
        ? {
            rol: texto(x.rol, 60),
            nombre: texto(x.nombre, 120),
            hora: texto(x.hora, 10),
            direccion: texto(x.direccion, 250),
            mapa_url: urlSegura(x.mapa_url),
          }
        : null
    ),
    agenda: lista(d.agenda, 15, (x) => (texto(x?.titulo, 100) ? { hora: texto(x.hora, 10), titulo: texto(x.titulo, 100), detalle: texto(x.detalle, 200) } : null)),
    vestimenta: { activa: !!v.activa, titulo: texto(v.titulo, 80) || "Código de vestimenta", texto: texto(v.texto, 600) },
    galeria: lista(d.galeria, 24, archivoPropio),
    regalos: {
      activa: !!r.activa,
      texto: texto(r.texto, 600),
      cuentas: lista(r.cuentas, 6, (x) =>
        texto(x?.numero, 60) ? { banco: texto(x.banco, 60), titular: texto(x.titular, 120), numero: texto(x.numero, 60), cci: texto(x.cci, 60) } : null
      ),
      yape: texto(r.yape, 40),
      lista_url: urlSegura(r.lista_url),
    },
    rsvp: {
      activa: rs.activa !== false,
      modo: rs.modo === "solo_invitados" ? "solo_invitados" : "abierto",
      fecha_limite: /^\d{4}-\d{2}-\d{2}$/.test(rs.fecha_limite || "") ? rs.fecha_limite : "",
      menu: lista(rs.menu, 8, (x) => texto(x, 60) || null),
      nota: texto(rs.nota, 300),
    },
    firmas: { activa: f.activa !== false, moderar: !!f.moderar },
    hashtag: texto(d.hashtag, 60).replace(/\s+/g, ""),
    cierre: texto(d.cierre, 300),
  };
}

function actualizar(id, entrada) {
  const actual = obtener(id);
  if (!actual) return null;
  const cambios = {};
  if (entrada.titulo !== undefined) {
    cambios.titulo = texto(entrada.titulo, 120);
    if (!cambios.titulo) throw new Error("El título no puede quedar vacío.");
  }
  if (entrada.slug !== undefined && entrada.slug !== actual.slug) {
    const slug = texto(entrada.slug, 40).toLowerCase();
    const error = validarSlug(slug);
    if (error) throw new Error(error);
    if (!slugDisponible(slug, id)) throw new Error(`El subdominio ${slug}.${DOMINIO} ya está en uso.`);
    cambios.slug = slug;
  }
  if (entrada.tipo !== undefined && TIPOS[entrada.tipo]) cambios.tipo = entrada.tipo;
  if (entrada.estado !== undefined) {
    if (!ESTADOS.includes(entrada.estado)) throw new Error("Estado no válido.");
    cambios.estado = entrada.estado;
  }
  if (entrada.cliente_nombre !== undefined) cambios.cliente_nombre = texto(entrada.cliente_nombre, 120) || null;
  if (entrada.cliente_whatsapp !== undefined) cambios.cliente_whatsapp = normalizarWhatsapp(entrada.cliente_whatsapp);
  if (entrada.fecha_evento !== undefined) {
    const fe = texto(entrada.fecha_evento, 20);
    if (fe && !/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/.test(fe)) throw new Error("La fecha del evento debe tener el formato AAAA-MM-DD y hora opcional.");
    cambios.fecha_evento = fe || null;
  }
  if (entrada.datos !== undefined) cambios.datos = JSON.stringify(sanearDatos(entrada.datos));
  const campos = Object.keys(cambios);
  if (campos.length) {
    db.prepare(`UPDATE tarjetas SET ${campos.map((c) => `${c} = @${c}`).join(", ")} WHERE id = @id`).run({ ...cambios, id });
    socket.emitir("tarjeta:actualizada", { id });
  }
  return obtener(id);
}

function duplicar(id) {
  const t = obtener(id);
  if (!t) return null;
  let slug = `${t.slug}-copia`.slice(0, 40);
  for (let i = 2; !slugDisponible(slug); i++) slug = `${t.slug.slice(0, 34)}-copia${i}`;
  const nueva = crear({ tipo: t.tipo, titulo: `${t.titulo} (copia)`, slug });
  // Los archivos son por tarjeta: la copia conserva el diseño, sin fotos ni musica.
  const datos = { ...t.datos, portada: { ...t.datos.portada, foto: null }, musica: { archivo: null, titulo: "" }, galeria: [] };
  return actualizar(nueva.id, { datos });
}

function eliminar(id) {
  const info = db.prepare("DELETE FROM tarjetas WHERE id = ?").run(id);
  fs.rmSync(path.join(DIR_ARCHIVOS, String(Number(id))), { recursive: true, force: true });
  socket.emitir("tarjeta:actualizada", { id });
  return info.changes > 0;
}

/* ---------- Archivos ---------- */

function guardarArchivo(id, { tipo_mime, base64 }) {
  if (!obtener(id)) return null;
  const ext = TIPOS_ARCHIVO[tipo_mime];
  if (!ext) throw new Error("Formato no admitido. Usa JPG, PNG o WebP para fotos y MP3, M4A u OGG para música.");
  const buffer = Buffer.from(String(base64 || ""), "base64");
  const esAudio = tipo_mime.startsWith("audio/");
  if (!buffer.length) throw new Error("El archivo está vacío.");
  if (buffer.length > (esAudio ? MAX_AUDIO : MAX_IMAGEN)) {
    throw new Error(esAudio ? "La música no puede pasar de 12 MB." : "La foto no puede pasar de 6 MB.");
  }
  const dir = path.join(DIR_ARCHIVOS, String(Number(id)));
  fs.mkdirSync(dir, { recursive: true });
  const nombre = `${Date.now().toString(36)}-${token(6)}${ext}`;
  fs.writeFileSync(path.join(dir, nombre), buffer);
  return { archivo: nombre };
}

function rutaArchivo(id, nombre) {
  const limpio = archivoPropio(nombre);
  if (!limpio) return null;
  const ruta = path.join(DIR_ARCHIVOS, String(Number(id)), limpio);
  return fs.existsSync(ruta) ? ruta : null;
}

/* ---------- Invitados ---------- */

function listarInvitados(tarjetaId) {
  return db
    .prepare(
      `SELECT i.*, r.asiste, r.cantidad, r.menu, r.mensaje AS respuesta_mensaje, r.creado_en AS respondio_en
       FROM tarjeta_invitados i
       LEFT JOIN tarjeta_respuestas r ON r.invitado_id = i.id
       WHERE i.tarjeta_id = ? ORDER BY i.grupo, i.nombre`
    )
    .all(tarjetaId);
}

function agregarInvitados(tarjetaId, filas) {
  if (!obtener(tarjetaId)) return null;
  const insertar = db.prepare("INSERT INTO tarjeta_invitados (tarjeta_id, nombre, pases, whatsapp, grupo, token) VALUES (?, ?, ?, ?, ?, ?)");
  let n = 0;
  db.transaction(() => {
    for (const f of (Array.isArray(filas) ? filas : []).slice(0, 1000)) {
      const nombre = texto(f?.nombre, 120);
      if (!nombre) continue;
      const pases = Math.min(Math.max(parseInt(f.pases, 10) || 1, 1), 50);
      insertar.run(tarjetaId, nombre, pases, normalizarWhatsapp(f.whatsapp), texto(f.grupo, 60) || null, token(6));
      n++;
    }
  })();
  return n;
}

function actualizarInvitado(tarjetaId, invitadoId, entrada) {
  const inv = db.prepare("SELECT * FROM tarjeta_invitados WHERE id = ? AND tarjeta_id = ?").get(invitadoId, tarjetaId);
  if (!inv) return null;
  db.prepare("UPDATE tarjeta_invitados SET nombre = ?, pases = ?, whatsapp = ?, grupo = ? WHERE id = ?").run(
    texto(entrada.nombre ?? inv.nombre, 120) || inv.nombre,
    Math.min(Math.max(parseInt(entrada.pases ?? inv.pases, 10) || 1, 1), 50),
    entrada.whatsapp !== undefined ? normalizarWhatsapp(entrada.whatsapp) : inv.whatsapp,
    entrada.grupo !== undefined ? texto(entrada.grupo, 60) || null : inv.grupo,
    invitadoId
  );
  return true;
}

function eliminarInvitado(tarjetaId, invitadoId) {
  return db.prepare("DELETE FROM tarjeta_invitados WHERE id = ? AND tarjeta_id = ?").run(invitadoId, tarjetaId).changes > 0;
}

function invitadoPorToken(tarjetaId, tk) {
  if (!tk) return null;
  return db.prepare("SELECT * FROM tarjeta_invitados WHERE tarjeta_id = ? AND token = ?").get(tarjetaId, String(tk).slice(0, 20)) || null;
}

/* ---------- Respuestas (RSVP) y firmas ---------- */

function listarRespuestas(tarjetaId) {
  return db
    .prepare(
      `SELECT r.*, i.nombre AS invitado_nombre, i.pases AS invitado_pases, i.grupo
       FROM tarjeta_respuestas r LEFT JOIN tarjeta_invitados i ON i.id = r.invitado_id
       WHERE r.tarjeta_id = ? ORDER BY r.creado_en DESC`
    )
    .all(tarjetaId);
}

function responder(tarjeta, entrada) {
  const rsvp = tarjeta.datos.rsvp || {};
  if (!rsvp.activa) throw new Error("Esta tarjeta no recibe confirmaciones.");
  if (rsvp.fecha_limite && new Date().toISOString().slice(0, 10) > rsvp.fecha_limite) {
    throw new Error("La fecha para confirmar ya pasó. Comunícate directamente con los anfitriones.");
  }
  const invitado = invitadoPorToken(tarjeta.id, entrada.invitado);
  if (rsvp.modo === "solo_invitados" && !invitado) throw new Error("Usa el enlace personal que recibiste para confirmar.");
  const asiste = entrada.asiste === true || entrada.asiste === "si" || entrada.asiste === 1;
  const nombre = texto(entrada.nombre, 120) || invitado?.nombre;
  if (!nombre) throw new Error("Escribe tu nombre.");
  const tope = invitado ? invitado.pases : 10;
  const cantidad = asiste ? Math.min(Math.max(parseInt(entrada.cantidad, 10) || 1, 1), tope) : 0;
  const menu = (rsvp.menu || []).includes(entrada.menu) ? entrada.menu : null;
  const valores = [nombre, asiste ? 1 : 0, cantidad, texto(entrada.telefono, 30) || null, menu, texto(entrada.mensaje, 500) || null];

  const previa = invitado && db.prepare("SELECT id FROM tarjeta_respuestas WHERE invitado_id = ?").get(invitado.id);
  if (previa) {
    db.prepare(
      "UPDATE tarjeta_respuestas SET nombre = ?, asiste = ?, cantidad = ?, telefono = ?, menu = ?, mensaje = ?, actualizado_en = datetime('now','localtime') WHERE id = ?"
    ).run(...valores, previa.id);
  } else {
    db.prepare(
      "INSERT INTO tarjeta_respuestas (tarjeta_id, invitado_id, nombre, asiste, cantidad, telefono, menu, mensaje) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(tarjeta.id, invitado?.id || null, ...valores);
  }
  socket.emitir("tarjeta:respuesta", { id: tarjeta.id, nombre, asiste });
  return { asiste, cantidad, actualizada: !!previa };
}

function eliminarRespuesta(tarjetaId, respuestaId) {
  return db.prepare("DELETE FROM tarjeta_respuestas WHERE id = ? AND tarjeta_id = ?").run(respuestaId, tarjetaId).changes > 0;
}

function listarFirmas(tarjetaId, soloAprobadas = false) {
  return db
    .prepare(
      `SELECT id, nombre, mensaje, aprobada, creado_en FROM tarjeta_firmas WHERE tarjeta_id = ? ${soloAprobadas ? "AND aprobada = 1" : ""} ORDER BY id DESC LIMIT 300`
    )
    .all(tarjetaId);
}

function firmar(tarjeta, entrada) {
  if (!tarjeta.datos.firmas?.activa) throw new Error("El libro de firmas está cerrado.");
  const nombre = texto(entrada.nombre, 80);
  const mensaje = texto(entrada.mensaje, 500);
  if (!nombre || !mensaje) throw new Error("Escribe tu nombre y tu mensaje.");
  const aprobada = tarjeta.datos.firmas.moderar ? 0 : 1;
  db.prepare("INSERT INTO tarjeta_firmas (tarjeta_id, nombre, mensaje, aprobada) VALUES (?, ?, ?, ?)").run(tarjeta.id, nombre, mensaje, aprobada);
  socket.emitir("tarjeta:firma", { id: tarjeta.id });
  return { aprobada: !!aprobada };
}

function moderarFirma(tarjetaId, firmaId, aprobada) {
  return db.prepare("UPDATE tarjeta_firmas SET aprobada = ? WHERE id = ? AND tarjeta_id = ?").run(aprobada ? 1 : 0, firmaId, tarjetaId).changes > 0;
}

function eliminarFirma(tarjetaId, firmaId) {
  return db.prepare("DELETE FROM tarjeta_firmas WHERE id = ? AND tarjeta_id = ?").run(firmaId, tarjetaId).changes > 0;
}

function registrarVisita(tarjeta, invitado) {
  db.prepare("UPDATE tarjetas SET visitas = visitas + 1 WHERE id = ?").run(tarjeta.id);
  if (invitado && !invitado.abierta_en) {
    db.prepare("UPDATE tarjeta_invitados SET abierta_en = datetime('now','localtime') WHERE id = ?").run(invitado.id);
  }
}

module.exports = {
  DOMINIO,
  TIPOS,
  TEMAS,
  ESTADOS,
  sugerirSlug,
  validarSlug,
  slugDisponible,
  slugDeHost,
  urlPublica,
  listar,
  obtener,
  obtenerPorSlug,
  crear,
  actualizar,
  duplicar,
  eliminar,
  guardarArchivo,
  rutaArchivo,
  listarInvitados,
  agregarInvitados,
  actualizarInvitado,
  eliminarInvitado,
  invitadoPorToken,
  listarRespuestas,
  responder,
  eliminarRespuesta,
  listarFirmas,
  firmar,
  moderarFirma,
  eliminarFirma,
  registrarVisita,
  resumenRespuestas,
};
