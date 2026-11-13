const conversacionesService = require("./conversaciones");
const clavesIA = require("./clavesIA");

const MAX_TOKENS = 1024;
const MAX_ITERACIONES_TOOLS = 5;

// Bucle de herramientas (con la salvaguarda anti-alucinacion) para APIs
// compatibles con OpenAI: ChatGPT (nivel de razonamiento y acciones),
// OpenRouter (respaldo) y DeepSeek cuando es el unico proveedor configurado.
// Ver la estrategia de niveles en claude.js (procesarMensajeInterno).
const PROVEEDORES = {
  openai: { nombre: "ChatGPT", url: "https://api.openai.com/v1/chat/completions" },
  openrouter: { nombre: "OpenRouter", url: "https://openrouter.ai/api/v1/chat/completions" },
  deepseek: { nombre: "DeepSeek", url: "https://api.deepseek.com/chat/completions" },
};
// Los modelos de razonamiento de OpenAI (gpt-5*, o*) usan max_completion_tokens
// y gastan parte del limite en "pensar": se les da mas margen.
const MAX_TOKENS_OPENAI = 4096;

const HERRAMIENTAS_MUTANTES = ["agendar_turno", "cancelar_turno", "reprogramar_turno", "registrar_inscripcion", "registrar_pedido"];

// Consultar el estado de algo existente (turnos, inscripciones) y contarselo
// al cliente ("tu inscripcion ya esta confirmada") no es una confirmacion
// fabricada: si en el turno se llamo alguna de estas, no se frena.
const HERRAMIENTAS_DE_ESTADO = ["ver_turnos_paciente", "ver_inscripciones", "ver_pedidos"];

// Misma salvaguarda anti-alucinacion que en claude.js: estos proveedores solo
// se usan cuando DeepSeek escala o cuando falla Claude, pero tienen las mismas
// tools mutantes disponibles, asi que corren el mismo riesgo de "confirmar" en
// texto una accion que nunca ejecutaron.
const VERBOS_CONFIRMACION_ACCION =
  "(confirmad[oa]|agendad[oa]|reprogramad[oa]|cancelad[oa]|reservad[oa]|registrad[oa]|inscrit[oa]|agend[oé]|reprogram[oé]|cancel[oé]|confirm[oé]|reserv[oé]|registr[eé]|inscrib[ií])";
const PATRON_CONFIRMACION_ACCION = new RegExp(
  "\\b(cita|turno|reuni[oó]n|asesor[ií]a|inscripci[oó]n)\\b[^.!?\\n]{0,40}\\b" +
    VERBOS_CONFIRMACION_ACCION +
    "|\\b" +
    VERBOS_CONFIRMACION_ACCION +
    "[^.!?\\n]{0,40}\\b(cita|turno|reuni[oó]n|asesor[ií]a|inscripci[oó]n)\\b|id\\s*de\\s*(turno|inscripci[oó]n)|turno\\s*#\\s*\\d+",
  "i"
);

const MENSAJE_CORRECTIVO_CONFIRMACION_SIN_TOOL =
  "[Sistema] Tu respuesta anterior da a entender que se agendo, cancelo o reprogramo un turno, o que se registro una inscripcion, pero no se detecto ninguna llamada real a esa herramienta en este turno. Si el cliente pidio una accion nueva (agendar, cancelar, reprogramar o inscribirse), DEBES llamar ahora mismo la herramienta correspondiente antes de confirmar nada; nunca repitas una confirmacion sin haberla ejecutado, ni inventes un ID. Si en realidad solo estabas informando sobre algo ya existente (por ejemplo, resultado de ver_turnos_paciente o ver_inscripciones), vuelve a responder de forma normal.";

function estaHabilitado(proveedor = "openrouter") {
  return Boolean(clavesIA.obtenerClave(proveedor));
}

function toolsAFormatoOpenAI(tools) {
  return tools.map((tool) => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.input_schema,
    },
  }));
}

async function llamarApi(proveedor, body) {
  const headers = {
    Authorization: `Bearer ${clavesIA.obtenerClave(proveedor)}`,
    "Content-Type": "application/json",
  };
  if (proveedor === "openrouter") {
    if (process.env.OPENROUTER_SITE_URL) headers["HTTP-Referer"] = process.env.OPENROUTER_SITE_URL;
    if (process.env.OPENROUTER_APP_NAME) headers["X-Title"] = process.env.OPENROUTER_APP_NAME;
  }

  const respuesta = await fetch(PROVEEDORES[proveedor].url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!respuesta.ok) {
    const texto = await respuesta.text();
    throw new Error(`${PROVEEDORES[proveedor].nombre} respondio ${respuesta.status}: ${texto}`);
  }

  return respuesta.json();
}

/**
 * Procesa la conversacion usando una API compatible con OpenAI (ChatGPT,
 * OpenRouter o DeepSeek con todas las herramientas).
 * `mensajes` viene en formato simple { role, content } (Anthropic-compatible),
 * que tambien es valido para la API de chat completions de OpenAI.
 * `tools` viene en formato Anthropic (name, description, input_schema) y se
 * convierte aca al formato de OpenAI. `ejecutarTool` es el ejecutor compartido
 * que ya usa el proveedor de Claude.
 */
async function procesarMensaje(system, mensajes, tools, ejecutarTool, numeroTelefono, proveedor = "openrouter") {
  const nombre = PROVEEDORES[proveedor].nombre;
  if (!estaHabilitado(proveedor)) {
    throw new Error(`${nombre} no esta configurado (falta su API key).`);
  }

  const toolsOpenAI = toolsAFormatoOpenAI(tools);
  const messages = [{ role: "system", content: system }, ...mensajes];

  let huboMutacionExitosa = false;
  let huboConsultaDeEstado = false;
  let intentosCorrectivos = 0;

  for (let iteracion = 0; iteracion < MAX_ITERACIONES_TOOLS; iteracion++) {
    const data = await llamarApi(proveedor, {
      model: clavesIA.obtenerModelo(proveedor),
      ...(proveedor === "openai" ? { max_completion_tokens: MAX_TOKENS_OPENAI } : { max_tokens: MAX_TOKENS }),
      messages,
      tools: toolsOpenAI,
    });

    const mensaje = data.choices?.[0]?.message;
    if (!mensaje) {
      throw new Error(`Respuesta invalida de ${nombre} (sin mensaje).`);
    }

    if (!mensaje.tool_calls || mensaje.tool_calls.length === 0) {
      const texto = mensaje.content || "";

      if (!huboMutacionExitosa && !huboConsultaDeEstado && PATRON_CONFIRMACION_ACCION.test(texto)) {
        if (intentosCorrectivos === 0) {
          intentosCorrectivos++;
          console.warn(
            `[${new Date().toISOString()}] Posible confirmacion fabricada de ${nombre} para ${numeroTelefono}, pidiendo correccion:`,
            texto
          );
          messages.push(mensaje);
          messages.push({ role: "user", content: MENSAJE_CORRECTIVO_CONFIRMACION_SIN_TOOL });
          continue;
        }

        console.error(
          `[${new Date().toISOString()}] ${nombre} insistio con una confirmacion sin ejecutar la herramienta real para ${numeroTelefono}. Se descarta y se deriva a un humano.`
        );
        if (numeroTelefono) {
          conversacionesService.cambiarModo(numeroTelefono, "humano");
        }
        return "Disculpe, necesito que el equipo confirme ese cambio manualmente antes de decirle algo en firme — en breve le escriben por aquí para confirmarlo.";
      }

      return texto;
    }

    messages.push(mensaje);

    for (const toolCall of mensaje.tool_calls) {
      let input = {};
      try {
        input = JSON.parse(toolCall.function.arguments || "{}");
      } catch (error) {
        input = {};
      }
      const resultado = await ejecutarTool(toolCall.function.name, input);
      if (HERRAMIENTAS_MUTANTES.includes(toolCall.function.name) && resultado?.exito !== false) {
        huboMutacionExitosa = true;
      }
      if (HERRAMIENTAS_DE_ESTADO.includes(toolCall.function.name)) {
        huboConsultaDeEstado = true;
      }
      messages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: JSON.stringify(resultado),
      });
    }
  }

  throw new Error(`Se alcanzo el limite de iteraciones de herramientas sin una respuesta final (${nombre}).`);
}

module.exports = { estaHabilitado, procesarMensaje };
