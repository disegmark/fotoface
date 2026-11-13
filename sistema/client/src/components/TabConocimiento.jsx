import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { BookOpen, FileUp, Globe, Pencil, Trash2, Plus, Save, X } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  listarConocimiento,
  obtenerDocConocimiento,
  crearDocConocimiento,
  actualizarDocConocimiento,
  eliminarDocConocimiento,
  importarUrlConocimiento,
  subirArchivoConocimiento,
} from "@/lib/api";

const ETIQUETA_ORIGEN = (origen) => {
  if (!origen || origen === "texto") return "Texto";
  if (origen === "web") return "Semilla inicial";
  if (origen.startsWith("archivo:")) return `Archivo ${origen.slice(8).toUpperCase()}`;
  if (origen.startsWith("url:")) return origen.slice(4);
  return origen;
};

export default function TabConocimiento() {
  const queryClient = useQueryClient();
  const refrescar = () => queryClient.invalidateQueries({ queryKey: ["conocimiento"] });
  const { data, isLoading, error } = useQuery({ queryKey: ["conocimiento"], queryFn: listarConocimiento });

  const [titulo, setTitulo] = useState("");
  const [texto, setTexto] = useState("");
  const [url, setUrl] = useState("");
  const archivoRef = useRef(null);
  const [edicion, setEdicion] = useState(null); // { id, titulo, texto }

  const alFallar = (e) => toast.error(e.message);

  const crear = useMutation({
    mutationFn: crearDocConocimiento,
    onSuccess: () => {
      toast.success("Información guardada. Lumi ya la usa.");
      setTitulo("");
      setTexto("");
      refrescar();
    },
    onError: alFallar,
  });
  const importar = useMutation({
    mutationFn: importarUrlConocimiento,
    onSuccess: () => {
      toast.success("Página importada. Revísala y edítala si hace falta.");
      setUrl("");
      refrescar();
    },
    onError: alFallar,
  });
  const subir = useMutation({
    mutationFn: subirArchivoConocimiento,
    onSuccess: () => {
      toast.success("Archivo cargado. Lumi ya lo usa.");
      if (archivoRef.current) archivoRef.current.value = "";
      refrescar();
    },
    onError: alFallar,
  });
  const actualizar = useMutation({
    mutationFn: ({ id, ...cambios }) => actualizarDocConocimiento(id, cambios),
    onSuccess: () => {
      setEdicion(null);
      refrescar();
    },
    onError: alFallar,
  });
  const eliminar = useMutation({
    mutationFn: eliminarDocConocimiento,
    onSuccess: () => {
      toast.success("Documento eliminado.");
      refrescar();
    },
    onError: alFallar,
  });

  async function abrirEdicion(doc) {
    try {
      const completo = await obtenerDocConocimiento(doc.id);
      setEdicion({ id: completo.id, titulo: completo.titulo, texto: completo.texto });
    } catch (e) {
      toast.error(e.message);
    }
  }

  const estado = data?.estado;
  const docs = data?.documentos || [];

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-brand-primary" /> Base de conocimiento de Lumi
          </CardTitle>
          <CardDescription>
            Todo lo que cargues aquí (servicios, preguntas frecuentes, políticas, catálogos) lo usa Lumi para responder
            a los clientes de inmediato, sin reiniciar nada. Si un dato no está aquí, Lumi deriva al equipo humano.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {estado && (
            <p className="text-sm text-muted-foreground">
              {estado.activos} de {estado.documentos} documentos activos · {estado.caracteresActivos.toLocaleString("es-PE")} caracteres
              {estado.seleccionaFragmentos
                ? ` (supera los ${estado.presupuesto.toLocaleString("es-PE")}: Lumi usa los fragmentos más relevantes a cada pregunta)`
                : ` (límite de uso completo: ${estado.presupuesto.toLocaleString("es-PE")})`}
            </p>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Plus className="h-4 w-4" /> Agregar texto
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="conoc-titulo">Título</Label>
              <Input id="conoc-titulo" value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ej.: Preguntas frecuentes sobre los servicios" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="conoc-texto">Contenido</Label>
              <Textarea id="conoc-texto" rows={8} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Pega o escribe la información que Lumi debe conocer…" />
            </div>
            <div>
              <Button onClick={() => crear.mutate({ titulo, texto })} disabled={crear.isPending || !texto.trim()}>
                <Save className="h-4 w-4" /> {crear.isPending ? "Guardando…" : "Guardar"}
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <FileUp className="h-4 w-4" /> Subir archivo
              </CardTitle>
              <CardDescription>PDF, Word (.docx), TXT, MD o CSV. Hasta 12 MB.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <input
                ref={archivoRef}
                type="file"
                accept=".pdf,.docx,.txt,.md,.csv"
                disabled={subir.isPending}
                onChange={(e) => e.target.files?.[0] && subir.mutate(e.target.files[0])}
                className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-2 file:text-sm file:font-medium file:text-primary-foreground"
              />
              {subir.isPending && <p className="text-sm text-muted-foreground">Leyendo el archivo…</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Globe className="h-4 w-4" /> Importar de una página web
              </CardTitle>
              <CardDescription>Pega la dirección de una página pública de la web.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://fotoface.pro/#servicios" />
              <div>
                <Button variant="outline" onClick={() => importar.mutate(url)} disabled={importar.isPending || !url.trim()}>
                  {importar.isPending ? "Importando…" : "Importar"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Documentos cargados</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {isLoading && <p className="text-sm text-muted-foreground">Cargando…</p>}
          {error && <p className="text-sm text-destructive">{error.message}</p>}
          {docs.map((doc) => (
            <div key={doc.id} className="rounded-lg border border-border p-4">
              {edicion?.id === doc.id ? (
                <div className="flex flex-col gap-3">
                  <Input value={edicion.titulo} onChange={(e) => setEdicion({ ...edicion, titulo: e.target.value })} />
                  <Textarea rows={14} value={edicion.texto} onChange={(e) => setEdicion({ ...edicion, texto: e.target.value })} />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => actualizar.mutate(edicion)} disabled={actualizar.isPending}>
                      <Save className="h-4 w-4" /> Guardar cambios
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setEdicion(null)}>
                      <X className="h-4 w-4" /> Cancelar
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className={`truncate font-medium ${doc.activo ? "" : "text-muted-foreground line-through"}`}>{doc.titulo}</p>
                    <p className="text-xs text-muted-foreground">
                      {ETIQUETA_ORIGEN(doc.origen)} · {doc.caracteres.toLocaleString("es-PE")} caracteres · actualizado {doc.actualizado_en}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="flex cursor-pointer items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={!!doc.activo}
                        onChange={(e) => actualizar.mutate({ id: doc.id, activo: e.target.checked })}
                      />
                      Activo
                    </label>
                    <Button size="sm" variant="outline" onClick={() => abrirEdicion(doc)}>
                      <Pencil className="h-4 w-4" /> Editar
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => window.confirm(`¿Eliminar "${doc.titulo}"?`) && eliminar.mutate(doc.id)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))}
          {!isLoading && !docs.length && <p className="text-sm text-muted-foreground">Aún no hay documentos.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
