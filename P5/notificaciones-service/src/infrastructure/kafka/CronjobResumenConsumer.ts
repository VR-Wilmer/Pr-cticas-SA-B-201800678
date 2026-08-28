import { Kafka, Consumer } from "kafkajs";
import { Pool } from "pg";

interface ResumenPayload {
  generadoEn: string;
  carne: string;
  resumenPorHora: Array<{ hora: string; cantidad: number }>;
}

// Segundo consumer loop (mismo proceso, otro consumer group): recibe el
// resumen que publica el Cronjob 2 y lo almacena en "cronjob_resumenes"
// (platform_db). Cumple el requisito H ("publicado -> consumido y
// almacenado") sin necesitar un microservicio nuevo.
export class CronjobResumenConsumer {
  private readonly consumer: Consumer;

  constructor(
    clientId: string,
    brokers: string[],
    private readonly topic: string,
    private readonly platformPool: Pool
  ) {
    const kafka = new Kafka({ clientId, brokers });
    this.consumer = kafka.consumer({ groupId: "notificaciones-cronjob-resumen", allowAutoTopicCreation: false });
  }

  async start(): Promise<void> {
    await this.consumer.connect();
    // Ver comentario equivalente en TicketEventsConsumer: el topico lo crea
    // un Job de Helm que corre despues del startupProbe de este pod.
    await this.retrySubscribe();

    await this.consumer.run({
      autoCommit: false,
      eachMessage: async ({ topic, partition, message }) => {
        if (!message.value) return;

        const resumen: ResumenPayload = JSON.parse(message.value.toString());
        try {
          await this.platformPool.query(
            `INSERT INTO cronjob_resumenes (generado_en, carne, resumen)
             VALUES ($1, $2, $3)`,
            [resumen.generadoEn, resumen.carne, JSON.stringify(resumen.resumenPorHora)]
          );
          await this.consumer.commitOffsets([
            { topic, partition, offset: (Number(message.offset) + 1).toString() },
          ]);
        } catch (err) {
          console.error(`No se pudo almacenar el resumen generado en ${resumen.generadoEn}, no se confirma:`, err);
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
