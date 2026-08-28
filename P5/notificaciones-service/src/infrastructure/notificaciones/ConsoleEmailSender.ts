import { IEmailSender } from "../../domain/services/IEmailSender";
import { TipoNotificacion } from "../../domain/entities/Notificacion";

// Implementacion concreta de IEmailSender: no envia correo real (no se pide SMTP
// real en P4), lo simula con un log estructurado. Cambiar a un proveedor real
// (SMTP/SES) es reemplazar solo esta clase, sin tocar el caso de uso (OCP/DIP).
export class ConsoleEmailSender implements IEmailSender {
  async enviar(destinatario: string, tipo: TipoNotificacion): Promise<boolean> {
    console.log(`[notificaciones-service] correo simulado -> ${destinatario} | tipo=${tipo}`);
    return true;
  }
}
