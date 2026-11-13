import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Facebook, Music2, Search, Linkedin, Bot, CheckCircle2, KeyRound } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { obtenerClavesPublicidad, guardarClavePublicidad, probarClavePublicidad } from "@/lib/api";

const INFO = {
  meta: {
    icono: Facebook,
    etiquetaCuenta: "Ad Account ID",
    ayuda: "business.facebook.com (Administrador de eventos → Configuración → ID de la cuenta publicitaria)",
    placeholderCuenta: "1234567890 (sin 'act_', se agrega solo)",
  },
  tiktok: {
    icono: Music2,
    etiquetaCuenta: "Advertiser ID",
    ayuda: "ads.tiktok.com/marketing_api (TikTok for Business → Assets → ID de cuenta publicitaria)",
    placeholderCuenta: "1234567890123456789",
  },
  google: {
    icono: Search,
    etiquetaCuenta: "Customer ID",
    ayuda: "ads.google.com (Herramientas y configuración → Configuración → Acceso API/Centro de API)",
    placeholderCuenta: "1234567890 (con o sin guiones)",
    ayudaExtra: "Lo entrega Google al aprobar el acceso a la API de Google Ads (nivel básico o superior)",
    placeholderExtra: "Developer Token de la cuenta administradora",
  },
  linkedin: {
    icono: Linkedin,
    etiquetaCuenta: "Sponsored Account ID",
    ayuda: "linkedin.com/campaignmanager (Cuenta publicitaria → Configuración de la cuenta → ID de cuenta)",
    placeholderCuenta: "123456789",
  },
  chatgpt: {
    icono: Bot,
    ayuda: "ads.openai.com (Ads Manager → Settings → API keys; la cuenta queda implícita en la key, no hace falta otro ID)",
  },
};

function FilaPlataforma({ estado }) {
  const queryClient = useQueryClient();
  const info = INFO[estado.plataforma];
  const [token, setToken] = useState("");
  const [cuentaId, setCuentaId] = useState(estado.cuenta_id || "");
  const [tokenExtra, setTokenExtra] = useState("");

  const refrescar = () => queryClient.invalidateQueries({ queryKey: ["claves-publicidad"] });
  const guardar = useMutation({
    mutationFn: () =>
      guardarClavePublicidad(estado.plataforma, {
        ...(token ? { access_token: token } : {}),
        ...(estado.sin_cuenta ? {} : { cuenta_id: cuentaId }),
        ...(estado.etiqueta_extra && tokenExtra ? { token_extra: tokenExtra } : {}),
      }),
    onSuccess: () => {
      setToken("");
      setTokenExtra("");
      refrescar();
      toast.success(`${estado.nombre}: guardado.`);
    },
    onError: (e) => toast.error(e.message),
  });
  const quitar = useMutation({
    mutationFn: () =>
      guardarClavePublicidad(estado.plataforma, {
        access_token: "",
        ...(estado.sin_cuenta ? {} : { cuenta_id: "" }),
        ...(estado.etiqueta_extra ? { token_extra: "" } : {}),
      }),
    onSuccess: () => {
      setCuentaId("");
      refrescar();
      toast.success(`${estado.nombre}: credenciales eliminadas.`);
    },
    onError: (e) => toast.error(e.message),
  });
  const probar = useMutation({
    mutationFn: () => probarClavePublicidad(estado.plataforma),
    onSuccess: (r) => (r.ok ? toast.success(`${estado.nombre}: ${r.mensaje}`) : toast.error(`${estado.nombre}: ${r.mensaje}`)),
    onError: (e) => toast.error(e.message),
  });

  const Icono = info.icono;

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <Icono className="h-4 w-4 text-brand-primary" />
          <p className="font-display font-semibold">{estado.nombre}</p>
        </div>
        {estado.configurada ? (
          <Badge variant="success" className="gap-1">
            <CheckCircle2 className="h-3 w-3" /> {estado.token} {estado.origen === "env" ? "(.env)" : ""}
          </Badge>
        ) : (
          <Badge variant="outline">Sin configurar</Badge>
        )}
      </div>

      <form
        className={`grid grid-cols-1 gap-3 ${
          estado.etiqueta_extra
            ? "md:grid-cols-[1fr_1fr_1fr_auto]"
            : estado.sin_cuenta
              ? "md:grid-cols-[1fr_auto]"
              : "md:grid-cols-[1fr_1fr_auto]"
        }`}
        onSubmit={(e) => {
          e.preventDefault();
          guardar.mutate();
        }}
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`token-${estado.plataforma}`}>Access Token</Label>
          <Input
            id={`token-${estado.plataforma}`}
            type="password"
            autoComplete="off"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder={estado.configurada ? "Pega un token nuevo para reemplazarlo" : `Obtenelo en ${info.ayuda}`}
          />
        </div>
        {!estado.sin_cuenta && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`cuenta-${estado.plataforma}`}>{info.etiquetaCuenta}</Label>
            <Input
              id={`cuenta-${estado.plataforma}`}
              value={cuentaId}
              onChange={(e) => setCuentaId(e.target.value)}
              placeholder={info.placeholderCuenta}
            />
          </div>
        )}
        {estado.etiqueta_extra && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`extra-${estado.plataforma}`}>{estado.etiqueta_extra}</Label>
            <Input
              id={`extra-${estado.plataforma}`}
              type="password"
              autoComplete="off"
              value={tokenExtra}
              onChange={(e) => setTokenExtra(e.target.value)}
              placeholder={estado.extra ? "Pega uno nuevo para reemplazarlo" : info.ayudaExtra}
            />
          </div>
        )}
        <div className="flex items-end gap-2">
          <Button
            type="submit"
            disabled={
              guardar.isPending ||
              (!token && !tokenExtra && (estado.sin_cuenta || cuentaId === estado.cuenta_id))
            }
          >
            {guardar.isPending ? "Guardando…" : "Guardar"}
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

export default function TabClavesPublicidad() {
  const { data: estados = [], isLoading } = useQuery({ queryKey: ["claves-publicidad"], queryFn: obtenerClavesPublicidad });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="h-5 w-5 text-brand-primary" /> Claves de publicidad (Meta, TikTok, Google, LinkedIn y ChatGPT)
        </CardTitle>
        <CardDescription>
          Trae impresiones, alcance, clics, CTR, inversión y conversiones reales de tus campañas a los KPIs de
          Marketing. Cada clave se aplica al instante; nunca se vuelve a mostrar completa.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {isLoading && <p className="text-sm text-muted-foreground">Cargando…</p>}
        {estados.map((estado) => (
          <FilaPlataforma key={estado.plataforma} estado={estado} />
        ))}
      </CardContent>
    </Card>
  );
}
