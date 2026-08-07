import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { login } from "../api/authApi";
import { ApiError } from "../api/httpClient";

export function LoginPage() {
  const [correo, setCorreo] = useState("");
  const [contrasena, setContrasena] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(evento: FormEvent): Promise<void> {
    evento.preventDefault();
    setError(null);
    setCargando(true);
    try {
      const { usuario } = await login(correo, contrasena);
      navigate("/confirmacion", { state: { usuario } });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo iniciar sesion");
    } finally {
      setCargando(false);
    }
  }

  return (
    <main>
      <h1>Iniciar sesion</h1>
      <form onSubmit={handleSubmit}>
        <label>
          Correo
          <input type="email" value={correo} onChange={(e) => setCorreo(e.target.value)} required />
        </label>
        <label>
          Contrasena
          <input
            type="password"
            value={contrasena}
            onChange={(e) => setContrasena(e.target.value)}
            required
          />
        </label>
        <button type="submit" disabled={cargando}>
          {cargando ? "Ingresando..." : "Ingresar"}
        </button>
      </form>
      {error && <p role="alert">{error}</p>}
      <p>
        <Link to="/registro">Crear una cuenta</Link>
      </p>
    </main>
  );
}
