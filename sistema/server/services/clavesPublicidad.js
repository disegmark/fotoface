/*
 * Claves de las plataformas de publicidad (Meta Ads, TikTok Ads, Google Ads,
 * LinkedIn Ads, ChatGPT Ads), para traer KPIs reales de campañas al
 * dashboard. Se cargan desde Dashboard -> Conexiones (tabla
 * claves_publicidad). La API nunca devuelve una clave completa: solo los
 * ultimos 4 caracteres.
 */
const db = require("../db");

const PLATAFORMAS = {
  meta: {
    nombre: "Meta Ads",
    envToken: "META_ADS_ACCESS_TOKEN",
    envCuenta: "META_ADS_ACCOUNT_ID",
    etiquetaCuenta: "Ad Account ID",
  },
  tiktok: {
    nombre: "TikTok Ads",
    envToken: "TIKTOK_ADS_ACCESS_TOKEN",
    envCuenta: "TIKTOK_ADS_ADVERTISER_ID",
    etiquetaCuenta: "Advertiser ID",
  },
  google: {
    nombre: "Google Ads",
    envToken: "GOOGLE_ADS_ACCESS_TOKEN",
    envCuenta: "GOOGLE_ADS_CUSTOMER_ID",
    etiquetaCuenta: "Customer ID",
    envExtra: "GOOGLE_ADS_DEVELOPER_TOKEN",
    etiquetaExtra: "Developer Token",
  },
  linkedin: {
    nombre: "LinkedIn Ads",
    envToken: "LINKEDIN_ADS_ACCESS_TOKEN",
    envCuenta: "LINKEDIN_ADS_ACCOUNT_ID",
    etiquetaCuenta: "Sponsored Account ID",
  },
  // La cuenta de ChatGPT Ads queda implicita en la propia API key (no hay un
  // ID de cuenta separado para pedir), a diferencia de las otras plataformas.
  chatgpt: {
    nombre: "ChatGPT Ads",
    envToken: "CHATGPT_ADS_API_KEY",
    sinCuenta: true,
  },
};

const PLATAFORMAS_VALIDAS = Object.keys(PLATAFORMAS);

const LISTA_CHECK = PLATAFORMAS_VALIDAS.map((p) => `'${p}'`).join(", ");

db.exec(`
  CREATE TABLE IF NOT EXISTS claves_publicidad (
    plataforma TEXT PRIMARY KEY CHECK(plataforma IN (${LISTA_CHECK})),
    access_token TEXT,
    cuenta_id TEXT,
    token_extra TEXT,
    actualizado_por TEXT,
    actualizado_en DATETIME DEFAULT (datetime('now', 'localtime'))
  );
`);

// La tabla pudo haber sido creada antes de agregar alguna plataforma nueva:
// el CHECK viejo rechazaria esos valores. Si detectamos el CHECK restrictivo,
// se recrea la tabla (SQLite no permite alterar un CHECK existente).
const tablaActual = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'claves_publicidad'").get();
if (tablaActual?.sql && !tablaActual.sql.includes("'chatgpt'")) {
  db.exec(`
    ALTER TABLE claves_publicidad RENAME TO claves_publicidad_vieja;
    CREATE TABLE claves_publicidad (
      plataforma TEXT PRIMARY KEY CHECK(plataforma IN (${LISTA_CHECK})),
      access_token TEXT,
      cuenta_id TEXT,
      token_extra TEXT,
      actualizado_por TEXT,
      actualizado_en DATETIME DEFAULT (datetime('now', 'localtime'))
    );
    INSERT INTO claves_publicidad (plataforma, access_token, cuenta_id, actualizado_por, actualizado_en)
      SELECT plataforma, access_token, cuenta_id, actualizado_por, actualizado_en FROM claves_publicidad_vieja;
    DROP TABLE claves_publicidad_vieja;
  `);
} else {
  const columnas = db.prepare("PRAGMA table_info(claves_publicidad)").all().map((c) => c.name);
  if (!columnas.includes("token_extra")) {
    db.exec("ALTER TABLE claves_publicidad ADD COLUMN token_extra TEXT");
  }
}

function fila(plataforma) {
  return db.prepare("SELECT * FROM claves_publicidad WHERE plataforma = ?").get(plataforma);
}

function obtenerToken(plataforma) {
  const info = PLATAFORMAS[plataforma];
  if (!info) return null;
  return fila(plataforma)?.access_token || process.env[info.envToken] || null;
}

function obtenerCuentaId(plataforma) {
  const info = PLATAFORMAS[plataforma];
  if (!info) return null;
  return fila(plataforma)?.cuenta_id || process.env[info.envCuenta] || null;
}

/** Credencial extra opcional (ej. Developer Token de Google Ads). Null si la plataforma no la usa. */
function obtenerTokenExtra(plataforma) {
  const info = PLATAFORMAS[plataforma];
  if (!info?.envExtra) return null;
  return fila(plataforma)?.token_extra || process.env[info.envExtra] || null;
}

function enmascarar(valor) {
  return valor ? `••••${valor.slice(-4)}` : null;
}

function estado() {
  return Object.keys(PLATAFORMAS).map((plataforma) => {
    const info = PLATAFORMAS[plataforma];
    const guardada = fila(plataforma);
    const token = obtenerToken(plataforma);
    const cuentaId = obtenerCuentaId(plataforma);
    const tokenExtra = obtenerTokenExtra(plataforma);
    return {
      plataforma,
      nombre: info.nombre,
      configurada: Boolean(token && (info.sinCuenta || cuentaId) && (!info.envExtra || tokenExtra)),
      origen: guardada?.access_token ? "dashboard" : token ? "env" : null,
      token: enmascarar(token),
      sin_cuenta: Boolean(info.sinCuenta),
      cuenta_id: cuentaId || null,
      etiqueta_extra: info.etiquetaExtra || null,
      extra: enmascarar(tokenExtra),
      actualizado_en: guardada?.actualizado_en || null,
      actualizado_por: guardada?.actualizado_por || null,
    };
  });
}

/** Guarda (o borra, con valores vacios) las credenciales de una plataforma. */
function guardar(plataforma, { access_token, cuenta_id, token_extra }, usuario) {
  if (!PLATAFORMAS[plataforma]) throw new Error(`Plataforma invalida. Usa ${PLATAFORMAS_VALIDAS.join(", ")}.`);
  const token = access_token === undefined ? undefined : String(access_token || "").trim() || null;
  const cuenta = cuenta_id === undefined ? undefined : String(cuenta_id || "").trim() || null;
  const extra = token_extra === undefined ? undefined : String(token_extra || "").trim() || null;

  const actual = fila(plataforma);
  db.prepare(
    `INSERT INTO claves_publicidad (plataforma, access_token, cuenta_id, token_extra, actualizado_por, actualizado_en)
     VALUES (?, ?, ?, ?, ?, datetime('now', 'localtime'))
     ON CONFLICT(plataforma) DO UPDATE SET access_token = excluded.access_token, cuenta_id = excluded.cuenta_id,
       token_extra = excluded.token_extra, actualizado_por = excluded.actualizado_por, actualizado_en = excluded.actualizado_en`
  ).run(
    plataforma,
    token === undefined ? actual?.access_token ?? null : token,
    cuenta === undefined ? actual?.cuenta_id ?? null : cuenta,
    extra === undefined ? actual?.token_extra ?? null : extra,
    usuario || null
  );
  return estado().find((e) => e.plataforma === plataforma);
}

async function probar(plataforma) {
  const info = PLATAFORMAS[plataforma];
  if (!info) throw new Error("Plataforma invalida.");
  const token = obtenerToken(plataforma);
  const cuentaId = obtenerCuentaId(plataforma);
  const tokenExtra = obtenerTokenExtra(plataforma);
  if (!token || (!info.sinCuenta && !cuentaId)) {
    return { ok: false, mensaje: "Falta el access token o el ID de cuenta." };
  }
  if (info.envExtra && !tokenExtra) {
    return { ok: false, mensaje: `Falta el ${info.etiquetaExtra}.` };
  }

  try {
    if (plataforma === "meta") {
      const id = cuentaId.startsWith("act_") ? cuentaId : `act_${cuentaId}`;
      const respuesta = await fetch(`https://graph.facebook.com/v19.0/${id}?fields=name,account_status&access_token=${encodeURIComponent(token)}`);
      const datos = await respuesta.json();
      if (!respuesta.ok) return { ok: false, mensaje: datos?.error?.message || `Meta respondio ${respuesta.status}.` };
      return { ok: true, mensaje: `Conectado a "${datos.name || id}".` };
    }
    if (plataforma === "tiktok") {
      const respuesta = await fetch(
        `https://business-api.tiktok.com/open_api/v1.3/advertiser/info/?advertiser_ids=${encodeURIComponent(JSON.stringify([cuentaId]))}`,
        { headers: { "Access-Token": token } }
      );
      const datos = await respuesta.json();
      if (!respuesta.ok || datos.code !== 0) return { ok: false, mensaje: datos?.message || `TikTok respondio ${respuesta.status}.` };
      const cuenta = datos.data?.list?.[0];
      return { ok: true, mensaje: cuenta ? `Conectado a "${cuenta.name}".` : "La clave es valida." };
    }
    if (plataforma === "google") {
      const idLimpio = cuentaId.replace(/-/g, "");
      const respuesta = await fetch(`https://googleads.googleapis.com/v17/customers/${idLimpio}/googleAds:search`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "developer-token": tokenExtra,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query: "SELECT customer.descriptive_name FROM customer LIMIT 1" }),
      });
      const datos = await respuesta.json();
      if (!respuesta.ok) return { ok: false, mensaje: datos?.error?.message || `Google Ads respondio ${respuesta.status}.` };
      const nombre = datos.results?.[0]?.customer?.descriptiveName;
      return { ok: true, mensaje: nombre ? `Conectado a "${nombre}".` : "La clave es valida." };
    }
    if (plataforma === "linkedin") {
      const respuesta = await fetch(`https://api.linkedin.com/rest/adAccounts/${cuentaId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          "LinkedIn-Version": "202401",
          "X-Restli-Protocol-Version": "2.0.0",
        },
      });
      const datos = await respuesta.json();
      if (!respuesta.ok) return { ok: false, mensaje: datos?.message || `LinkedIn respondio ${respuesta.status}.` };
      return { ok: true, mensaje: `Conectado a "${datos.name || cuentaId}".` };
    }
    if (plataforma === "chatgpt") {
      const params = new URLSearchParams();
      params.append("aggregation_level", "account");
      params.append("time_granularity", "none");
      const hoy = new Date().toISOString().slice(0, 10);
      params.append("time_ranges[]", JSON.stringify({ type: "date_range", since: hoy, until: hoy, timezone: "America/Lima" }));
      params.append("fields[]", "impressions");
      const respuesta = await fetch(`https://api.ads.openai.com/v1/ad_account/insights?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const datos = await respuesta.json().catch(() => null);
      if (!respuesta.ok) return { ok: false, mensaje: datos?.error?.message || `ChatGPT Ads respondio ${respuesta.status}.` };
      return { ok: true, mensaje: "La clave de ChatGPT Ads es valida." };
    }
  } catch (error) {
    return { ok: false, mensaje: `No se pudo contactar a la plataforma: ${error.message}` };
  }
}

const hayAlguna = (plataforma) => {
  const info = PLATAFORMAS[plataforma];
  if (!info) return false;
  return Boolean(
    obtenerToken(plataforma) &&
      (info.sinCuenta || obtenerCuentaId(plataforma)) &&
      (!info.envExtra || obtenerTokenExtra(plataforma))
  );
};

module.exports = { PLATAFORMAS, obtenerToken, obtenerCuentaId, obtenerTokenExtra, estado, guardar, probar, hayAlguna };
