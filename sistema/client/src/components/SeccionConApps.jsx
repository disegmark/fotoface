import { useState } from "react";
import { ExternalLink, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { appsDeSeccion, urlDeApp } from "@/lib/appsIntegradas";

function AppEmbebida({ app, visible }) {
  const [version, setVersion] = useState(0);
  return (
    <div className={visible ? "flex flex-col gap-3" : "hidden"}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{app.descripcion}</p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setVersion((v) => v + 1)}>
            <RefreshCw className="h-4 w-4" /> Recargar
          </Button>
          <Button variant="outline" size="sm" asChild>
            <a href={urlDeApp(app)} target="_blank" rel="noreferrer">
              <ExternalLink className="h-4 w-4" /> Abrir en pestaña nueva
            </a>
          </Button>
        </div>
      </div>
      <iframe
        key={version}
        src={urlDeApp(app)}
        title={app.nombre}
        allow="geolocation; clipboard-write; fullscreen; camera; microphone"
        className="h-[calc(100vh-11rem)] min-h-[480px] w-full rounded-xl border border-border bg-white"
      />
    </div>
  );
}

function AppEnPestana({ app }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-start gap-4 p-8">
        <div>
          <h2 className="font-display text-xl font-bold">{app.nombre}</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{app.descripcion}</p>
        </div>
        <Button asChild>
          <a href={app.url} target="_blank" rel="noreferrer">
            <ExternalLink className="h-4 w-4" /> Abrir {app.nombre}
          </a>
        </Button>
        <p className="text-xs text-muted-foreground">
          Se abre en una pestaña nueva porque su inicio de sesión no funciona dentro del dashboard (está en otro dominio).
        </p>
      </CardContent>
    </Card>
  );
}

// Muestra el contenido nativo (children, cuando appId es null) o la app de la
// subseccion activa. Los iframes se montan al abrirse por primera vez y luego se
// conservan ocultos, para no perder el estado al cambiar de subseccion.
export default function SeccionConApps({ seccion, appId, children = null }) {
  const apps = appsDeSeccion(seccion);
  const [abiertas, setAbiertas] = useState([]);

  const activa = apps.find((a) => a.id === appId);
  if (activa && !activa.pestanaNueva && !abiertas.includes(appId)) {
    setAbiertas((prev) => [...prev, appId]);
  }

  return (
    <>
      {children && <div className={appId ? "hidden" : ""}>{children}</div>}
      {activa?.pestanaNueva && <AppEnPestana app={activa} />}
      {apps
        .filter((app) => abiertas.includes(app.id))
        .map((app) => (
          <AppEmbebida key={app.id} app={app} visible={appId === app.id} />
        ))}
    </>
  );
}
