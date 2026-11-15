const tarjetas = require("./tarjetas");
const { TEMAS, esc } = require("./tarjetaPagina");

/*
 * Vitrina publica de tarjetas digitales (tarjetas.fotoface.pro).
 * Muestra lo que incluyen, los estilos disponibles y las tarjetas publicadas
 * que el equipo marco como muestra (Tarjetas digitales > tarjeta > Datos >
 * "Mostrar en la vitrina"). La creacion y gestion se hace en el sistema.
 */

const NOMBRES_TEMA = {
  marfil: "Marfil y oro",
  salvia: "Verde salvia",
  rubor: "Rosa rubor",
  cielo: "Celeste cielo",
  noche: "Noche dorada",
  terracota: "Terracota",
  fiesta: "Fiesta",
  lavanda: "Lavanda",
};

const EJEMPLO_TEMA = {
  marfil: "José & María",
  salvia: "Ana & Luis",
  rubor: "Valentina · 15",
  cielo: "Mateo",
  noche: "Bodas de plata",
  terracota: "Camila & Diego",
  fiesta: "¡Sofía cumple 6!",
  lavanda: "Isabella",
};

const WEB = "https://fotoface.pro";

const ICONOS = {
  sobre: '<path d="M3 7l9 6 9-6M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z"/>',
  musica: '<path d="M9 18V5l11-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm11-2a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"/>',
  reloj: '<path d="M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"/>',
  mapa: '<path d="M12 21s7-6.1 7-11.5A7 7 0 0 0 5 9.5C5 14.9 12 21 12 21Z"/><circle cx="12" cy="9.5" r="2.5"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  galeria: '<path d="M4 5h16v14H4zM4 15l4-4 4 4 3-3 5 5"/><circle cx="15.5" cy="8.5" r="1.5"/>',
  firma: '<path d="M4 20h16M6 16l9.5-9.5a2.1 2.1 0 0 1 3 3L9 19H6v-3Z"/>',
  regalo: '<path d="M4 11h16v9H4zM3 7h18v4H3zM12 7v13M12 7S10.5 3 8 4s0 3 4 3Zm0 0s1.5-4 4-3 0 3-4 3Z"/>',
  ojo: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  compartir: '<path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4M21 5a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM9 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm12 7a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"/>',
};

function icono(nombre) {
  return `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONOS[nombre]}</svg>`;
}

const FUNCIONES = [
  ["sobre", "Apertura animada", "Tu invitado abre un sobre con sello de lacre o un telón antes de ver la tarjeta."],
  ["musica", "Música de fondo", "La canción que elijas suena mientras recorren la invitación."],
  ["reloj", "Cuenta regresiva", "Días, horas y minutos para el gran día, y un botón para agendarlo en el calendario."],
  ["mapa", "Lugares con mapa", "Ceremonia y recepción con dirección, hora y botón directo a Google Maps."],
  ["check", "Confirmación de asistencia", "Los invitados confirman desde la tarjeta, con número de pases y menú."],
  ["galeria", "Galería de fotos", "Tus mejores fotos (o la sesión que hagamos en FotoFace) dentro de la invitación."],
  ["firma", "Libro de firmas", "Mensajes y buenos deseos que quedan guardados como recuerdo."],
  ["regalo", "Mesa de regalos", "Cuentas, Yape o lista de regalos, con botón para copiar los datos."],
  ["ojo", "Vista del anfitrión", "Un enlace privado para ver en tiempo real quién confirmó y cuántos serán."],
  ["compartir", "Tu propio enlace", "Cada tarjeta vive en su dirección, como tusnombres.fotoface.pro, lista para WhatsApp."],
];

function portadaMuestra(m) {
  const t = TEMAS[m.tema] || TEMAS.marfil;
  if (m.foto) {
    return `<div class="m-portada" style="background-image:url('${esc(`${m.url}/media/${encodeURIComponent(m.foto)}`)}')"><span class="m-velo"></span></div>`;
  }
  return `<div class="m-portada m-sin-foto" style="background:${t.bg};color:${t.ink}">
    <span class="m-orn" style="color:${t.accent}">✦</span>
    <span class="m-script" style="font-family:'${esc(t.script)}',cursive;color:${t.accent}">${esc(m.titulo)}</span>
  </div>`;
}

function renderMuestras(muestras) {
  if (!muestras.length) {
    return `<div class="vacio">
      <p><b>Estamos preparando nuevas muestras.</b></p>
      <p>Mientras tanto, mira los estilos de abajo o escríbele a Lumi en el chat: te mostramos ejemplos por WhatsApp.</p>
    </div>`;
  }
  return `<div class="muestras">${muestras
    .map(
      (m) => `<article class="muestra">
        ${portadaMuestra(m)}
        <div class="m-cuerpo">
          <span class="chip">${esc(m.tipo_nombre)}</span>
          <h3>${esc(m.titulo)}</h3>
          ${m.descripcion ? `<p>${esc(m.descripcion)}</p>` : `<p>Estilo ${esc(NOMBRES_TEMA[m.tema] || "")}${m.apertura ? ` · apertura con ${m.apertura === "telon" ? "telón" : "sobre"}` : ""}.</p>`}
          <a class="boton boton-chico" href="${esc(m.url)}" target="_blank" rel="noopener">Abrir tarjeta ↗</a>
        </div>
      </article>`
    )
    .join("")}</div>`;
}

function renderEstilos() {
  return `<div class="estilos">${Object.keys(NOMBRES_TEMA)
    .map((k) => {
      const t = TEMAS[k];
      return `<figure class="estilo" style="background:${t.bg};color:${t.ink}">
        <span class="e-borde" style="border-color:${t.accent2}"></span>
        <span class="e-orn" style="color:${t.accent}">— ✦ —</span>
        <span class="e-script" style="font-family:'${esc(t.script)}',cursive;color:${t.accent}">${esc(EJEMPLO_TEMA[k])}</span>
        <figcaption style="color:${t.muted}">${esc(NOMBRES_TEMA[k])}</figcaption>
      </figure>`;
    })
    .join("")}</div>`;
}

function renderVitrina() {
  const muestras = tarjetas.listarVitrina();
  const ocasiones = Object.values(tarjetas.TIPOS);
  const sistema = (process.env.PUBLIC_BASE_URL || "https://fotoface.ia.nom.pe").replace(/\/$/, "");
  const canonica = `https://${tarjetas.VITRINA_HOST}/`;
  const descripcion =
    "Invitaciones digitales interactivas de FotoFace para bodas, bautizos, quince años, cumpleaños y más: apertura animada, música, cuenta regresiva, mapa y confirmación de asistencia.";

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Tarjetas digitales interactivas | FotoFace</title>
<meta name="description" content="${esc(descripcion)}">
<link rel="canonical" href="${esc(canonica)}">
<link rel="icon" type="image/png" href="/favicon.png"><link rel="apple-touch-icon" href="/apple-touch-icon.png">
<meta property="og:title" content="Tarjetas digitales interactivas | FotoFace">
<meta property="og:description" content="${esc(descripcion)}">
<meta property="og:type" content="website">
<meta property="og:url" content="${esc(canonica)}">
<meta property="og:image" content="${WEB}/assets/img/logo-fotoface.png">
<meta name="theme-color" content="#0b2239">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,700&family=DM+Sans:wght@400;500;700&family=Great+Vibes&family=Parisienne&family=Allura&family=Pinyon+Script&family=Pacifico&display=swap" rel="stylesheet">
<style>${CSS}</style>
</head>
<body>
<a class="saltar" href="#contenido">Saltar al contenido</a>
<header class="cabecera">
  <div class="contenedor fila">
    <a class="marca" href="${WEB}/" aria-label="Ir a fotoface.pro"><img src="/logo-marca.png" alt="FotoFace" width="600" height="265"></a>
    <nav class="menu" aria-label="Secciones">
      <a href="#muestras">Muestras</a>
      <a href="#estilos">Estilos</a>
      <a href="#como">Cómo funciona</a>
      <a href="${WEB}/" class="volver">← fotoface.pro</a>
      <a class="boton boton-chico" href="${WEB}/#pedido">Pedir mi tarjeta</a>
    </nav>
  </div>
</header>

<main id="contenido">
  <section class="hero">
    <div class="contenedor hero-grid">
      <div>
        <p class="etiqueta">FotoFace · Tarjetas digitales</p>
        <h1>Invitaciones que se <em>abren</em> como un regalo</h1>
        <p class="lead">Tarjetas interactivas para tu boda, bautizo, quince años o cumpleaños. Tus invitados las abren desde el celular, escuchan tu canción, ven el lugar en el mapa y confirman su asistencia en un toque.</p>
        <div class="botones">
          <a class="boton" href="#muestras">Ver muestras</a>
          <a class="boton boton-claro" href="${WEB}/#pedido">Pedir mi tarjeta</a>
        </div>
        <ul class="ocasiones" aria-label="Ocasiones">${ocasiones.map((o) => `<li>${esc(o)}</li>`).join("")}</ul>
      </div>
      <div class="telefono" aria-hidden="true">
        <div class="pantalla">
          <div class="sobre">
            <span class="solapa"></span>
            <span class="sello">J&amp;M</span>
          </div>
          <p class="t-script">José &amp; María</p>
          <p class="t-fecha">Sábado 14 · Febrero</p>
          <div class="t-cuenta"><span><b>42</b>días</span><span><b>08</b>horas</span><span><b>15</b>min</span></div>
          <span class="t-boton">Confirmar asistencia</span>
        </div>
      </div>
    </div>
  </section>

  <section class="seccion" id="muestras">
    <div class="contenedor">
      <div class="titulo-seccion">
        <p class="etiqueta">Muestras</p>
        <h2>Ábrelas y pruébalas</h2>
        <p>Son tarjetas reales, publicadas como ejemplo. Ábrelas desde tu celular para vivirlas como tus invitados.</p>
      </div>
      ${renderMuestras(muestras)}
    </div>
  </section>

  <section class="seccion seccion-suave">
    <div class="contenedor">
      <div class="titulo-seccion">
        <p class="etiqueta">Qué incluye</p>
        <h2>Todo lo de una invitación impresa, y mucho más</h2>
      </div>
      <div class="funciones">${FUNCIONES.map(([i, t, d]) => `<div class="funcion"><span class="icono">${icono(i)}</span><h3>${esc(t)}</h3><p>${esc(d)}</p></div>`).join("")}</div>
    </div>
  </section>

  <section class="seccion" id="estilos">
    <div class="contenedor">
      <div class="titulo-seccion">
        <p class="etiqueta">Estilos</p>
        <h2>Elige el estilo de tu celebración</h2>
        <p>Cada estilo trae su paleta, tipografías y animaciones. Lo ajustamos con tus fotos, colores y textos.</p>
      </div>
      ${renderEstilos()}
    </div>
  </section>

  <section class="seccion seccion-oscura" id="como">
    <div class="contenedor">
      <div class="titulo-seccion">
        <p class="etiqueta">Cómo funciona</p>
        <h2>Lista en tres pasos</h2>
      </div>
      <ol class="pasos">
        <li><span>1</span><h3>Cuéntanos tu evento</h3><p>Ocasión, fecha, lugares y el estilo que te gusta. Puedes pedirla por el formulario o por el chat.</p></li>
        <li><span>2</span><h3>Envíanos fotos y música</h3><p>Armamos tu tarjeta y te mandamos la vista previa para que la revises antes de publicarla.</p></li>
        <li><span>3</span><h3>Compártela y sigue las respuestas</h3><p>Recibes tu enlace propio para enviarlo por WhatsApp y otro privado para ver quién confirmó.</p></li>
      </ol>
      <div class="cta">
        <a class="boton" href="${WEB}/#pedido">Pedir mi tarjeta</a>
        <p>¿Dudas? Escríbele a Lumi en el chat (abajo a la derecha).</p>
      </div>
    </div>
  </section>
</main>

<footer class="pie">
  <div class="contenedor pie-fila">
    <a href="${WEB}/"><img class="pie-logo" src="/logo-fotoface.png" alt="FotoFace, tu foto estudio personal" width="900" height="589"></a>
    <nav aria-label="Enlaces">
      <a href="${WEB}/">Inicio de fotoface.pro</a>
      <a href="${WEB}/privacidad.html">Política de privacidad</a>
      <a href="${WEB}/reclamaciones.html">Libro de Reclamaciones</a>
    </nav>
  </div>
  <p class="derechos">© ${new Date().getFullYear()} FotoFace. Todos los derechos reservados.</p>
</footer>
<script src="${esc(sistema)}/widget.js" data-color="#0a5fa3" defer></script>
</body>
</html>`;
}

const CSS = `
:root{--tinta:#0b2239;--tinta-2:#13324f;--crema:#eaf4fb;--crema-2:#d8eaf7;--papel:#fafdff;--acento:#0a5fa3;--acento-osc:#03426f;--celeste:#4fb3e8;--gris:#586b7d;--borde:#d3e3f0;--radio:14px;--sombra:0 18px 40px -18px rgba(3,40,72,.35);--serif:"Fraunces",Georgia,serif;--sans:"DM Sans",system-ui,-apple-system,"Segoe UI",sans-serif}
*{box-sizing:border-box}html{scroll-behavior:smooth;scroll-padding-top:84px}
body{margin:0;font-family:var(--sans);color:var(--tinta);background:var(--papel);line-height:1.6;-webkit-font-smoothing:antialiased}
img{max-width:100%;display:block}a{color:inherit}
h1,h2,h3{font-family:var(--serif);line-height:1.12;margin:0 0 .5em;font-weight:700;letter-spacing:-.01em}
h2{font-size:clamp(1.8rem,4vw,2.6rem)}h3{font-size:1.15rem}p{margin:0 0 1em}
.contenedor{width:min(1160px,100% - 32px);margin-inline:auto}
.fila{display:flex;align-items:center;justify-content:space-between;gap:16px}
.saltar{position:absolute;left:-999px;top:8px;background:var(--tinta);color:#fff;padding:8px 12px;z-index:100}.saltar:focus{left:8px}
.etiqueta{font-size:.78rem;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--acento);margin-bottom:.8em}
.boton{display:inline-flex;align-items:center;justify-content:center;gap:8px;background:var(--acento);color:#fff;text-decoration:none;font-weight:700;padding:14px 24px;border-radius:999px;border:2px solid var(--acento);transition:background .2s,transform .2s}
.boton:hover{background:var(--acento-osc);border-color:var(--acento-osc);transform:translateY(-1px)}
.boton-claro{background:transparent;color:var(--tinta);border-color:var(--tinta)}.boton-claro:hover{background:var(--tinta);color:#fff;border-color:var(--tinta)}
.boton-chico{padding:9px 18px;font-size:.92rem}
a:focus-visible,.boton:focus-visible{outline:3px solid var(--celeste);outline-offset:2px}
.cabecera{position:sticky;top:0;z-index:50;padding:12px 0;background:rgba(250,253,255,.94);backdrop-filter:blur(8px);box-shadow:0 1px 0 var(--borde)}
.marca img{height:50px;width:auto}
.menu{display:flex;align-items:center;gap:24px}
.menu a:not(.boton){text-decoration:none;font-weight:500;font-size:.96rem}.menu a:not(.boton):hover{color:var(--acento)}
.menu .volver{color:var(--gris)}
.hero{padding:70px 0 90px;background:radial-gradient(1000px 480px at 85% 0%,#cbe7fa 0%,transparent 60%),var(--crema);overflow:hidden}
.hero-grid{display:grid;grid-template-columns:1.15fr .85fr;gap:48px;align-items:center}
.hero h1{font-size:clamp(2.3rem,5.4vw,3.9rem)}.hero h1 em{color:var(--acento)}
.lead{font-size:1.1rem;color:var(--tinta-2);max-width:36em}
.botones{display:flex;flex-wrap:wrap;gap:12px;margin:26px 0}
.ocasiones{list-style:none;padding:0;margin:0;display:flex;flex-wrap:wrap;gap:8px}
.ocasiones li{background:#fff;border:1px solid var(--borde);border-radius:999px;padding:5px 13px;font-size:.88rem;font-weight:500}
.telefono{justify-self:center;width:280px;padding:12px;border-radius:44px;background:var(--tinta);box-shadow:var(--sombra),0 40px 80px -30px rgba(3,40,72,.5);transform:rotate(3deg)}
.pantalla{border-radius:34px;background:#e9f2f9;color:#23405a;padding:30px 20px 26px;text-align:center;min-height:500px;display:flex;flex-direction:column;align-items:center;gap:10px}
.sobre{position:relative;width:180px;height:120px;margin:10px 0 14px;background:#dceaf5;border-radius:6px;box-shadow:0 10px 24px -12px rgba(3,40,72,.4);overflow:hidden}
.solapa{position:absolute;inset:0 0 auto;height:70px;background:#c9deef;clip-path:polygon(0 0,100% 0,50% 100%);transform-origin:top;animation:abrir 4s ease-in-out infinite}
.sello{position:absolute;left:50%;top:52px;transform:translateX(-50%);width:44px;height:44px;border-radius:50%;background:#5f97c2;color:#fff;font:700 13px/44px var(--serif);box-shadow:0 3px 8px rgba(0,0,0,.25)}
@keyframes abrir{0%,35%{transform:rotateX(0)}55%,85%{transform:rotateX(180deg)}100%{transform:rotateX(0)}}
.t-script{font-family:"Allura",cursive;font-size:2.6rem;color:#5f97c2;margin:0;line-height:1.1}
.t-fecha{letter-spacing:.2em;text-transform:uppercase;font-size:.72rem;margin:0}
.t-cuenta{display:flex;gap:8px;margin:10px 0}
.t-cuenta span{background:#fbfdff;border-radius:10px;padding:8px 10px;font-size:.65rem;text-transform:uppercase;letter-spacing:.08em;display:grid}
.t-cuenta b{font:700 1.3rem/1.1 var(--serif)}
.t-boton{margin-top:auto;background:#5f97c2;color:#fff;border-radius:999px;padding:10px 18px;font-size:.78rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase}
.seccion{padding:90px 0}.seccion-suave{background:var(--crema)}
.seccion-oscura{background:var(--tinta);color:#fff}.seccion-oscura .etiqueta{color:var(--celeste)}.seccion-oscura p{color:#b5c9db}
.titulo-seccion{max-width:720px;margin-bottom:40px}.titulo-seccion p:last-child{color:var(--gris)}.seccion-oscura .titulo-seccion p:last-child{color:#b5c9db}
.muestras{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:24px}
.muestra{background:#fff;border:1px solid var(--borde);border-radius:var(--radio);overflow:hidden;display:flex;flex-direction:column;transition:transform .25s,box-shadow .25s}
.muestra:hover{transform:translateY(-4px);box-shadow:var(--sombra)}
.m-portada{position:relative;aspect-ratio:4/3;background-size:cover;background-position:center}
.m-velo{position:absolute;inset:0;background:linear-gradient(180deg,transparent 50%,rgba(11,34,57,.35))}
.m-sin-foto{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;padding:16px;text-align:center}
.m-orn{font-size:1.1rem}.m-script{font-size:2.2rem;line-height:1.15}
.m-cuerpo{padding:20px;display:flex;flex-direction:column;align-items:flex-start;gap:4px;flex:1}
.m-cuerpo p{color:var(--gris);font-size:.95rem;flex:1}
.chip{font-size:.75rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--acento);background:#e0eff9;border-radius:999px;padding:3px 10px;margin-bottom:6px}
.vacio{background:#fff;border:1px dashed var(--borde);border-radius:var(--radio);padding:32px;max-width:720px}.vacio p:last-child{margin:0;color:var(--gris)}
.funciones{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:18px}
.funcion{background:#fff;border:1px solid var(--borde);border-radius:var(--radio);padding:22px}
.funcion p{margin:0;color:var(--gris);font-size:.95rem}
.icono{width:44px;height:44px;border-radius:12px;display:grid;place-items:center;background:#e0eff9;color:var(--acento);margin-bottom:14px}
.estilos{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:18px}
.estilo{position:relative;margin:0;aspect-ratio:3/4;border-radius:var(--radio);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;text-align:center;padding:18px;box-shadow:0 10px 26px -18px rgba(3,40,72,.45)}
.e-borde{position:absolute;inset:10px;border:1px solid;border-radius:10px;pointer-events:none}
.e-orn{font-size:.9rem;letter-spacing:.2em}.e-script{font-size:2rem;line-height:1.15}
.estilo figcaption{position:absolute;bottom:20px;font-size:.78rem;font-weight:700;letter-spacing:.12em;text-transform:uppercase}
.pasos{list-style:none;padding:0;margin:0;display:grid;grid-template-columns:repeat(3,1fr);gap:28px}
.pasos li{border-top:2px solid var(--celeste);padding-top:18px}
.pasos span{font:700 2rem/1 var(--serif);color:var(--celeste);display:block;margin-bottom:10px}
.cta{margin-top:48px;display:flex;flex-wrap:wrap;align-items:center;gap:18px}.cta p{margin:0}
.pie{background:#081a2c;color:#b5c9db;padding:48px 0 24px}
.pie-fila{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:24px}
.pie-logo{width:200px;height:auto;background:#fff;padding:12px 16px;border-radius:var(--radio);box-sizing:content-box}
.pie nav{display:flex;flex-wrap:wrap;gap:20px}.pie nav a{text-decoration:none}.pie nav a:hover{color:var(--celeste)}
.derechos{width:min(1160px,100% - 32px);margin:32px auto 0;padding-top:18px;border-top:1px solid #1c3d5c;font-size:.86rem}
@media (max-width:960px){.hero-grid{grid-template-columns:1fr}.telefono{transform:none;margin-top:10px}.menu a:not(.boton):not(.volver){display:none}}
@media (max-width:760px){.pasos{grid-template-columns:1fr}.seccion{padding:64px 0}.menu .volver{display:none}.marca img{height:42px}}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}html{scroll-behavior:auto}}
`;

module.exports = { renderVitrina };
