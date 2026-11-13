import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Printer, Phone, Mail, MapPin, Truck, Store, Link as LinkIcon, Copy, Plus, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { obtenerPedidos, actualizarPedido, enviarPedidoAReparto, crearPedido } from "@/lib/api";
import { formatearCorto } from "@/lib/fechas";
import { socket } from "@/lib/socket";

const ESTADOS = {
  nuevo: { etiqueta: "Nuevo", variante: "warning" },
  cotizado: { etiqueta: "Cotizado", variante: "info" },
  en_produccion: { etiqueta: "En producción", variante: "info" },
  listo: { etiqueta: "Listo", variante: "success" },
  en_reparto: { etiqueta: "En reparto", variante: "info" },
  entregado: { etiqueta: "Entregado", variante: "success" },
  cancelado: { etiqueta: "Cancelado", variante: "destructive" },
};

const ORIGENES = { chat: "Chat / WhatsApp", web: "Web", "web-sesion": "Web · sesión", equipo: "Equipo" };

function numeroWhatsapp(p) {
  return (p.whatsapp || (/^\d+$/.test(p.numero_telefono) ? p.numero_telefono : "")).replace(/[^\d]/g, "");
}

function textoUbicacion(p) {
  return `Hola ${p.nombre.split(" ")[0]}, su pedido ${p.codigo} de FotoFace sale a reparto. Para entregárselo en el punto exacto, abra este enlace y comparta su ubicación: ${p.reparto_enlace}`;
}

const VACIO = { nombre: "", whatsapp: "", productos: "", entrega: "tienda", direccion: "", fecha_deseada: "", notas: "" };

function FormularioNuevo({ onCerrar }) {
  const queryClient = useQueryClient();
  const [datos, setDatos] = useState(VACIO);
  const cambiar = (campo) => (e) => setDatos((d) => ({ ...d, [campo]: e.target.value }));
  const mutacion = useMutation({
    mutationFn: () => crearPedido(datos),
    onSuccess: (p) => {
      queryClient.invalidateQueries({ queryKey: ["pedidos"] });
      toast.success(`Pedido ${p.codigo} registrado.`);
      onCerrar();
    },
    onError: (e) => toast.error(e.message),
  });
  return (
    <Card>
      <CardContent className="grid gap-3 p-4 md:grid-cols-2">
        <Input placeholder="Nombre del cliente" value={datos.nombre} onChange={cambiar("nombre")} />
        <Input placeholder="WhatsApp (ej. 987654321)" value={datos.whatsapp} onChange={cambiar("whatsapp")} />
        <Textarea
          className="md:col-span-2"
          rows={3}
          placeholder="Detalle: producto, tamaño, acabado y cantidad (una línea por ítem)"
          value={datos.productos}
          onChange={cambiar("productos")}
        />
        <select value={datos.entrega} onChange={cambiar("entrega")} className="rounded-md border border-input bg-white px-3 py-2 text-sm">
          <option value="tienda">Recojo en tienda</option>
          <option value="domicilio">Envío a domicilio</option>
        </select>
        <Input placeholder="Fecha que lo necesita (opcional)" value={datos.fecha_deseada} onChange={cambiar("fecha_deseada")} />
        {datos.entrega === "domicilio" && (
          <Input className="md:col-span-2" placeholder="Dirección, distrito y referencia" value={datos.direccion} onChange={cambiar("direccion")} />
        )}
        <Input className="md:col-span-2" placeholder="Notas (opcional)" value={datos.notas} onChange={cambiar("notas")} />
        <div className="flex gap-2 md:col-span-2">
          <Button onClick={() => mutacion.mutate()} disabled={mutacion.isPending}>
            Guardar pedido
          </Button>
          <Button variant="outline" onClick={onCerrar}>
            Cancelar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function SeccionPedidos() {
  const queryClient = useQueryClient();
  const [filtro, setFiltro] = useState("activos");
  const [nuevo, setNuevo] = useState(false);
  const { data, isLoading } = useQuery({ queryKey: ["pedidos"], queryFn: obtenerPedidos });

  useEffect(() => {
    const refrescar = () => queryClient.invalidateQueries({ queryKey: ["pedidos"] });
    socket.on("pedido:nuevo", refrescar);
    socket.on("pedido:actualizado", refrescar);
    return () => {
      socket.off("pedido:nuevo", refrescar);
      socket.off("pedido:actualizado", refrescar);
    };
  }, [queryClient]);

  const mutacion = useMutation({
    mutationFn: ({ id, ...datos }) => actualizarPedido(id, datos),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pedidos"] });
      toast.success("Pedido actualizado.");
    },
    onError: (e) => toast.error(e.message),
  });

  const mutacionReparto = useMutation({
    mutationFn: (id) => enviarPedidoAReparto(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pedidos"] });
      toast.success("Entrega creada en Repartos. Envíe el enlace al cliente.");
    },
    onError: (e) => toast.error(e.message),
  });

  const pedidos = data?.pedidos || [];
  const filtrados = pedidos.filter((p) =>
    filtro === "activos" ? !["entregado", "cancelado"].includes(p.estado) : filtro === "todos" ? true : p.estado === filtro
  );
  const filtros = [["activos", "Activos"], ["nuevo", "Nuevos"], ["listo", "Listos"], ["en_reparto", "En reparto"], ["entregado", "Entregados"], ["todos", "Todos"]];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-3xl text-sm text-muted-foreground">
          Pedidos de impresión que llegan por WhatsApp, el chat y el formulario de fotoface.pro. Confirme el monto, avance el
          estado y, si es a domicilio, envíelo a Repartos para obtener el enlace de ubicación del cliente.
        </p>
        {!nuevo && (
          <Button size="sm" onClick={() => setNuevo(true)}>
            <Plus className="h-4 w-4" /> Nuevo pedido
          </Button>
        )}
      </div>

      {nuevo && <FormularioNuevo onCerrar={() => setNuevo(false)} />}

      <div className="flex flex-wrap gap-2">
        {filtros.map(([id, nombre]) => (
          <button
            key={id}
            onClick={() => setFiltro(id)}
            className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${
              filtro === id ? "border-brand-primary bg-brand-primary text-white" : "border-border bg-white hover:bg-muted"
            }`}
          >
            {nombre}
          </button>
        ))}
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading && <p className="p-6 text-sm text-muted-foreground">Cargando...</p>}
          {!isLoading && filtrados.length === 0 && <p className="p-6 text-sm text-muted-foreground">No hay pedidos en esta vista.</p>}
          <div className="flex flex-col divide-y divide-border">
            {filtrados.map((p) => {
              const estado = ESTADOS[p.estado] || ESTADOS.nuevo;
              const wa = numeroWhatsapp(p);
              return (
                <div key={p.id} className="flex flex-col gap-3 p-4 lg:flex-row lg:justify-between">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-gradient text-white">
                      <Printer className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">
                        {p.codigo} · {p.nombre}
                        <span className="ml-2 text-xs font-normal text-muted-foreground">{ORIGENES[p.origen] || p.origen}</span>
                      </p>
                      <p className="mt-1 whitespace-pre-line text-sm">{p.productos}</p>
                      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          {p.entrega === "domicilio" ? <Truck className="h-3 w-3" /> : <Store className="h-3 w-3" />}
                          {p.entrega === "domicilio" ? "Domicilio" : "Recojo en tienda"}
                        </span>
                        {p.direccion && (
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3 w-3" /> {p.direccion}
                          </span>
                        )}
                        {wa && (
                          <a href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:underline">
                            <Phone className="h-3 w-3" /> +{wa}
                          </a>
                        )}
                        {p.email && (
                          <a href={`mailto:${p.email}`} className="flex items-center gap-1 hover:underline">
                            <Mail className="h-3 w-3" /> {p.email}
                          </a>
                        )}
                        {p.fecha_deseada && <span>Para: {p.fecha_deseada}</span>}
                        <span>{formatearCorto(p.creado_en)}</span>
                      </div>
                      {p.fotos_enlace && (
                        <a
                          href={/^https?:\/\//i.test(p.fotos_enlace) ? p.fotos_enlace : undefined}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-1 flex items-center gap-1 text-xs text-brand-primary hover:underline"
                        >
                          <LinkIcon className="h-3 w-3" /> Fotos: {p.fotos_enlace}
                        </a>
                      )}
                      {p.notas && <p className="mt-1 max-w-xl text-xs text-muted-foreground">📝 {p.notas}</p>}
                      {p.reparto_enlace && (
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                          <span className="text-muted-foreground">Enlace de ubicación:</span>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => navigator.clipboard?.writeText(p.reparto_enlace).then(() => toast.success("Enlace copiado."))}
                          >
                            <Copy className="h-3 w-3" /> Copiar
                          </Button>
                          {wa && (
                            <Button variant="outline" size="sm" asChild>
                              <a href={`https://wa.me/${wa}?text=${encodeURIComponent(textoUbicacion(p))}`} target="_blank" rel="noopener noreferrer">
                                Enviar por WhatsApp
                              </a>
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 lg:flex-col lg:items-end">
                    <Badge variant={estado.variante}>{estado.etiqueta}</Badge>
                    <select
                      aria-label="Cambiar estado"
                      value={p.estado}
                      disabled={mutacion.isPending}
                      onChange={(e) => mutacion.mutate({ id: p.id, estado: e.target.value })}
                      className="rounded-md border border-input bg-white px-2 py-1 text-xs"
                    >
                      {Object.entries(ESTADOS).map(([id, info]) => (
                        <option key={id} value={id}>
                          {info.etiqueta}
                        </option>
                      ))}
                    </select>
                    <label className="flex items-center gap-1 text-xs text-muted-foreground">
                      S/
                      <input
                        type="number"
                        min="0"
                        step="0.1"
                        defaultValue={p.monto ?? ""}
                        placeholder="Monto"
                        onBlur={(e) => {
                          if (e.target.value !== String(p.monto ?? "")) mutacion.mutate({ id: p.id, monto: e.target.value });
                        }}
                        className="w-24 rounded-md border border-input bg-white px-2 py-1 text-xs"
                      />
                    </label>
                    {p.entrega === "domicilio" && !p.reparto_enlace && !["entregado", "cancelado"].includes(p.estado) && (
                      <Button size="sm" variant="outline" disabled={mutacionReparto.isPending} onClick={() => mutacionReparto.mutate(p.id)}>
                        <Truck className="h-4 w-4" /> Enviar a Repartos
                      </Button>
                    )}
                    {p.estado === "nuevo" && (
                      <button
                        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive"
                        onClick={() => mutacion.mutate({ id: p.id, estado: "cancelado" })}
                      >
                        <X className="h-3 w-3" /> Cancelar
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
