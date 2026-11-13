import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import QRCode from "qrcode";
import {
  Megaphone,
  Facebook,
  Linkedin,
  Music2,
  Mail,
  Search,
  Copy,
  Check,
  Download,
  QrCode,
  ExternalLink,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import TarjetasMarketing from "@/components/TarjetasMarketing";
import GraficoOrigenes from "@/components/GraficoOrigenes";
import { obtenerCampanas, crearCampana, actualizarCampana, obtenerConfiguracion, obtenerEstadisticasDetalle } from "@/lib/api";
import { formatearCorto } from "@/lib/fechas";

const CANALES = {
  tiktok: { etiqueta: "TikTok", icono: Music2, color: "#000000" },
  meta: { etiqueta: "Meta Ads", icono: Facebook, color: "#1877f2" },
  linkedin: { etiqueta: "LinkedIn", icono: Linkedin, color: "#0a66c2" },
  google: { etiqueta: "Google Ads", icono: Search, color: "#ea4335" },
  email: { etiqueta: "Email", icono: Mail, color: "#6b7280" },
  otro: { etiqueta: "Otro", icono: Megaphone, color: "#6b7280" },
};

const ESTADOS = {
  activa: { etiqueta: "Activa", variante: "success" },
  pausada: { etiqueta: "Pausada", variante: "warning" },
  finalizada: { etiqueta: "Finalizada", variante: "outline" },
};

const PASOS_COMO_FUNCIONA = [
  "Crea un código corto para tu campaña.",
  "Genera el link (se agrega automáticamente al mensaje).",
  "Úsalo en tus anuncios, bio o publicaciones.",
  "El sistema detecta el origen cuando te escriben por WhatsApp.",
];

function formatearMonto(monto) {
  if (!monto) return "S/ 0";
  return `S/ ${Number(monto).toLocaleString("es-PE")}`;
}

function FormularioCampana({ numeroBot, onCreada }) {
  const inputNombreRef = useRef(null);
  const [form, setForm] = useState({
    nombre: "",
    descripcion: "",
    canal: "tiktok",
    codigo_origen: "",
    mensaje_precargado: "Hola, quiero más información",
    inversion: "",
  });
  const [copiado, setCopiado] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState("");

  const codigoLimpio = form.codigo_origen.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "");
  const link =
    numeroBot && codigoLimpio
      ? `https://wa.me/${numeroBot}?text=${encodeURIComponent(`${form.mensaje_precargado} #${codigoLimpio}`)}`
      : "";

  useEffect(() => {
    if (!link) {
      setQrDataUrl("");
      return;
    }
    QRCode.toDataURL(link, { width: 220, margin: 1 })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(""));
  }, [link]);

  const mutacion = useMutation({
    mutationFn: () =>
      crearCampana({
        ...form,
        nombre: form.nombre || codigoLimpio,
        inversion: form.inversion || null,
      }),
    onSuccess: () => {
      toast.success("Campaña creada.");
      setForm({ nombre: "", descripcion: "", canal: "tiktok", codigo_origen: "", mensaje_precargado: "Hola, quiero más información", inversion: "" });
      onCreada();
    },
    onError: (error) => toast.error(error.message || "No se pudo crear la campaña."),
  });

  async function copiar() {
    try {
      await navigator.clipboard.writeText(link);
      setCopiado(true);
      toast.success("Link copiado.");
      setTimeout(() => setCopiado(false), 2000);
    } catch (error) {
      toast.error("No se pudo copiar el link.");
    }
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.4fr_1fr_1fr]">
      <Card>
        <CardHeader>
          <CardTitle>Generar link con código de origen</CardTitle>
          <CardDescription>
            Pegá este link en la bio o el anuncio de TikTok, LinkedIn, etc. Cuando alguien lo use para escribirte, el
            sistema detecta el código y lo cuenta como venido de esa campaña.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="grid grid-cols-1 gap-4 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              mutacion.mutate();
            }}
          >
            <div className="grid gap-1.5">
              <Label>Nombre de la campaña</Label>
              <Input ref={inputNombreRef} value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <Label>Canal</Label>
              <select
                className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                value={form.canal}
                onChange={(e) => setForm({ ...form, canal: e.target.value })}
              >
                {Object.entries(CANALES).map(([valor, info]) => (
                  <option key={valor} value={valor}>
                    {info.etiqueta}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-1.5 sm:col-span-2">
              <Label>Código de la campaña (corto, sin espacios)</Label>
              <Input
                placeholder="TT_PROMO2026"
                value={form.codigo_origen}
                onChange={(e) => setForm({ ...form, codigo_origen: e.target.value })}
                required
              />
            </div>
            <div className="grid gap-1.5 sm:col-span-2">
              <Label>Mensaje pre-cargado (el cliente lo puede editar)</Label>
              <Input value={form.mensaje_precargado} onChange={(e) => setForm({ ...form, mensaje_precargado: e.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <Label>Inversión (S/, opcional)</Label>
              <Input type="number" min="0" value={form.inversion} onChange={(e) => setForm({ ...form, inversion: e.target.value })} />
            </div>

            {link && (
              <div className="flex items-center gap-2 rounded-lg bg-muted/40 p-3 sm:col-span-2">
                <ExternalLink className="h-4 w-4 shrink-0 text-muted-foreground" />
                <p className="min-w-0 flex-1 break-all font-mono text-xs text-muted-foreground">Link generado: {link}</p>
                <Button type="button" size="sm" variant="gradient" onClick={copiar}>
                  {copiado ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} Copiar link
                </Button>
              </div>
            )}

            <div className="sm:col-span-2">
              <Button type="submit" variant="gradient" disabled={!codigoLimpio || mutacion.isPending}>
                Guardar campaña
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <QrCode className="h-4 w-4" /> Código QR
          </CardTitle>
          <CardDescription>Descarga y usa este QR en tus piezas de marketing.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-3">
          {qrDataUrl ? (
            <img src={qrDataUrl} alt="Código QR del link de campaña" className="h-44 w-44 rounded-lg border border-border" />
          ) : (
            <div className="flex h-44 w-44 items-center justify-center rounded-lg border border-dashed border-border text-center text-xs text-muted-foreground">
              Completá un código para generar el QR
            </div>
          )}
          <a
            href={qrDataUrl || undefined}
            download={qrDataUrl ? `qr-${codigoLimpio || "campana"}.png` : undefined}
            className={!qrDataUrl ? "pointer-events-none" : ""}
          >
            <Button type="button" variant="outline" disabled={!qrDataUrl}>
              <Download className="h-4 w-4" /> Descargar QR
            </Button>
          </a>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">¿Cómo funciona?</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="flex flex-col gap-4">
            {PASOS_COMO_FUNCIONA.map((paso, indice) => (
              <li key={paso} className="flex items-start gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-primary/10 text-xs font-semibold text-brand-primary">
                  {indice + 1}
                </span>
                <p className="text-sm text-muted-foreground">{paso}</p>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}

function FilaCampana({ campana }) {
  const queryClient = useQueryClient();
  const info = CANALES[campana.canal] || CANALES.otro;
  const IconoCanal = info.icono;
  const estado = ESTADOS[campana.estado] || ESTADOS.activa;

  const mutacionEstado = useMutation({
    mutationFn: (estado) => actualizarCampana(campana.id, { estado }),
    onSuccess: () => {
      toast.success("Estado actualizado.");
      queryClient.invalidateQueries({ queryKey: ["campanas"] });
    },
    onError: (error) => toast.error(error.message || "No se pudo actualizar."),
  });

  async function copiarCodigo() {
    try {
      await navigator.clipboard.writeText(campana.codigo_origen);
      toast.success("Código copiado.");
    } catch (error) {
      toast.error("No se pudo copiar.");
    }
  }

  return (
    <tr className="border-b border-border last:border-0">
      <td className="p-3">
        <p className="font-semibold">{campana.nombre}</p>
        {campana.descripcion && <p className="text-xs text-muted-foreground">{campana.descripcion}</p>}
      </td>
      <td className="p-3">
        <span className="flex items-center gap-1.5 text-sm">
          <IconoCanal className="h-4 w-4" style={{ color: info.color }} /> {info.etiqueta}
        </span>
      </td>
      <td className="p-3">
        <button onClick={copiarCodigo} className="flex items-center gap-1 font-mono text-xs text-muted-foreground hover:text-foreground">
          {campana.codigo_origen} <Copy className="h-3 w-3" />
        </button>
      </td>
      <td className="p-3 text-sm">{campana.clics.toLocaleString("es-PE")}</td>
      <td className="p-3 text-sm">{campana.leads.toLocaleString("es-PE")}</td>
      <td className="p-3 text-sm">{campana.ventas.toLocaleString("es-PE")}</td>
      <td className="p-3 text-sm">{formatearMonto(campana.inversion)}</td>
      <td className="p-3 text-sm">{campana.cac === null ? "—" : formatearMonto(campana.cac)}</td>
      <td className="p-3 text-sm">{campana.roi === null ? "—" : `${campana.roi}%`}</td>
      <td className="p-3">
        {campana.es_demo ? (
          <Badge variant={estado.variante}>{estado.etiqueta}</Badge>
        ) : (
          <select
            className="h-8 rounded-md border border-input bg-background px-2 text-xs"
            value={campana.estado}
            disabled={mutacionEstado.isPending}
            onChange={(e) => mutacionEstado.mutate(e.target.value)}
          >
            {Object.entries(ESTADOS).map(([valor, i]) => (
              <option key={valor} value={valor}>
                {i.etiqueta}
              </option>
            ))}
          </select>
        )}
      </td>
      <td className="p-3 text-xs text-muted-foreground">{formatearCorto(campana.creado_en)}</td>
    </tr>
  );
}

export default function SeccionMarketing() {
  const [pestana, setPestana] = useState("campanas");
  const { data: config } = useQuery({ queryKey: ["configuracion"], queryFn: obtenerConfiguracion });
  const { data, isLoading, refetch } = useQuery({ queryKey: ["campanas"], queryFn: obtenerCampanas });
  const { data: detalle } = useQuery({ queryKey: ["estadisticas-detalle"], queryFn: obtenerEstadisticasDetalle });

  const numeroBot = (config?.telefono || "").replace(/[^\d]/g, "");
  const campanas = data?.campanas || [];

  function exportarCSV() {
    const encabezados = ["Nombre", "Canal", "Código", "Clics", "Leads", "Ventas", "Inversión", "CAC", "ROI %", "Estado", "Fecha"];
    const filas = campanas.map((c) => [
      c.nombre,
      CANALES[c.canal]?.etiqueta || c.canal,
      c.codigo_origen,
      c.clics,
      c.leads,
      c.ventas,
      c.inversion || 0,
      c.cac ?? "",
      c.roi ?? "",
      c.estado,
      c.creado_en,
    ]);
    const csv = [encabezados, ...filas].map((fila) => fila.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const enlace = document.createElement("a");
    enlace.href = url;
    enlace.download = "campanas-marketing.csv";
    enlace.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="font-display text-lg font-bold">Marketing</h2>
        <p className="text-sm text-muted-foreground">Captura datos de tus campañas y visualiza resultados en tiempo real.</p>
      </div>

      <TarjetasMarketing />

      <FormularioCampana numeroBot={numeroBot} onCreada={refetch} />

      <Card>
        <CardContent className="p-0">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border p-4">
            <div className="flex gap-4 text-sm">
              {[
                { id: "campanas", etiqueta: "Campañas" },
                { id: "fuentes", etiqueta: "Fuentes de tráfico" },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setPestana(tab.id)}
                  className={`border-b-2 pb-1 font-medium transition-colors ${
                    pestana === tab.id ? "border-brand-primary text-brand-primary" : "border-transparent text-muted-foreground"
                  }`}
                >
                  {tab.etiqueta}
                </button>
              ))}
            </div>
            {pestana === "campanas" && (
              <Button size="sm" variant="outline" onClick={exportarCSV}>
                Exportar CSV
              </Button>
            )}
          </div>

          {pestana === "campanas" && (
            <div className="overflow-x-auto">
              {isLoading && <p className="p-6 text-sm text-muted-foreground">Cargando...</p>}
              {!isLoading && campanas.length === 0 && (
                <p className="p-6 text-sm text-muted-foreground">Todavía no hay campañas.</p>
              )}
              {!isLoading && campanas.length > 0 && (
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-border text-xs text-muted-foreground">
                      <th className="p-3 font-medium">Campaña</th>
                      <th className="p-3 font-medium">Canal</th>
                      <th className="p-3 font-medium">Código</th>
                      <th className="p-3 font-medium">Clics</th>
                      <th className="p-3 font-medium">Leads</th>
                      <th className="p-3 font-medium">Ventas</th>
                      <th className="p-3 font-medium">Inversión</th>
                      <th className="p-3 font-medium">CAC</th>
                      <th className="p-3 font-medium">ROI</th>
                      <th className="p-3 font-medium">Estado</th>
                      <th className="p-3 font-medium">Fecha</th>
                    </tr>
                  </thead>
                  <tbody>
                    {campanas.map((c) => (
                      <FilaCampana key={c.id} campana={c} />
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {pestana === "fuentes" && (
            <div className="p-4">
              <GraficoOrigenes datos={detalle?.origenes || []} />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
