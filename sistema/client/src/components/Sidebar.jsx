import {
  LayoutDashboard,
  MessageSquare,
  CalendarDays,
  Contact,
  TrendingUp,
  Megaphone,
  Briefcase,
  Settings,
  Users,
  Plug,
  GraduationCap,
  BookOpen,
  Printer,
} from "lucide-react";
import { appsDeSeccion, SUBSECCION_NATIVA } from "@/lib/appsIntegradas";

const SECCIONES_PRINCIPALES = [
  { id: "dashboard", nombre: "Dashboard", icono: LayoutDashboard },
  { id: "conversaciones", nombre: "Conversaciones", icono: MessageSquare },
  { id: "calendario", nombre: "Sesiones y citas", icono: CalendarDays },
  { id: "pedidos", nombre: "Pedidos", icono: Printer },
  { id: "inscripciones", nombre: "Talleres", icono: GraduationCap },
  { id: "contacto", nombre: "Contacto", icono: Contact },
  { id: "ventas", nombre: "Ventas y Clientes Potenciales", icono: TrendingUp },
  { id: "marketing", nombre: "Marketing", icono: Megaphone },
  { id: "oficina", nombre: "Oficina", icono: Briefcase },
];

const SECCIONES_ADMIN = [
  { id: "conocimiento", nombre: "Conocimiento", icono: BookOpen },
  { id: "conexiones", nombre: "Conexiones", icono: Plug },
  { id: "usuarios", nombre: "Usuarios", icono: Users },
  { id: "configuracion", nombre: "Configuración", icono: Settings },
];

// Secciones con apps integradas (ver lib/appsIntegradas.js) muestran sus
// subsecciones al estar activas: primero el contenido propio (si tiene) y
// luego cada app (id "seccion:app").
function ItemNav({ seccion, activa, onSeleccionar }) {
  const Icono = seccion.icono;
  const apps = appsDeSeccion(seccion.id);
  const grupoActivo = activa === seccion.id || activa.startsWith(seccion.id + ":");
  const subsecciones = [
    ...(SUBSECCION_NATIVA[seccion.id] ? [{ id: seccion.id, nombre: SUBSECCION_NATIVA[seccion.id] }] : []),
    ...apps.map((app) => ({ id: seccion.id + ":" + app.id, nombre: app.nombre })),
  ];
  // En secciones solo de apps, la primera app equivale a la seccion sin subseccion.
  const subActiva = activa.includes(":") || SUBSECCION_NATIVA[seccion.id] ? activa : subsecciones[0]?.id;
  return (
    <div className="flex flex-col gap-1">
      <button
        onClick={() => onSeleccionar(seccion.id)}
        className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors ${
          grupoActivo ? "bg-white/15 text-white" : "text-white/70 hover:bg-white/10 hover:text-white"
        }`}
      >
        <Icono className="h-4.5 w-4.5 shrink-0" />
        <span className="truncate">{seccion.nombre}</span>
      </button>
      {apps.length > 0 && grupoActivo && (
        <div className="ml-5 flex flex-col gap-0.5 border-l border-white/15 pl-3">
          {subsecciones.map((sub) => (
            <button
              key={sub.id}
              onClick={() => onSeleccionar(sub.id)}
              className={`rounded-md px-3 py-1.5 text-left text-[13px] transition-colors ${
                subActiva === sub.id ? "bg-white/15 font-semibold text-white" : "text-white/65 hover:bg-white/10 hover:text-white"
              }`}
            >
              {sub.nombre}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Sidebar({ seccionActiva, onCambiarSeccion }) {
  return (
    <aside className="flex h-full w-64 shrink-0 flex-col gap-6 bg-brand-primary px-3 py-6">
      <div className="flex items-center gap-2 px-2 font-display text-lg font-bold text-white">
        <img src="/logo.svg" alt="FotoFace" className="h-8 w-8 rounded-full" />
        FotoFace
      </div>

      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto">
        {SECCIONES_PRINCIPALES.map((seccion) => (
          <ItemNav key={seccion.id} seccion={seccion} activa={seccionActiva} onSeleccionar={onCambiarSeccion} />
        ))}

        <div className="my-2 border-t border-white/10" />

        {SECCIONES_ADMIN.map((seccion) => (
          <ItemNav key={seccion.id} seccion={seccion} activa={seccionActiva} onSeleccionar={onCambiarSeccion} />
        ))}
      </nav>
    </aside>
  );
}
