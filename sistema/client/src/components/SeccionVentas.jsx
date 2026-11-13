import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronUp, User } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { obtenerVentas, obtenerUsuarios, actualizarPipelineContacto } from "@/lib/api";
import { formatearCorto } from "@/lib/fechas";

const NIVELES = {
  frio: { etiqueta: "Informes", puntoColor: "bg-sky-400", texto: "text-sky-700", fondo: "bg-sky-50" },
  tibio: { etiqueta: "Prospecto", puntoColor: "bg-orange-400", texto: "text-orange-700", fondo: "bg-orange-50" },
  caliente: { etiqueta: "Cliente Potencial", puntoColor: "bg-red-500", texto: "text-red-700", fondo: "bg-red-50" },
};

const ETAPAS = [
  { id: "nuevo", etiqueta: "Nuevo" },
  { id: "contactado", etiqueta: "Contactado" },
  { id: "propuesta", etiqueta: "Propuesta" },
  { id: "negociacion", etiqueta: "Negociación" },
  { id: "ganado", etiqueta: "Ganado" },
  { id: "perdido", etiqueta: "Perdido" },
];

const FILTROS = [{ id: "todos", etiqueta: "Todos" }, ...Object.entries(NIVELES).map(([id, info]) => ({ id, etiqueta: info.etiqueta }))];

const inputClase =
  "h-8 rounded-md border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function PuntoNivel({ nivel }) {
  const info = NIVELES[nivel] || NIVELES.frio;
  return <span className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${info.puntoColor}`} />;
}

function FilaLead({ lead, usuarios, expandido, onToggle }) {
  const queryClient = useQueryClient();
  const info = NIVELES[lead.nivel] || NIVELES.frio;
  const [tags, setTags] = useState(lead.tags || "");
  const [notas, setNotas] = useState(lead.notas || "");

  useEffect(() => {
    setTags(lead.tags || "");
    setNotas(lead.notas || "");
  }, [lead.tags, lead.notas]);

  const mutacion = useMutation({
    mutationFn: (datos) => actualizarPipelineContacto(lead.numero_telefono, datos),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["ventas"] }),
  });

  return (
    <div className="flex flex-col gap-3 p-4">
      <button className="flex items-center justify-between gap-4 text-left" onClick={onToggle}>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-gradient text-white">
            <User className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-semibold">{lead.nombre || lead.numero_telefono}</p>
            <p className="max-w-md truncate text-xs text-muted-foreground">{lead.ultimo_mensaje}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex flex-col items-end gap-1">
            <span className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${info.fondo} ${info.texto}`}>
              <PuntoNivel nivel={lead.nivel} /> {info.etiqueta}
            </span>
            <p className="text-xs text-muted-foreground">Última vez {formatearCorto(lead.ultimo_mensaje_en)}</p>
          </div>
          {expandido ? (
            <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          )}
        </div>
      </button>

      <div className="flex flex-wrap items-center gap-2 pl-[52px]">
        <select
          className={inputClase}
          value={lead.etapa_embudo}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => mutacion.mutate({ etapa_embudo: e.target.value })}
        >
          {ETAPAS.map((etapa) => (
            <option key={etapa.id} value={etapa.id}>
              {etapa.etiqueta}
            </option>
          ))}
        </select>

        <select
          className={inputClase}
          value={lead.asignado_a ?? ""}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => mutacion.mutate({ asignado_a: e.target.value ? Number(e.target.value) : null })}
        >
          <option value="">Sin asignar</option>
          {usuarios.map((usuario) => (
            <option key={usuario.id} value={usuario.id}>
              {usuario.nombre || usuario.email}
            </option>
          ))}
        </select>

        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <span>S/</span>
          <input
            type="number"
            className={`${inputClase} w-24`}
            defaultValue={lead.valor_potencial ?? ""}
            placeholder="0.00"
            onClick={(e) => e.stopPropagation()}
            onBlur={(e) => {
              const valor = e.target.value === "" ? null : Number(e.target.value);
              if (valor !== (lead.valor_potencial ?? null)) mutacion.mutate({ valor_potencial: valor });
            }}
          />
        </div>
      </div>

      {expandido && (
        <div className="flex flex-col gap-2 pl-[52px]" onClick={(e) => e.stopPropagation()}>
          <Input
            className="h-8 text-xs"
            placeholder="Tags separados por coma (ej: urgente, web)"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            onBlur={() => {
              if (tags !== (lead.tags || "")) mutacion.mutate({ tags });
            }}
          />
          <Textarea
            className="min-h-[70px] text-xs"
            placeholder="Notas sobre este contacto..."
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            onBlur={() => {
              if (notas !== (lead.notas || "")) mutacion.mutate({ notas });
            }}
          />
        </div>
      )}
    </div>
  );
}

export default function SeccionVentas() {
  const [filtro, setFiltro] = useState("todos");
  const [expandidoId, setExpandidoId] = useState(null);
  const { data: leads = [], isLoading } = useQuery({ queryKey: ["ventas"], queryFn: obtenerVentas });
  const { data: usuarios = [] } = useQuery({ queryKey: ["usuarios"], queryFn: obtenerUsuarios });

  const leadsFiltrados = filtro === "todos" ? leads : leads.filter((lead) => lead.nivel === filtro);

  const conteos = leads.reduce(
    (acc, lead) => ({ ...acc, [lead.nivel]: (acc[lead.nivel] || 0) + 1 }),
    {}
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {FILTROS.map((f) => {
          const info = NIVELES[f.id];
          const activo = filtro === f.id;
          return (
            <button
              key={f.id}
              onClick={() => setFiltro(f.id)}
              className={`flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${
                activo ? "border-brand-primary bg-brand-primary text-white" : "border-border bg-white hover:bg-muted"
              }`}
            >
              {info && <PuntoNivel nivel={f.id} />}
              {f.etiqueta}
              {f.id !== "todos" && (
                <span className={activo ? "text-white/80" : "text-muted-foreground"}>
                  ({conteos[f.id] || 0})
                </span>
              )}
            </button>
          );
        })}
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading && <p className="p-6 text-sm text-muted-foreground">Cargando...</p>}
          {!isLoading && leadsFiltrados.length === 0 && (
            <p className="p-6 text-sm text-muted-foreground">No hay contactos en esta categoría todavía.</p>
          )}
          <div className="flex flex-col divide-y divide-border">
            {leadsFiltrados.map((lead) => (
              <FilaLead
                key={lead.numero_telefono}
                lead={lead}
                usuarios={usuarios}
                expandido={expandidoId === lead.numero_telefono}
                onToggle={() => setExpandidoId(expandidoId === lead.numero_telefono ? null : lead.numero_telefono)}
              />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
