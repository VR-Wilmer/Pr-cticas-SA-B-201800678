import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { obtenerDashboard, logout } from "../api/authApi";
import { ApiError } from "../api/httpClient";

// Ruta 2 del enunciado: Admin y Cliente.
export function DashboardPage() {
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    obtenerDashboard()
      .then((data) => setMensaje(data.mensaje))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Error inesperado"));
  }, []);

  async function handleLogout(): Promise<void> {
    await logout();
    navigate("/");
  }

  return (
    <main>
      <h1>Dashboard</h1>
      {mensaje && <p>{mensaje}</p>}
      {error && <p role="alert">{error}</p>}
      <nav>
        <Link to="/admin">Ir a Panel de administracion</Link>
        {" | "}
        <button onClick={handleLogout}>Cerrar sesion</button>
      </nav>
    </main>
  );
}
