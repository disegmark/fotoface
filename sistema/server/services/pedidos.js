/*
 * Pedidos de impresion fotografica (revelado, ampliaciones, cuadros, fotolibros...).
 * Entran por tres vias: Lumi desde el chat (herramienta registrar_pedido), el
 * formulario de la web fotoface.pro (POST /api/publico/pedido) o el equipo.
 * El equipo los gestiona desde Dashboard -> Pedidos y, si son con envio a
 * domicilio, los manda a la app de Repartos (repartos.ia.nom.pe), que devuelve
 * un enlace para que el cliente comparta su ubicacion exacta de entrega.
 */
const db = require("../db");
const socket = require("./socket");
const conversacionesService = require("./conversaciones");

const ESTADOS = ["nuevo", "cotizado", "en_produccion", "listo", "en_reparto", "entregado", "cancelado"];
const ENTREGAS = ["tienda", "domicilio"];
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function texto(valor, max = 2000) {
  const t = String(valor ?? "").trim();
  return t ? t.slice(0, max) : null;
}

/** Numero de WhatsApp en digitos con codigo de pais (Peru por defecto si vienen 9 digitos). */
function normalizarWhatsapp(valor) {
  const digitos = String(valor || "").replace(/[^\d]/g, "");
  if (!digitos) return null;
  if (digitos.length === 9 && digitos.startsWith("9")) return `51${digitos}`;
  return digitos.length >= 8 && digitos.length <= 15 ? digitos : null;
}

function registrar(datos, origen = "chat") {
  const nombre = texto(datos.nombre, 120);
  if (!nombre) return { exito: false, mensaje: "Falta el nombre completo del cliente. Pidelo antes de registrar el pedido." };
  const productos = texto(datos.productos, 3000);
  if (!productos) {
    return {
      exito: false,
      mensaje: "Falta el detalle del pedido (producto, tamano, acabado y cantidad). Pidelo antes de registrar.",
    };
  }
  const entrega = ENTREGAS.includes(datos.entrega) ? datos.entrega : null;
  if (!entrega) return { exito: false, mensaje: "Falta saber si recoge en tienda o quiere envio a domicilio." };
  const direccion = texto(datos.direccion, 300);
  if (entrega === "domicilio" && !direccion) {
    return { exito: false, mensaje: "Para envio a domicilio falta la direccion (con distrito y una referencia)." };
  }
  const email = texto(datos.email, 160);
  if (email && !EMAIL_REGEX.test(email)) {
    return { exito: false, mensaje: "El email no tiene un formato valido. Pidele al cliente que lo revise." };
  }
  const whatsapp = normalizarWhatsapp(datos.whatsapp);
  const numero = texto(datos.numero_telefono, 80) || whatsapp;
  if (!numero) return { exito: false, mensaje: "Falta un numero de WhatsApp de contacto." };

  const id = db
    .prepare(
      `INSERT INTO pedidos (numero_telefono, nombre, whatsapp, email, productos, entrega, direccion,
         fecha_deseada, fotos_enlace, notas, origen)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      numero,
      nombre,
      whatsapp,
      email,
      productos,
      entrega,
      entrega === "domicilio" ? direccion : null,
      texto(datos.fecha_deseada, 60),
      texto(datos.fotos_enlace, 500),
      texto(datos.notas, 1000),
      origen
    ).lastInsertRowid;

  conversacionesService.actualizarNombreContacto(numero, nombre);
  socket.emitir("pedido:nuevo", { id, origen });

  return {
    exito: true,
    id_pedido: id,
    codigo: codigoPedido(id),
    mensaje:
      "Pedido registrado. El equipo revisara las fotos y le confirmara el precio final y la fecha de entrega por WhatsApp." +
      (entrega === "domicilio" ? " Para el envio le llegara un enlace para compartir su ubicacion exacta." : ""),
  };
}

function codigoPedido(id) {
  return `FF-${String(id).padStart(4, "0")}`;
}

function verDeContacto(numeroTelefono) {
  const pedidos = db
    .prepare(
      `SELECT id, productos, entrega, estado, monto, creado_en FROM pedidos
       WHERE numero_telefono = ? AND estado != 'cancelado' ORDER BY id DESC LIMIT 10`
    )
    .all(numeroTelefono)
    .map((p) => ({ ...p, codigo: codigoPedido(p.id) }));
  return { pedidos };
}

function listar() {
  return db
    .prepare("SELECT * FROM pedidos ORDER BY id DESC LIMIT 500")
    .all()
    .map((p) => ({ ...p, codigo: codigoPedido(p.id) }));
}

function obtener(id) {
  const p = db.prepare("SELECT * FROM pedidos WHERE id = ?").get(id);
  return p ? { ...p, codigo: codigoPedido(p.id) } : null;
}

function actualizar(id, { estado, notas, monto }) {
  if (!obtener(id)) return null;
  if (estado !== undefined && !ESTADOS.includes(estado)) {
    throw new Error(`Estado invalido. Debe ser uno de: ${ESTADOS.join(", ")}.`);
  }
  let montoNum = null;
  if (monto !== undefined && monto !== null && monto !== "") {
    montoNum = Number(monto);
    if (!Number.isFinite(montoNum) || montoNum < 0) throw new Error("El monto debe ser un numero positivo.");
  }
  db.prepare(
    "UPDATE pedidos SET estado = COALESCE(?, estado), notas = COALESCE(?, notas), monto = COALESCE(?, monto) WHERE id = ?"
  ).run(estado ?? null, notas ?? null, montoNum, id);
  socket.emitir("pedido:actualizado", { id });
  return obtener(id);
}

/**
 * Crea la entrega en la app de Repartos con la clave de API de FotoFace (que
 * solo ve las entregas de la cuenta "fotoface") y guarda el enlace para que el
 * cliente comparta su ubicacion.
 */
async function enviarAReparto(id) {
  const pedido = obtener(id);
  if (!pedido) return null;
  if (pedido.entrega !== "domicilio") throw new Error("Este pedido es para recoger en tienda.");
  if (pedido.reparto_enlace) return pedido;
  const base = (process.env.REPARTOS_URL || "https://repartos.ia.nom.pe").replace(/\/+$/, "");
  const clave = process.env.REPARTOS_API_KEY || "";
  if (clave.length < 32) throw new Error("Falta configurar REPARTOS_API_KEY en el servidor.");

  const cuerpo = new URLSearchParams({
    kind: "delivery",
    ref: pedido.codigo,
    customer_name: `${pedido.nombre}${pedido.direccion ? ` · ${pedido.direccion}` : ""}`.slice(0, 120),
    hours: "72",
  });
  const r = await fetch(`${base}/api/links`, {
    method: "POST",
    headers: { "X-API-Key": clave, "Content-Type": "application/x-www-form-urlencoded" },
    body: cuerpo,
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw new Error(`Repartos respondio ${r.status}.`);
  const datos = await r.json();
  db.prepare("UPDATE pedidos SET reparto_id = ?, reparto_enlace = ?, estado = 'en_reparto' WHERE id = ?").run(
    datos.delivery_id ?? null,
    datos.url,
    id
  );
  socket.emitir("pedido:actualizado", { id });
  return obtener(id);
}

module.exports = { ESTADOS, ENTREGAS, registrar, verDeContacto, listar, obtener, actualizar, enviarAReparto, codigoPedido };
