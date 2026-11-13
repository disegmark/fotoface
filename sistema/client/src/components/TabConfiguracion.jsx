import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Copy, Check } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { obtenerConfiguracion, actualizarConfiguracion } from "@/lib/api";

const CAMPOS_INICIALES = {
  nombre_agencia: "",
  direccion: "",
  telefono: "",
  telefono_humano: "",
  email: "",
  horarios: "",
  servicios: "",
  sobre_agencia: "",
};

function serviciosArrayATexto(servicios) {
  try {
    const lista = JSON.parse(servicios || "[]");
    return Array.isArray(lista) ? lista.join(", ") : "";
  } catch (error) {
    return "";
  }
}

export default function TabConfiguracion() {
  const queryClient = useQueryClient();
  const [formulario, setFormulario] = useState(CAMPOS_INICIALES);
  const [copiado, setCopiado] = useState(false);

  const webhookUrl =
    typeof window !== "undefined" ? `${window.location.origin}/api/webhook/whatsapp` : "";

  const { data: config, isLoading } = useQuery({
    queryKey: ["configuracion"],
    queryFn: obtenerConfiguracion,
  });

  useEffect(() => {
    if (config) {
      setFormulario({
        nombre_agencia: config.nombre_agencia || "",
        direccion: config.direccion || "",
        telefono: config.telefono || "",
        telefono_humano: config.telefono_humano || "",
        email: config.email || "",
        horarios: config.horarios || "",
        servicios: serviciosArrayATexto(config.servicios),
        sobre_agencia: config.sobre_agencia || "",
      });
    }
  }, [config]);

  const mutacion = useMutation({
    mutationFn: actualizarConfiguracion,
    onSuccess: () => {
      toast.success("Configuracion actualizada correctamente.");
      queryClient.invalidateQueries({ queryKey: ["configuracion"] });
    },
    onError: (error) => {
      toast.error(error.message || "No se pudo actualizar la configuracion.");
    },
  });

  function actualizarCampo(campo, valor) {
    setFormulario((anterior) => ({ ...anterior, [campo]: valor }));
  }

  function manejarEnvio(evento) {
    evento.preventDefault();
    mutacion.mutate(formulario);
  }

  async function copiarUrl() {
    try {
      await navigator.clipboard.writeText(webhookUrl);
      setCopiado(true);
      toast.success("URL copiada al portapapeles.");
      setTimeout(() => setCopiado(false), 2000);
    } catch (error) {
      toast.error("No se pudo copiar la URL.");
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Webhook de WhatsApp (Twilio)</CardTitle>
          <CardDescription>
            Configura esta URL en tu consola de Twilio para conectar el agente de IA.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <Input readOnly value={webhookUrl} className="font-mono text-xs" />
            <Button type="button" variant="outline" size="icon" onClick={copiarUrl}>
              {copiado ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>

          <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
            <li>Ingresa a Twilio Console → Messaging → WhatsApp Sandbox.</li>
            <li>Pega la URL del webhook en el campo "When a message comes in".</li>
            <li>Selecciona el metodo HTTP POST.</li>
            <li>Guarda los cambios.</li>
          </ol>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Datos de la Agencia</CardTitle>
          <CardDescription>Esta informacion la usa Lumi para responder a tus clientes.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-4" onSubmit={manejarEnvio}>
            <div className="grid gap-2">
              <Label htmlFor="nombre_agencia">Nombre de la agencia</Label>
              <Input
                id="nombre_agencia"
                value={formulario.nombre_agencia}
                onChange={(e) => actualizarCampo("nombre_agencia", e.target.value)}
                disabled={isLoading}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="direccion">Direccion</Label>
              <Input
                id="direccion"
                value={formulario.direccion}
                onChange={(e) => actualizarCampo("direccion", e.target.value)}
                disabled={isLoading}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="telefono">Numero de WhatsApp del bot</Label>
                <Input
                  id="telefono"
                  value={formulario.telefono}
                  onChange={(e) => actualizarCampo("telefono", e.target.value)}
                  disabled={isLoading}
                />
                <p className="text-xs text-muted-foreground">El numero de este chat (donde responde Lumi).</p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={formulario.email}
                  onChange={(e) => actualizarCampo("email", e.target.value)}
                  disabled={isLoading}
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="telefono_humano">Telefono para hablar con una persona</Label>
              <Input
                id="telefono_humano"
                value={formulario.telefono_humano}
                onChange={(e) => actualizarCampo("telefono_humano", e.target.value)}
                disabled={isLoading}
              />
              <p className="text-xs text-muted-foreground">
                Un numero distinto al del bot. Lumi solo lo recomienda cuando no puede resolver algo o el cliente
                pide hablar con alguien del equipo.
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="horarios">Horarios de atencion</Label>
              <Textarea
                id="horarios"
                value={formulario.horarios}
                onChange={(e) => actualizarCampo("horarios", e.target.value)}
                disabled={isLoading}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="servicios">Servicios (separados por coma)</Label>
              <Textarea
                id="servicios"
                value={formulario.servicios}
                onChange={(e) => actualizarCampo("servicios", e.target.value)}
                disabled={isLoading}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="sobre_agencia">Sobre la agencia</Label>
              <Textarea
                id="sobre_agencia"
                value={formulario.sobre_agencia}
                onChange={(e) => actualizarCampo("sobre_agencia", e.target.value)}
                disabled={isLoading}
              />
            </div>

            <Button type="submit" variant="gradient" disabled={mutacion.isPending || isLoading}>
              {mutacion.isPending ? "Guardando..." : "Guardar Cambios"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
