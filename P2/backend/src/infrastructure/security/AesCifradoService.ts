import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from "node:crypto";
import { ICifradoService } from "../../domain/services/ICifradoService";

const ALGORITMO = "aes-256-gcm";
const IV_LENGTH = 12; // longitud recomendada de IV para GCM

// Implementacion concreta de ICifradoService con AES-256-GCM (node:crypto, sin
// dependencias externas). El texto cifrado se guarda como "iv:authTag:cifrado" en
// hexadecimal, todo en una unica columna de texto. La clave de 32 bytes se deriva
// de AES_SECRET_KEY (string de longitud arbitraria) mediante SHA-256.
export class AesCifradoService implements ICifradoService {
  private readonly key: Buffer;

  constructor(secretKey: string) {
    this.key = createHash("sha256").update(secretKey).digest();
  }

  encriptar(texto: string): string {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITMO, this.key, iv);
    const cifrado = Buffer.concat([cipher.update(texto, "utf8"), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return `${iv.toString("hex")}:${authTag.toString("hex")}:${cifrado.toString("hex")}`;
  }

  desencriptar(textoEncriptado: string): string {
    const [ivHex, authTagHex, cifradoHex] = textoEncriptado.split(":");
    const decipher = createDecipheriv(ALGORITMO, this.key, Buffer.from(ivHex, "hex"));
    decipher.setAuthTag(Buffer.from(authTagHex, "hex"));
    const texto = Buffer.concat([decipher.update(Buffer.from(cifradoHex, "hex")), decipher.final()]);
    return texto.toString("utf8");
  }

  // HMAC determinista (misma entrada -> misma salida) usado solo para poder buscar
  // por igualdad (ej. correo_hash) sin desencriptar toda la tabla. AES por si solo
  // no sirve para esto porque cada cifrado usa un IV aleatorio distinto.
  hash(texto: string): string {
    return createHmac("sha256", this.key).update(texto).digest("hex");
  }
}
