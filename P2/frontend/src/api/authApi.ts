import { httpClient } from "./httpClient";

export interface Usuario {
  id: string;
  nombre: string;
  correo: string;
  rol: "admin" | "cliente";
}

export function registrar(nombre: string, correo: string, contrasena: string): Promise<Usuario> {
  return httpClient<Usuario>("/auth/registro", {
    method: "POST",
    body: JSON.stringify({ nombre, correo, contrasena }),
  });
}

export function login(correo: string, contrasena: string): Promise<{ usuario: Usuario }> {
  return httpClient<{ usuario: Usuario }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ correo, contrasena }),
  });
}

export function logout(): Promise<void> {
  return httpClient<void>("/auth/logout", { method: "POST" });
}

export function obtenerPanelAdmin(): Promise<{ mensaje: string }> {
  return httpClient<{ mensaje: string }>("/api/admin/panel");
}

export function obtenerDashboard(): Promise<{ mensaje: string }> {
  return httpClient<{ mensaje: string }>("/api/dashboard");
}
