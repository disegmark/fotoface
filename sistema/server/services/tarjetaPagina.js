/*
 * Genera el HTML autocontenido de una tarjeta virtual (y la vista del
 * anfitrion). Todo el texto que viene de la base se escapa con esc(); los
 * datos que usa el script del navegador van en JSON con "<" escapado.
 *
 * `base` es el prefijo de rutas: "" cuando se sirve en <slug>.fotoface.pro y
 * "/t/<slug>" en la vista previa por ruta.
 */
const tarjetas = require("./tarjetas");

const OFFSET = process.env.TARJETAS_ZONA_OFFSET || "-05:00"; // hora de Lima

const TEMAS = {
  marfil: { bg: "#f5efe4", paper: "#fffdf8", ink: "#3b3127", muted: "#857563", accent: "#b08d57", accent2: "#d9c29a", env: "#efe3cf", envDark: "#e2d1b4", script: "Great Vibes", title: "Cormorant Garamond", body: "Montserrat", fx: "petalos" },
  salvia: { bg: "#edf0e8", paper: "#fbfcf9", ink: "#2f3a2f", muted: "#6c7a69", accent: "#7d9474", accent2: "#c3d1b8", env: "#e2e8da", envDark: "#d0dac4", script: "Parisienne", title: "Cormorant Garamond", body: "Montserrat", fx: "hojas" },
  rubor: { bg: "#f8ecec", paper: "#fffafa", ink: "#4a3236", muted: "#8f6e73", accent: "#c4848d", accent2: "#ecc9cd", env: "#f3dcdd", envDark: "#ebc9cb", script: "Great Vibes", title: "Cormorant Garamond", body: "Montserrat", fx: "petalos" },
  cielo: { bg: "#e9f2f9", paper: "#fbfdff", ink: "#23405a", muted: "#5f7d96", accent: "#5f97c2", accent2: "#bcd8ee", env: "#dceaf5", envDark: "#c9deef", script: "Allura", title: "Cormorant Garamond", body: "Montserrat", fx: "burbujas" },
  noche: { bg: "#0f1729", paper: "#172238", ink: "#f1ead8", muted: "#b5ad98", accent: "#d4b26a", accent2: "#6e5a2e", env: "#1d2a45", envDark: "#15203a", script: "Pinyon Script", title: "Cinzel", body: "Montserrat", fx: "estrellas" },
  terracota: { bg: "#f3e7dc", paper: "#fffaf5", ink: "#4a2e22", muted: "#8c6a59", accent: "#bf6d47", accent2: "#e8c3a8", env: "#efd9c7", envDark: "#e5c6ae", script: "Parisienne", title: "Cormorant Garamond", body: "Montserrat", fx: "hojas" },
  fiesta: { bg: "#fff4e6", paper: "#ffffff", ink: "#2c2140", muted: "#6f6585", accent: "#f2506b", accent2: "#ffb627", env: "#ffe2c2", envDark: "#ffd2a3", script: "Pacifico", title: "Fredoka", body: "Nunito", fx: "confeti" },
  lavanda: { bg: "#f0edf7", paper: "#fdfcff", ink: "#3a3350", muted: "#7a7192", accent: "#9583c0", accent2: "#d6cdea", env: "#e6e0f2", envDark: "#d8cfec", script: "Great Vibes", title: "Cormorant Garamond", body: "Montserrat", fx: "petalos" },
};

const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
function esc(v) {
  return String(v ?? "").replace(/[&<>"']/g, (c) => ESC[c]);
}
function json(v) {
  return JSON.stringify(v).replace(/</g, "\\u003c");
}
function parrafos(t) {
  return esc(t).replace(/\n{2,}/g, "</p><p>").replace(/\n/g, "<br>");
}

function fechaEvento(t) {
  if (!t.fecha_evento) return null;
  const [d, h] = t.fecha_evento.split("T");
  const inicio = new Date(`${d}T${h || "00:00"}:00${OFFSET}`);
  if (Number.isNaN(inicio.getTime())) return null;
  const fecha = new Date(`${d}T12:00:00Z`);
  const larga = new Intl.DateTimeFormat("es-PE", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(fecha);
  const partes = new Intl.DateTimeFormat("es-PE", { day: "2-digit", month: "long", year: "numeric", timeZone: "UTC" }).formatToParts(fecha);
  const pick = (k) => partes.find((p) => p.type === k)?.value || "";
  return { inicio, conHora: !!h, hora: h || "", larga, dia: pick("day"), mes: pick("month"), anio: pick("year") };
}

function hora12(h) {
  if (!/^\d{1,2}:\d{2}$/.test(h || "")) return esc(h);
  let [hh, mm] = h.split(":").map(Number);
  const suf = hh >= 12 ? "p. m." : "a. m.";
  hh = hh % 12 || 12;
  return `${hh}:${String(mm).padStart(2, "0")} ${suf}`;
}

function fechaUtcCompacta(d) {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function enlaceGoogleCalendar(t, f) {
  const fin = new Date(f.inicio.getTime() + 5 * 3600 * 1000);
  const lugar = t.datos.lugares?.[0];
  const q = new URLSearchParams({
    action: "TEMPLATE",
    text: t.titulo,
    dates: `${fechaUtcCompacta(f.inicio)}/${fechaUtcCompacta(fin)}`,
    details: `${tarjetas.urlPublica(t.slug)}`,
    location: lugar ? [lugar.nombre, lugar.direccion].filter(Boolean).join(", ") : "",
  });
  return `https://calendar.google.com/calendar/render?${q}`;
}

function ics(t) {
  const f = fechaEvento(t);
  if (!f) return null;
  const fin = new Date(f.inicio.getTime() + 5 * 3600 * 1000);
  const lugar = t.datos.lugares?.[0];
  const limpiar = (s) => String(s || "").replace(/([,;\\])/g, "\\$1").replace(/\n/g, "\\n");
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//FotoFace//Tarjetas//ES",
    "BEGIN:VEVENT",
    `UID:tarjeta-${t.id}@${tarjetas.DOMINIO}`,
    `DTSTAMP:${fechaUtcCompacta(new Date())}`,
    `DTSTART:${fechaUtcCompacta(f.inicio)}`,
    `DTEND:${fechaUtcCompacta(fin)}`,
    `SUMMARY:${limpiar(t.titulo)}`,
    `DESCRIPTION:${limpiar(tarjetas.urlPublica(t.slug))}`,
    lugar ? `LOCATION:${limpiar([lugar.nombre, lugar.direccion].filter(Boolean).join(", "))}` : null,
    "END:VEVENT",
    "END:VCALENDAR",
  ]
    .filter(Boolean)
    .join("\r\n");
}

function fuentes(tema) {
  const fam = [...new Set([tema.script, tema.title, tema.body])]
    .map((f) => `family=${f.replace(/ /g, "+")}${f === tema.script ? "" : ":wght@400;500;600;700"}`)
    .join("&");
  return `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?${fam}&display=swap" rel="stylesheet">`;
}

function variables(tema) {
  return `:root{--bg:${tema.bg};--paper:${tema.paper};--ink:${tema.ink};--muted:${tema.muted};--accent:${tema.accent};--accent2:${tema.accent2};--env:${tema.env};--env-dark:${tema.envDark};--f-script:'${tema.script}',cursive;--f-title:'${tema.title}',serif;--f-body:'${tema.body}',system-ui,sans-serif}`;
}

const ORNAMENTO = `<svg class="orn" viewBox="0 0 240 24" aria-hidden="true"><path d="M2 12h88M150 12h88" stroke="currentColor" stroke-width="1"/><path d="M120 3c-6 0-10 4-10 9s4 9 10 9 10-4 10-9-4-9-10-9Zm0 4c3 0 5 2 5 5s-2 5-5 5-5-2-5-5 2-5 5-5Z" fill="currentColor" opacity=".8"/><circle cx="100" cy="12" r="2" fill="currentColor"/><circle cx="140" cy="12" r="2" fill="currentColor"/></svg>`;

const ICONOS = {
  musica: '<svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6Z"/></svg>',
  pausa: '<svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg>',
  mapa: '<svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M12 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5Z"/></svg>',
  calendario: '<svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M7 2v2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2V2h-2v2H9V2H7Zm12 8v10H5V10h14Z"/></svg>',
  copiar: '<svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M16 1H4a2 2 0 0 0-2 2v14h2V3h12V1Zm3 4H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2Zm0 16H8V7h11v14Z"/></svg>',
  whatsapp: '<svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm5.3 14.2c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .1-3.3-.8-2.8-1.1-4.5-4-4.7-4.2-.1-.2-1.1-1.5-1.1-2.9s.7-2 1-2.3c.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.8 2c.1.2.1.4 0 .5l-.3.5-.4.4c-.1.2-.3.3-.1.6.2.3.8 1.3 1.7 2.1 1.2 1 2.1 1.3 2.4 1.5.3.1.5.1.6-.1l.9-1c.2-.3.4-.2.7-.1l1.9.9c.3.1.5.2.5.3.1.2.1.7-.1 1.2Z"/></svg>',
  regalo: '<svg viewBox="0 0 24 24" width="26" height="26"><path fill="currentColor" d="M20 7h-2.2A3 3 0 0 0 12 3.8 3 3 0 0 0 6.2 7H4a1 1 0 0 0-1 1v3a1 1 0 0 0 1 1h1v8a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-8h1a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1Zm-5-2a1 1 0 1 1 0 2h-2a2 2 0 0 1 2-2Zm-6 0a2 2 0 0 1 2 2H9a1 1 0 1 1 0-2Zm-4 4h6v1H5V9Zm2 3h4v7H7v-7Zm10 7h-4v-7h4v7Zm2-9h-6V9h6v1Z"/></svg>',
};

const CSS = `
*{box-sizing:border-box;margin:0;padding:0}
html{scroll-behavior:smooth;-webkit-text-size-adjust:100%}
body{background:var(--bg);color:var(--ink);font-family:var(--f-body);font-size:15px;line-height:1.7;overflow-x:hidden}
body.cerrada{overflow:hidden;height:100vh}
img{max-width:100%;display:block}
a{color:inherit}
.script{font-family:var(--f-script);font-weight:400;line-height:1.15}
.titulo{font-family:var(--f-title);letter-spacing:.02em}
.orn{width:180px;height:18px;color:var(--accent);margin:14px auto;display:block}
.wrap{max-width:640px;margin:0 auto;padding:0 20px}
section{padding:64px 0;text-align:center;position:relative}
section+section{border-top:1px solid color-mix(in srgb,var(--accent) 18%,transparent)}
.etq{font-size:11px;letter-spacing:.32em;text-transform:uppercase;color:var(--accent);font-weight:600}
h2.script{font-size:46px;color:var(--accent);margin:6px 0 10px}
.p-lead{font-family:var(--f-title);font-size:21px;line-height:1.55;color:var(--ink)}
.muted{color:var(--muted)}
.btn{display:inline-flex;align-items:center;gap:8px;justify-content:center;border:1px solid var(--accent);background:var(--accent);color:var(--paper);padding:12px 22px;border-radius:999px;font:600 13px/1 var(--f-body);letter-spacing:.06em;text-transform:uppercase;text-decoration:none;cursor:pointer;transition:transform .2s,box-shadow .2s,background .2s}
.btn:hover{transform:translateY(-2px);box-shadow:0 8px 24px -10px var(--accent)}
.btn.sec{background:transparent;color:var(--accent)}
.btns{display:flex;flex-wrap:wrap;gap:10px;justify-content:center;margin-top:18px}
.card{background:var(--paper);border:1px solid color-mix(in srgb,var(--accent) 22%,transparent);border-radius:18px;padding:28px 22px;box-shadow:0 18px 40px -28px rgba(0,0,0,.35)}
.reveal{opacity:0;transform:translateY(26px);transition:opacity .9s ease,transform .9s ease}
.reveal.on{opacity:1;transform:none}

/* Portada */
.hero{min-height:100svh;display:flex;align-items:center;justify-content:center;padding:80px 20px;position:relative;overflow:hidden;border:0}
.hero .foto{position:absolute;inset:0;background-size:cover;background-position:center;transform:scale(1.08);transition:transform 6s ease}
body.abierta .hero .foto{transform:scale(1)}
.hero.con-foto::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.25),rgba(0,0,0,.15) 40%,rgba(0,0,0,.55))}
.hero .marco{position:relative;z-index:2;padding:46px 30px;max-width:520px;width:100%}
.hero:not(.con-foto) .marco{border:1px solid color-mix(in srgb,var(--accent) 45%,transparent);outline:1px solid color-mix(in srgb,var(--accent) 25%,transparent);outline-offset:8px;border-radius:999px 999px 24px 24px;background:var(--paper)}
.hero.con-foto .marco{color:#fff}
.hero.con-foto .orn,.hero.con-foto .etq{color:#fff}
.hero h1{font-size:clamp(52px,14vw,86px);color:var(--accent);margin:10px 0 6px}
.hero.con-foto h1{color:#fff;text-shadow:0 2px 20px rgba(0,0,0,.35)}
.hero .sub{font-family:var(--f-title);font-size:20px}
.hero .fecha-hero{display:flex;align-items:center;justify-content:center;gap:16px;margin-top:22px;font-family:var(--f-title)}
.hero .fecha-hero span{font-size:13px;letter-spacing:.25em;text-transform:uppercase;padding:6px 0;border-top:1px solid currentColor;border-bottom:1px solid currentColor;min-width:86px}
.hero .fecha-hero b{font-size:52px;font-weight:500;line-height:1}
.scroll{position:absolute;bottom:22px;left:50%;transform:translateX(-50%);z-index:2;font-size:11px;letter-spacing:.3em;text-transform:uppercase;opacity:.8;animation:flota 2.4s ease-in-out infinite}
.hero.con-foto .scroll{color:#fff}
@keyframes flota{50%{transform:translate(-50%,8px)}}

/* Invitado */
.invitado .nombre{font-size:44px;color:var(--accent);margin:8px 0}
.pases{display:inline-flex;flex-direction:column;align-items:center;margin-top:14px;padding:14px 28px;border:1px dashed var(--accent);border-radius:14px}
.pases b{font-family:var(--f-title);font-size:40px;line-height:1;color:var(--accent)}

/* Familia */
.familia{display:grid;gap:22px;margin-top:26px}
.familia .rol{font-size:11px;letter-spacing:.3em;text-transform:uppercase;color:var(--muted)}
.familia .nom{font-family:var(--f-title);font-size:20px;white-space:pre-line}

/* Cuenta regresiva */
.cuenta{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:26px 0 8px}
.cuenta div{background:var(--paper);border:1px solid color-mix(in srgb,var(--accent) 25%,transparent);border-radius:16px;padding:16px 4px}
.cuenta b{display:block;font-family:var(--f-title);font-size:clamp(30px,9vw,44px);font-weight:500;line-height:1;color:var(--accent)}
.cuenta small{font-size:10px;letter-spacing:.22em;text-transform:uppercase;color:var(--muted)}

/* Lugares */
.lugares{display:grid;gap:22px;margin-top:26px}
.lugar .rol{font-family:var(--f-script);font-size:34px;color:var(--accent);line-height:1.2}
.lugar h3{font-family:var(--f-title);font-size:23px;font-weight:600;margin:4px 0}
.lugar .hora{font-weight:600;letter-spacing:.1em;margin:6px 0}
.lugar iframe{width:100%;height:220px;border:0;border-radius:12px;margin-top:16px;filter:saturate(.85)}

/* Agenda */
.agenda{position:relative;margin:30px auto 0;max-width:440px;text-align:left}
.agenda::before{content:"";position:absolute;left:88px;top:6px;bottom:6px;width:1px;background:color-mix(in srgb,var(--accent) 45%,transparent)}
.item{display:grid;grid-template-columns:76px 1fr;gap:24px;padding:12px 0;position:relative}
.item::before{content:"";position:absolute;left:83px;top:20px;width:11px;height:11px;border-radius:50%;background:var(--paper);border:2px solid var(--accent)}
.item .h{font-family:var(--f-title);font-weight:600;text-align:right;color:var(--accent)}
.item .t{font-weight:600}
.item .d{font-size:13px;color:var(--muted)}

/* Galeria */
.galeria{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-top:26px}
.galeria button{border:0;padding:0;background:none;cursor:zoom-in;border-radius:12px;overflow:hidden;aspect-ratio:1}
.galeria button:nth-child(3n+1){grid-column:span 2;aspect-ratio:16/10}
.galeria img{width:100%;height:100%;object-fit:cover;transition:transform .6s}
.galeria button:hover img{transform:scale(1.05)}
.lightbox{position:fixed;inset:0;background:rgba(0,0,0,.92);display:none;align-items:center;justify-content:center;z-index:60;padding:20px}
.lightbox.on{display:flex}
.lightbox img{max-height:88vh;border-radius:8px}
.lightbox button{position:absolute;background:rgba(255,255,255,.12);color:#fff;border:0;width:46px;height:46px;border-radius:50%;font-size:22px;cursor:pointer}
.lb-x{top:16px;right:16px}.lb-a{left:12px;top:50%}.lb-s{right:12px;top:50%}

/* Regalos */
.cuentas{display:grid;gap:14px;margin-top:22px;text-align:left}
.cuentas .card{padding:18px 20px}
.cuentas .banco{font-weight:700;letter-spacing:.08em;text-transform:uppercase;font-size:12px;color:var(--accent)}
.fila{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:6px;font-family:ui-monospace,Menlo,monospace;font-size:14px;word-break:break-all}
.copiar{flex-shrink:0;border:1px solid var(--accent);background:transparent;color:var(--accent);border-radius:999px;padding:5px 10px;font:600 11px var(--f-body);display:inline-flex;gap:5px;align-items:center;cursor:pointer}

/* Formularios */
form{display:grid;gap:12px;text-align:left;margin-top:24px}
label{font-size:12px;font-weight:600;letter-spacing:.06em;color:var(--muted)}
input,select,textarea{width:100%;font:15px var(--f-body);color:var(--ink);background:var(--paper);border:1px solid color-mix(in srgb,var(--accent) 35%,transparent);border-radius:12px;padding:12px 14px;outline:none}
input:focus,select:focus,textarea:focus{border-color:var(--accent);box-shadow:0 0 0 3px color-mix(in srgb,var(--accent) 18%,transparent)}
.opciones{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.opciones label{display:flex;align-items:center;justify-content:center;gap:8px;border:1px solid color-mix(in srgb,var(--accent) 35%,transparent);border-radius:12px;padding:14px;font-size:14px;color:var(--ink);cursor:pointer;background:var(--paper)}
.opciones input{width:auto;accent-color:var(--accent)}
.opciones label:has(input:checked){border-color:var(--accent);background:color-mix(in srgb,var(--accent) 12%,var(--paper))}
.aviso{padding:14px;border-radius:12px;background:color-mix(in srgb,var(--accent) 12%,var(--paper));text-align:center;font-weight:600;display:none}
.aviso.on{display:block}
.trampa{position:absolute;left:-9999px}

/* Firmas */
.firmas{display:grid;gap:12px;margin-top:26px;text-align:left}
.firma{background:var(--paper);border-radius:14px;padding:16px 18px;border-left:3px solid var(--accent)}
.firma p{font-family:var(--f-title);font-size:18px;line-height:1.5}
.firma b{display:block;margin-top:6px;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:var(--accent)}

.hashtag{font-family:var(--f-title);font-size:28px;color:var(--accent);margin-top:12px}
footer{padding:40px 20px 90px;text-align:center;font-size:12px;color:var(--muted)}
footer a{color:var(--accent);font-weight:600;text-decoration:none}

/* Musica */
.musica{position:fixed;right:16px;bottom:16px;z-index:40;width:52px;height:52px;border-radius:50%;border:0;background:var(--accent);color:var(--paper);display:flex;align-items:center;justify-content:center;box-shadow:0 10px 28px -8px rgba(0,0,0,.45);cursor:pointer}
.musica.sonando::before{content:"";position:absolute;inset:-6px;border-radius:50%;border:2px solid var(--accent);animation:pulso 1.8s ease-out infinite}
@keyframes pulso{from{opacity:.8;transform:scale(.9)}to{opacity:0;transform:scale(1.35)}}

/* Apertura: sobre */
.apertura{position:fixed;inset:0;z-index:80;background:radial-gradient(circle at 50% 40%,var(--paper),var(--bg));display:flex;flex-direction:column;align-items:center;justify-content:center;gap:26px;transition:opacity 1s ease .9s,visibility 0s linear 1.9s;cursor:pointer;padding:20px}
.apertura.fuera{opacity:0;visibility:hidden}
.apertura .para{font-family:var(--f-title);font-size:15px;letter-spacing:.2em;text-transform:uppercase;color:var(--muted);text-align:center}
.apertura .para b{display:block;font-family:var(--f-script);font-size:36px;letter-spacing:0;text-transform:none;color:var(--accent);font-weight:400;margin-top:4px}
.sobre{position:relative;width:min(84vw,360px);aspect-ratio:1.45;perspective:1200px}
.sobre .cuerpo{position:absolute;inset:0;background:var(--env);border-radius:10px;box-shadow:0 30px 60px -30px rgba(0,0,0,.5);overflow:hidden}
.sobre .cuerpo::before,.sobre .cuerpo::after{content:"";position:absolute;bottom:0;width:0;height:0;border-style:solid}
.sobre .cuerpo::before{left:0;border-width:0 0 calc(min(84vw,360px)/1.45) calc(min(84vw,360px)/2);border-color:transparent transparent var(--env-dark) transparent}
.sobre .cuerpo::after{right:0;border-width:0 calc(min(84vw,360px)/2) calc(min(84vw,360px)/1.45) 0;border-color:transparent var(--env-dark) transparent transparent}
.sobre .carta{position:absolute;left:7%;right:7%;top:8%;height:84%;background:var(--paper);border-radius:6px;display:flex;align-items:center;justify-content:center;font-family:var(--f-script);font-size:32px;color:var(--accent);transition:transform 1s cubic-bezier(.5,0,.2,1) .45s;z-index:1}
.sobre .tapa{position:absolute;left:0;right:0;top:0;height:62%;transform-origin:top;transition:transform .7s ease;z-index:3;filter:drop-shadow(0 4px 6px rgba(0,0,0,.12))}
.sobre .tapa::before{content:"";position:absolute;inset:0;background:var(--env-dark);clip-path:polygon(0 0,100% 0,50% 100%)}
.sello{position:absolute;left:50%;top:62%;transform:translate(-50%,-50%);z-index:4;width:66px;height:66px;border-radius:50%;background:radial-gradient(circle at 35% 30%,color-mix(in srgb,var(--accent) 70%,#fff),var(--accent) 60%,color-mix(in srgb,var(--accent) 70%,#000));color:#fff;display:flex;align-items:center;justify-content:center;font-family:var(--f-script);font-size:24px;box-shadow:0 4px 10px rgba(0,0,0,.3),inset 0 0 0 4px rgba(255,255,255,.18);transition:opacity .3s,transform .4s;animation:latido 2s ease-in-out infinite}
@keyframes latido{50%{transform:translate(-50%,-50%) scale(1.07)}}
.apertura.abriendo .sello{opacity:0;animation:none;transform:translate(-50%,-50%) scale(.6)}
.apertura.abriendo .tapa{transform:rotateX(180deg);z-index:0}
.apertura.abriendo .carta{transform:translateY(-55%);z-index:2}
.toca{font-size:11px;letter-spacing:.35em;text-transform:uppercase;color:var(--accent);animation:parpadeo 1.6s ease-in-out infinite}
@keyframes parpadeo{50%{opacity:.35}}

/* Apertura: telon */
.apertura.telon{background:none}
.apertura.telon::before,.apertura.telon::after{content:"";position:absolute;top:0;bottom:0;width:50.5%;background:repeating-linear-gradient(90deg,var(--env-dark) 0 22px,var(--env) 22px 44px);transition:transform 1.4s cubic-bezier(.7,0,.3,1);box-shadow:inset 0 -40px 80px -40px rgba(0,0,0,.4)}
.apertura.telon::before{left:0}.apertura.telon::after{right:0}
.apertura.telon>*{position:relative;z-index:2;transition:opacity .4s}
.apertura.telon.abriendo>*{opacity:0}
.apertura.telon.abriendo::before{transform:translateX(-100%)}
.apertura.telon.abriendo::after{transform:translateX(100%)}
.apertura.telon{transition:visibility 0s linear 1.5s}
.medallon{width:120px;height:120px;border-radius:50%;background:var(--paper);display:flex;align-items:center;justify-content:center;font-family:var(--f-script);font-size:40px;color:var(--accent);box-shadow:0 0 0 6px color-mix(in srgb,var(--accent) 30%,transparent),0 20px 40px -14px rgba(0,0,0,.5)}

/* Particulas */
.fx{position:fixed;inset:0;pointer-events:none;z-index:30;overflow:hidden}
.fx i{position:absolute;top:-30px;display:block;animation:caer linear infinite;opacity:.75}
@keyframes caer{to{transform:translate3d(var(--dx),110vh,0) rotate(var(--rot))}}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}.fx{display:none}.reveal{opacity:1;transform:none}}
@media (min-width:640px){.galeria{grid-template-columns:repeat(3,1fr)}.galeria button:nth-child(3n+1){grid-column:auto;aspect-ratio:1}.lugares.dos{grid-template-columns:1fr 1fr}.familia.varios{grid-template-columns:1fr 1fr}}
`;


// Script del navegador (sin comillas invertidas ni ${} para no chocar con la plantilla).
const JS = `
(function(){
  var D = window.__TARJETA__;
  var body = document.body;
  var audio = document.getElementById('audio');
  var btnM = document.getElementById('btn-musica');

  function setMusica(on){
    if(!audio) return;
    if(on){ var p = audio.play(); if(p && p.catch) p.catch(function(){}); } else audio.pause();
  }
  if(audio && btnM){
    audio.addEventListener('play', function(){ btnM.classList.add('sonando'); btnM.innerHTML = D.iconos.pausa; btnM.setAttribute('aria-label','Pausar música'); });
    audio.addEventListener('pause', function(){ btnM.classList.remove('sonando'); btnM.innerHTML = D.iconos.musica; btnM.setAttribute('aria-label','Reproducir música'); });
    btnM.addEventListener('click', function(){ setMusica(audio.paused); });
  }

  // Apertura (sobre o telon). La musica arranca con el toque: los navegadores
  // solo permiten reproducir audio despues de un gesto del usuario.
  var ap = document.getElementById('apertura');
  function abrir(){
    if(!ap || ap.classList.contains('abriendo')) return;
    ap.classList.add('abriendo');
    setMusica(true);
    setTimeout(function(){ ap.classList.add('fuera'); body.classList.remove('cerrada'); body.classList.add('abierta'); iniciarFx(); }, ap.classList.contains('telon') ? 900 : 1300);
  }
  if(ap){
    ap.addEventListener('click', abrir);
    ap.addEventListener('keydown', function(e){ if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); abrir(); } });
  } else { body.classList.add('abierta'); iniciarFx(); }

  // Aparicion al hacer scroll
  var obs = 'IntersectionObserver' in window ? new IntersectionObserver(function(es){
    es.forEach(function(e){ if(e.isIntersecting){ e.target.classList.add('on'); obs.unobserve(e.target); } });
  }, { threshold: .15 }) : null;
  document.querySelectorAll('.reveal').forEach(function(el){ obs ? obs.observe(el) : el.classList.add('on'); });

  // Cuenta regresiva
  var cuenta = document.getElementById('cuenta');
  if(cuenta && D.inicio){
    var meta = new Date(D.inicio).getTime();
    var campos = cuenta.querySelectorAll('b');
    var tic = function(){
      var s = Math.max(0, Math.floor((meta - Date.now())/1000));
      var v = [Math.floor(s/86400), Math.floor(s%86400/3600), Math.floor(s%3600/60), s%60];
      for(var i=0;i<4;i++) campos[i].textContent = (i>0 && v[i]<10 ? '0' : '') + v[i];
      if(s === 0){ var f = document.getElementById('cuenta-fin'); if(f) f.style.display = 'block'; cuenta.style.display = 'none'; return; }
      setTimeout(tic, 1000);
    };
    tic();
  }

  // Galeria con visor
  var fotos = Array.prototype.slice.call(document.querySelectorAll('.galeria button'));
  var lb = document.getElementById('lightbox');
  if(lb && fotos.length){
    var img = lb.querySelector('img'), idx = 0;
    var mostrar = function(i){ idx = (i + fotos.length) % fotos.length; img.src = fotos[idx].getAttribute('data-src'); lb.classList.add('on'); };
    fotos.forEach(function(b, i){ b.addEventListener('click', function(){ mostrar(i); }); });
    lb.querySelector('.lb-x').addEventListener('click', function(){ lb.classList.remove('on'); });
    lb.querySelector('.lb-a').addEventListener('click', function(e){ e.stopPropagation(); mostrar(idx-1); });
    lb.querySelector('.lb-s').addEventListener('click', function(e){ e.stopPropagation(); mostrar(idx+1); });
    lb.addEventListener('click', function(e){ if(e.target === lb) lb.classList.remove('on'); });
    document.addEventListener('keydown', function(e){ if(!lb.classList.contains('on')) return; if(e.key==='Escape') lb.classList.remove('on'); if(e.key==='ArrowLeft') mostrar(idx-1); if(e.key==='ArrowRight') mostrar(idx+1); });
    var x0 = null;
    lb.addEventListener('touchstart', function(e){ x0 = e.touches[0].clientX; }, { passive: true });
    lb.addEventListener('touchend', function(e){ if(x0 === null) return; var dx = e.changedTouches[0].clientX - x0; if(Math.abs(dx) > 40) mostrar(idx + (dx < 0 ? 1 : -1)); x0 = null; });
  }

  // Copiar numeros de cuenta
  document.querySelectorAll('[data-copiar]').forEach(function(b){
    b.addEventListener('click', function(){
      var t = b.getAttribute('data-copiar');
      var ok = function(){ var o = b.innerHTML; b.textContent = '¡Copiado!'; setTimeout(function(){ b.innerHTML = o; }, 1600); };
      if(navigator.clipboard) navigator.clipboard.writeText(t).then(ok, function(){});
      else { var ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select(); try{ document.execCommand('copy'); ok(); }catch(e){} ta.remove(); }
    });
  });

  function enviar(form, url, alTerminar){
    form.addEventListener('submit', function(e){
      e.preventDefault();
      var datos = {};
      new FormData(form).forEach(function(v, k){ datos[k] = v; });
      if(D.invitado) datos.invitado = D.invitado;
      var btn = form.querySelector('button[type=submit]');
      btn.disabled = true;
      fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(datos) })
        .then(function(r){ return r.json().then(function(j){ if(!r.ok) throw new Error(j.error || 'No se pudo enviar.'); return j; }); })
        .then(function(j){ alTerminar(j, datos); })
        .catch(function(err){ alert(err.message); })
        .then(function(){ btn.disabled = false; });
    });
  }

  // Confirmacion de asistencia
  var fr = document.getElementById('form-rsvp');
  if(fr){
    var cant = document.getElementById('campo-cantidad');
    fr.querySelectorAll('input[name=asiste]').forEach(function(r){
      r.addEventListener('change', function(){ if(cant) cant.style.display = fr.asiste.value === 'si' ? '' : 'none'; });
    });
    enviar(fr, D.base + '/api/rsvp', function(j){
      var a = document.getElementById('aviso-rsvp');
      a.textContent = j.asiste ? '¡Gracias por confirmar! Te esperamos 🎉' : 'Gracias por avisarnos. ¡Te extrañaremos!';
      a.classList.add('on');
      fr.style.display = 'none';
      if(j.asiste) lanzarConfeti();
    });
  }

  // Libro de firmas
  var ff = document.getElementById('form-firma');
  if(ff){
    enviar(ff, D.base + '/api/firmas', function(j, datos){
      var a = document.getElementById('aviso-firma');
      if(j.aprobada){
        var l = document.getElementById('lista-firmas');
        var div = document.createElement('div'); div.className = 'firma';
        var p = document.createElement('p'); p.textContent = datos.mensaje;
        var b = document.createElement('b'); b.textContent = datos.nombre;
        div.appendChild(p); div.appendChild(b); l.insertBefore(div, l.firstChild);
        a.textContent = '¡Gracias por tu mensaje!';
      } else a.textContent = '¡Gracias! Tu mensaje aparecerá cuando los anfitriones lo aprueben.';
      a.classList.add('on');
      ff.reset();
    });
  }

  // Particulas decorativas segun el tema
  var CONF = {
    petalos: { n: 14, f: function(i){ return '<svg viewBox="0 0 20 20" width="'+(10+i%3*4)+'"><path fill="'+(i%2?D.color2:D.color)+'" d="M10 0C14 5 16 10 10 20 4 10 6 5 10 0Z"/></svg>'; } },
    hojas: { n: 10, f: function(i){ return '<svg viewBox="0 0 20 20" width="'+(12+i%3*4)+'"><path fill="'+(i%2?D.color2:D.color)+'" d="M2 18C2 8 8 2 18 2 18 12 12 18 2 18Z"/></svg>'; } },
    burbujas: { n: 12, f: function(i){ var s=6+i%4*4; return '<span style="display:block;width:'+s+'px;height:'+s+'px;border-radius:50%;border:1.5px solid '+D.color+'"></span>'; } },
    estrellas: { n: 18, f: function(i){ return '<svg viewBox="0 0 20 20" width="'+(6+i%3*3)+'"><path fill="'+D.color+'" d="M10 0l2.5 7.5H20l-6 4.5 2.3 8L10 15l-6.3 5 2.3-8-6-4.5h7.5Z"/></svg>'; } },
    confeti: { n: 22, f: function(i){ var c=[D.color,D.color2,'#4cc9f0','#7ae582'][i%4]; return '<span style="display:block;width:8px;height:'+(i%2?14:8)+'px;background:'+c+';border-radius:2px"></span>'; } }
  };
  function iniciarFx(){
    var c = CONF[D.fx]; var cont = document.getElementById('fx');
    if(!c || !cont || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    for(var i=0;i<c.n;i++){
      var el = document.createElement('i');
      el.innerHTML = c.f(i);
      el.style.left = (Math.random()*100) + 'vw';
      el.style.animationDuration = (9 + Math.random()*10) + 's';
      el.style.animationDelay = (-Math.random()*18) + 's';
      el.style.setProperty('--dx', (Math.random()*160-80) + 'px');
      el.style.setProperty('--rot', (Math.random()*720-360) + 'deg');
      cont.appendChild(el);
    }
  }
  function lanzarConfeti(){
    if(window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var cont = document.getElementById('fx');
    for(var i=0;i<60;i++){
      var el = document.createElement('i');
      var c = [D.color, D.color2, '#4cc9f0', '#ffb627', '#7ae582'][i%5];
      el.innerHTML = '<span style="display:block;width:8px;height:12px;background:'+c+';border-radius:2px"></span>';
      el.style.left = (Math.random()*100) + 'vw';
      el.style.animationDuration = (2.5 + Math.random()*2.5) + 's';
      el.style.animationIterationCount = '1';
      el.style.setProperty('--dx', (Math.random()*200-100) + 'px');
      el.style.setProperty('--rot', (Math.random()*900) + 'deg');
      cont.appendChild(el);
      (function(e){ setTimeout(function(){ e.remove(); }, 5200); })(el);
    }
  }
})();
`;

function media(base, archivo) {
  return `${base}/media/${encodeURIComponent(archivo)}`;
}

function iniciales(t) {
  if (t.datos.apertura?.sello) return t.datos.apertura.sello;
  const partes = (t.datos.portada?.titulo || t.titulo).split(/\s*(?:&|y|\+)\s*/i).filter(Boolean);
  if (partes.length >= 2) return `${partes[0][0]}&${partes[1][0]}`.toUpperCase();
  return (partes[0] || "F")[0].toUpperCase();
}

/**
 * HTML completo de la tarjeta.
 * opciones: { base, invitado, firmas, vistaPrevia }
 */
function renderTarjeta(t, { base = "", invitado = null, firmas = [], vistaPrevia = false } = {}) {
  const d = t.datos;
  const tema = TEMAS[d.tema] || TEMAS.marfil;
  const f = fechaEvento(t);
  const urlAbs = tarjetas.urlPublica(t.slug);
  const titulo = d.portada?.titulo || t.titulo;
  const foto = d.portada?.foto;
  const descripcion = [d.portada?.antetitulo, f ? f.larga : "", d.lugares?.[0]?.nombre].filter(Boolean).join(" · ") || "Estás invitado";
  const tk = invitado ? `?i=${encodeURIComponent(invitado.token)}` : "";
  const secciones = [];

  // Invitado personal
  if (invitado) {
    secciones.push(`<section class="invitado"><div class="wrap reveal">
      <p class="etq">Invitación especial para</p>
      <p class="script nombre">${esc(invitado.nombre)}</p>
      <div class="pases"><b>${invitado.pases}</b><span class="muted">${invitado.pases === 1 ? "pase reservado" : "pases reservados"}</span></div>
    </div></section>`);
  }

  // Mensaje y familia
  if (d.mensaje || d.familia?.length) {
    secciones.push(`<section><div class="wrap reveal">
      ${ORNAMENTO}
      ${d.mensaje ? `<p class="p-lead">${parrafos(d.mensaje)}</p>` : ""}
      ${
        d.familia?.length
          ? `<div class="familia ${d.familia.length > 1 ? "varios" : ""}">${d.familia
              .map((x) => `<div>${x.rol ? `<p class="rol">${esc(x.rol)}</p>` : ""}<p class="nom">${esc(x.nombres)}</p></div>`)
              .join("")}</div>`
          : ""
      }
    </div></section>`);
  }

  // Cuenta regresiva
  if (f) {
    secciones.push(`<section><div class="wrap reveal">
      <p class="etq">Falta muy poco</p>
      <h2 class="script">Cuenta regresiva</h2>
      <p class="titulo" style="font-size:20px;text-transform:capitalize">${esc(f.larga)}${f.conHora ? ` · ${hora12(f.hora)}` : ""}</p>
      <div class="cuenta" id="cuenta"><div><b>0</b><small>Días</small></div><div><b>00</b><small>Horas</small></div><div><b>00</b><small>Min</small></div><div><b>00</b><small>Seg</small></div></div>
      <p id="cuenta-fin" class="script" style="display:none;font-size:40px;color:var(--accent)">¡Llegó el gran día!</p>
      <div class="btns">
        <a class="btn" href="${esc(enlaceGoogleCalendar(t, f))}" target="_blank" rel="noopener">${ICONOS.calendario} Google Calendar</a>
        <a class="btn sec" href="${base}/evento.ics">${ICONOS.calendario} iPhone / Outlook</a>
      </div>
    </div></section>`);
  }

  // Lugares
  if (d.lugares?.length) {
    secciones.push(`<section><div class="wrap">
      <div class="reveal"><p class="etq">Dónde y cuándo</p><h2 class="script">${d.lugares.length > 1 ? "Los lugares" : "El lugar"}</h2></div>
      <div class="lugares ${d.lugares.length === 2 ? "dos" : ""}">${d.lugares
        .map((l) => {
          const q = encodeURIComponent([l.nombre, l.direccion].filter(Boolean).join(", "));
          const gmaps = l.mapa_url || `https://www.google.com/maps/search/?api=1&query=${q}`;
          return `<div class="card lugar reveal">
            ${l.rol ? `<p class="rol">${esc(l.rol)}</p>` : ""}
            <h3>${esc(l.nombre)}</h3>
            ${l.hora ? `<p class="hora">${hora12(l.hora)}</p>` : ""}
            ${l.direccion ? `<p class="muted">${esc(l.direccion)}</p>` : ""}
            ${l.direccion || l.nombre ? `<iframe loading="lazy" referrerpolicy="no-referrer-when-downgrade" title="Mapa de ${esc(l.nombre)}" src="https://www.google.com/maps?q=${q}&output=embed"></iframe>` : ""}
            <div class="btns">
              <a class="btn" href="${esc(gmaps)}" target="_blank" rel="noopener">${ICONOS.mapa} Google Maps</a>
              <a class="btn sec" href="https://waze.com/ul?q=${q}&navigate=yes" target="_blank" rel="noopener">Waze</a>
            </div>
          </div>`;
        })
        .join("")}</div>
    </div></section>`);
  }

  // Agenda
  if (d.agenda?.length) {
    secciones.push(`<section><div class="wrap reveal">
      <p class="etq">Programa</p><h2 class="script">Itinerario</h2>
      <div class="agenda">${d.agenda
        .map((a) => `<div class="item"><div class="h">${hora12(a.hora)}</div><div><div class="t">${esc(a.titulo)}</div>${a.detalle ? `<div class="d">${esc(a.detalle)}</div>` : ""}</div></div>`)
        .join("")}</div>
    </div></section>`);
  }

  // Vestimenta
  if (d.vestimenta?.activa && d.vestimenta.texto) {
    secciones.push(`<section><div class="wrap reveal">
      <p class="etq">Para tener en cuenta</p><h2 class="script">${esc(d.vestimenta.titulo)}</h2>
      <p class="p-lead">${parrafos(d.vestimenta.texto)}</p>
    </div></section>`);
  }

  // Galeria
  if (d.galeria?.length) {
    secciones.push(`<section><div class="wrap">
      <div class="reveal"><p class="etq">Momentos</p><h2 class="script">Galería</h2></div>
      <div class="galeria reveal">${d.galeria
        .map((g, i) => `<button type="button" data-src="${esc(media(base, g))}" aria-label="Ver foto ${i + 1}"><img loading="lazy" src="${esc(media(base, g))}" alt=""></button>`)
        .join("")}</div>
    </div></section>
    <div class="lightbox" id="lightbox" role="dialog" aria-label="Foto ampliada"><img alt=""><button class="lb-x" aria-label="Cerrar">×</button><button class="lb-a" aria-label="Anterior">‹</button><button class="lb-s" aria-label="Siguiente">›</button></div>`);
  }

  // Regalos
  const r = d.regalos || {};
  if (r.activa && (r.texto || r.cuentas?.length || r.yape || r.lista_url)) {
    const copiar = (v) => `<button type="button" class="copiar" data-copiar="${esc(v)}">${ICONOS.copiar} Copiar</button>`;
    secciones.push(`<section><div class="wrap reveal">
      <div style="color:var(--accent)">${ICONOS.regalo}</div>
      <p class="etq">Mesa de regalos</p><h2 class="script">Regalos</h2>
      ${r.texto ? `<p class="p-lead">${parrafos(r.texto)}</p>` : ""}
      <div class="cuentas">
        ${(r.cuentas || [])
          .map(
            (c) => `<div class="card">
              <p class="banco">${esc(c.banco || "Cuenta")}</p>
              ${c.titular ? `<p class="muted" style="font-size:13px">${esc(c.titular)}</p>` : ""}
              <div class="fila"><span>N.° ${esc(c.numero)}</span>${copiar(c.numero)}</div>
              ${c.cci ? `<div class="fila"><span>CCI ${esc(c.cci)}</span>${copiar(c.cci)}</div>` : ""}
            </div>`
          )
          .join("")}
        ${r.yape ? `<div class="card"><p class="banco">Yape / Plin</p><div class="fila"><span>${esc(r.yape)}</span>${copiar(r.yape.replace(/\s/g, ""))}</div></div>` : ""}
      </div>
      ${r.lista_url ? `<div class="btns"><a class="btn" href="${esc(r.lista_url)}" target="_blank" rel="noopener">Ver lista de regalos</a></div>` : ""}
    </div></section>`);
  }

  // RSVP
  const rs = d.rsvp || {};
  const rsvpAbierto = rs.activa && (rs.modo !== "solo_invitados" || invitado);
  if (rsvpAbierto) {
    const yaPaso = rs.fecha_limite && new Date().toISOString().slice(0, 10) > rs.fecha_limite;
    const limite = rs.fecha_limite
      ? new Intl.DateTimeFormat("es-PE", { day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${rs.fecha_limite}T12:00:00Z`))
      : "";
    const maxPases = invitado ? invitado.pases : 10;
    secciones.push(`<section id="confirmar"><div class="wrap reveal">
      <p class="etq">RSVP</p><h2 class="script">Confirma tu asistencia</h2>
      <p class="muted">${limite ? `Por favor, confírmanos antes del <b>${esc(limite)}</b>.` : "Tu respuesta nos ayuda a preparar todo."}${rs.nota ? `<br>${esc(rs.nota)}` : ""}</p>
      ${
        yaPaso
          ? `<p class="aviso on">El plazo para confirmar terminó. Comunícate directamente con los anfitriones.</p>`
          : `<form id="form-rsvp" class="card" autocomplete="on">
        <div><label for="r-nombre">Nombre${invitado ? "" : " y apellido"}</label><input id="r-nombre" name="nombre" required maxlength="120" value="${invitado ? esc(invitado.nombre) : ""}"></div>
        <div class="opciones" role="radiogroup" aria-label="¿Asistirás?">
          <label><input type="radio" name="asiste" value="si" checked> ¡Sí, asistiré!</label>
          <label><input type="radio" name="asiste" value="no"> No podré ir</label>
        </div>
        <div id="campo-cantidad"><label for="r-cant">¿Cuántas personas asistirán?</label>
          <select id="r-cant" name="cantidad">${Array.from({ length: maxPases }, (_, i) => `<option value="${i + 1}" ${i + 1 === maxPases && invitado ? "selected" : ""}>${i + 1}</option>`).join("")}</select>
        </div>
        ${rs.menu?.length ? `<div><label for="r-menu">Menú</label><select id="r-menu" name="menu"><option value="">Sin preferencia</option>${rs.menu.map((m) => `<option>${esc(m)}</option>`).join("")}</select></div>` : ""}
        <div><label for="r-tel">Celular (opcional)</label><input id="r-tel" name="telefono" inputmode="tel" maxlength="30"></div>
        <div><label for="r-msg">Mensaje para los anfitriones (opcional)</label><textarea id="r-msg" name="mensaje" rows="3" maxlength="500"></textarea></div>
        <input class="trampa" name="sitio_web" tabindex="-1" autocomplete="off" aria-hidden="true">
        <button class="btn" type="submit">Enviar confirmación</button>
      </form>
      <p class="aviso" id="aviso-rsvp" role="status"></p>`
      }
    </div></section>`);
  }

  // Firmas
  if (d.firmas?.activa) {
    secciones.push(`<section><div class="wrap reveal">
      <p class="etq">Libro de firmas</p><h2 class="script">Déjanos un mensaje</h2>
      <form id="form-firma" class="card">
        <div><label for="f-nombre">Tu nombre</label><input id="f-nombre" name="nombre" required maxlength="80" value="${invitado ? esc(invitado.nombre) : ""}"></div>
        <div><label for="f-msg">Tus buenos deseos</label><textarea id="f-msg" name="mensaje" rows="3" required maxlength="500"></textarea></div>
        <input class="trampa" name="sitio_web" tabindex="-1" autocomplete="off" aria-hidden="true">
        <button class="btn" type="submit">Firmar</button>
      </form>
      <p class="aviso" id="aviso-firma" role="status" style="margin-top:12px"></p>
      <div class="firmas" id="lista-firmas">${firmas.map((x) => `<div class="firma"><p>${esc(x.mensaje)}</p><b>${esc(x.nombre)}</b></div>`).join("")}</div>
    </div></section>`);
  }

  // Cierre
  const textoCompartir = encodeURIComponent(`${titulo} — ${urlAbs}`);
  secciones.push(`<section><div class="wrap reveal">
    ${ORNAMENTO}
    ${d.cierre ? `<p class="script" style="font-size:40px;color:var(--accent)">${esc(d.cierre)}</p>` : ""}
    ${d.hashtag ? `<p class="hashtag">#${esc(d.hashtag.replace(/^#/, ""))}</p><p class="muted" style="font-size:13px">Comparte tus fotos con este hashtag</p>` : ""}
    <div class="btns"><a class="btn sec" href="https://wa.me/?text=${textoCompartir}" target="_blank" rel="noopener">${ICONOS.whatsapp} Compartir</a></div>
  </div></section>`);

  const apertura = d.apertura?.activa
    ? d.apertura.estilo === "telon"
      ? `<div class="apertura telon" id="apertura" role="button" tabindex="0" aria-label="Abrir invitación">
          <div class="medallon">${esc(iniciales(t))}</div>
          ${invitado ? `<p class="para" style="color:var(--paper)">Para<b style="color:var(--paper)">${esc(invitado.nombre)}</b></p>` : ""}
          <p class="toca" style="color:var(--paper)">Toca para abrir</p>
        </div>`
      : `<div class="apertura" id="apertura" role="button" tabindex="0" aria-label="Abrir invitación">
          ${invitado ? `<p class="para">Para<b>${esc(invitado.nombre)}</b></p>` : `<p class="para">Tienes una invitación</p>`}
          <div class="sobre"><div class="cuerpo"></div><div class="carta">${esc(titulo)}</div><div class="tapa"></div><div class="sello">${esc(iniciales(t))}</div></div>
          <p class="toca">Toca para abrir</p>
        </div>`
    : "";

  const datosCliente = {
    base,
    invitado: invitado?.token || null,
    inicio: f ? f.inicio.toISOString() : null,
    fx: tema.fx,
    color: tema.accent,
    color2: tema.accent2,
    iconos: { musica: ICONOS.musica, pausa: ICONOS.pausa },
  };

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(titulo)}${d.portada?.antetitulo ? ` · ${esc(d.portada.antetitulo)}` : ""}</title>
<meta name="description" content="${esc(descripcion)}">
<meta name="robots" content="noindex,nofollow">
<meta name="theme-color" content="${tema.bg}">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(invitado ? `${invitado.nombre}, estás invitado: ${titulo}` : titulo)}">
<meta property="og:description" content="${esc(descripcion)}">
<meta property="og:url" content="${esc(urlAbs + tk)}">
${foto ? `<meta property="og:image" content="${esc(urlAbs + "/media/" + encodeURIComponent(foto))}"><meta name="twitter:card" content="summary_large_image">` : ""}
${fuentes(tema)}
<style>${variables(tema)}${CSS}</style>
</head>
<body class="${apertura ? "cerrada" : ""}">
${vistaPrevia ? `<div style="position:fixed;top:0;left:0;right:0;z-index:90;background:#111;color:#fff;font:600 12px system-ui;text-align:center;padding:6px">Vista previa · ${esc(t.estado)}</div>` : ""}
${apertura}
<div class="fx" id="fx" aria-hidden="true"></div>
<header class="hero ${foto ? "con-foto" : ""}">
  ${foto ? `<div class="foto" style="background-image:url('${esc(media(base, foto))}')"></div>` : ""}
  <div class="marco">
    ${d.portada?.antetitulo ? `<p class="etq">${esc(d.portada.antetitulo)}</p>` : ""}
    ${ORNAMENTO}
    <h1 class="script">${esc(titulo)}</h1>
    ${d.portada?.subtitulo ? `<p class="sub">${esc(d.portada.subtitulo)}</p>` : ""}
    ${f ? `<div class="fecha-hero"><span>${esc(f.mes)}</span><b>${esc(f.dia)}</b><span>${esc(f.anio)}</span></div>` : ""}
  </div>
  <div class="scroll">Desliza ↓</div>
</header>
<main>
${secciones.join("\n")}
</main>
<footer>Invitación digital creada por <a href="https://fotoface.pro" target="_blank" rel="noopener">FotoFace</a></footer>
${d.musica?.archivo ? `<audio id="audio" src="${esc(media(base, d.musica.archivo))}" loop preload="auto"></audio><button class="musica" id="btn-musica" type="button" aria-label="Reproducir música">${ICONOS.musica}</button>` : ""}
<script>window.__TARJETA__=${json(datosCliente)};</script>
<script>${JS}</script>
</body>
</html>`;
}

/** Pagina sencilla para el anfitrion: confirmaciones y firmas (solo lectura). */
function renderAnfitrion(t, { respuestas, invitados, firmas }) {
  const tema = TEMAS[t.datos.tema] || TEMAS.marfil;
  const si = respuestas.filter((r) => r.asiste);
  const no = respuestas.filter((r) => !r.asiste);
  const asistentes = si.reduce((s, r) => s + r.cantidad, 0);
  const pendientes = invitados.filter((i) => i.asiste === null || i.asiste === undefined);
  const fila = (r) =>
    `<tr><td>${esc(r.nombre)}${r.grupo ? `<br><small>${esc(r.grupo)}</small>` : ""}</td><td>${r.asiste ? r.cantidad : "—"}</td><td>${esc(r.menu || "")}</td><td>${esc(r.mensaje || "")}</td></tr>`;
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Confirmaciones · ${esc(t.titulo)}</title><meta name="robots" content="noindex,nofollow">${fuentes(tema)}
<style>${variables(tema)}
*{box-sizing:border-box;margin:0}body{background:var(--bg);color:var(--ink);font:15px/1.6 var(--f-body);padding:28px 16px 60px}
.w{max-width:860px;margin:0 auto}h1{font:400 48px/1.1 var(--f-script);color:var(--accent);text-align:center}
.sub{text-align:center;color:var(--muted);margin-bottom:24px}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:26px}
.k{background:var(--paper);border-radius:16px;padding:16px;text-align:center;border:1px solid color-mix(in srgb,var(--accent) 22%,transparent)}
.k b{display:block;font:500 36px/1 var(--f-title);color:var(--accent)}.k span{font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)}
h2{font:600 20px var(--f-title);margin:26px 0 10px}
.tabla{overflow-x:auto;background:var(--paper);border-radius:14px;border:1px solid color-mix(in srgb,var(--accent) 22%,transparent)}
table{width:100%;border-collapse:collapse;font-size:14px}th,td{padding:10px 12px;text-align:left;border-bottom:1px solid color-mix(in srgb,var(--accent) 14%,transparent);vertical-align:top}
th{font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)}small{color:var(--muted)}
.firma{background:var(--paper);border-radius:12px;padding:12px 14px;margin-bottom:8px;border-left:3px solid var(--accent)}
.vacio{color:var(--muted);padding:14px}
</style></head><body><div class="w">
<h1>${esc(t.titulo)}</h1><p class="sub">Confirmaciones de tu invitación · se actualiza al recargar</p>
<div class="kpis">
  <div class="k"><b>${asistentes}</b><span>Personas confirmadas</span></div>
  <div class="k"><b>${si.length}</b><span>Respuestas «sí»</span></div>
  <div class="k"><b>${no.length}</b><span>No asistirán</span></div>
  ${invitados.length ? `<div class="k"><b>${pendientes.length}</b><span>Invitados sin responder</span></div>` : ""}
</div>
<h2>Asistirán</h2><div class="tabla">${si.length ? `<table><thead><tr><th>Nombre</th><th>Personas</th><th>Menú</th><th>Mensaje</th></tr></thead><tbody>${si.map(fila).join("")}</tbody></table>` : `<p class="vacio">Aún no hay confirmaciones.</p>`}</div>
<h2>No asistirán</h2><div class="tabla">${no.length ? `<table><thead><tr><th>Nombre</th><th></th><th></th><th>Mensaje</th></tr></thead><tbody>${no.map(fila).join("")}</tbody></table>` : `<p class="vacio">Nadie por ahora.</p>`}</div>
${pendientes.length ? `<h2>Sin responder</h2><div class="tabla"><table><tbody>${pendientes.map((i) => `<tr><td>${esc(i.nombre)}${i.grupo ? ` <small>· ${esc(i.grupo)}</small>` : ""}</td><td>${i.pases} pase(s)</td><td>${i.abierta_en ? "Abrió la tarjeta" : "No la abrió aún"}</td></tr>`).join("")}</tbody></table></div>` : ""}
${firmas.length ? `<h2>Libro de firmas</h2>${firmas.map((x) => `<div class="firma">${esc(x.mensaje)}<br><small>— ${esc(x.nombre)}</small></div>`).join("")}` : ""}
</div></body></html>`;
}

function renderNoDisponible(mensaje = "Esta invitación no está disponible.") {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Invitación no disponible</title><meta name="robots" content="noindex">
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f5efe4;color:#3b3127;font:16px/1.6 system-ui,sans-serif;text-align:center;padding:20px}a{color:#0a5fa3;font-weight:600}</style></head>
<body><div><p style="font-size:42px;margin:0">💌</p><p>${esc(mensaje)}</p><p><a href="https://fotoface.pro">Crea tu invitación digital con FotoFace</a></p></div></body></html>`;
}

module.exports = { TEMAS, esc, ics, renderTarjeta, renderAnfitrion, renderNoDisponible };
