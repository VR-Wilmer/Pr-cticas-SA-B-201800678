export enum RolUsuario {
  ADMIN = "ADMIN",
  AGENTE = "AGENTE",
  CLIENTE = "CLIENTE",
}

// Representa al usuario tal como lo maneja el dominio: la contrasena aqui ya es
// el hash de bcrypt, nunca el texto plano (a diferencia de P2, que guardaba un
// cifrado reversible). Ver justificacion de este cambio en README.md.
export interface Usuario {
  id: string;
  nombre: string;
  correo: string;
  contrasenaHash: string;
  rol: RolUsuario;
}
