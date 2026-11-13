(function () {
  var C = window.FOTOFACE || {};
  var SISTEMA = (C.sistema || "").replace(/\/+$/, "");

  document.getElementById("anio").textContent = new Date().getFullYear();

  // Menú móvil
  var boton = document.querySelector(".menu-boton");
  var menu = document.getElementById("menu");
  boton.addEventListener("click", function () {
    var abierto = menu.classList.toggle("abierto");
    boton.setAttribute("aria-expanded", String(abierto));
  });
  menu.addEventListener("click", function (e) {
    if (e.target.tagName === "A") {
      menu.classList.remove("abierto");
      boton.setAttribute("aria-expanded", "false");
    }
  });

  // Cabecera con fondo al hacer scroll
  var cab = document.getElementById("cabecera");
  function alScroll() {
    cab.classList.toggle("con-fondo", window.scrollY > 20);
  }
  window.addEventListener("scroll", alScroll, { passive: true });
  alScroll();

  // WhatsApp y dirección (desde config.js)
  if (C.whatsapp) {
    var url = "https://wa.me/" + C.whatsapp + "?text=" + encodeURIComponent("Hola FotoFace, quisiera información");
    document.querySelectorAll(".js-whatsapp").forEach(function (a) {
      a.href = url;
      a.target = "_blank";
      a.rel = "noopener";
      a.hidden = false;
    });
  }
  if (C.direccion) document.querySelector(".js-direccion").textContent = C.direccion;

  // Formulario
  var form = document.getElementById("formulario");
  var estado = form.querySelector(".estado");

  function tipoActual() {
    return form.querySelector('input[name="tipo"]:checked').value;
  }
  function actualizarVista() {
    var sesion = tipoActual() === "sesion";
    form.querySelector(".solo-sesion").hidden = !sesion;
    form.querySelector(".solo-impresion").hidden = sesion;
    form.querySelectorAll(".t-imp").forEach(function (el) { el.hidden = sesion; });
    form.querySelectorAll(".t-ses").forEach(function (el) { el.hidden = !sesion; });
    form.productos.placeholder = sesion
      ? "Ej.: sesión familiar de 5 personas, estilo natural"
      : "Ej.: 30 fotos 10x15 brillo · 1 canvas 40x60";
    var domicilio = form.querySelector('input[name="entrega"]:checked').value === "domicilio";
    form.querySelector(".solo-domicilio").hidden = sesion || !domicilio;
  }
  form.addEventListener("change", actualizarVista);
  actualizarVista();

  // Enlaces "Reservar una sesión" preseleccionan el tipo
  document.querySelectorAll('[data-tipo="sesion"]').forEach(function (a) {
    a.addEventListener("click", function () {
      form.querySelector('input[name="tipo"][value="sesion"]').checked = true;
      actualizarVista();
    });
  });

  function mostrar(msg, tipo) {
    estado.textContent = msg;
    estado.className = "estado " + (tipo || "");
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var tipo = tipoActual();
    var datos = {
      tipo: tipo,
      nombre: form.nombre.value.trim(),
      whatsapp: form.whatsapp.value.trim(),
      email: form.email.value.trim(),
      servicio: form.servicio.value,
      productos: form.productos.value.trim(),
      fotos_enlace: form.fotos_enlace.value.trim(),
      entrega: form.querySelector('input[name="entrega"]:checked').value,
      direccion: form.direccion.value.trim(),
      fecha_deseada: form.fecha_deseada.value.trim(),
      sitio_web: form.sitio_web.value,
    };
    if (!datos.nombre) return mostrar("Escribe tu nombre.", "error");
    if (datos.whatsapp.replace(/\D/g, "").length < 9) return mostrar("Escribe un número de WhatsApp válido.", "error");
    if (tipo === "impresion" && !datos.productos) return mostrar("Cuéntanos qué quieres imprimir.", "error");
    if (tipo === "impresion" && datos.entrega === "domicilio" && !datos.direccion)
      return mostrar("Escribe la dirección de entrega.", "error");

    var enviar = form.querySelector('button[type="submit"]');
    enviar.disabled = true;
    mostrar("Enviando…");
    fetch(SISTEMA + "/api/publico/pedido", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(datos),
    })
      .then(function (r) {
        return r.json().then(function (j) {
          if (!r.ok) throw new Error(j.error || "No se pudo enviar.");
          return j;
        });
      })
      .then(function (j) {
        form.reset();
        actualizarVista();
        mostrar(
          "¡Listo! Recibimos tu solicitud" + (j.codigo ? " (código " + j.codigo + ")" : "") +
            ". Te escribiremos por WhatsApp muy pronto.",
          "ok"
        );
      })
      .catch(function (err) {
        mostrar(err.message + (C.whatsapp ? " También puedes escribirnos por WhatsApp." : ""), "error");
      })
      .finally(function () {
        enviar.disabled = false;
      });
  });

  // Chat de Lumi (sistema agéntico de FotoFace)
  if (SISTEMA) {
    var s = document.createElement("script");
    s.src = SISTEMA + "/widget.js";
    s.defer = true;
    s.setAttribute("data-color", "#c9432b");
    document.body.appendChild(s);
  }
})();
