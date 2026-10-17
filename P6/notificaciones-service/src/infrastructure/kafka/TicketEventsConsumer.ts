import { Kafka, Consumer } from "kafkajs";
import { RegistrarNotificacionUseCase } from "../../application/use-cases/RegistrarNotificacionUseCase";
import { TipoNotificacion } from "../../domain/entities/Notificacion";
import { metrics } from "@opentelemetry/api";

// Practica 10, metrica de negocio: notificaciones entregadas al cliente por
// tipo y estado de envio. Es el extremo final del flujo asincrono: si
// tickets_creados_total sube y esta no, los clientes no se estan enterando
// de sus tickets aunque la API responda bien.
const notificacionesProcesadas = metrics
  .getMeter("sa-platform-negocio")
  .createCounter("notificaciones_procesadas", {
    description: "Eventos de ticket convertidos en notificacion, por tipo y estado de envio",
  });

interface TicketEventoPayload {
  ticketId: string;
  destinatario: string;
  tipo: TipoNotificacion;
  secretoInterno: string;
}

// Consumidor del flujo asincrono de notificaciones (P5, requisito D):
// tickets-service publica en este topico y retorna de inmediato; este
// consumidor procesa cada evento de forma independiente, ejecutando el mismo
// caso de uso que antes invocaba el resolver GraphQL via HTTP.
//
// autoCommit esta deshabilitado a proposito: el offset solo se confirma
// (commitOffsets) despues de que RegistrarNotificacionUseCase termino de
// escribir en la base de datos. Si el proceso muere a media escritura, Kafka
// vuelve a entregar el mensaje al reiniciar -- no se pierde, en el peor caso
// se reprocesa (at-least-once).
export class TicketEventsConsumer {
  private readonly consumer: Consumer;

  constructor(
    clientId: string,
    brokers: string[],
    private readonly topic: string,
    private readonly registrarNotificacion: RegistrarNotificacionUseCase
  ) {
    const kafka = new Kafka({ clientId, brokers });
    this.consumer = kafka.consumer({ groupId: "notificaciones-ticket-events", allowAutoTopicCreation: false });
  }

  async start(): Promise<void> {
    await this.consumer.connect();

    // El topico lo crea un Job de Helm (post-install/post-upgrade hook, ver
    // charts/sa-platform/templates/kafka-topics-job.yaml) que corre DESPUES
    // de que este pod pase su startupProbe -- en el primer arranque puede
    // no existir todavia. subscribe() falla duro (UNKNOWN_TOPIC_OR_PARTITION)
    // si el topico no existe, asi que se reintenta con espera hasta que el
    // Job termine de crearlo.
    await this.retrySubscribe();

    await this.consumer.run({
      autoCommit: false,
      eachMessage: async ({ topic, partition, message }) => {
        if (!message.value) return;

        const evento: TicketEventoPayload = JSON.parse(message.value.toString());
        try {
          const notificacion = await this.registrarNotificacion.execute(
            evento.secretoInterno,
            evento.ticketId,
            evento.destinatario,
            evento.tipo
          );
          notificacionesProcesadas.add(1, { tipo: notificacion.tipo, estado_envio: notificacion.estadoEnvio });
          await this.consumer.commitOffsets([
            { topic, partition, offset: (Number(message.offset) + 1).toString() },
          ]);
        } catch (err) {
          notificacionesProcesadas.add(1, { tipo: evento.tipo, estado_envio: "ERROR" });
          console.error(
            `No se pudo procesar el evento de notificacion del ticket ${evento.ticketId} (offset ${message.offset}), no se confirma -- se reintentara:`,
            err
          );
        }
      },
    });
  }

  private async retrySubscribe(maxAttempts = 24, delayMs = 5000): Promise<void> {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await this.consumer.subscribe({ topic: this.topic, fromBeginning: true });
        return;
      } catch (err) {
        if (attempt === maxAttempts) throw err;
        console.warn(
          `No se pudo suscribir a "${this.topic}" (intento ${attempt}/${maxAttempts}), reintentando en ${delayMs}ms:`,
          err instanceof Error ? err.message : err
        );
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }

  async stop(): Promise<void> {
    await this.consumer.disconnect();
  }
}
