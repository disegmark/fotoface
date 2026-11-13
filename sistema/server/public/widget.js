/*
 * Widget de chat de FotoFace (Lumi). Se incluye en cualquier pagina con:
 *   <script src="https://TU-SERVIDOR/widget.js" defer></script>
 * Aislado en Shadow DOM para que los estilos del sitio no lo afecten.
 */
(function () {
  if (window.__fotofaceCargado) return;
  window.__fotofaceCargado = true;

  var script = document.currentScript;
  var BASE = script ? new URL(script.src).origin : "";
  var COLOR = (script && script.getAttribute("data-color")) || "#c9432b";
  var CLAVE_SESION = "fotoface_chat_sesion";
  var INTERVALO_POLLING = 6000;

  function leerSesion() {
    try {
      var s = localStorage.getItem(CLAVE_SESION);
      if (s && /^[A-Za-z0-9-]{16,64}$/.test(s)) return s;
    } catch (e) {}
    var nueva =
      window.crypto && crypto.randomUUID
        ? crypto.randomUUID()
        : "s" + Date.now().toString(36) + Math.random().toString(36).slice(2, 12) + Math.random().toString(36).slice(2, 12);
    try {
      localStorage.setItem(CLAVE_SESION, nueva);
    } catch (e) {}
    return nueva;
  }

  var sesion = leerSesion();
  var ultimoId = 0;
  var abierto = false;
  var enviando = false;
  var pollTimer = null;
  var config = { nombre: "FotoFace", bienvenida: "¡Hola! 👋 Soy Lumi. ¿En qué le puedo ayudar hoy?" };

  function api(ruta, opciones) {
    return fetch(BASE + "/api/webchat" + ruta, opciones).then(function (r) {
      return r.json().then(function (data) {
        if (!r.ok) throw new Error(data.error || "Error de conexión.");
        return data;
      });
    });
  }

  // ---------- UI ----------
  var host = document.createElement("div");
  host.id = "fotoface-chat-host";
  var root = host.attachShadow({ mode: "open" });
  root.innerHTML =
    "<style>" +
    ":host{all:initial}" +
    "*{box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif}" +
    ".boton{position:fixed;right:20px;bottom:20px;width:60px;height:60px;border-radius:50%;border:0;cursor:pointer;background:linear-gradient(135deg,#c9432b,#38d3ff);color:#fff;box-shadow:0 6px 20px rgba(10,20,40,.35);display:flex;align-items:center;justify-content:center;z-index:2147483646;transition:transform .15s}" +
    ".boton:hover{transform:scale(1.06)}" +
    ".boton svg{width:28px;height:28px;fill:#fff}" +
    ".panel{position:fixed;right:20px;bottom:92px;width:370px;max-width:calc(100vw - 24px);height:540px;max-height:calc(100vh - 110px);background:#0d1326;border:1px solid rgba(255,255,255,.08);border-radius:16px;box-shadow:0 12px 40px rgba(0,0,0,.4);display:none;flex-direction:column;overflow:hidden;z-index:2147483646}" +
    ".panel.abierto{display:flex}" +
    ".cab{background:linear-gradient(135deg,#0a0e1f,#152454);color:#fff;padding:14px 16px;display:flex;align-items:center;justify-content:space-between;border-bottom:3px solid " + COLOR + "}" +
    ".cab b{font-size:15px;display:block}" +
    ".cab small{font-size:12px;opacity:.75}" +
    ".cerrar{background:none;border:0;color:#fff;font-size:24px;cursor:pointer;line-height:1;padding:0 4px}" +
    ".msgs{flex:1;overflow-y:auto;padding:14px;background:#0a0e1f;display:flex;flex-direction:column;gap:8px}" +
    ".m{max-width:82%;padding:9px 12px;border-radius:14px;font-size:14px;line-height:1.4;white-space:pre-wrap;word-wrap:break-word}" +
    ".m.bot,.m.humano{background:#161d38;color:#e6e9f5;align-self:flex-start;border-bottom-left-radius:4px;box-shadow:0 1px 2px rgba(0,0,0,.2)}" +
    ".m.humano{border-left:3px solid " + COLOR + "}" +
    ".m.yo{background:" + COLOR + ";color:#fff;align-self:flex-end;border-bottom-right-radius:4px}" +
    ".m.sistema{align-self:center;background:transparent;color:#8891b0;font-size:12px;box-shadow:none;text-align:center}" +
    ".escribiendo{display:none;align-self:flex-start;color:#8891b0;font-size:13px;padding:2px 6px}" +
    ".escribiendo.on{display:block}" +
    "form{display:flex;gap:8px;padding:10px;border-top:1px solid rgba(255,255,255,.08);background:#0d1326}" +
    "input{flex:1;border:1px solid rgba(255,255,255,.15);background:#151b33;color:#fff;border-radius:20px;padding:10px 14px;font-size:14px;outline:none}" +
    "input::placeholder{color:#6b7394}" +
    "input:focus{border-color:" + COLOR + "}" +
    ".enviar{border:0;background:" + COLOR + ";color:#fff;border-radius:20px;padding:0 16px;font-size:14px;cursor:pointer}" +
    ".enviar:disabled{opacity:.5;cursor:default}" +
    "@media(max-width:480px){.panel{right:8px;bottom:84px;height:calc(100vh - 100px)}}" +
    "</style>" +
    '<button class="boton" aria-label="Abrir chat con Lumi" title="Chatea con Lumi"><svg viewBox="0 0 24 24"><path d="M12 3C6.48 3 2 6.58 2 11c0 2.39 1.31 4.53 3.38 6L4.5 21l4.27-2.13c1.02.25 2.1.38 3.23.38 5.52 0 10-3.58 10-8s-4.48-8-10-8zM7.5 12.25a1.25 1.25 0 110-2.5 1.25 1.25 0 010 2.5zm4.5 0a1.25 1.25 0 110-2.5 1.25 1.25 0 010 2.5zm4.5 0a1.25 1.25 0 110-2.5 1.25 1.25 0 010 2.5z"/></svg></button>' +
    '<div class="panel" role="dialog" aria-label="Chat">' +
    '<div class="cab"><div><b class="titulo">FotoFace</b><small>Lumi · Asistente virtual</small></div><button class="cerrar" aria-label="Cerrar">×</button></div>' +
    '<div class="msgs"></div>' +
    '<div class="escribiendo">Lumi está escribiendo…</div>' +
    '<form><input type="text" maxlength="1000" placeholder="Escribe tu mensaje…" autocomplete="off"><button class="enviar" type="submit">Enviar</button></form>' +
    "</div>";

  var $boton = root.querySelector(".boton");
  var $panel = root.querySelector(".panel");
  var $msgs = root.querySelector(".msgs");
  var $escribiendo = root.querySelector(".escribiendo");
  var $form = root.querySelector("form");
  var $input = root.querySelector("input");
  var $enviar = root.querySelector(".enviar");

  // Escapa HTML y convierte *texto* (formato de WhatsApp que usa Lumi) en negrita.
  function formatear(texto) {
    var seguro = texto.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    return seguro.replace(/\*([^*\n]+)\*/g, "<strong>$1</strong>");
  }

  function pintar(clase, texto) {
    var el = document.createElement("div");
    el.className = "m " + clase;
    el.innerHTML = formatear(texto);
    $msgs.appendChild(el);
    $msgs.scrollTop = $msgs.scrollHeight;
  }

  function pintarMensajeServidor(m) {
    if (m.id > ultimoId) ultimoId = m.id;
    pintar(m.remitente === "usuario" ? "yo" : m.remitente === "humano" ? "humano" : "bot", m.texto);
  }

  function cargarHistorial() {
    return api("/mensajes?sesion=" + encodeURIComponent(sesion)).then(function (data) {
      $msgs.innerHTML = "";
      ultimoId = 0;
      if (!data.mensajes.length) {
        pintar("bot", config.bienvenida);
      }
      data.mensajes.forEach(pintarMensajeServidor);
      if (data.modo === "humano") pintar("sistema", "Un asesor de nuestro equipo te responderá en breve.");
    });
  }

  function consultarNuevos() {
    if (!abierto || enviando || document.hidden) return;
    api("/mensajes?sesion=" + encodeURIComponent(sesion) + "&desde=" + ultimoId)
      .then(function (data) {
        data.mensajes.forEach(pintarMensajeServidor);
      })
      .catch(function () {});
  }

  function alternar(mostrar) {
    abierto = mostrar;
    $panel.classList.toggle("abierto", mostrar);
    if (mostrar) {
      cargarHistorial().catch(function () {
        pintar("sistema", "No se pudo conectar con el chat. Inténtalo de nuevo más tarde.");
      });
      $input.focus();
      pollTimer = setInterval(consultarNuevos, INTERVALO_POLLING);
    } else {
      clearInterval(pollTimer);
    }
  }

  $boton.addEventListener("click", function () {
    alternar(!abierto);
  });
  root.querySelector(".cerrar").addEventListener("click", function () {
    alternar(false);
  });

  $form.addEventListener("submit", function (e) {
    e.preventDefault();
    var texto = $input.value.trim();
    if (!texto || enviando) return;

    enviando = true;
    $input.value = "";
    $enviar.disabled = true;
    pintar("yo", texto);
    $escribiendo.classList.add("on");
    $msgs.scrollTop = $msgs.scrollHeight;

    api("/mensaje", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sesion: sesion, texto: texto }),
    })
      .then(function (data) {
        // El primer mensaje ("yo") ya esta pintado; solo se avanza el cursor y
        // se muestran las respuestas (el mensaje del usuario vuelve solo en modo humano).
        data.mensajes.forEach(function (m) {
          if (m.remitente === "usuario") {
            if (m.id > ultimoId) ultimoId = m.id;
          } else {
            pintarMensajeServidor(m);
          }
        });
        if (data.modo === "humano") pintar("sistema", "Un asesor de nuestro equipo te responderá en breve.");
      })
      .catch(function (err) {
        pintar("sistema", err.message);
      })
      .then(function () {
        enviando = false;
        $enviar.disabled = false;
        $escribiendo.classList.remove("on");
        $input.focus();
      });
  });

  function montar() {
    document.body.appendChild(host);
    api("/config")
      .then(function (c) {
        config = c;
        root.querySelector(".titulo").textContent = c.nombre;
      })
      .catch(function () {});
  }

  if (document.body) montar();
  else document.addEventListener("DOMContentLoaded", montar);
})();
