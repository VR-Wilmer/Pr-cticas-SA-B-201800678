import { Link, useLocation } from "react-router-dom";
import { Usuario } from "../api/authApi";

// Pagina de confirmacion visible tras un login exitoso (requisito 7 del
// enunciado). Los datos del usuario llegan por el estado de navegacion que dejo
// LoginPage; si se accede directo a esta URL (sin pasar por login) simplemente no
// se muestran, pero eso no es un problema de seguridad: el acceso real a
// /admin y /dashboard lo sigue validando el backend con la cookie de sesion.
export function ConfirmacionPage() {
  const location = useLocation();
  const usuario = (location.state as { usuario?: Usuario } | null)?.usuario;

  return (
    <main>
      <h1>Sesion iniciada correctamente</h1>
      {usuario ? (
        <p>
          Bienvenido, {usuario.nombre} ({usuario.correo}) — rol: {usuario.rol}
        </p>
      ) : (
        <p>Sesion iniciada.</p>
      )}
      <nav>
        <Link to="/dashboard">Ir a Dashboard</Link>
        {" | "}
        <Link to="/admin">Ir a Panel de administracion</Link>
      </nav>
    </main>
  );
}
