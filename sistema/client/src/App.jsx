import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import Dashboard from "./pages/Dashboard.jsx";
import Login from "./pages/Login.jsx";
import RecuperarPassword from "./pages/RecuperarPassword.jsx";
import RutaProtegida from "./components/RutaProtegida.jsx";
import PanelTarjetas from "./pages/PanelTarjetas.jsx";
import { MODO_TARJETAS } from "./lib/modo.js";

if (MODO_TARJETAS) document.title = "Tarjetas digitales · FotoFace";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
    },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          {MODO_TARJETAS ? (
            <>
              <Route path="/" element={<RutaProtegida><PanelTarjetas /></RutaProtegida>} />
              <Route path="/dashboard" element={<Navigate to="/" replace />} />
            </>
          ) : (
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
          )}
          <Route path="/login" element={<Login />} />
          <Route path="/recuperar" element={<RecuperarPassword />} />
          {!MODO_TARJETAS && <Route
            path="/dashboard"
            element={
              <RutaProtegida>
                <Dashboard />
              </RutaProtegida>
            }
          />}
        </Routes>
      </BrowserRouter>
      <Toaster position="top-right" richColors />
    </QueryClientProvider>
  );
}
