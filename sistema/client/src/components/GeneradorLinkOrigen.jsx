import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Copy, Check, Link2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { obtenerConfiguracion } from "@/lib/api";

export default function GeneradorLinkOrigen() {
  const { data: config } = useQuery({ queryKey: ["configuracion"], queryFn: obtenerConfiguracion });
  const [codigo, setCodigo] = useState("");
  const [mensaje, setMensaje] = useState("Hola, quiero más información");
  const [copiado, setCopiado] = useState(false);

  const numero = (config?.telefono || "").replace(/[^\d]/g, "");
  const codigoLimpio = codigo.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "");
  const link =
    numero && codigoLimpio
      ? `https://wa.me/${numero}?text=${encodeURIComponent(`${mensaje} #${codigoLimpio}`)}`
      : "";

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
    <Card>
      <CardHeader>
        <CardTitle>Generar link con código de origen</CardTitle>
        <CardDescription>
          Pega este link en la bio o el anuncio de TikTok, LinkedIn, etc. Cuando alguien lo use para escribirte,
          el sistema detecta el código y lo cuenta como venido de esa campaña — sin cambiar nada más.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid gap-2">
          <Label htmlFor="codigo-origen">Código de la campaña (corto, sin espacios)</Label>
          <Input
            id="codigo-origen"
            placeholder="TT, LI, BLACKFRIDAY2026..."
            value={codigo}
            onChange={(e) => setCodigo(e.target.value)}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="mensaje-origen">Mensaje pre-cargado (el cliente lo puede editar)</Label>
          <Input id="mensaje-origen" value={mensaje} onChange={(e) => setMensaje(e.target.value)} />
        </div>

        {link ? (
          <div className="flex items-center gap-2">
            <Input readOnly value={link} className="font-mono text-xs" />
            <Button type="button" variant="outline" size="icon" onClick={copiar}>
              {copiado ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
        ) : (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Link2 className="h-3.5 w-3.5" /> Completa un código para generar el link.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
