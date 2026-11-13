/*
 * Base de conocimiento de Lumi. Los documentos se gestionan desde el dashboard
 * (Conocimiento) y se usan en el prompt del agente de inmediato, sin reiniciar.
 *
 * Si todo el conocimiento activo cabe en el presupuesto se envia completo; si
 * no, se envia el documento mas antiguo (la informacion oficial de la agencia)
 * y, del resto, los fragmentos mas parecidos a lo que pregunta el cliente.
 */
const db = require("../db");

const PRESUPUESTO = 30000; // caracteres por respuesta (~8 mil tokens)
const MAX_TEXTO = 200000; // por documento

const limpiar = (t) =>
  String(t || "")
    .replace(/\r\n/g, "\n")
    .replace(/\u0000/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();

function validar({ titulo, texto }) {
  const t = limpiar(texto);
  if (!t) throw new Error("El texto esta vacio.");
  if (t.length > MAX_TEXTO) throw new Error(`El texto supera los ${MAX_TEXTO} caracteres.`);
  return { titulo: String(titulo || "").trim().slice(0, 120) || "Sin titulo", texto: t };
}

function listar() {
  return db
    .prepare(
      "SELECT id, titulo, origen, activo, LENGTH(texto) AS caracteres, actualizado_en FROM conocimiento_docs ORDER BY id"
    )
    .all();
}

const obtener = (id) => db.prepare("SELECT * FROM conocimiento_docs WHERE id = ?").get(id);

function crear({ titulo, texto, origen = "texto" }) {
  const d = validar({ titulo, texto });
  const r = db.prepare("INSERT INTO conocimiento_docs (titulo, texto, origen) VALUES (?, ?, ?)").run(d.titulo, d.texto, origen);
  return obtener(r.lastInsertRowid);
}

function actualizar(id, cambios) {
  const actual = obtener(id);
  if (!actual) return null;
  const d = validar({ titulo: cambios.titulo ?? actual.titulo, texto: cambios.texto ?? actual.texto });
  const activo = typeof cambios.activo === "boolean" ? (cambios.activo ? 1 : 0) : actual.activo;
  db.prepare("UPDATE conocimiento_docs SET titulo = ?, texto = ?, activo = ? WHERE id = ?").run(d.titulo, d.texto, activo, id);
  return obtener(id);
}

const eliminar = (id) => db.prepare("DELETE FROM conocimiento_docs WHERE id = ?").run(id).changes > 0;

const normalizar = (t) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const palabras = (t) => new Set(normalizar(t).match(/[a-z0-9]{4,}/g) || []);

function fragmentos(doc, max = 1200) {
  const out = [];
  let actual = "";
  for (const p of doc.texto.split(/\n{2,}/)) {
    if (actual && actual.length + p.length > max) {
      out.push(actual);
      actual = "";
    }
    actual += (actual ? "\n\n" : "") + p;
  }
  if (actual) out.push(actual);
  return out.map((texto) => ({ titulo: doc.titulo, texto }));
}

/** Texto de conocimiento para el prompt. `consulta` = lo ultimo que escribio el cliente. */
function paraPrompt(consulta = "") {
  const docs = db.prepare("SELECT id, titulo, texto FROM conocimiento_docs WHERE activo = 1 ORDER BY id").all();
  if (!docs.length) return "";
  const completo = docs.map((d) => `### ${d.titulo}\n${d.texto}`).join("\n\n");
  if (completo.length <= PRESUPUESTO) return completo;

  const [primero, ...resto] = docs;
  const partes = [`### ${primero.titulo}\n${primero.texto.slice(0, PRESUPUESTO)}`];
  let usado = partes[0].length;
  const q = palabras(consulta);
  const candidatos = resto
    .flatMap((d) => fragmentos(d))
    .map((f) => {
      const w = palabras(`${f.titulo} ${f.texto}`);
      let puntos = 0;
      for (const x of q) if (w.has(x)) puntos++;
      return { ...f, puntos };
    })
    .sort((a, b) => b.puntos - a.puntos);
  for (const f of candidatos) {
    const t = `### ${f.titulo} (fragmento)\n${f.texto}`;
    if (usado + t.length > PRESUPUESTO) continue;
    partes.push(t);
    usado += t.length;
  }
  return partes.join("\n\n");
}

function estado() {
  const r = db.prepare("SELECT COUNT(*) AS total, SUM(activo) AS activos, COALESCE(SUM(CASE WHEN activo = 1 THEN LENGTH(texto) END), 0) AS chars FROM conocimiento_docs").get();
  return { documentos: r.total, activos: r.activos || 0, caracteresActivos: r.chars, presupuesto: PRESUPUESTO, seleccionaFragmentos: r.chars > PRESUPUESTO };
}

module.exports = { listar, obtener, crear, actualizar, eliminar, paraPrompt, estado, limpiar };
