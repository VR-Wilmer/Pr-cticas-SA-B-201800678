// Puerto (DIP): publicar un evento de dominio en un topico del broker de
// mensajeria y retornar de inmediato -- quien lo consuma lo procesa de forma
// independiente (Practica 5, requisito D). Reemplaza a la llamada sincrona
// que en P4 iba directo a notificaciones-service via HTTP/GraphQL.
export interface IEventPublisher {
  publish(topic: string, evento: Record<string, unknown>): Promise<void>;
}
