import { TipoNotificacion } from "../entities/Notificacion";

// Puerto (DIP + ISP): abstrae el envio real de correo. La implementacion de esta
// practica solo simula el envio (log estructurado), pero cualquier proveedor real
// (SMTP/SES, como en el diseno de P3) se conecta implementando este mismo puerto,
// sin tocar el caso de uso que lo consume.
export interface IEmailSender {
  enviar(destinatario: string, tipo: TipoNotificacion): Promise<boolean>;
}
