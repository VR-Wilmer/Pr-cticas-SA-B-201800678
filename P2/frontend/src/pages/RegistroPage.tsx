import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { registrar } from "../api/authApi";
import { ApiError } from "../api/httpClient";

export function RegistroPage() {
  const [nombre, setNombre] = useState("");
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
      await registrar(nombre, correo, contrasena);
      navigate("/");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo completar el registro");
    } finally {
      setCargando(false);
    }
  }

  return (
    <main>
      <h1>Crear cuenta</h1>
      <form onSubmit={handleSubmit}>
        <label>
          Nombre
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} required />
        </label>
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
            minLength={8}
          />
        </label>
        <button type="submit" disabled={cargando}>
          {cargando ? "Creando..." : "Crear cuenta"}
        </button>
      </form>
      {error && <p role="alert">{error}</p>}
      <p>
        <Link to="/">Ya tengo una cuenta</Link>
      </p>
    </main>
  );
}
