# FotoFace — Sistema agéntico (fotoface.ia.nom.pe)

Sistema propio de la marca **FotoFace** (estudio de fotografía e impresión fotográfica, web pública en
`fotoface.pro`). Datos, usuarios, claves y base de datos propios: no comparte nada con otros sistemas.

- **Lumi**: asistente de IA que atiende por WhatsApp (Twilio / Meta / YCloud / Evolution) y por el chat
  web de fotoface.pro (`/widget.js`). Agenda sesiones, toma pedidos de impresión y da su estado.
- **Dashboard**: conversaciones en vivo con toma de control humano, sesiones y citas (Google Calendar
  opcional), **pedidos de impresión** (estados, monto, envío a Repartos), contactos y ventas,
  marketing, oficina (cotizaciones), base de conocimiento, conexiones, usuarios.
- **Apps integradas** con entrada automática (pase SSO firmado, cuenta propia `fotoface` en cada app):
  Repartos (en Pedidos), Carruseles, Convertir video, Quitar marca de agua, Catálogos, Editor de
  videos, Slides, Convertir documentos.

## Stack
Node.js + Express + SQLite (`server/data/fotoface.db`) · React + Vite + Tailwind · Socket.IO ·
Claude (`claude-haiku-5-5` por defecto; clave en `.env` o desde el dashboard).

## Pedidos
- Entran por Lumi (`registrar_pedido`), por el formulario de fotoface.pro (`POST /api/publico/pedido`,
  CORS solo para `WEB_ORIGINS`, límite por IP y campo trampa) o los crea el equipo.
- "Enviar a Repartos" crea la entrega en repartos.ia.nom.pe con `REPARTOS_API_KEY` (clave de API
  propia de la cuenta `fotoface`: solo ve sus entregas) y devuelve el enlace para que el cliente
  comparta su ubicación.

## Despliegue (VPS)
`/opt/automations/systems/fotoface-ia`, servicio systemd `fotoface-ia`, puerto `127.0.0.1:3021`,
Caddy `fotoface.ia.nom.pe`. Compilar el cliente: `cd client && npx vite build`.
