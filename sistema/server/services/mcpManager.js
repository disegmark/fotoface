const fs = require("fs");
const path = require("path");
const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
const { StdioClientTransport } = require("@modelcontextprotocol/sdk/client/stdio.js");
const { StreamableHTTPClientTransport } = require("@modelcontextprotocol/sdk/client/streamableHttp.js");

const PREFIJO = "mcp__";
const TIMEOUT_CONEXION_MS = 10000;

const HABILITADO = process.env.MCP_ENABLED === "true";
const RUTA_CONFIG = process.env.MCP_CONFIG_PATH
  ? path.isAbsolute(process.env.MCP_CONFIG_PATH)
    ? process.env.MCP_CONFIG_PATH
    : path.join(__dirname, "..", "..", process.env.MCP_CONFIG_PATH)
  : path.join(__dirname, "..", "config", "mcpServers.json");

// { nombrePrefixed: { client, nombreOriginal, servidor } }
const toolsRegistradas = new Map();
// tool defs en formato Anthropic (name, description, input_schema)
let toolsParaClaude = [];
let inicializado = false;

// Estado en memoria por servidor (nombre saneado -> { config, client, estado, error, tools }).
// `config` guarda el objeto tal cual esta en el archivo (con los "${VAR}" sin interpolar),
// para poder listarlo en el dashboard sin exponer secretos resueltos.
const servidoresPorNombre = new Map();

function sanitizarNombre(nombre) {
  return String(nombre).replace(/[^a-zA-Z0-9_-]/g, "_");
}

/** Reemplaza "${VAR}" por process.env.VAR en strings, recursivamente en objetos/arrays. */
function interpolarEnv(valor) {
  if (typeof valor === "string") {
    return valor.replace(/\$\{([A-Z0-9_]+)\}/g, (coincidencia, nombreVar) =>
      process.env[nombreVar] !== undefined ? process.env[nombreVar] : coincidencia
    );
  }
  if (Array.isArray(valor)) {
    return valor.map(interpolarEnv);
  }
  if (valor && typeof valor === "object") {
    const resultado = {};
    for (const [clave, val] of Object.entries(valor)) {
      resultado[clave] = interpolarEnv(val);
    }
    return resultado;
  }
  return valor;
}

function leerConfiguracionCruda() {
  if (!fs.existsSync(RUTA_CONFIG)) return [];
  try {
    const contenido = fs.readFileSync(RUTA_CONFIG, "utf-8");
    const servidores = JSON.parse(contenido);
    if (!Array.isArray(servidores)) {
      throw new Error("El archivo debe contener un array de servidores.");
    }
    return servidores;
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error leyendo ${RUTA_CONFIG}:`, error.message);
    return [];
  }
}

function guardarConfiguracionCruda(servidores) {
  fs.mkdirSync(path.dirname(RUTA_CONFIG), { recursive: true });
  fs.writeFileSync(RUTA_CONFIG, JSON.stringify(servidores, null, 2) + "\n", "utf-8");
}

function crearTransporte(servidor) {
  if (servidor.transport === "stdio") {
    return new StdioClientTransport({
      command: servidor.command,
      args: servidor.args || [],
      env: servidor.env || undefined,
      cwd: servidor.cwd || undefined,
    });
  }
  if (servidor.transport === "http") {
    return new StreamableHTTPClientTransport(new URL(servidor.url), {
      requestInit: servidor.headers ? { headers: servidor.headers } : undefined,
    });
  }
  throw new Error(`Transporte MCP desconocido: "${servidor.transport}" (usar "stdio" o "http").`);
}

function conTimeout(promesa, ms, mensaje) {
  return Promise.race([
    promesa,
    new Promise((_, reject) => setTimeout(() => reject(new Error(mensaje)), ms)),
  ]);
}

function quitarToolsDe(nombreServidor) {
  for (const [nombrePrefixed, registro] of toolsRegistradas.entries()) {
    if (registro.servidor === nombreServidor) {
      toolsRegistradas.delete(nombrePrefixed);
    }
  }
  toolsParaClaude = toolsParaClaude.filter((tool) => !tool.name.startsWith(`${PREFIJO}${nombreServidor}__`));
}

/** Conecta (o reconecta) un unico servidor MCP y registra sus tools. Lanza si falla. */
async function conectarServidor(servidorCrudo) {
  const servidor = interpolarEnv(servidorCrudo);
  const nombreServidor = sanitizarNombre(servidor.nombre || "sin_nombre");

  quitarToolsDe(nombreServidor);
  const previo = servidoresPorNombre.get(nombreServidor);
  if (previo?.client) {
    try {
      await previo.client.close();
    } catch (error) {
      // no es critico si falla el cierre de una conexion vieja
    }
  }

  const client = new Client({ name: "nova-whatsapp-bot", version: "1.0.0" });
  const transporte = crearTransporte(servidor);

  try {
    await conTimeout(
      client.connect(transporte),
      TIMEOUT_CONEXION_MS,
      `Timeout conectando al agente MCP "${nombreServidor}".`
    );

    const { tools } = await client.listTools();

    for (const tool of tools) {
      const nombrePrefixed = `${PREFIJO}${nombreServidor}__${sanitizarNombre(tool.name)}`;
      toolsRegistradas.set(nombrePrefixed, { client, nombreOriginal: tool.name, servidor: nombreServidor });
      toolsParaClaude.push({
        name: nombrePrefixed,
        description: `[Agente externo: ${servidor.descripcion || nombreServidor}] ${tool.description || ""}`.trim(),
        input_schema: tool.inputSchema || { type: "object", properties: {} },
      });
    }

    servidoresPorNombre.set(nombreServidor, {
      config: servidorCrudo,
      client,
      estado: "conectado",
      error: null,
      tools: tools.map((t) => t.name),
    });

    console.log(
      `[${new Date().toISOString()}] Agente MCP "${nombreServidor}" conectado (${tools.length} herramientas).`
    );
  } catch (error) {
    servidoresPorNombre.set(nombreServidor, {
      config: servidorCrudo,
      client: null,
      estado: "error",
      error: error.message,
      tools: [],
    });
    throw error;
  }
}

/**
 * Conecta con todos los agentes MCP habilitados en la configuracion. No lanza
 * excepcion si un servidor individual falla: lo omite y sigue con los demas,
 * para que un agente externo caido no tumbe el resto del sistema.
 */
async function inicializar() {
  if (inicializado) return;
  inicializado = true;

  if (!HABILITADO) return;

  const servidores = leerConfiguracionCruda().filter((s) => s.habilitado !== false);
  if (servidores.length === 0) {
    console.log(`[${new Date().toISOString()}] MCP habilitado pero no hay agentes configurados.`);
    return;
  }

  await Promise.all(
    servidores.map((servidor) =>
      conectarServidor(servidor).catch((error) => {
        console.error(
          `[${new Date().toISOString()}] No se pudo conectar al agente MCP "${servidor.nombre}":`,
          error.message
        );
      })
    )
  );
}

function estaHabilitado() {
  return HABILITADO;
}

function obtenerToolsParaClaude() {
  return toolsParaClaude;
}

function esToolMCP(nombre) {
  return typeof nombre === "string" && nombre.startsWith(PREFIJO);
}

/** Convierte el resultado de `callTool` (bloques de contenido MCP) a un valor plano para el modelo. */
function normalizarResultado(resultado) {
  if (resultado.structuredContent !== undefined) {
    return resultado.structuredContent;
  }
  const texto = (resultado.content || [])
    .filter((bloque) => bloque.type === "text")
    .map((bloque) => bloque.text)
    .join("\n");

  try {
    return JSON.parse(texto);
  } catch (error) {
    return { resultado: texto };
  }
}

async function ejecutarTool(nombrePrefixed, input) {
  const registro = toolsRegistradas.get(nombrePrefixed);
  if (!registro) {
    return { exito: false, mensaje: `Herramienta MCP desconocida: ${nombrePrefixed}` };
  }

  const resultado = await registro.client.callTool({ name: registro.nombreOriginal, arguments: input });

  if (resultado.isError) {
    return { exito: false, mensaje: normalizarResultado(resultado) };
  }
  return normalizarResultado(resultado);
}

function listarAgentesConectados() {
  const agentes = new Map();
  for (const [, registro] of toolsRegistradas.entries()) {
    if (!agentes.has(registro.servidor)) {
      agentes.set(registro.servidor, []);
    }
    agentes.get(registro.servidor).push(registro.nombreOriginal);
  }
  return Array.from(agentes.entries()).map(([nombre, tools]) => ({ nombre, tools }));
}

/** Lista completa para el dashboard: config guardada (sin resolver secretos) + estado de conexion actual. */
function listarConfiguracion() {
  const servidores = leerConfiguracionCruda();
  return servidores.map((servidor) => {
    const nombreServidor = sanitizarNombre(servidor.nombre || "sin_nombre");
    const estado = servidoresPorNombre.get(nombreServidor);
    return {
      ...servidor,
      estado: estado?.estado || (servidor.habilitado === false ? "deshabilitado" : "desconectado"),
      error: estado?.error || null,
      tools: estado?.tools || [],
    };
  });
}

/** Agrega un servidor nuevo al archivo de configuracion y, si MCP esta habilitado, lo conecta ya mismo. */
async function agregarServidor(servidorNuevo) {
  const servidores = leerConfiguracionCruda();
  const nombreSaneado = sanitizarNombre(servidorNuevo.nombre || "");

  if (!nombreSaneado) {
    throw new Error('El campo "nombre" es requerido.');
  }
  if (servidores.some((s) => sanitizarNombre(s.nombre) === nombreSaneado)) {
    throw new Error(`Ya existe un agente MCP con el nombre "${servidorNuevo.nombre}".`);
  }
  if (!["stdio", "http"].includes(servidorNuevo.transport)) {
    throw new Error('El campo "transport" debe ser "stdio" o "http".');
  }
  if (servidorNuevo.transport === "http" && !servidorNuevo.url) {
    throw new Error('Falta "url" para un agente de transporte http.');
  }
  if (servidorNuevo.transport === "stdio" && !servidorNuevo.command) {
    throw new Error('Falta "command" para un agente de transporte stdio.');
  }

  servidores.push(servidorNuevo);
  guardarConfiguracionCruda(servidores);

  if (HABILITADO && servidorNuevo.habilitado !== false) {
    await conectarServidor(servidorNuevo);
  }
}

/** Quita un servidor del archivo de configuracion y cierra su conexion si estaba activa. */
async function eliminarServidor(nombre) {
  const nombreSaneado = sanitizarNombre(nombre);
  const servidores = leerConfiguracionCruda();
  const restantes = servidores.filter((s) => sanitizarNombre(s.nombre) !== nombreSaneado);

  if (restantes.length === servidores.length) {
    throw new Error(`No se encontro un agente MCP con el nombre "${nombre}".`);
  }

  guardarConfiguracionCruda(restantes);

  const estado = servidoresPorNombre.get(nombreSaneado);
  if (estado?.client) {
    try {
      await estado.client.close();
    } catch (error) {
      // no critico
    }
  }
  quitarToolsDe(nombreSaneado);
  servidoresPorNombre.delete(nombreSaneado);
}

/** Habilita o deshabilita un servidor existente sin borrar su configuracion. */
async function cambiarHabilitado(nombre, habilitado) {
  const nombreSaneado = sanitizarNombre(nombre);
  const servidores = leerConfiguracionCruda();
  const servidor = servidores.find((s) => sanitizarNombre(s.nombre) === nombreSaneado);

  if (!servidor) {
    throw new Error(`No se encontro un agente MCP con el nombre "${nombre}".`);
  }

  servidor.habilitado = habilitado;
  guardarConfiguracionCruda(servidores);

  if (!habilitado) {
    const estado = servidoresPorNombre.get(nombreSaneado);
    if (estado?.client) {
      try {
        await estado.client.close();
      } catch (error) {
        // no critico
      }
    }
    quitarToolsDe(nombreSaneado);
    servidoresPorNombre.set(nombreSaneado, { config: servidor, client: null, estado: "deshabilitado", error: null, tools: [] });
  } else if (HABILITADO) {
    await conectarServidor(servidor);
  }
}

module.exports = {
  inicializar,
  estaHabilitado,
  obtenerToolsParaClaude,
  esToolMCP,
  ejecutarTool,
  listarAgentesConectados,
  listarConfiguracion,
  agregarServidor,
  eliminarServidor,
  cambiarHabilitado,
};
