import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft, Copy, Download, Eye, EyeOff, ExternalLink, Heart, ImagePlus, Loader2, Music, Plus, RefreshCw,
  Save, Send, Trash2, Users, X, Check, CopyPlus, MessageCircle,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import * as api from "@/lib/tarjetasApi";
import { socket } from "@/lib/socket";

const ESTADOS = {
  borrador: { etiqueta: "Borrador", variante: "warning" },
  publicada: { etiqueta: "Publicada", variante: "success" },
  archivada: { etiqueta: "Archivada", variante: "secondary" },
};

// Muestras de color para elegir tema (deben coincidir con server/services/tarjetaPagina.js).
const TEMAS = {
  marfil: { nombre: "Marfil y oro", bg: "#f5efe4", accent: "#b08d57" },
  salvia: { nombre: "Verde salvia", bg: "#edf0e8", accent: "#7d9474" },
  rubor: { nombre: "Rosa rubor", bg: "#f8ecec", accent: "#c4848d" },
  cielo: { nombre: "Celeste cielo", bg: "#e9f2f9", accent: "#5f97c2" },
  noche: { nombre: "Noche dorada", bg: "#0f1729", accent: "#d4b26a" },
  terracota: { nombre: "Terracota", bg: "#f3e7dc", accent: "#bf6d47" },
  fiesta: { nombre: "Fiesta", bg: "#fff4e6", accent: "#f2506b" },
  lavanda: { nombre: "Lavanda", bg: "#f0edf7", accent: "#9583c0" },
};

const selectCls = "w-full rounded-md border border-input bg-card px-3 py-2 text-sm";

function Campo({ etiqueta, ayuda, children, className = "" }) {
  return (
    <label className={`flex flex-col gap-1.5 ${className}`}>
      <span className="text-xs font-semibold text-muted-foreground">{etiqueta}</span>
      {children}
      {ayuda && <span className="text-xs text-muted-foreground">{ayuda}</span>}
    </label>
  );
}

function Interruptor({ activo, onChange, etiqueta }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!activo)}
      className="flex items-center gap-3 text-sm font-medium"
      aria-pressed={activo}
    >
      <span className={`relative h-6 w-11 rounded-full transition-colors ${activo ? "bg-brand-primary" : "bg-muted-foreground/30"}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${activo ? "left-[22px]" : "left-0.5"}`} />
      </span>
      {etiqueta}
    </button>
  );
}

/** Lista de filas editables (lugares, agenda, familia, cuentas...). */
function ListaEditable({ items, campos, onChange, textoAgregar, max = 12 }) {
  const lista = items || [];
  const cambiar = (i, k, v) => onChange(lista.map((it, j) => (j === i ? { ...it, [k]: v } : it)));
  const mover = (i, d) => {
    const n = [...lista];
    const [x] = n.splice(i, 1);
    n.splice(i + d, 0, x);
    onChange(n);
  };
  return (
    <div className="flex flex-col gap-3">
      {lista.map((it, i) => (
        <div key={i} className="relative grid gap-2 rounded-lg border border-border bg-muted/30 p-3 pr-10 md:grid-cols-6">
          {campos.map((c) =>
            c.area ? (
              <Textarea key={c.k} rows={2} className={c.cls || "md:col-span-6"} placeholder={c.ph} value={it[c.k] || ""} onChange={(e) => cambiar(i, c.k, e.target.value)} />
            ) : (
              <Input key={c.k} type={c.type || "text"} className={c.cls || "md:col-span-3"} placeholder={c.ph} value={it[c.k] || ""} onChange={(e) => cambiar(i, c.k, e.target.value)} />
            )
          )}
          <div className="absolute right-2 top-2 flex flex-col gap-1">
            <button type="button" className="text-muted-foreground hover:text-destructive" onClick={() => onChange(lista.filter((_, j) => j !== i))} aria-label="Quitar">
              <X className="h-4 w-4" />
            </button>
            {i > 0 && (
              <button type="button" className="text-xs text-muted-foreground" onClick={() => mover(i, -1)} aria-label="Subir">▲</button>
            )}
            {i < lista.length - 1 && (
              <button type="button" className="text-xs text-muted-foreground" onClick={() => mover(i, 1)} aria-label="Bajar">▼</button>
            )}
          </div>
        </div>
      ))}
      {lista.length < max && (
        <Button type="button" variant="outline" size="sm" className="self-start" onClick={() => onChange([...lista, {}])}>
          <Plus className="h-4 w-4" /> {textoAgregar}
        </Button>
      )}
    </div>
  );
}

function copiar(texto, aviso = "Copiado.") {
  navigator.clipboard?.writeText(texto).then(() => toast.success(aviso), () => toast.error("No se pudo copiar."));
}

function enlaceWhatsapp(numero, texto) {
  return `https://wa.me/${numero || ""}?text=${encodeURIComponent(texto)}`;
}

/* ------------------------------ Nueva tarjeta ------------------------------ */

function FormularioNueva({ tipos, dominio, onCreada, onCerrar }) {
  const [datos, setDatos] = useState({ tipo: "boda", titulo: "", slug: "", cliente_nombre: "", cliente_whatsapp: "", fecha_evento: "" });
  const [slugManual, setSlugManual] = useState(false);
  const [estadoSlug, setEstadoSlug] = useState(null);
  const cambiar = (k) => (e) => setDatos((d) => ({ ...d, [k]: e.target.value }));

  useEffect(() => {
    const t = setTimeout(async () => {
      if (!datos.titulo && !datos.slug) return setEstadoSlug(null);
      try {
        const r = await api.sugerirSlug(slugManual ? { slug: datos.slug } : { titulo: datos.titulo });
        if (!slugManual) setDatos((d) => ({ ...d, slug: r.slug }));
        setEstadoSlug(r);
      } catch {
        setEstadoSlug(null);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [datos.titulo, datos.slug, slugManual]);

  const mutacion = useMutation({
    mutationFn: () => api.crearTarjeta(datos),
    onSuccess: (t) => {
      toast.success("Tarjeta creada. Ahora complétala.");
      onCreada(t);
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Card>
      <CardContent className="grid gap-4 p-5 md:grid-cols-2">
        <Campo etiqueta="Tipo de evento">
          <select className={selectCls} value={datos.tipo} onChange={cambiar("tipo")}>
            {Object.entries(tipos).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </Campo>
        <Campo etiqueta="Título (nombres de los festejados)">
          <Input placeholder="José & María" value={datos.titulo} onChange={cambiar("titulo")} autoFocus />
        </Campo>
        <Campo
          etiqueta="Subdominio"
          className="md:col-span-2"
          ayuda={
            estadoSlug?.error ? (
              <span className="text-destructive">{estadoSlug.error}</span>
            ) : estadoSlug && !estadoSlug.disponible ? (
              <span className="text-destructive">Ese subdominio ya está en uso.</span>
            ) : estadoSlug?.disponible ? (
              <span className="text-emerald-600">Disponible ✓</span>
            ) : (
              "Se genera solo a partir del título; puedes cambiarlo."
            )
          }
        >
          <div className="flex items-center overflow-hidden rounded-md border border-input bg-card">
            <span className="pl-3 text-sm text-muted-foreground">https://</span>
            <input
              className="min-w-0 flex-1 bg-transparent px-1 py-2 text-sm font-semibold outline-none"
              value={datos.slug}
              onChange={(e) => {
                setSlugManual(true);
                setDatos((d) => ({ ...d, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") }));
              }}
            />
            <span className="pr-3 text-sm text-muted-foreground">.{dominio}</span>
          </div>
        </Campo>
        <Campo etiqueta="Cliente (quien encarga)">
          <Input placeholder="Nombre del cliente" value={datos.cliente_nombre} onChange={cambiar("cliente_nombre")} />
        </Campo>
        <Campo etiqueta="WhatsApp del cliente">
          <Input placeholder="987654321" value={datos.cliente_whatsapp} onChange={cambiar("cliente_whatsapp")} />
        </Campo>
        <Campo etiqueta="Fecha y hora del evento">
          <Input type="datetime-local" value={datos.fecha_evento} onChange={cambiar("fecha_evento")} />
        </Campo>
        <div className="flex items-end gap-2">
          <Button onClick={() => mutacion.mutate()} disabled={mutacion.isPending || !datos.titulo || (estadoSlug && !estadoSlug.disponible)}>
            {mutacion.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Crear tarjeta
          </Button>
          <Button variant="outline" onClick={onCerrar}>Cancelar</Button>
        </div>
      </CardContent>
    </Card>
  );
}

/* ------------------------------ Subida de archivos ------------------------------ */

function BotonSubir({ tarjetaId, acepta, multiple, onSubido, children }) {
  const ref = useRef(null);
  const [subiendo, setSubiendo] = useState(false);
  async function alElegir(e) {
    const archivos = [...(e.target.files || [])];
    e.target.value = "";
    if (!archivos.length) return;
    setSubiendo(true);
    try {
      for (const f of archivos) {
        const r = await api.subirArchivo(tarjetaId, f);
        onSubido(r.archivo);
      }
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSubiendo(false);
    }
  }
  return (
    <>
      <input ref={ref} type="file" accept={acepta} multiple={multiple} className="hidden" onChange={alElegir} />
      <Button type="button" variant="outline" size="sm" onClick={() => ref.current?.click()} disabled={subiendo}>
        {subiendo ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />} {subiendo ? "Subiendo..." : children}
      </Button>
    </>
  );
}

/* ------------------------------ Invitados ------------------------------ */

function PanelInvitados({ tarjeta }) {
  const queryClient = useQueryClient();
  const clave = ["tarjeta-invitados", tarjeta.id];
  const { data: invitados = [] } = useQuery({ queryKey: clave, queryFn: () => api.listarInvitados(tarjeta.id) });
  const [uno, setUno] = useState({ nombre: "", pases: "2", whatsapp: "", grupo: "" });
  const [masivo, setMasivo] = useState("");
  const refrescar = () => queryClient.invalidateQueries({ queryKey: clave });

  const agregar = useMutation({
    mutationFn: (lista) => api.agregarInvitados(tarjeta.id, lista),
    onSuccess: (r) => {
      toast.success(`${r.agregados} invitado(s) agregados.`);
      setUno({ nombre: "", pases: "2", whatsapp: "", grupo: "" });
      setMasivo("");
      refrescar();
    },
    onError: (e) => toast.error(e.message),
  });
  const quitar = useMutation({ mutationFn: (inv) => api.eliminarInvitado(tarjeta.id, inv), onSuccess: refrescar });

  function agregarMasivo() {
    const filas = masivo
      .split("\n")
      .map((l) => l.split(/[;\t]/).map((x) => x.trim()))
      .filter((p) => p[0])
      .map(([nombre, pases, whatsapp, grupo]) => ({ nombre, pases, whatsapp, grupo }));
    if (!filas.length) return toast.error("Pega al menos una línea.");
    agregar.mutate(filas);
  }

  const totalPases = invitados.reduce((s, i) => s + i.pases, 0);
  const confirmados = invitados.filter((i) => i.asiste === 1).reduce((s, i) => s + i.cantidad, 0);

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-muted-foreground">
        Cada invitado recibe un <b>enlace personal</b>: la tarjeta lo saluda por su nombre, muestra sus pases y limita la confirmación a esa cantidad.
        Envíalo por WhatsApp con un toque.
      </p>
      <div className="grid gap-2 rounded-lg border border-border p-3 md:grid-cols-12">
        <Input className="md:col-span-4" placeholder="Familia Pérez / Ana Torres" value={uno.nombre} onChange={(e) => setUno({ ...uno, nombre: e.target.value })} />
        <Input className="md:col-span-1" type="number" min="1" max="50" title="Pases" value={uno.pases} onChange={(e) => setUno({ ...uno, pases: e.target.value })} />
        <Input className="md:col-span-3" placeholder="WhatsApp (opcional)" value={uno.whatsapp} onChange={(e) => setUno({ ...uno, whatsapp: e.target.value })} />
        <Input className="md:col-span-2" placeholder="Grupo (novia, trabajo...)" value={uno.grupo} onChange={(e) => setUno({ ...uno, grupo: e.target.value })} />
        <Button className="md:col-span-2" onClick={() => uno.nombre && agregar.mutate([uno])} disabled={agregar.isPending}>
          <Plus className="h-4 w-4" /> Agregar
        </Button>
      </div>
      <details className="rounded-lg border border-border p-3 text-sm">
        <summary className="cursor-pointer font-semibold">Agregar varios a la vez (pegar desde Excel)</summary>
        <p className="my-2 text-xs text-muted-foreground">Una línea por invitado: <code>Nombre; pases; WhatsApp; grupo</code> (también sirve copiar columnas desde Excel).</p>
        <Textarea rows={5} value={masivo} onChange={(e) => setMasivo(e.target.value)} placeholder={"Familia Pérez; 4; 987654321; Novio\nAna Torres; 2"} />
        <Button size="sm" className="mt-2" onClick={agregarMasivo} disabled={agregar.isPending}>Agregar lista</Button>
      </details>

      <div className="flex flex-wrap gap-4 text-sm">
        <span><b>{invitados.length}</b> invitaciones</span>
        <span><b>{totalPases}</b> pases</span>
        <span><b>{confirmados}</b> personas confirmadas</span>
        <span><b>{invitados.filter((i) => i.abierta_en).length}</b> abrieron la tarjeta</span>
      </div>

      <div className="divide-y divide-border rounded-lg border border-border">
        {invitados.length === 0 && <p className="p-4 text-sm text-muted-foreground">Aún no hay invitados. La tarjeta también funciona con un enlace general sin nombres.</p>}
        {invitados.map((i) => {
          const enlace = `${tarjeta.url}?i=${i.token}`;
          const mensaje = `Hola ${i.nombre} 💌\nCon mucho cariño te enviamos nuestra invitación:\n${enlace}`;
          return (
            <div key={i.id} className="flex flex-col gap-2 p-3 md:flex-row md:items-center md:justify-between">
              <div className="min-w-0">
                <p className="text-sm font-semibold">
                  {i.nombre} <span className="font-normal text-muted-foreground">· {i.pases} pase(s){i.grupo ? ` · ${i.grupo}` : ""}</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {i.asiste === 1 ? <span className="text-emerald-600">Confirmó {i.cantidad}</span> : i.asiste === 0 ? <span className="text-destructive">No asistirá</span> : "Sin respuesta"}
                  {" · "}
                  {i.abierta_en ? "abrió la tarjeta" : "no la abrió aún"}
                  {i.menu ? ` · menú: ${i.menu}` : ""}
                </p>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button variant="outline" size="sm" onClick={() => copiar(enlace, "Enlace personal copiado.")} title="Copiar enlace">
                  <Copy className="h-4 w-4" />
                </Button>
                <a href={`/api/tarjetas/${tarjeta.id}/vista?i=${i.token}`} target="_blank" rel="noopener noreferrer">
                  <Button variant="outline" size="sm" title="Ver como este invitado"><Eye className="h-4 w-4" /></Button>
                </a>
                <a href={enlaceWhatsapp(i.whatsapp, mensaje)} target="_blank" rel="noopener noreferrer">
                  <Button size="sm" title="Enviar por WhatsApp"><MessageCircle className="h-4 w-4" /> Enviar</Button>
                </a>
                <Button variant="outline" size="sm" onClick={() => confirm(`¿Quitar a ${i.nombre}?`) && quitar.mutate(i.id)} title="Quitar">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------ Confirmaciones ------------------------------ */

function PanelRespuestas({ tarjeta, rsvp, onRsvp }) {
  const queryClient = useQueryClient();
  const clave = ["tarjeta-respuestas", tarjeta.id];
  const { data } = useQuery({ queryKey: clave, queryFn: () => api.listarRespuestas(tarjeta.id) });
  const quitar = useMutation({ mutationFn: (r) => api.eliminarRespuesta(tarjeta.id, r), onSuccess: () => queryClient.invalidateQueries({ queryKey: clave }) });
  const respuestas = data?.respuestas || [];
  const enlaceAnfitrion = `${tarjeta.url}/anfitrion/${tarjeta.clave_anfitrion}`;

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 rounded-lg border border-border p-4 md:grid-cols-2">
        <Interruptor activo={rsvp.activa} onChange={(v) => onRsvp({ activa: v })} etiqueta="Recibir confirmaciones (RSVP)" />
        <Campo etiqueta="¿Quién puede confirmar?">
          <select className={selectCls} value={rsvp.modo} onChange={(e) => onRsvp({ modo: e.target.value })}>
            <option value="abierto">Cualquiera con el enlace</option>
            <option value="solo_invitados">Solo invitados con enlace personal</option>
          </select>
        </Campo>
        <Campo etiqueta="Fecha límite para confirmar">
          <Input type="date" value={rsvp.fecha_limite || ""} onChange={(e) => onRsvp({ fecha_limite: e.target.value })} />
        </Campo>
        <Campo etiqueta="Opciones de menú (separadas por coma, opcional)">
          <Input
            placeholder="Carne, Pescado, Vegetariano"
            defaultValue={(rsvp.menu || []).join(", ")}
            onBlur={(e) => onRsvp({ menu: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })}
          />
        </Campo>
        <Campo etiqueta="Nota bajo el formulario (opcional)" className="md:col-span-2">
          <Input placeholder="Evento solo para adultos" value={rsvp.nota || ""} onChange={(e) => onRsvp({ nota: e.target.value })} />
        </Campo>
      </div>

      <div className="flex flex-col gap-2 rounded-lg bg-muted/50 p-4 text-sm">
        <p className="font-semibold">Enlace para el cliente (anfitrión)</p>
        <p className="text-muted-foreground">Ahí ve en tiempo real quién confirmó, cuántos van, los menús y el libro de firmas. Es privado: no lo compartas con los invitados.</p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => copiar(enlaceAnfitrion, "Enlace del anfitrión copiado.")}><Copy className="h-4 w-4" /> Copiar enlace</Button>
          <a href={enlaceAnfitrion} target="_blank" rel="noopener noreferrer"><Button size="sm" variant="outline"><ExternalLink className="h-4 w-4" /> Abrir</Button></a>
          <a href={`/api/tarjetas/${tarjeta.id}/respuestas.csv`}><Button size="sm" variant="outline"><Download className="h-4 w-4" /> Descargar Excel (CSV)</Button></a>
        </div>
      </div>

      <div className="flex flex-wrap gap-4 text-sm">
        <span><b>{data?.resumen?.asistentes ?? 0}</b> personas asistirán</span>
        <span><b>{respuestas.filter((r) => r.asiste).length}</b> respuestas «sí»</span>
        <span><b>{data?.resumen?.no_asisten ?? 0}</b> no asistirán</span>
      </div>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
            <tr><th className="p-2">Nombre</th><th className="p-2">Asiste</th><th className="p-2">Personas</th><th className="p-2">Menú</th><th className="p-2">Mensaje</th><th className="p-2" /></tr>
          </thead>
          <tbody className="divide-y divide-border">
            {respuestas.length === 0 && <tr><td colSpan={6} className="p-4 text-muted-foreground">Aún no hay confirmaciones.</td></tr>}
            {respuestas.map((r) => (
              <tr key={r.id}>
                <td className="p-2 font-medium">{r.nombre}{r.telefono && <div className="text-xs text-muted-foreground">{r.telefono}</div>}</td>
                <td className="p-2">{r.asiste ? <Badge variant="success">Sí</Badge> : <Badge variant="destructive">No</Badge>}</td>
                <td className="p-2">{r.asiste ? r.cantidad : "—"}</td>
                <td className="p-2">{r.menu || ""}</td>
                <td className="max-w-xs p-2 text-muted-foreground">{r.mensaje || ""}</td>
                <td className="p-2">
                  <button className="text-muted-foreground hover:text-destructive" onClick={() => confirm("¿Borrar esta respuesta?") && quitar.mutate(r.id)} aria-label="Borrar"><Trash2 className="h-4 w-4" /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ------------------------------ Firmas ------------------------------ */

function PanelFirmas({ tarjeta, firmasCfg, onFirmas }) {
  const queryClient = useQueryClient();
  const clave = ["tarjeta-firmas", tarjeta.id];
  const { data: firmas = [] } = useQuery({ queryKey: clave, queryFn: () => api.listarFirmas(tarjeta.id) });
  const refrescar = () => queryClient.invalidateQueries({ queryKey: clave });
  const moderar = useMutation({ mutationFn: ({ id, aprobada }) => api.moderarFirma(tarjeta.id, id, aprobada), onSuccess: refrescar });
  const quitar = useMutation({ mutationFn: (id) => api.eliminarFirma(tarjeta.id, id), onSuccess: refrescar });
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-6 rounded-lg border border-border p-4">
        <Interruptor activo={firmasCfg.activa} onChange={(v) => onFirmas({ activa: v })} etiqueta="Libro de firmas visible" />
        <Interruptor activo={firmasCfg.moderar} onChange={(v) => onFirmas({ moderar: v })} etiqueta="Revisar mensajes antes de publicarlos" />
      </div>
      <div className="flex flex-col gap-2">
        {firmas.length === 0 && <p className="text-sm text-muted-foreground">Aún no hay mensajes.</p>}
        {firmas.map((f) => (
          <div key={f.id} className={`flex items-start justify-between gap-3 rounded-lg border p-3 ${f.aprobada ? "border-border" : "border-amber-300 bg-amber-50"}`}>
            <div>
              <p className="text-sm">{f.mensaje}</p>
              <p className="mt-1 text-xs font-semibold text-muted-foreground">— {f.nombre} {!f.aprobada && "· pendiente de aprobar"}</p>
            </div>
            <div className="flex shrink-0 gap-1">
              <Button size="sm" variant="outline" onClick={() => moderar.mutate({ id: f.id, aprobada: !f.aprobada })} title={f.aprobada ? "Ocultar" : "Aprobar"}>
                {f.aprobada ? <EyeOff className="h-4 w-4" /> : <Check className="h-4 w-4" />}
              </Button>
              <Button size="sm" variant="outline" onClick={() => confirm("¿Borrar este mensaje?") && quitar.mutate(f.id)} title="Borrar"><Trash2 className="h-4 w-4" /></Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------ Editor ------------------------------ */

function EditorTarjeta({ id, tipos, dominio, onVolver }) {
  const queryClient = useQueryClient();
  const { data: tarjeta, isLoading } = useQuery({ queryKey: ["tarjeta", id], queryFn: () => api.obtenerTarjeta(id) });
  const [form, setForm] = useState(null);
  const [cambios, setCambios] = useState(false);
  const [vistaKey, setVistaKey] = useState(0);
  const formRef = useRef(null);
  formRef.current = form;

  useEffect(() => {
    if (tarjeta && !cambios) {
      setForm({
        titulo: tarjeta.titulo,
        slug: tarjeta.slug,
        tipo: tarjeta.tipo,
        cliente_nombre: tarjeta.cliente_nombre || "",
        cliente_whatsapp: tarjeta.cliente_whatsapp || "",
        fecha_evento: tarjeta.fecha_evento || "",
        datos: tarjeta.datos,
      });
    }
  }, [tarjeta, cambios]);

  const guardar = useMutation({
    mutationFn: (extra = {}) => api.actualizarTarjeta(id, { ...form, ...extra }),
    onSuccess: (t) => {
      queryClient.setQueryData(["tarjeta", id], t);
      queryClient.invalidateQueries({ queryKey: ["tarjetas"] });
      setCambios(false);
      setVistaKey((k) => k + 1);
      toast.success("Cambios guardados.");
    },
    onError: (e) => toast.error(e.message),
  });

  const cambiarEstado = useMutation({
    mutationFn: (estado) => api.actualizarTarjeta(id, { ...form, estado }),
    onSuccess: (t) => {
      queryClient.setQueryData(["tarjeta", id], t);
      queryClient.invalidateQueries({ queryKey: ["tarjetas"] });
      setCambios(false);
      setVistaKey((k) => k + 1);
      toast.success(t.estado === "publicada" ? `¡Publicada en ${t.url.replace("https://", "")}!` : `Tarjeta en ${t.estado}.`);
    },
    onError: (e) => toast.error(e.message),
  });

  // Guardado rapido con Ctrl/Cmd + S
  useEffect(() => {
    const h = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        if (cambios) guardar.mutate();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  });

  if (isLoading || !form) return <p className="text-sm text-muted-foreground">Cargando...</p>;
  if (!tarjeta) return <p>No se encontró la tarjeta.</p>;

  const d = form.datos;
  const set = (k, v) => {
    setForm((f) => ({ ...f, [k]: v }));
    setCambios(true);
  };
  const setD = (k, v) => set("datos", { ...form.datos, [k]: v });
  const setDD = (k, sub) => setD(k, { ...(form.datos[k] || {}), ...sub });
  // Cambios que deben guardarse al momento (archivos ya subidos, ajustes de RSVP).
  const setDyGuardar = (k, v) => {
    const datos = { ...formRef.current.datos, [k]: v };
    setForm((f) => ({ ...f, datos }));
    guardar.mutate({ datos });
  };

  const estado = ESTADOS[tarjeta.estado];
  const mensajeCliente = `Hola ${tarjeta.cliente_nombre?.split(" ")[0] || ""} 😊\nTu invitación digital de FotoFace está lista:\n${tarjeta.url}\n\nAquí puedes ver en tiempo real quién confirma asistencia (enlace privado, solo para ti):\n${tarjeta.url}/anfitrion/${tarjeta.clave_anfitrion}`;

  return (
    <div className="flex flex-col gap-4">
      {/* Barra superior */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => (!cambios || confirm("Hay cambios sin guardar. ¿Salir igual?")) && onVolver()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0">
            <p className="flex items-center gap-2 truncate font-display text-lg font-bold">
              {tarjeta.titulo} <Badge variant={estado.variante}>{estado.etiqueta}</Badge>
            </p>
            <a href={tarjeta.url} target="_blank" rel="noopener noreferrer" className="text-sm text-brand-primary hover:underline">
              {tarjeta.url.replace("https://", "")}
            </a>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => copiar(tarjeta.url, "Enlace copiado.")}><Copy className="h-4 w-4" /> Copiar enlace</Button>
          <a href={enlaceWhatsapp(tarjeta.cliente_whatsapp, mensajeCliente)} target="_blank" rel="noopener noreferrer">
            <Button variant="outline" size="sm"><Send className="h-4 w-4" /> Enviar al cliente</Button>
          </a>
          {tarjeta.estado === "publicada" ? (
            <Button variant="outline" size="sm" onClick={() => cambiarEstado.mutate("borrador")}><EyeOff className="h-4 w-4" /> Despublicar</Button>
          ) : (
            <Button variant="outline" size="sm" onClick={() => cambiarEstado.mutate("publicada")}><Eye className="h-4 w-4" /> Publicar</Button>
          )}
          <Button size="sm" onClick={() => guardar.mutate()} disabled={!cambios || guardar.isPending}>
            {guardar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Guardar
          </Button>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_400px]">
        <Card>
          <CardContent className="p-5">
            <Tabs defaultValue="datos">
              <TabsList className="mb-5 h-auto flex-wrap justify-start">
                <TabsTrigger value="datos">Datos</TabsTrigger>
                <TabsTrigger value="portada">Portada</TabsTrigger>
                <TabsTrigger value="contenido">Contenido</TabsTrigger>
                <TabsTrigger value="galeria">Galería</TabsTrigger>
                <TabsTrigger value="regalos">Regalos</TabsTrigger>
                <TabsTrigger value="invitados">Invitados</TabsTrigger>
                <TabsTrigger value="rsvp">Confirmaciones</TabsTrigger>
                <TabsTrigger value="firmas">Firmas</TabsTrigger>
              </TabsList>

              <TabsContent value="datos" className="grid gap-4 md:grid-cols-2">
                <Campo etiqueta="Tipo de evento">
                  <select className={selectCls} value={form.tipo} onChange={(e) => set("tipo", e.target.value)}>
                    {Object.entries(tipos).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </Campo>
                <Campo etiqueta="Título interno"><Input value={form.titulo} onChange={(e) => set("titulo", e.target.value)} /></Campo>
                <Campo etiqueta="Subdominio" className="md:col-span-2" ayuda="Si lo cambias, el enlace anterior deja de funcionar.">
                  <div className="flex items-center overflow-hidden rounded-md border border-input bg-card">
                    <span className="pl-3 text-sm text-muted-foreground">https://</span>
                    <input className="min-w-0 flex-1 bg-transparent px-1 py-2 text-sm font-semibold outline-none" value={form.slug}
                      onChange={(e) => set("slug", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))} />
                    <span className="pr-3 text-sm text-muted-foreground">.{dominio}</span>
                  </div>
                </Campo>
                <Campo etiqueta="Cliente"><Input value={form.cliente_nombre} onChange={(e) => set("cliente_nombre", e.target.value)} /></Campo>
                <Campo etiqueta="WhatsApp del cliente"><Input value={form.cliente_whatsapp} onChange={(e) => set("cliente_whatsapp", e.target.value)} /></Campo>
                <Campo etiqueta="Fecha y hora del evento" ayuda="Activa la cuenta regresiva y el botón «Agendar».">
                  <Input type="datetime-local" value={form.fecha_evento} onChange={(e) => set("fecha_evento", e.target.value)} />
                </Campo>
                <div />
                <div className="md:col-span-2">
                  <p className="mb-2 text-xs font-semibold text-muted-foreground">Estilo de la tarjeta</p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {Object.entries(TEMAS).map(([k, t]) => (
                      <button key={k} type="button" onClick={() => setD("tema", k)}
                        className={`flex items-center gap-2 rounded-lg border p-2 text-left text-xs font-medium transition ${d.tema === k ? "border-brand-primary ring-2 ring-brand-primary/30" : "border-border hover:bg-muted"}`}>
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border" style={{ background: t.bg }}>
                          <span className="h-4 w-4 rounded-full" style={{ background: t.accent }} />
                        </span>
                        {t.nombre}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex gap-2 border-t border-border pt-4 md:col-span-2">
                  <Button variant="outline" size="sm" onClick={async () => {
                    const t = await api.duplicarTarjeta(id).catch((e) => toast.error(e.message));
                    if (t) { toast.success("Copia creada (sin fotos ni música)."); queryClient.invalidateQueries({ queryKey: ["tarjetas"] }); }
                  }}><CopyPlus className="h-4 w-4" /> Duplicar como plantilla</Button>
                  {tarjeta.estado !== "archivada" && (
                    <Button variant="outline" size="sm" onClick={() => cambiarEstado.mutate("archivada")}>Archivar</Button>
                  )}
                  <Button variant="outline" size="sm" className="text-destructive" onClick={async () => {
                    if (!confirm(`¿Eliminar "${tarjeta.titulo}" con sus invitados, confirmaciones, firmas y fotos? No se puede deshacer.`)) return;
                    await api.eliminarTarjeta(id);
                    queryClient.invalidateQueries({ queryKey: ["tarjetas"] });
                    toast.success("Tarjeta eliminada.");
                    onVolver();
                  }}><Trash2 className="h-4 w-4" /> Eliminar</Button>
                </div>
              </TabsContent>

              <TabsContent value="portada" className="grid gap-4 md:grid-cols-2">
                <Campo etiqueta="Texto superior"><Input placeholder="¡Nos casamos!" value={d.portada.antetitulo} onChange={(e) => setDD("portada", { antetitulo: e.target.value })} /></Campo>
                <Campo etiqueta="Nombres (título principal)"><Input placeholder="José & María" value={d.portada.titulo} onChange={(e) => setDD("portada", { titulo: e.target.value })} /></Campo>
                <Campo etiqueta="Subtítulo" className="md:col-span-2"><Input placeholder="Y queremos que seas parte de este día" value={d.portada.subtitulo} onChange={(e) => setDD("portada", { subtitulo: e.target.value })} /></Campo>
                <div className="flex flex-col gap-2 md:col-span-2">
                  <span className="text-xs font-semibold text-muted-foreground">Foto de portada (también sale al compartir por WhatsApp)</span>
                  <div className="flex items-center gap-3">
                    {d.portada.foto && <img src={api.urlMedia(id, d.portada.foto)} alt="" className="h-20 w-20 rounded-lg object-cover" />}
                    <BotonSubir tarjetaId={id} acepta="image/*" onSubido={(a) => setDyGuardar("portada", { ...d.portada, foto: a })}>
                      {d.portada.foto ? "Cambiar foto" : "Subir foto"}
                    </BotonSubir>
                    {d.portada.foto && <Button variant="outline" size="sm" onClick={() => setDyGuardar("portada", { ...d.portada, foto: null })}>Quitar</Button>}
                  </div>
                </div>
                <div className="flex flex-col gap-3 rounded-lg border border-border p-4 md:col-span-2">
                  <Interruptor activo={d.apertura.activa} onChange={(v) => setDD("apertura", { activa: v })} etiqueta="Animación de apertura" />
                  {d.apertura.activa && (
                    <div className="grid gap-3 md:grid-cols-2">
                      <Campo etiqueta="Estilo">
                        <select className={selectCls} value={d.apertura.estilo} onChange={(e) => setDD("apertura", { estilo: e.target.value })}>
                          <option value="sobre">Sobre con sello de lacre</option>
                          <option value="telon">Telón que se abre</option>
                        </select>
                      </Campo>
                      <Campo etiqueta="Iniciales del sello" ayuda="Vacío = se toman del título."><Input maxLength={6} placeholder="J&M" value={d.apertura.sello} onChange={(e) => setDD("apertura", { sello: e.target.value })} /></Campo>
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-3 rounded-lg border border-border p-4 md:col-span-2">
                  <p className="flex items-center gap-2 text-sm font-medium"><Music className="h-4 w-4" /> Música de fondo</p>
                  <p className="text-xs text-muted-foreground">Empieza cuando el invitado abre la tarjeta. MP3 de hasta 12 MB; usa música con permiso de uso.</p>
                  <div className="flex flex-wrap items-center gap-3">
                    {d.musica.archivo && <audio controls src={api.urlMedia(id, d.musica.archivo)} className="h-9" />}
                    <BotonSubir tarjetaId={id} acepta="audio/mpeg,audio/mp4,audio/ogg,.mp3,.m4a" onSubido={(a) => setDyGuardar("musica", { ...d.musica, archivo: a })}>
                      {d.musica.archivo ? "Cambiar canción" : "Subir canción"}
                    </BotonSubir>
                    {d.musica.archivo && <Button variant="outline" size="sm" onClick={() => setDyGuardar("musica", { archivo: null, titulo: "" })}>Quitar</Button>}
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="contenido" className="flex flex-col gap-6">
                <Campo etiqueta="Mensaje de invitación">
                  <Textarea rows={4} value={d.mensaje} onChange={(e) => setD("mensaje", e.target.value)} />
                </Campo>
                <div>
                  <p className="mb-2 text-sm font-semibold">Padres, padrinos y familia</p>
                  <ListaEditable items={d.familia} onChange={(v) => setD("familia", v)} textoAgregar="Agregar"
                    campos={[{ k: "rol", ph: "Padres de la novia", cls: "md:col-span-2" }, { k: "nombres", ph: "Juan Pérez y Rosa Díaz", cls: "md:col-span-4" }]} />
                </div>
                <div>
                  <p className="mb-2 text-sm font-semibold">Lugares (ceremonia, recepción...)</p>
                  <ListaEditable items={d.lugares} onChange={(v) => setD("lugares", v)} textoAgregar="Agregar lugar" max={6}
                    campos={[
                      { k: "rol", ph: "Ceremonia religiosa", cls: "md:col-span-2" },
                      { k: "nombre", ph: "Parroquia San Antonio", cls: "md:col-span-3" },
                      { k: "hora", ph: "16:00", type: "time", cls: "md:col-span-1" },
                      { k: "direccion", ph: "Av. Principal 123, Miraflores, Lima", cls: "md:col-span-3" },
                      { k: "mapa_url", ph: "Enlace de Google Maps (opcional)", cls: "md:col-span-3" },
                    ]} />
                </div>
                <div>
                  <p className="mb-2 text-sm font-semibold">Itinerario</p>
                  <ListaEditable items={d.agenda} onChange={(v) => setD("agenda", v)} textoAgregar="Agregar momento" max={15}
                    campos={[{ k: "hora", ph: "19:00", type: "time", cls: "md:col-span-1" }, { k: "titulo", ph: "Recepción", cls: "md:col-span-2" }, { k: "detalle", ph: "Detalle (opcional)", cls: "md:col-span-3" }]} />
                </div>
                <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
                  <Interruptor activo={d.vestimenta.activa} onChange={(v) => setDD("vestimenta", { activa: v })} etiqueta="Código de vestimenta" />
                  {d.vestimenta.activa && (
                    <>
                      <Input value={d.vestimenta.titulo} onChange={(e) => setDD("vestimenta", { titulo: e.target.value })} />
                      <Textarea rows={2} placeholder="Formal. Por favor, evita el color blanco." value={d.vestimenta.texto} onChange={(e) => setDD("vestimenta", { texto: e.target.value })} />
                    </>
                  )}
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <Campo etiqueta="Frase de cierre"><Input value={d.cierre} onChange={(e) => setD("cierre", e.target.value)} /></Campo>
                  <Campo etiqueta="Hashtag (opcional)"><Input placeholder="BodaJoseYMaria" value={d.hashtag} onChange={(e) => setD("hashtag", e.target.value)} /></Campo>
                </div>
              </TabsContent>

              <TabsContent value="galeria" className="flex flex-col gap-4">
                <p className="text-sm text-muted-foreground">Hasta 24 fotos. Se reducen solas a un tamaño liviano antes de subir. Si no hay fotos, la sección no aparece.</p>
                <BotonSubir tarjetaId={id} acepta="image/*" multiple onSubido={(a) => setDyGuardar("galeria", [...(formRef.current.datos.galeria || []), a].slice(0, 24))}>Agregar fotos</BotonSubir>
                <div className="grid grid-cols-3 gap-2 md:grid-cols-4">
                  {(d.galeria || []).map((g, i) => (
                    <div key={g} className="group relative aspect-square overflow-hidden rounded-lg">
                      <img src={api.urlMedia(id, g)} alt="" className="h-full w-full object-cover" />
                      <div className="absolute inset-x-0 bottom-0 flex justify-between bg-black/50 p-1 opacity-0 transition group-hover:opacity-100">
                        <button className="px-1 text-white" disabled={i === 0} onClick={() => { const n = [...d.galeria]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; setDyGuardar("galeria", n); }}>◀</button>
                        <button className="px-1 text-white" onClick={() => setDyGuardar("galeria", d.galeria.filter((x) => x !== g))}><Trash2 className="h-4 w-4" /></button>
                        <button className="px-1 text-white" disabled={i === d.galeria.length - 1} onClick={() => { const n = [...d.galeria]; [n[i + 1], n[i]] = [n[i], n[i + 1]]; setDyGuardar("galeria", n); }}>▶</button>
                      </div>
                    </div>
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="regalos" className="flex flex-col gap-4">
                <Interruptor activo={d.regalos.activa} onChange={(v) => setDD("regalos", { activa: v })} etiqueta="Mostrar mesa de regalos" />
                {d.regalos.activa && (
                  <>
                    <Campo etiqueta="Mensaje"><Textarea rows={3} placeholder="Tu presencia es nuestro mejor regalo. Si deseas tener un detalle con nosotros..." value={d.regalos.texto} onChange={(e) => setDD("regalos", { texto: e.target.value })} /></Campo>
                    <div>
                      <p className="mb-2 text-sm font-semibold">Cuentas bancarias</p>
                      <ListaEditable items={d.regalos.cuentas} onChange={(v) => setDD("regalos", { cuentas: v })} textoAgregar="Agregar cuenta" max={6}
                        campos={[{ k: "banco", ph: "BCP soles", cls: "md:col-span-2" }, { k: "titular", ph: "Titular", cls: "md:col-span-4" }, { k: "numero", ph: "Número de cuenta", cls: "md:col-span-3" }, { k: "cci", ph: "CCI (opcional)", cls: "md:col-span-3" }]} />
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <Campo etiqueta="Yape / Plin (número)"><Input placeholder="987 654 321" value={d.regalos.yape} onChange={(e) => setDD("regalos", { yape: e.target.value })} /></Campo>
                      <Campo etiqueta="Enlace a lista de regalos (opcional)"><Input placeholder="https://..." value={d.regalos.lista_url} onChange={(e) => setDD("regalos", { lista_url: e.target.value })} /></Campo>
                    </div>
                  </>
                )}
              </TabsContent>

              <TabsContent value="invitados"><PanelInvitados tarjeta={tarjeta} /></TabsContent>
              <TabsContent value="rsvp"><PanelRespuestas tarjeta={tarjeta} rsvp={d.rsvp} onRsvp={(sub) => setDyGuardar("rsvp", { ...d.rsvp, ...sub })} /></TabsContent>
              <TabsContent value="firmas"><PanelFirmas tarjeta={tarjeta} firmasCfg={d.firmas} onFirmas={(sub) => setDyGuardar("firmas", { ...d.firmas, ...sub })} /></TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        {/* Vista previa en marco de celular */}
        <div className="xl:sticky xl:top-0 xl:self-start">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="font-semibold">Vista previa {cambios && <span className="font-normal text-amber-600">· guarda para ver los cambios</span>}</span>
            <div className="flex gap-1">
              <Button variant="outline" size="sm" onClick={() => setVistaKey((k) => k + 1)} title="Recargar"><RefreshCw className="h-4 w-4" /></Button>
              <a href={`/api/tarjetas/${id}/vista`} target="_blank" rel="noopener noreferrer"><Button variant="outline" size="sm" title="Abrir en pestaña"><ExternalLink className="h-4 w-4" /></Button></a>
            </div>
          </div>
          <div className="mx-auto w-[360px] rounded-[42px] border-[10px] border-neutral-900 bg-neutral-900 shadow-2xl">
            <iframe key={vistaKey} title="Vista previa" src={`/api/tarjetas/${id}/vista`} className="h-[700px] w-full rounded-[32px] bg-white" />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ Lista ------------------------------ */

export default function SeccionTarjetas() {
  const queryClient = useQueryClient();
  const [editando, setEditando] = useState(null);
  const [nueva, setNueva] = useState(false);
  const [filtro, setFiltro] = useState("activas");
  const { data, isLoading } = useQuery({ queryKey: ["tarjetas"], queryFn: api.listarTarjetas });

  useEffect(() => {
    const refrescar = (p) => {
      queryClient.invalidateQueries({ queryKey: ["tarjetas"] });
      if (p?.id) {
        queryClient.invalidateQueries({ queryKey: ["tarjeta-respuestas", p.id] });
        queryClient.invalidateQueries({ queryKey: ["tarjeta-invitados", p.id] });
        queryClient.invalidateQueries({ queryKey: ["tarjeta-firmas", p.id] });
      }
    };
    const avisar = (p) => {
      refrescar(p);
      toast(`${p.nombre} ${p.asiste ? "confirmó asistencia 🎉" : "no podrá asistir"}`);
    };
    socket.on("tarjeta:actualizada", refrescar);
    socket.on("tarjeta:firma", refrescar);
    socket.on("tarjeta:respuesta", avisar);
    return () => {
      socket.off("tarjeta:actualizada", refrescar);
      socket.off("tarjeta:firma", refrescar);
      socket.off("tarjeta:respuesta", avisar);
    };
  }, [queryClient]);

  const tipos = data?.tipos || {};
  const dominio = data?.dominio || "fotoface.pro";
  const lista = useMemo(
    () => (data?.tarjetas || []).filter((t) => (filtro === "activas" ? t.estado !== "archivada" : filtro === "todas" ? true : t.estado === filtro)),
    [data, filtro]
  );

  if (editando) return <EditorTarjeta id={editando} tipos={tipos} dominio={dominio} onVolver={() => setEditando(null)} />;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-3xl text-sm text-muted-foreground">
          Invitaciones digitales interactivas a pedido: bodas, bautizos, cumpleaños, quince años, aniversarios y más. Cada una se publica en su propio
          subdominio (<b>nombres.{dominio}</b>) con apertura animada, música, cuenta regresiva, mapa, confirmación de asistencia, regalos y libro de firmas.
        </p>
        {!nueva && <Button size="sm" onClick={() => setNueva(true)}><Plus className="h-4 w-4" /> Nueva tarjeta</Button>}
      </div>

      {nueva && <FormularioNueva tipos={tipos} dominio={dominio} onCerrar={() => setNueva(false)} onCreada={(t) => { setNueva(false); queryClient.invalidateQueries({ queryKey: ["tarjetas"] }); setEditando(t.id); }} />}

      <div className="flex flex-wrap gap-2">
        {[["activas", "Activas"], ["borrador", "Borradores"], ["publicada", "Publicadas"], ["archivada", "Archivadas"], ["todas", "Todas"]].map(([k, n]) => (
          <button key={k} onClick={() => setFiltro(k)}
            className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${filtro === k ? "border-brand-primary bg-brand-primary text-white" : "border-border bg-card hover:bg-muted"}`}>
            {n}
          </button>
        ))}
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Cargando...</p>}
      {!isLoading && lista.length === 0 && (
        <Card><CardContent className="flex flex-col items-center gap-2 p-10 text-center text-sm text-muted-foreground">
          <Heart className="h-8 w-8 text-brand-primary" /> No hay tarjetas en esta vista. Crea la primera con «Nueva tarjeta».
        </CardContent></Card>
      )}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {lista.map((t) => {
          const estado = ESTADOS[t.estado];
          return (
            <Card key={t.id} className="cursor-pointer overflow-hidden transition hover:shadow-lg" onClick={() => setEditando(t.id)}>
              <div className="relative h-36 bg-brand-gradient">
                {t.foto && <img src={api.urlMedia(t.id, t.foto)} alt="" className="h-full w-full object-cover" />}
                <div className="absolute left-3 top-3 flex gap-1.5">
                  <Badge variant={estado.variante}>{estado.etiqueta}</Badge>
                  <Badge variant="secondary">{t.tipo_nombre}</Badge>
                </div>
              </div>
              <CardContent className="flex flex-col gap-1 p-4">
                <p className="font-display text-base font-bold">{t.titulo}</p>
                <p className="truncate text-xs text-brand-primary">{t.slug}.{dominio}</p>
                <p className="text-xs text-muted-foreground">
                  {t.fecha_evento ? new Date(t.fecha_evento.length === 10 ? `${t.fecha_evento}T12:00` : t.fecha_evento).toLocaleDateString("es-PE", { day: "numeric", month: "long", year: "numeric" }) : "Sin fecha"}
                  {t.cliente_nombre ? ` · ${t.cliente_nombre}` : ""}
                </p>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                  <span title="Visitas"><Eye className="mr-1 inline h-3 w-3" />{t.visitas}</span>
                  <span title="Personas confirmadas"><Check className="mr-1 inline h-3 w-3" />{t.asistentes} confirmados</span>
                  {t.invitados > 0 && <span title="Invitaciones"><Users className="mr-1 inline h-3 w-3" />{t.invitados} inv. · {t.pases} pases</span>}
                  {t.firmas > 0 && <span><MessageCircle className="mr-1 inline h-3 w-3" />{t.firmas}</span>}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
