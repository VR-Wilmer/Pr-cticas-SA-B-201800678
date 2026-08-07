import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { obtenerPanelAdmin, logout } from "../api/authApi";
import { ApiError } from "../api/httpClient";

// Ruta 1 del enunciado: solo Admin. Si el usuario autenticado es Cliente, el
// backend responde 403 (via el microservicio de autorizacion) y aqui se muestra
// el mensaje de acceso denegado.
export function AdminPanelPage() {
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    obtenerPanelAdmin()
      .then((data) => setMensaje(data.mensaje))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Error inesperado"));
  }, []);

  async function handleLogout(): Promise<void> {
    await logout();
    navigate("/");
  }

  return (
    <main>
      <h1>Panel de administracion</h1>
      {mensaje && <p>{mensaje}</p>}
      {error && <p role="alert">Acceso denegado: {error}</p>}
      <nav>
        <Link to="/dashboard">Ir a Dashboard</Link>
        {" | "}
        <button onClick={handleLogout}>Cerrar sesion</button>
      </nav>
    </main>
  );
}
