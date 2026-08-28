import bcrypt from "bcryptjs";
import { IPasswordHasher } from "../../domain/services/IPasswordHasher";

const SALT_ROUNDS = 10;

// Implementacion concreta de IPasswordHasher con bcrypt. Unico lugar del proyecto
// que conoce el algoritmo de hashing.
export class BcryptPasswordHasher implements IPasswordHasher {
  async hash(textoPlano: string): Promise<string> {
    return bcrypt.hash(textoPlano, SALT_ROUNDS);
  }

  async comparar(textoPlano: string, hash: string): Promise<boolean> {
    return bcrypt.compare(textoPlano, hash);
  }
}
