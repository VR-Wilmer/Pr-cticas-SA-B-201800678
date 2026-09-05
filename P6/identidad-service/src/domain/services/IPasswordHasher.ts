// Puerto (ISP): solo los dos metodos que el caso de uso de autenticacion necesita,
// nada de un servicio de "seguridad" generico y sobrecargado.
export interface IPasswordHasher {
  hash(textoPlano: string): Promise<string>;
  comparar(textoPlano: string, hash: string): Promise<boolean>;
}
