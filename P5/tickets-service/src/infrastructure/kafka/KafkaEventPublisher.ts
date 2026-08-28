import { Kafka, Producer } from "kafkajs";
import { IEventPublisher } from "../../domain/services/IEventPublisher";

// Adaptador concreto de IEventPublisher usando KafkaJS. El productor se
// conecta una sola vez (ver connect()/disconnect() invocados desde
// server.ts) y se reutiliza para toda la vida del proceso -- abrir una
// conexion nueva por publicacion seria costoso e innecesario.
export class KafkaEventPublisher implements IEventPublisher {
  private readonly producer: Producer;

  constructor(clientId: string, brokers: string[]) {
    const kafka = new Kafka({ clientId, brokers });
    this.producer = kafka.producer({ allowAutoTopicCreation: false });
  }

  async connect(): Promise<void> {
    await this.producer.connect();
  }

  async disconnect(): Promise<void> {
    await this.producer.disconnect();
  }

  async publish(topic: string, evento: Record<string, unknown>): Promise<void> {
    await this.producer.send({
      topic,
      messages: [{ value: JSON.stringify(evento) }],
    });
  }
}
