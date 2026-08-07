import { Routes, Route } from "react-router-dom";
import { LoginPage } from "./pages/LoginPage";
import { RegistroPage } from "./pages/RegistroPage";
import { ConfirmacionPage } from "./pages/ConfirmacionPage";
import { AdminPanelPage } from "./pages/AdminPanelPage";
import { DashboardPage } from "./pages/DashboardPage";

// El enrutamiento en si es estructura, no logica de negocio: la proteccion real
// de /admin y /dashboard (verificar sesion antes de renderizar) se agrega en la
// siguiente iteracion.
export function App() {
  return (
    <Routes>
      <Route path="/" element={<LoginPage />} />
      <Route path="/registro" element={<RegistroPage />} />
      <Route path="/confirmacion" element={<ConfirmacionPage />} />
      <Route path="/admin" element={<AdminPanelPage />} />
      <Route path="/dashboard" element={<DashboardPage />} />
    </Routes>
  );
}
