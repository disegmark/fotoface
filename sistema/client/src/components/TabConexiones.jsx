import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Notebook,
  Zap,
  Facebook,
  Instagram,
  Linkedin,
  Music2,
  Trash2,
  Plus,
  Clock,
  Video,
  Sheet,
  BarChart3,
  MessageCircle,
  ExternalLink,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import TabClavesIA from "@/components/TabClavesIA";
import TabClavesPublicidad from "@/components/TabClavesPublicidad";
import {
  obtenerConfiguracionMCP,
  agregarAgenteMCP,
  eliminarAgenteMCP,
  cambiarHabilitadoAgenteMCP,
  obtenerEstadoGoogle,
  desconectarGoogle,
  obtenerConfiguracion,
  actualizarConfiguracion,
  obtenerCredencialesGoogleOAuth,
  guardarCredencialesGoogleOAuth,
  obtenerEstadoWhatsappMeta,
  guardarCredencialesWhatsappMeta,
  probarWhatsappMeta,
  obtenerCuentaWhatsappMeta,
  obtenerPlantillasWhatsappMeta,
  crearPlantillaWhatsappMeta,
  eliminarPlantillaWhatsappMeta,
  obtenerEstadoTwilio,
  guardarCredencialesTwilio,
  probarTwilio,
  obtenerEstadoYcloud,
  guardarCredencialesYcloud,
  probarYcloud,
} from "@/lib/api";

const PROVEEDORES_DISPONIBLES = [
  {
    id: "notion",
    nombre: "Notion",
    icono: Notebook,
    descripcion: "Conectar una base de conocimiento de Notion.",
    campos: [{ clave: "token", etiqueta: "Integration token de Notion", tipo: "password" }],
    construirConfig: ({ token }) => ({
      nombre: "notion",
      descripcion: "Notion (base de conocimiento)",
      habilitado: true,
      transport: "http",
      url: "https://mcp.notion.com/mcp",
      headers: { Authorization: `Bearer ${token}` },
    }),
    nota: "Si Notion exige un login interactivo (OAuth) en vez de aceptar este token directo, este tipo de conexión simple no va a funcionar.",
  },
  {
    id: "zapier",
    nombre: "Zapier",
    icono: Zap,
    descripcion: "Conectar tus automatizaciones de Zapier (MCP).",
    campos: [{ clave: "url", etiqueta: "URL del servidor MCP de tu cuenta de Zapier", tipo: "text" }],
    construirConfig: ({ url }) => ({
      nombre: "zapier",
      descripcion: "Zapier (automatizaciones)",
      habilitado: true,
      transport: "http",
      url,
    }),
    nota: "La URL la generás en mcp.zapier.com dentro de tu cuenta; ya incluye tu credencial, no hace falta un token aparte.",
  },
];

function FormularioGoogleOAuth({ estado }) {
  const queryClient = useQueryClient();
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");

  const refrescar = () => {
    queryClient.invalidateQueries({ queryKey: ["google-oauth-credenciales"] });
    queryClient.invalidateQueries({ queryKey: ["google-estado"] });
  };

  const guardar = useMutation({
    mutationFn: () =>
      guardarCredencialesGoogleOAuth({
        client_id: clientId || undefined,
        client_secret: clientSecret || undefined,
      }),
    onSuccess: () => {
      setClientId("");
      setClientSecret("");
      refrescar();
      toast.success("Credenciales de Google guardadas.");
    },
    onError: (error) => toast.error(error.message || "No se pudieron guardar las credenciales."),
  });

  const quitar = useMutation({
    mutationFn: () => guardarCredencialesGoogleOAuth({ client_id: "", client_secret: "" }),
    onSuccess: () => {
      refrescar();
      toast.success("Credenciales eliminadas del dashboard.");
    },
    onError: (error) => toast.error(error.message || "No se pudieron eliminar."),
  });

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold text-muted-foreground">Client ID / Secret de OAuth</p>
        {estado?.configurado ? (
          <Badge variant="success">
            Configurado {estado.origen === "env" ? "(.env)" : ""}
          </Badge>
        ) : (
          <Badge variant="outline">Sin configurar</Badge>
        )}
      </div>
      {!estado?.public_base_url_configurado && (
        <p className="text-xs text-amber-700">Falta configurar PUBLIC_BASE_URL en el servidor (ver README).</p>
      )}
      <form
        className="grid grid-cols-1 gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          guardar.mutate();
        }}
      >
        <Input
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          placeholder={estado?.client_id ? estado.client_id : "Client ID"}
        />
        <Input
          type="password"
          autoComplete="off"
          value={clientSecret}
          onChange={(e) => setClientSecret(e.target.value)}
          placeholder={estado?.client_secret ? `Secret actual: ${estado.client_secret}` : "Client Secret"}
        />
        <div className="flex gap-2">
          <Button type="submit" size="sm" disabled={guardar.isPending || (!clientId && !clientSecret)}>
            Guardar
          </Button>
          {estado?.origen === "dashboard" && (
            <Button type="button" size="sm" variant="ghost" disabled={quitar.isPending} onClick={() => quitar.mutate()}>
              Quitar
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}

const CATEGORIAS_PLANTILLA = ["MARKETING", "UTILITY", "AUTHENTICATION"];

function GestorPlantillasWhatsapp() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ nombre: "", categoria: "MARKETING", idioma: "es", cuerpo: "" });
  const [mostrarForm, setMostrarForm] = useState(false);

  const { data, isLoading } = useQuery({ queryKey: ["whatsapp-meta-plantillas"], queryFn: obtenerPlantillasWhatsappMeta });

  const crear = useMutation({
    mutationFn: () => crearPlantillaWhatsappMeta(form),
    onSuccess: () => {
      toast.success("Plantilla enviada a revisión de Meta.");
      setForm({ nombre: "", categoria: "MARKETING", idioma: "es", cuerpo: "" });
      setMostrarForm(false);
      queryClient.invalidateQueries({ queryKey: ["whatsapp-meta-plantillas"] });
    },
    onError: (error) => toast.error(error.message || "No se pudo crear la plantilla."),
  });

  const eliminar = useMutation({
    mutationFn: eliminarPlantillaWhatsappMeta,
    onSuccess: () => {
      toast.success("Plantilla eliminada.");
      queryClient.invalidateQueries({ queryKey: ["whatsapp-meta-plantillas"] });
    },
    onError: (error) => toast.error(error.message || "No se pudo eliminar la plantilla."),
  });

  const plantillas = data?.plantillas || [];

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-muted-foreground">Plantillas de mensajes (HSM)</p>
        <Button size="sm" variant="outline" onClick={() => setMostrarForm((v) => !v)}>
          <Plus className="h-4 w-4" /> Nueva
        </Button>
      </div>

      {mostrarForm && (
        <form
          className="flex flex-col gap-2 rounded-lg bg-muted/30 p-2"
          onSubmit={(e) => {
            e.preventDefault();
            crear.mutate();
          }}
        >
          <Input
            placeholder="nombre_de_la_plantilla (solo minúsculas, números y _)"
            value={form.nombre}
            onChange={(e) => setForm({ ...form, nombre: e.target.value })}
            required
          />
          <div className="grid grid-cols-2 gap-2">
            <select
              className="flex h-9 rounded-lg border border-input bg-background px-2 text-sm"
              value={form.categoria}
              onChange={(e) => setForm({ ...form, categoria: e.target.value })}
            >
              {CATEGORIAS_PLANTILLA.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <Input
              placeholder="Idioma (ej: es, es_PE, en_US)"
              value={form.idioma}
              onChange={(e) => setForm({ ...form, idioma: e.target.value })}
              required
            />
          </div>
          <textarea
            className="min-h-[70px] rounded-lg border border-input bg-background px-2 py-1.5 text-sm"
            placeholder="Texto del mensaje. Usá {{1}}, {{2}}... para variables."
            value={form.cuerpo}
            onChange={(e) => setForm({ ...form, cuerpo: e.target.value })}
            required
          />
          <Button type="submit" size="sm" disabled={crear.isPending}>
            {crear.isPending ? "Enviando…" : "Enviar a revisión"}
          </Button>
        </form>
      )}

      {isLoading && <p className="text-xs text-muted-foreground">Cargando…</p>}
      {!isLoading && plantillas.length === 0 && (
        <p className="text-xs text-muted-foreground">Todavía no hay plantillas.</p>
      )}
      <div className="flex flex-col divide-y divide-border">
        {plantillas.map((p) => (
          <div key={p.name} className="flex items-center justify-between gap-2 py-2">
            <div>
              <p className="text-sm font-medium">{p.name}</p>
              <p className="text-xs text-muted-foreground">
                {p.category} · {p.language}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge
                variant={
                  p.status === "APPROVED" ? "success" : p.status === "REJECTED" ? "destructive" : "outline"
                }
              >
                {p.status}
              </Badge>
              <Button
                size="icon"
                variant="ghost"
                disabled={eliminar.isPending}
                onClick={() => eliminar.mutate(p.name)}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TarjetaWhatsappMetaBusiness() {
  const queryClient = useQueryClient();
  const [token, setToken] = useState("");
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [wabaId, setWabaId] = useState("");

  const { data: estado } = useQuery({ queryKey: ["whatsapp-meta-estado"], queryFn: obtenerEstadoWhatsappMeta });
  const { data: cuenta } = useQuery({
    queryKey: ["whatsapp-meta-cuenta"],
    queryFn: obtenerCuentaWhatsappMeta,
    enabled: Boolean(estado?.configurado),
  });

  const refrescar = () => queryClient.invalidateQueries({ queryKey: ["whatsapp-meta-estado"] });

  const guardar = useMutation({
    mutationFn: () =>
      guardarCredencialesWhatsappMeta({
        ...(token ? { access_token: token } : {}),
        phone_number_id: phoneNumberId,
        waba_id: wabaId,
      }),
    onSuccess: () => {
      setToken("");
      refrescar();
      queryClient.invalidateQueries({ queryKey: ["whatsapp-meta-cuenta"] });
      toast.success("Credenciales de WhatsApp Business guardadas.");
    },
    onError: (error) => toast.error(error.message || "No se pudieron guardar."),
  });

  const quitar = useMutation({
    mutationFn: () => guardarCredencialesWhatsappMeta({ access_token: "", phone_number_id: "", waba_id: "" }),
    onSuccess: () => {
      setPhoneNumberId("");
      setWabaId("");
      refrescar();
      toast.success("Credenciales eliminadas del dashboard.");
    },
    onError: (error) => toast.error(error.message || "No se pudo eliminar."),
  });

  const probar = useMutation({
    mutationFn: probarWhatsappMeta,
    onSuccess: (r) => (r.ok ? toast.success(r.mensaje) : toast.error(r.mensaje)),
    onError: (error) => toast.error(error.message || "No se pudo probar la conexión."),
  });

  return (
    <Card>
      <CardHeader className="flex-row items-center gap-3 space-y-0 pb-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ backgroundColor: "#25D366" }}>
          <MessageCircle className="h-4.5 w-4.5 text-white" />
        </div>
        <CardTitle className="text-base">WhatsApp Business (Meta Cloud API)</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <CardDescription>
          Mismo token que usa Lumi para enviar y recibir mensajes. Acá además podés ver el número conectado y
          gestionar las plantillas de mensajes (HSM) sin salir del dashboard.
        </CardDescription>

        <form
          className="grid grid-cols-1 gap-2 rounded-lg border border-border p-3"
          onSubmit={(e) => {
            e.preventDefault();
            guardar.mutate();
          }}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold text-muted-foreground">Access Token / Phone Number ID / WABA ID</p>
            {estado?.configurado ? (
              <Badge variant="success">Configurado {estado.origen === "env" ? "(.env)" : ""}</Badge>
            ) : (
              <Badge variant="outline">Sin configurar</Badge>
            )}
          </div>
          <Input
            type="password"
            autoComplete="off"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder={estado?.token ? `Token actual: ${estado.token}` : "Access Token (permanente, de un System User)"}
          />
          <Input
            value={phoneNumberId}
            onChange={(e) => setPhoneNumberId(e.target.value)}
            placeholder={estado?.phone_number_id || "Phone Number ID"}
          />
          <Input
            value={wabaId}
            onChange={(e) => setWabaId(e.target.value)}
            placeholder={estado?.waba_id || "WhatsApp Business Account ID (WABA ID, para plantillas)"}
          />
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={guardar.isPending}>
              Guardar
            </Button>
            {estado?.configurado && (
              <Button type="button" size="sm" variant="outline" disabled={probar.isPending} onClick={() => probar.mutate()}>
                Probar
              </Button>
            )}
            {estado?.origen === "dashboard" && (
              <Button type="button" size="sm" variant="ghost" disabled={quitar.isPending} onClick={() => quitar.mutate()}>
                Quitar
              </Button>
            )}
          </div>
          <a
            href="https://business.facebook.com/settings/system-users"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 text-xs text-brand-primary hover:underline"
          >
            <ExternalLink className="h-3 w-3" /> Generar o rotar el Access Token en Business Settings
          </a>
        </form>

        {cuenta?.numeroActual && (
          <div className="rounded-lg border border-border p-3 text-sm">
            <p className="font-medium">{cuenta.numeroActual.verified_name || "Número conectado"}</p>
            <p className="text-xs text-muted-foreground">
              {cuenta.numeroActual.display_phone_number} · Calidad: {cuenta.numeroActual.quality_rating}
            </p>
          </div>
        )}

        {estado?.waba_id && <GestorPlantillasWhatsapp />}
      </CardContent>
    </Card>
  );
}

function TarjetaTwilio() {
  const queryClient = useQueryClient();
  const [accountSid, setAccountSid] = useState("");
  const [authToken, setAuthToken] = useState("");
  const [numero, setNumero] = useState("");

  const { data: estado } = useQuery({ queryKey: ["twilio-estado"], queryFn: obtenerEstadoTwilio });

  const refrescar = () => queryClient.invalidateQueries({ queryKey: ["twilio-estado"] });

  const guardar = useMutation({
    mutationFn: () =>
      guardarCredencialesTwilio({
        account_sid: accountSid || undefined,
        ...(authToken ? { auth_token: authToken } : {}),
        numero_whatsapp: numero || undefined,
      }),
    onSuccess: () => {
      setAccountSid("");
      setAuthToken("");
      setNumero("");
      refrescar();
      toast.success("Credenciales de Twilio guardadas.");
    },
    onError: (error) => toast.error(error.message || "No se pudieron guardar."),
  });

  const quitar = useMutation({
    mutationFn: () => guardarCredencialesTwilio({ account_sid: "", auth_token: "", numero_whatsapp: "" }),
    onSuccess: () => {
      refrescar();
      toast.success("Credenciales eliminadas del dashboard.");
    },
    onError: (error) => toast.error(error.message || "No se pudo eliminar."),
  });

  const probar = useMutation({
    mutationFn: probarTwilio,
    onSuccess: (r) => (r.ok ? toast.success(r.mensaje) : toast.error(r.mensaje)),
    onError: (error) => toast.error(error.message || "No se pudo probar la conexión."),
  });

  return (
    <Card>
      <CardHeader className="flex-row items-center gap-3 space-y-0 pb-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ backgroundColor: "#F22F46" }}>
          <MessageCircle className="h-4.5 w-4.5 text-white" />
        </div>
        <CardTitle className="text-base">Twilio</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <CardDescription>
          Canal clásico de WhatsApp Sandbox/producción de Twilio. Independiente de Meta y YCloud: se puede usar uno,
          otro, o varios en simultáneo.
        </CardDescription>

        <form
          className="grid grid-cols-1 gap-2 rounded-lg border border-border p-3"
          onSubmit={(e) => {
            e.preventDefault();
            guardar.mutate();
          }}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold text-muted-foreground">Account SID / Auth Token / Número</p>
            {estado?.configurado ? (
              <Badge variant="success">Configurado {estado.origen === "env" ? "(.env)" : ""}</Badge>
            ) : (
              <Badge variant="outline">Sin configurar</Badge>
            )}
          </div>
          <Input
            value={accountSid}
            onChange={(e) => setAccountSid(e.target.value)}
            placeholder={estado?.account_sid || "Account SID (empieza con AC)"}
          />
          <Input
            type="password"
            autoComplete="off"
            value={authToken}
            onChange={(e) => setAuthToken(e.target.value)}
            placeholder={estado?.auth_token ? `Token actual: ${estado.auth_token}` : "Auth Token"}
          />
          <Input
            value={numero}
            onChange={(e) => setNumero(e.target.value)}
            placeholder={estado?.numero_whatsapp || "Número de WhatsApp (ej: whatsapp:+14155238886)"}
          />
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={guardar.isPending}>
              Guardar
            </Button>
            {estado?.configurado && (
              <Button type="button" size="sm" variant="outline" disabled={probar.isPending} onClick={() => probar.mutate()}>
                Probar
              </Button>
            )}
            {estado?.origen === "dashboard" && (
              <Button type="button" size="sm" variant="ghost" disabled={quitar.isPending} onClick={() => quitar.mutate()}>
                Quitar
              </Button>
            )}
          </div>
          <a
            href="https://console.twilio.com/"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 text-xs text-brand-primary hover:underline"
          >
            <ExternalLink className="h-3 w-3" /> Ver Account Info en la consola de Twilio
          </a>
        </form>
      </CardContent>
    </Card>
  );
}

function TarjetaYcloud() {
  const queryClient = useQueryClient();
  const [apiKey, setApiKey] = useState("");
  const [numero, setNumero] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");

  const { data: estado } = useQuery({ queryKey: ["ycloud-estado"], queryFn: obtenerEstadoYcloud });

  const refrescar = () => queryClient.invalidateQueries({ queryKey: ["ycloud-estado"] });

  const guardar = useMutation({
    mutationFn: () =>
      guardarCredencialesYcloud({
        ...(apiKey ? { api_key: apiKey } : {}),
        numero_whatsapp: numero || undefined,
        ...(webhookSecret ? { webhook_secret: webhookSecret } : {}),
      }),
    onSuccess: () => {
      setApiKey("");
      setNumero("");
      setWebhookSecret("");
      refrescar();
      toast.success("Credenciales de YCloud guardadas.");
    },
    onError: (error) => toast.error(error.message || "No se pudieron guardar."),
  });

  const quitar = useMutation({
    mutationFn: () => guardarCredencialesYcloud({ api_key: "", numero_whatsapp: "", webhook_secret: "" }),
    onSuccess: () => {
      refrescar();
      toast.success("Credenciales eliminadas del dashboard.");
    },
    onError: (error) => toast.error(error.message || "No se pudo eliminar."),
  });

  const probar = useMutation({
    mutationFn: probarYcloud,
    onSuccess: (r) => (r.ok ? toast.success(r.mensaje) : toast.error(r.mensaje)),
    onError: (error) => toast.error(error.message || "No se pudo probar la conexión."),
  });

  return (
    <Card>
      <CardHeader className="flex-row items-center gap-3 space-y-0 pb-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ backgroundColor: "#6C5CE7" }}>
          <MessageCircle className="h-4.5 w-4.5 text-white" />
        </div>
        <CardTitle className="text-base">YCloud</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <CardDescription>
          Proveedor alternativo de WhatsApp Cloud API, con onboarding más simple que Meta directo. Independiente de
          Meta y Twilio: se puede usar uno, otro, o varios en simultáneo.
        </CardDescription>

        <form
          className="grid grid-cols-1 gap-2 rounded-lg border border-border p-3"
          onSubmit={(e) => {
            e.preventDefault();
            guardar.mutate();
          }}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold text-muted-foreground">API Key / Número / Secreto del webhook</p>
            {estado?.configurado ? (
              <Badge variant="success">Configurado {estado.origen === "env" ? "(.env)" : ""}</Badge>
            ) : (
              <Badge variant="outline">Sin configurar</Badge>
            )}
          </div>
          <Input
            type="password"
            autoComplete="off"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={estado?.api_key ? `API Key actual: ${estado.api_key}` : "API Key"}
          />
          <Input
            value={numero}
            onChange={(e) => setNumero(e.target.value)}
            placeholder={estado?.numero_whatsapp || "Número de WhatsApp conectado (formato +51...)"}
          />
          <Input
            type="password"
            autoComplete="off"
            value={webhookSecret}
            onChange={(e) => setWebhookSecret(e.target.value)}
            placeholder={
              estado?.webhook_secret_configurado ? "Secreto del webhook: ya configurado" : "Secreto del webhook (opcional)"
            }
          />
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={guardar.isPending}>
              Guardar
            </Button>
            {estado?.configurado && (
              <Button type="button" size="sm" variant="outline" disabled={probar.isPending} onClick={() => probar.mutate()}>
                Probar
              </Button>
            )}
            {estado?.origen === "dashboard" && (
              <Button type="button" size="sm" variant="ghost" disabled={quitar.isPending} onClick={() => quitar.mutate()}>
                Quitar
              </Button>
            )}
          </div>
          <a
            href="https://docs.ycloud.com/en/api-reference/guides/api-fundamentals/configure-webhooks"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 text-xs text-brand-primary hover:underline"
          >
            <ExternalLink className="h-3 w-3" /> Configurar el webhook en YCloud (whatsapp.inbound_message.received)
          </a>
        </form>
      </CardContent>
    </Card>
  );
}

const PROVEEDORES_PROXIMAMENTE = [
  { nombre: "Facebook", icono: Facebook },
  { nombre: "Instagram", icono: Instagram },
  { nombre: "TikTok", icono: Music2 },
  { nombre: "LinkedIn", icono: Linkedin },
];

export default function TabConexiones() {
  const queryClient = useQueryClient();
  const [proveedorAbierto, setProveedorAbierto] = useState(null);
  const [valoresFormulario, setValoresFormulario] = useState({});
  const [sheetsId, setSheetsId] = useState("");
  const [calendarId, setCalendarId] = useState("");
  const [ga4PropertyId, setGa4PropertyId] = useState("");
  const [ga4MeasurementId, setGa4MeasurementId] = useState("");
  const [searchConsoleSite, setSearchConsoleSite] = useState("");

  const { data, isLoading } = useQuery({ queryKey: ["mcp-config"], queryFn: obtenerConfiguracionMCP });

  const { data: estadoGoogle } = useQuery({
    queryKey: ["google-estado"],
    queryFn: obtenerEstadoGoogle,
  });

  const { data: credencialesGoogle } = useQuery({
    queryKey: ["google-oauth-credenciales"],
    queryFn: obtenerCredencialesGoogleOAuth,
  });

  const { data: config } = useQuery({ queryKey: ["configuracion"], queryFn: obtenerConfiguracion });

  useEffect(() => {
    if (config) {
      setSheetsId(config.google_sheets_id || "");
      setCalendarId(config.google_calendar_id || "");
      setGa4PropertyId(config.ga4_property_id || "");
      setGa4MeasurementId(config.ga4_measurement_id || "");
      setSearchConsoleSite(config.search_console_site || "");
    }
  }, [config]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("google_conectado")) {
      toast.success("Google conectado correctamente. Ya se puede usar para Meet, Calendar, Sheets, Analytics y Search Console.");
      queryClient.invalidateQueries({ queryKey: ["google-estado"] });
      window.history.replaceState({}, "", window.location.pathname);
    } else if (params.get("google_error")) {
      toast.error(`No se pudo conectar con Google: ${params.get("google_error")}`);
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [queryClient]);

  const mutacionDesconectarGoogle = useMutation({
    mutationFn: desconectarGoogle,
    onSuccess: () => {
      toast.success("Google desconectado.");
      queryClient.invalidateQueries({ queryKey: ["google-estado"] });
    },
    onError: (error) => toast.error(error.message || "No se pudo desconectar Google."),
  });

  const mutacionGuardarSheets = useMutation({
    mutationFn: () => actualizarConfiguracion({ google_sheets_id: sheetsId }),
    onSuccess: () => {
      toast.success("ID de la planilla guardado.");
      queryClient.invalidateQueries({ queryKey: ["configuracion"] });
    },
    onError: (error) => toast.error(error.message || "No se pudo guardar el ID de la planilla."),
  });

  const mutacionGuardarCalendar = useMutation({
    mutationFn: () => actualizarConfiguracion({ google_calendar_id: calendarId }),
    onSuccess: () => {
      toast.success("Calendario guardado.");
      queryClient.invalidateQueries({ queryKey: ["configuracion"] });
      queryClient.invalidateQueries({ queryKey: ["google-estado"] });
    },
    onError: (error) => toast.error(error.message || "No se pudo guardar el calendario."),
  });

  const mutacionGuardarAnalytics = useMutation({
    mutationFn: () =>
      actualizarConfiguracion({
        ga4_property_id: ga4PropertyId,
        ga4_measurement_id: ga4MeasurementId,
        search_console_site: searchConsoleSite,
      }),
    onSuccess: () => {
      toast.success("Configuración de Analytics guardada.");
      queryClient.invalidateQueries({ queryKey: ["configuracion"] });
      queryClient.invalidateQueries({ queryKey: ["google-estado"] });
      queryClient.invalidateQueries({ queryKey: ["google-analytics"] });
    },
    onError: (error) => toast.error(error.message || "No se pudo guardar la configuración."),
  });

  const mutacionAgregar = useMutation({
    mutationFn: agregarAgenteMCP,
    onSuccess: () => {
      toast.success("Agente conectado correctamente.");
      setProveedorAbierto(null);
      setValoresFormulario({});
      queryClient.invalidateQueries({ queryKey: ["mcp-config"] });
    },
    onError: (error) => toast.error(error.message || "No se pudo conectar el agente."),
  });

  const mutacionEliminar = useMutation({
    mutationFn: eliminarAgenteMCP,
    onSuccess: () => {
      toast.success("Agente eliminado.");
      queryClient.invalidateQueries({ queryKey: ["mcp-config"] });
    },
    onError: (error) => toast.error(error.message || "No se pudo eliminar el agente."),
  });

  const mutacionToggle = useMutation({
    mutationFn: ({ nombre, habilitado }) => cambiarHabilitadoAgenteMCP(nombre, habilitado),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["mcp-config"] }),
    onError: (error) => toast.error(error.message || "No se pudo actualizar el agente."),
  });

  function manejarEnvioFormulario(proveedor) {
    const config = proveedor.construirConfig(valoresFormulario);
    mutacionAgregar.mutate(config);
  }

  const servidores = data?.servidores || [];

  return (
    <div className="flex flex-col gap-6">
      <TabClavesIA />

      <TabClavesPublicidad />

      {!data?.mcp_habilitado && !isLoading && (
        <Card className="border-amber-300 bg-amber-50">
          <CardContent className="p-4 text-sm text-amber-800">
            El harness MCP está deshabilitado globalmente (<code>MCP_ENABLED=false</code> en el servidor). Podés
            guardar conexiones igual, pero no van a activarse hasta que se habilite.
          </CardContent>
        </Card>
      )}

      <div>
        <h3 className="mb-3 font-display text-sm font-semibold text-muted-foreground">
          Google Workspace (Meet, Sheets y Analytics)
        </h3>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Card>
            <CardHeader className="flex-row items-center gap-3 space-y-0 pb-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-gradient text-white">
                <Video className="h-4.5 w-4.5" />
              </div>
              <CardTitle className="text-base">Google Meet y Calendar</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <CardDescription>
                Permite que Lumi genere un link de Google Meet real y sincronice los turnos con tu Google Calendar.
                Una sola conexión para las dos cosas (y para Sheets, Analytics y Search Console).
              </CardDescription>
              <FormularioGoogleOAuth estado={credencialesGoogle} />
              {estadoGoogle?.google_conectado ? (
                <div className="flex items-center gap-2">
                  <Badge variant="success">Conectado</Badge>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={mutacionDesconectarGoogle.isPending}
                    onClick={() => mutacionDesconectarGoogle.mutate()}
                  >
                    Desconectar
                  </Button>
                </div>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!estadoGoogle?.oauth_habilitado}
                  onClick={() => {
                    window.location.href = "/api/integraciones/google/iniciar";
                  }}
                >
                  <Plus className="h-4 w-4" /> Conectar con Google
                </Button>
              )}
              <div className="grid gap-1.5">
                <Label htmlFor="calendar-id">ID del Google Calendar a sincronizar</Label>
                <Input
                  id="calendar-id"
                  placeholder="primary, o el email del calendario"
                  value={calendarId}
                  onChange={(e) => setCalendarId(e.target.value)}
                />
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={mutacionGuardarCalendar.isPending}
                onClick={() => mutacionGuardarCalendar.mutate()}
              >
                Guardar
              </Button>
              {estadoGoogle?.calendar_habilitado ? (
                <Badge variant="success" className="w-fit">Calendar activo</Badge>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Usá "primary" para el calendario principal de la cuenta conectada, o el email de otro calendario
                  que esa cuenta tenga compartido con permiso de edición.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center gap-3 space-y-0 pb-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-gradient text-white">
                <Sheet className="h-4.5 w-4.5" />
              </div>
              <CardTitle className="text-base">Google Sheets</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <CardDescription>
                Cada turno agendado se agrega como fila nueva en la primera pestaña de esta planilla, para que el
                equipo de ventas la revise.
              </CardDescription>
              <div className="grid gap-1.5">
                <Label htmlFor="sheets-id">ID de la planilla de Google Sheets</Label>
                <Input
                  id="sheets-id"
                  placeholder="1AbCdEfG..."
                  value={sheetsId}
                  onChange={(e) => setSheetsId(e.target.value)}
                />
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={mutacionGuardarSheets.isPending}
                onClick={() => mutacionGuardarSheets.mutate()}
              >
                Guardar
              </Button>
              {estadoGoogle?.sheets_habilitado ? (
                <Badge variant="success" className="w-fit">Activo</Badge>
              ) : (
                <p className="text-xs text-muted-foreground">
                  El ID esta en la URL de la planilla: docs.google.com/spreadsheets/d/<b>ID_AQUI</b>/edit. Tiene que
                  ser propiedad de la cuenta de Google conectada arriba, o estar compartida con ella como Editor.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center gap-3 space-y-0 pb-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-gradient text-white">
                <BarChart3 className="h-4.5 w-4.5" />
              </div>
              <CardTitle className="text-base">Analytics y Search Console</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <CardDescription>
                Trae tráfico, impresiones, CTR y palabras clave de fotoface.pro a los KPIs de Marketing. Usa el mismo
                login de Google de arriba (hace falta reconectar si todavía no diste permiso de Analytics).
              </CardDescription>
              <div className="grid gap-1.5">
                <Label htmlFor="ga4-property">Property ID de GA4</Label>
                <Input
                  id="ga4-property"
                  placeholder="123456789"
                  value={ga4PropertyId}
                  onChange={(e) => setGa4PropertyId(e.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="ga4-measurement">Measurement ID de GA4</Label>
                <Input
                  id="ga4-measurement"
                  placeholder="G-XXXXXXXXXX"
                  value={ga4MeasurementId}
                  onChange={(e) => setGa4MeasurementId(e.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="search-console">Sitio en Search Console</Label>
                <Input
                  id="search-console"
                  placeholder="sc-domain:fotoface.pro"
                  value={searchConsoleSite}
                  onChange={(e) => setSearchConsoleSite(e.target.value)}
                />
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={mutacionGuardarAnalytics.isPending}
                onClick={() => mutacionGuardarAnalytics.mutate()}
              >
                Guardar
              </Button>
              {estadoGoogle?.analytics_habilitado || estadoGoogle?.search_console_habilitado ? (
                <Badge variant="success" className="w-fit">Activo</Badge>
              ) : (
                <p className="text-xs text-muted-foreground">
                  La cuenta de Google conectada necesita acceso de Lector a esta propiedad de GA4 y a esta propiedad
                  de Search Console.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <div>
        <h3 className="mb-3 font-display text-sm font-semibold text-muted-foreground">
          WhatsApp Business (Meta, Twilio y YCloud)
        </h3>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <TarjetaWhatsappMetaBusiness />
          <TarjetaTwilio />
          <TarjetaYcloud />
        </div>
      </div>

      <div>
        <h3 className="mb-3 font-display text-sm font-semibold text-muted-foreground">
          Conectar un agente externo
        </h3>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {PROVEEDORES_DISPONIBLES.map((proveedor) => {
            const Icono = proveedor.icono;
            const yaConectado = servidores.some((s) => s.nombre === proveedor.id);
            return (
              <Card key={proveedor.id}>
                <CardHeader className="flex-row items-center gap-3 space-y-0 pb-2">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-gradient text-white">
                    <Icono className="h-4.5 w-4.5" />
                  </div>
                  <CardTitle className="text-base">{proveedor.nombre}</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  <CardDescription>{proveedor.descripcion}</CardDescription>

                  {yaConectado ? (
                    <Badge variant="success" className="w-fit">
                      Ya conectado
                    </Badge>
                  ) : proveedorAbierto === proveedor.id ? (
                    <form
                      className="flex flex-col gap-3"
                      onSubmit={(e) => {
                        e.preventDefault();
                        manejarEnvioFormulario(proveedor);
                      }}
                    >
                      {proveedor.campos.map((campo) => (
                        <div key={campo.clave} className="grid gap-1.5">
                          <Label htmlFor={`${proveedor.id}-${campo.clave}`}>{campo.etiqueta}</Label>
                          <Input
                            id={`${proveedor.id}-${campo.clave}`}
                            type={campo.tipo}
                            required
                            value={valoresFormulario[campo.clave] || ""}
                            onChange={(e) =>
                              setValoresFormulario({ ...valoresFormulario, [campo.clave]: e.target.value })
                            }
                          />
                        </div>
                      ))}
                      <p className="text-xs text-muted-foreground">{proveedor.nota}</p>
                      <div className="flex gap-2">
                        <Button type="submit" size="sm" variant="gradient" disabled={mutacionAgregar.isPending}>
                          Conectar
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setProveedorAbierto(null);
                            setValoresFormulario({});
                          }}
                        >
                          Cancelar
                        </Button>
                      </div>
                    </form>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setProveedorAbierto(proveedor.id);
                        setValoresFormulario({});
                      }}
                    >
                      <Plus className="h-4 w-4" /> Conectar
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}

          {PROVEEDORES_PROXIMAMENTE.map(({ nombre, icono: Icono }) => (
            <Card key={nombre} className="opacity-60">
              <CardHeader className="flex-row items-center gap-3 space-y-0 pb-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <Icono className="h-4.5 w-4.5" />
                </div>
                <CardTitle className="text-base">{nombre}</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                <Badge variant="outline" className="w-fit gap-1">
                  <Clock className="h-3 w-3" /> Próximamente
                </Badge>
                <CardDescription>
                  {nombre} no tiene todavía un servidor MCP oficial propio para conectar de forma directa.
                </CardDescription>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <div>
        <h3 className="mb-3 font-display text-sm font-semibold text-muted-foreground">
          Agentes configurados
        </h3>
        <Card>
          <CardContent className="p-0">
            {isLoading && <p className="p-4 text-sm text-muted-foreground">Cargando...</p>}
            {!isLoading && servidores.length === 0 && (
              <p className="p-4 text-sm text-muted-foreground">Todavía no conectaste ningún agente externo.</p>
            )}
            <div className="flex flex-col divide-y divide-border">
              {servidores.map((servidor) => (
                <div key={servidor.nombre} className="flex items-center justify-between gap-4 p-4">
                  <div>
                    <p className="text-sm font-semibold">{servidor.descripcion || servidor.nombre}</p>
                    <p className="text-xs text-muted-foreground">
                      {servidor.transport === "http" ? servidor.url : `${servidor.command} ${(servidor.args || []).join(" ")}`}
                    </p>
                    {servidor.tools?.length > 0 && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Herramientas: {servidor.tools.join(", ")}
                      </p>
                    )}
                    {servidor.error && <p className="mt-1 text-xs text-destructive">{servidor.error}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={
                        servidor.estado === "conectado"
                          ? "success"
                          : servidor.estado === "error"
                            ? "destructive"
                            : "outline"
                      }
                    >
                      {servidor.estado}
                    </Badge>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={mutacionToggle.isPending}
                      onClick={() =>
                        mutacionToggle.mutate({ nombre: servidor.nombre, habilitado: servidor.habilitado === false })
                      }
                    >
                      {servidor.habilitado === false ? "Habilitar" : "Deshabilitar"}
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      disabled={mutacionEliminar.isPending}
                      onClick={() => mutacionEliminar.mutate(servidor.nombre)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
