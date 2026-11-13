import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  FileText,
  Clock,
  CalendarCheck,
  CheckCircle2,
  Search,
  Eye,
  Calendar as CalendarIcon,
  X,
  Plus,
  Send,
  Pencil,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import TarjetaResumen from "@/components/TarjetaResumen";
import {
  obtenerCotizaciones,
  crearCotizacion,
  actualizarCotizacion,
  enviarRecordatorioCotizacion,
  agendarReunionCotizacion,
} from "@/lib/api";
import { formatearCorto } from "@/lib/fechas";

const POR_PAGINA = 8;

const ESTADOS = {
  pendiente: { etiqueta: "Pendiente", variante: "outline" },
  enviada: { etiqueta: "Enviada", variante: "info" },
  en_revision: { etiqueta: "En revisión", variante: "warning" },
  reunion_agendada: { etiqueta: "Reunión agendada", variante: "default" },
  aceptada: { etiqueta: "Aceptada", variante: "success" },
  rechazada: { etiqueta: "Rechazada", variante: "destructive" },
};

const COLORES_AVATAR = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#4a3aa7"];

function colorAvatar(nombre) {
  let hash = 0;
  for (let i = 0; i < nombre.length; i++) hash = nombre.charCodeAt(i) + ((hash << 5) - hash);
  return COLORES_AVATAR[Math.abs(hash) % COLORES_AVATAR.length];
}

function iniciales(nombre) {
  return nombre
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join("");
}

function formatearMonto(monto, moneda) {
  if (monto === null || monto === undefined) return "—";
  const simbolo = moneda === "USD" ? "$" : "S/";
  return `${simbolo} ${Number(monto).toLocaleString("es-PE")}`;
}

function FormularioNuevaCotizacion({ onCancelar, onCreada }) {
  const [form, setForm] = useState({ nombre_cliente: "", email: "", numero_telefono: "", servicio: "", monto: "", estado: "enviada", notas: "" });

  const mutacion = useMutation({
    mutationFn: () => crearCotizacion({ ...form, monto: form.monto || null }),
    onSuccess: () => {
      toast.success("Cotización creada.");
      onCreada();
    },
    onError: (error) => toast.error(error.message || "No se pudo crear la cotización."),
  });

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-5">
        <div className="flex items-center justify-between">
          <h3 className="font-display font-semibold">Nueva cotización</h3>
          <Button variant="ghost" size="icon" onClick={onCancelar}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <form
          className="grid grid-cols-1 gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            mutacion.mutate();
          }}
        >
          <div className="grid gap-1.5">
            <Label>Cliente</Label>
            <Input required value={form.nombre_cliente} onChange={(e) => setForm({ ...form, nombre_cliente: e.target.value })} />
          </div>
          <div className="grid gap-1.5">
            <Label>Email</Label>
            <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div className="grid gap-1.5">
            <Label>WhatsApp (opcional)</Label>
            <Input placeholder="+51999888777" value={form.numero_telefono} onChange={(e) => setForm({ ...form, numero_telefono: e.target.value })} />
          </div>
          <div className="grid gap-1.5">
            <Label>Monto (S/)</Label>
            <Input type="number" min="0" value={form.monto} onChange={(e) => setForm({ ...form, monto: e.target.value })} />
          </div>
          <div className="grid gap-1.5 sm:col-span-2">
            <Label>Servicio solicitado</Label>
            <Input required value={form.servicio} onChange={(e) => setForm({ ...form, servicio: e.target.value })} />
          </div>
          <div className="grid gap-1.5">
            <Label>Estado inicial</Label>
            <select
              className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
              value={form.estado}
              onChange={(e) => setForm({ ...form, estado: e.target.value })}
            >
              {Object.entries(ESTADOS).map(([valor, info]) => (
                <option key={valor} value={valor}>
                  {info.etiqueta}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-1.5 sm:col-span-2">
            <Label>Notas (opcional)</Label>
            <Textarea value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} />
          </div>
          <div className="flex gap-2 sm:col-span-2">
            <Button type="submit" variant="gradient" disabled={mutacion.isPending}>
              Crear cotización
            </Button>
            <Button type="button" variant="outline" onClick={onCancelar}>
              Cancelar
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function PanelDetalle({ cotizacion, onCerrar, onCambio }) {
  const queryClient = useQueryClient();
  const [pestana, setPestana] = useState("resumen");
  const [notas, setNotas] = useState(cotizacion.notas || "");
  const [fechaReunion, setFechaReunion] = useState("");
  const [modalidadReunion, setModalidadReunion] = useState("virtual");

  const invalidar = () => queryClient.invalidateQueries({ queryKey: ["cotizaciones"] });

  const mutacionEstado = useMutation({
    mutationFn: (estado) => actualizarCotizacion(cotizacion.id, { estado }),
    onSuccess: () => {
      toast.success("Estado actualizado.");
      invalidar();
    },
    onError: (error) => toast.error(error.message || "No se pudo actualizar."),
  });

  const mutacionNotas = useMutation({
    mutationFn: () => actualizarCotizacion(cotizacion.id, { notas }),
    onSuccess: () => {
      toast.success("Notas guardadas.");
      invalidar();
    },
    onError: (error) => toast.error(error.message || "No se pudieron guardar las notas."),
  });

  const mutacionRecordatorio = useMutation({
    mutationFn: () => enviarRecordatorioCotizacion(cotizacion.id),
    onSuccess: () => toast.success("Recordatorio enviado por WhatsApp."),
    onError: (error) => toast.error(error.message || "No se pudo enviar el recordatorio."),
  });

  const mutacionReunion = useMutation({
    mutationFn: () => agendarReunionCotizacion(cotizacion.id, { fecha_turno: fechaReunion, modalidad: modalidadReunion }),
    onSuccess: () => {
      toast.success("Reunión agendada y sincronizada con Google Calendar.");
      invalidar();
    },
    onError: (error) => toast.error(error.message || "No se pudo agendar la reunión."),
  });

  const info = ESTADOS[cotizacion.estado] || ESTADOS.pendiente;

  return (
    <Card className="w-full shrink-0 lg:w-96">
      <CardContent className="flex flex-col gap-4 p-5">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div
              className="flex h-11 w-11 items-center justify-center rounded-full font-semibold text-white"
              style={{ backgroundColor: colorAvatar(cotizacion.nombre_cliente) }}
            >
              {iniciales(cotizacion.nombre_cliente)}
            </div>
            <div>
              <p className="font-display font-semibold">{cotizacion.nombre_cliente}</p>
              <p className="text-xs text-muted-foreground">{cotizacion.email || "Sin email"}</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onCerrar}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <Badge variant={info.variante} className="w-fit">
          {info.etiqueta}
        </Badge>

        {cotizacion.es_demo && (
          <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-800">
            Dato de ejemplo — las acciones se habilitan con cotizaciones reales.
          </p>
        )}

        <div className="flex gap-4 border-b border-border text-sm">
          {[
            { id: "resumen", etiqueta: "Resumen" },
            { id: "cliente", etiqueta: "Cliente" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setPestana(tab.id)}
              className={`border-b-2 pb-2 font-medium transition-colors ${
                pestana === tab.id ? "border-brand-primary text-brand-primary" : "border-transparent text-muted-foreground"
              }`}
            >
              {tab.etiqueta}
            </button>
          ))}
        </div>

        {pestana === "resumen" && (
          <>
            <div className="grid gap-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">ID</span>
                <span className="font-medium">{cotizacion.id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Servicio</span>
                <span className="max-w-[60%] text-right font-medium">{cotizacion.servicio}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Monto</span>
                <span className="font-medium">{formatearMonto(cotizacion.monto, cotizacion.moneda)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Fecha de creación</span>
                <span className="font-medium">{formatearCorto(cotizacion.creado_en)}</span>
              </div>
              {cotizacion.validez_hasta && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Válida hasta</span>
                  <span className="font-medium">{formatearCorto(cotizacion.validez_hasta)}</span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Estado</span>
                <select
                  className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                  value={cotizacion.estado}
                  disabled={cotizacion.es_demo || mutacionEstado.isPending}
                  onChange={(e) => mutacionEstado.mutate(e.target.value)}
                >
                  {Object.entries(ESTADOS).map(([valor, i]) => (
                    <option key={valor} value={valor}>
                      {i.etiqueta}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={cotizacion.es_demo || !cotizacion.numero_telefono || mutacionRecordatorio.isPending}
                onClick={() => mutacionRecordatorio.mutate()}
                title={!cotizacion.numero_telefono ? "Esta cotización no tiene WhatsApp asociado" : ""}
              >
                <Send className="h-3.5 w-3.5" /> Enviar recordatorio
              </Button>
            </div>

            <div className="rounded-lg border border-border p-3">
              <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
                <CalendarIcon className="h-4 w-4" /> Reunión de seguimiento
              </p>
              {cotizacion.turno_id ? (
                <p className="text-xs text-muted-foreground">Ya hay una reunión agendada para esta cotización.</p>
              ) : cotizacion.es_demo ? (
                <p className="text-xs text-muted-foreground">Disponible cuando esta sea una cotización real.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  <Input
                    type="datetime-local"
                    className="h-8 text-xs"
                    value={fechaReunion}
                    onChange={(e) => setFechaReunion(e.target.value)}
                  />
                  <div className="flex gap-2">
                    <select
                      className="h-8 flex-1 rounded-md border border-input bg-background px-2 text-xs"
                      value={modalidadReunion}
                      onChange={(e) => setModalidadReunion(e.target.value)}
                    >
                      <option value="virtual">Virtual</option>
                      <option value="presencial">Presencial</option>
                    </select>
                    <Button
                      size="sm"
                      variant="gradient"
                      disabled={!fechaReunion || mutacionReunion.isPending}
                      onClick={() => mutacionReunion.mutate()}
                    >
                      Agendar
                    </Button>
                  </div>
                </div>
              )}
            </div>

            <div className="grid gap-1.5">
              <Label className="text-xs">Notas</Label>
              <Textarea
                className="text-sm"
                rows={3}
                value={notas}
                disabled={cotizacion.es_demo}
                onChange={(e) => setNotas(e.target.value)}
              />
              {!cotizacion.es_demo && notas !== (cotizacion.notas || "") && (
                <Button size="sm" variant="outline" className="w-fit" onClick={() => mutacionNotas.mutate()}>
                  <Pencil className="h-3.5 w-3.5" /> Guardar nota
                </Button>
              )}
            </div>
          </>
        )}

        {pestana === "cliente" && (
          <div className="grid gap-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Nombre</span>
              <span className="font-medium">{cotizacion.nombre_cliente}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Email</span>
              <span className="font-medium">{cotizacion.email || "No captado"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">WhatsApp</span>
              <span className="font-medium">{cotizacion.numero_telefono || "No captado"}</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function SeccionOficina() {
  const [busqueda, setBusqueda] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("todos");
  const [pagina, setPagina] = useState(1);
  const [seleccionadaId, setSeleccionadaId] = useState(null);
  const [mostrarFormulario, setMostrarFormulario] = useState(false);

  const { data, isLoading } = useQuery({ queryKey: ["cotizaciones"], queryFn: obtenerCotizaciones });
  const cotizaciones = data?.cotizaciones || [];
  const resumen = data?.resumen;

  const filtradas = useMemo(() => {
    return cotizaciones.filter((c) => {
      const coincideTexto =
        !busqueda ||
        c.nombre_cliente.toLowerCase().includes(busqueda.toLowerCase()) ||
        c.servicio.toLowerCase().includes(busqueda.toLowerCase());
      const coincideEstado = filtroEstado === "todos" || c.estado === filtroEstado;
      return coincideTexto && coincideEstado;
    });
  }, [cotizaciones, busqueda, filtroEstado]);

  const totalPaginas = Math.max(1, Math.ceil(filtradas.length / POR_PAGINA));
  const paginaActual = Math.min(pagina, totalPaginas);
  const paginadas = filtradas.slice((paginaActual - 1) * POR_PAGINA, paginaActual * POR_PAGINA);
  const seleccionada = cotizaciones.find((c) => c.id === seleccionadaId) || null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-lg font-bold">Oficina</h2>
          <p className="text-sm text-muted-foreground">Panel de cotizaciones y coordinación de reuniones.</p>
        </div>
        <Button variant="gradient" onClick={() => setMostrarFormulario(true)}>
          <Plus className="h-4 w-4" /> Nueva cotización
        </Button>
      </div>

      {data?.es_demo && (
        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
          Estás viendo datos de ejemplo para mostrar cómo funciona este panel. En cuanto se cargue la primera
          cotización real (con "+ Nueva cotización" o, más adelante, un agente automático), estos datos se
          reemplazan solos.
        </p>
      )}

      {resumen && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <TarjetaResumen icono={FileText} color="#2a78d6" etiqueta="Cotizaciones generadas" valor={resumen.generadas.total} variacion={resumen.generadas.variacion} />
          <TarjetaResumen icono={Clock} color="#eda100" etiqueta="En revisión del cliente" valor={resumen.en_revision.total} variacion={resumen.en_revision.variacion} />
          <TarjetaResumen icono={CalendarCheck} color="#2a78d6" etiqueta="Reuniones agendadas" valor={resumen.reuniones_agendadas.total} variacion={resumen.reuniones_agendadas.variacion} />
          <TarjetaResumen icono={CheckCircle2} color="#1baf7a" etiqueta="Cotizaciones cerradas" valor={resumen.cerradas.total} variacion={resumen.cerradas.variacion} />
        </div>
      )}

      {mostrarFormulario && (
        <FormularioNuevaCotizacion
          onCancelar={() => setMostrarFormulario(false)}
          onCreada={() => setMostrarFormulario(false)}
        />
      )}

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <div className="flex flex-1 flex-col gap-4">
          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Buscar por cliente o servicio..."
                value={busqueda}
                onChange={(e) => {
                  setBusqueda(e.target.value);
                  setPagina(1);
                }}
              />
            </div>
            <select
              className="h-10 rounded-lg border border-input bg-background px-3 text-sm"
              value={filtroEstado}
              onChange={(e) => {
                setFiltroEstado(e.target.value);
                setPagina(1);
              }}
            >
              <option value="todos">Todos los estados</option>
              {Object.entries(ESTADOS).map(([valor, info]) => (
                <option key={valor} value={valor}>
                  {info.etiqueta}
                </option>
              ))}
            </select>
          </div>

          <Card>
            <CardContent className="p-0">
              {isLoading && <p className="p-6 text-sm text-muted-foreground">Cargando...</p>}
              {!isLoading && paginadas.length === 0 && (
                <p className="p-6 text-sm text-muted-foreground">No hay cotizaciones que coincidan con la búsqueda.</p>
              )}
              <div className="flex flex-col divide-y divide-border">
                {paginadas.map((c) => {
                  const info = ESTADOS[c.estado] || ESTADOS.pendiente;
                  return (
                    <button
                      key={c.id}
                      onClick={() => setSeleccionadaId(c.id)}
                      className={`flex items-center justify-between gap-3 p-4 text-left transition-colors hover:bg-muted/40 ${
                        seleccionadaId === c.id ? "bg-muted/50" : ""
                      }`}
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <div
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
                          style={{ backgroundColor: colorAvatar(c.nombre_cliente) }}
                        >
                          {iniciales(c.nombre_cliente)}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">{c.nombre_cliente}</p>
                          <p className="truncate text-xs text-muted-foreground">{c.servicio}</p>
                        </div>
                      </div>
                      <div className="hidden shrink-0 text-sm font-medium sm:block">{formatearMonto(c.monto, c.moneda)}</div>
                      <Badge variant={info.variante} className="hidden shrink-0 md:inline-flex">
                        {info.etiqueta}
                      </Badge>
                      <span className="hidden shrink-0 text-xs text-muted-foreground lg:block">{formatearCorto(c.creado_en)}</span>
                      <Eye className="h-4 w-4 shrink-0 text-muted-foreground" />
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {filtradas.length > POR_PAGINA && (
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>
                Mostrando {(paginaActual - 1) * POR_PAGINA + 1} a {Math.min(paginaActual * POR_PAGINA, filtradas.length)} de{" "}
                {filtradas.length}
              </span>
              <div className="flex gap-1">
                {Array.from({ length: totalPaginas }, (_, i) => i + 1).map((n) => (
                  <Button
                    key={n}
                    size="sm"
                    variant={n === paginaActual ? "gradient" : "outline"}
                    onClick={() => setPagina(n)}
                  >
                    {n}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </div>

        {seleccionada && (
          <PanelDetalle cotizacion={seleccionada} onCerrar={() => setSeleccionadaId(null)} />
        )}
      </div>
    </div>
  );
}
