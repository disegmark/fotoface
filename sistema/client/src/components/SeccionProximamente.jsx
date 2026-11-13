import { Clock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function SeccionProximamente({ icono: Icono, titulo, descripcion, detalles = [] }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-4 p-12 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-gradient text-white">
          <Icono className="h-7 w-7" />
        </div>
        <div>
          <h3 className="font-display text-xl font-semibold">{titulo}</h3>
          <Badge variant="outline" className="mt-2 gap-1">
            <Clock className="h-3 w-3" /> Próximamente
          </Badge>
        </div>
        <p className="max-w-xl text-sm text-muted-foreground">{descripcion}</p>
        {detalles.length > 0 && (
          <ul className="mt-2 flex flex-col gap-1.5 text-left text-sm text-muted-foreground">
            {detalles.map((detalle) => (
              <li key={detalle} className="flex items-start gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-primary" />
                {detalle}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
