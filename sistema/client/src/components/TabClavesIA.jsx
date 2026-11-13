import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { BrainCircuit, CheckCircle2, KeyRound } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { obtenerClavesIA, guardarClaveIA, probarClaveIA } from "@/lib/api";

// Orden y rol de cada proveedor en la estrategia de niveles del agente (ver server/services/claude.js).
const PROVEEDORES = {
  deepseek: {
    nombre: "DeepSeek",
    nivel: "1 · Primera instancia",
    rol: "Responde la mayoría de consultas (servicios, disponibilidad, estado de turnos e inscripciones). Económico y rápido.",
    ayuda: "platform.deepseek.com/api_keys",
  },
  openai: {
    nombre: "ChatGPT (OpenAI)",
    nivel: "2 · Mayor razonamiento",
    rol: "Ejecuta acciones: agendar, cancelar o reprogramar turnos, e inscripciones.",
    ayuda: "platform.openai.com/api-keys",
  },
  claude: {
    nombre: "Claude (Anthropic)",
    nivel: "3 · Escalamiento mayor",
    rol: "Casos complejos o delicados (reclamos, negociaciones). Respaldo de ChatGPT.",
    ayuda: "console.anthropic.com/settings/keys",
  },
  openrouter: {
    nombre: "OpenRouter",
    nivel: "Respaldo",
    rol: "Opcional: último respaldo si los demás proveedores fallan.",
    ayuda: "openrouter.ai/keys",
  },
};

function FilaProveedor({ estado }) {
  const queryClient = useQueryClient();
  const info = PROVEEDORES[estado.proveedor];
  const [clave, setClave] = useState("");
  const [modelo, setModelo] = useState(estado.modelo || "");

  const refrescar = () => queryClient.invalidateQueries({ queryKey: ["claves-ia"] });
  const guardar = useMutation({
    mutationFn: () => guardarClaveIA(estado.proveedor, { ...(clave ? { api_key: clave } : {}), modelo }),
    onSuccess: () => {
      setClave("");
      refrescar();
      toast.success(`${info.nombre}: guardado. Lumi ya lo usa.`);
    },
    onError: (e) => toast.error(e.message),
  });
  const quitar = useMutation({
    mutationFn: () => guardarClaveIA(estado.proveedor, { api_key: "" }),
    onSuccess: () => {
      refrescar();
      toast.success(`${info.nombre}: clave eliminada del dashboard.`);
    },
    onError: (e) => toast.error(e.message),
  });
  const probar = useMutation({
    mutationFn: () => probarClaveIA(estado.proveedor),
    onSuccess: (r) => (r.ok ? toast.success(`${info.nombre}: ${r.mensaje}`) : toast.error(`${info.nombre}: ${r.mensaje}`)),
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-display font-semibold">{info.nombre}</p>
          <p className="text-xs font-medium text-brand-primary">{info.nivel}</p>
          <p className="mt-1 max-w-xl text-xs text-muted-foreground">{info.rol}</p>
        </div>
        {estado.configurada ? (
          <Badge variant="success" className="gap-1">
            <CheckCircle2 className="h-3 w-3" /> {estado.clave} {estado.origen === "env" ? "(.env)" : ""}
          </Badge>
        ) : (
          <Badge variant="outline">Sin configurar</Badge>
        )}
      </div>

      <form
        className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_200px_auto]"
        onSubmit={(e) => {
          e.preventDefault();
          guardar.mutate();
        }}
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`clave-${estado.proveedor}`}>API key</Label>
          <Input
            id={`clave-${estado.proveedor}`}
            type="password"
            autoComplete="off"
            value={clave}
            onChange={(e) => setClave(e.target.value)}
            placeholder={estado.configurada ? "Pega una nueva clave para reemplazarla" : `Obtenla en ${info.ayuda}`}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`modelo-${estado.proveedor}`}>Modelo</Label>
          <Input id={`modelo-${estado.proveedor}`} value={modelo} onChange={(e) => setModelo(e.target.value)} />
        </div>
        <div className="flex items-end gap-2">
          <Button type="submit" disabled={guardar.isPending || (!clave && modelo === estado.modelo)}>
            {guardar.isPending ? "Validando…" : "Guardar"}
          </Button>
          {estado.configurada && (
            <Button type="button" variant="outline" disabled={probar.isPending} onClick={() => probar.mutate()}>
              Probar
            </Button>
          )}
          {estado.origen === "dashboard" && (
            <Button type="button" variant="ghost" disabled={quitar.isPending} onClick={() => quitar.mutate()}>
              Quitar
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}

export default function TabClavesIA() {
  const { data: estados = [], isLoading } = useQuery({ queryKey: ["claves-ia"], queryFn: obtenerClavesIA });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BrainCircuit className="h-5 w-5 text-brand-primary" /> Claves de IA del agente
        </CardTitle>
        <CardDescription className="flex items-start gap-1.5">
          <KeyRound className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Lumi responde primero con DeepSeek, escala a ChatGPT para ejecutar acciones y a Claude para los casos
          complejos. Si falta un proveedor, pasa al siguiente disponible. Cada clave se valida antes de guardarse y se
          aplica al instante; nunca se vuelve a mostrar completa.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {isLoading && <p className="text-sm text-muted-foreground">Cargando…</p>}
        {estados.map((estado) => (
          <FilaProveedor key={estado.proveedor} estado={estado} />
        ))}
      </CardContent>
    </Card>
  );
}
