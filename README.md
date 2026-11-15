# FotoFace

Estudio de fotografía e impresión fotográfica.

- [`web/`](web) — sitio público **fotoface.pro** (HTML/CSS/JS estático, servido por Caddy). Datos de contacto en `web/assets/js/config.js`.
- [`sistema/`](sistema) — sistema agéntico **fotoface.ia.nom.pe**: asistente Lumi (WhatsApp y chat web), dashboard, pedidos de impresión con envío a Repartos y apps integradas. Ver [`sistema/README.md`](sistema/README.md).
- **Tarjetas digitales** — invitaciones interactivas. Se crean y gestionan en el sistema (sección *Tarjetas digitales*); cada tarjeta publicada vive en `<nombre>.fotoface.pro` y las marcadas como muestra se ven en la vitrina pública **tarjetas.fotoface.pro**, enlazada desde fotoface.pro. La vitrina y las tarjetas las sirve el servidor del sistema.
