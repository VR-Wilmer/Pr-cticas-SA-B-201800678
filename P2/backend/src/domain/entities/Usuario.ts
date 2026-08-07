export enum RolUsuario {
  ADMIN = "admin",
  CLIENTE = "cliente",
}

// Representa al usuario ya en texto plano (forma de dominio). El cifrado/descifrado
// de los campos sensibles ocurre en la frontera de infraestructura (repositorio),
// nunca dentro de domain/ ni application/.
export interface Usuario {
  id: string;
  nombre: string;
  correo: string;
  contrasena: string;
  rol: RolUsuario;
}
