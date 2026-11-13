import { useQuery } from "@tanstack/react-query";
import { Phone, Mail, User, Megaphone } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { obtenerContactos } from "@/lib/api";
import { formatearCorto } from "@/lib/fechas";

const ETIQUETAS_CANAL = { meta: "Meta", ycloud: "YCloud", evolution: "Evolution", twilio: "Twilio" };

export default function SeccionContacto() {
  const { data: contactos = [], isLoading } = useQuery({ queryKey: ["contactos"], queryFn: obtenerContactos });

  return (
    <Card>
      <CardContent className="p-0">
        {isLoading && <p className="p-6 text-sm text-muted-foreground">Cargando...</p>}
        {!isLoading && contactos.length === 0 && (
          <p className="p-6 text-sm text-muted-foreground">Todavía no hay contactos registrados.</p>
        )}
        <div className="flex flex-col divide-y divide-border">
          {contactos.map((contacto) => (
            <div key={contacto.numero_telefono} className="flex items-center justify-between gap-4 p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-gradient text-white">
                  <User className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold">{contacto.nombre || "Sin nombre"}</p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Phone className="h-3 w-3" /> {contacto.numero_telefono}
                    </span>
                    <span className="flex items-center gap-1">
                      <Mail className="h-3 w-3" /> {contacto.email || "No captado"}
                    </span>
                    <span className="flex items-center gap-1">
                      <Megaphone className="h-3 w-3" /> {contacto.origen_legible || "Directo"}
                    </span>
                  </div>
                </div>
              </div>
              <div className="text-right">
                {contacto.canal && (
                  <Badge variant="outline" className="mb-1">
                    {ETIQUETAS_CANAL[contacto.canal] || "Twilio"}
                  </Badge>
                )}
                <p className="text-xs text-muted-foreground">Desde {formatearCorto(contacto.creado_en)}</p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
