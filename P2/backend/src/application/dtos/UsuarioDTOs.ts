export interface RegistrarUsuarioDTO {
  nombre: string;
  correo: string;
  contrasena: string;
}

export interface LoginDTO {
  correo: string;
  contrasena: string;
}
