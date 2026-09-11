import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { RegistrarNotificacionUseCase } from "../application/use-cases/RegistrarNotificacionUseCase";
import { INotificacionRepository } from "../domain/repositories/INotificacionRepository";
import { IEmailSender } from "../domain/services/IEmailSender";
import { Notificacion, TipoNotificacion, EstadoEnvio } from "../domain/entities/Notificacion";
import { SecretoInternoInvalidoError } from "../domain/errors/SecretoInternoInvalidoError";

class FakeNotificacionRepository implements INotificacionRepository {
  notificaciones: Notificacion[] = [];

  async create(notificacion: Notificacion): Promise<Notificacion> {
    this.notificaciones.push(notificacion);
    return notificacion;
  }

  async findByTicketId(ticketId: string): Promise<Notificacion[]> {
    return this.notificaciones.filter((n) => n.ticketId === ticketId);
  }
}

class FakeEmailSender implements IEmailSender {
  constructor(private readonly exito: boolean) {}

  async enviar(): Promise<boolean> {
    return this.exito;
  }
}

const SECRETO = "secreto-interno";

describe("RegistrarNotificacionUseCase", () => {
  it("registra la notificacion como ENVIADA cuando el envio tiene exito", async () => {
    const repo = new FakeNotificacionRepository();
    const useCase = new RegistrarNotificacionUseCase(repo, new FakeEmailSender(true), SECRETO);

    const notificacion = await useCase.execute(SECRETO, "ticket-1", "cliente@demo.com", TipoNotificacion.TICKET_CREADO);

    assert.equal(notificacion.estadoEnvio, EstadoEnvio.ENVIADA);
    assert.equal(repo.notificaciones.length, 1);
  });

  it("registra la notificacion como FALLIDA cuando el envio falla", async () => {
    const repo = new FakeNotificacionRepository();
    const useCase = new RegistrarNotificacionUseCase(repo, new FakeEmailSender(false), SECRETO);

    const notificacion = await useCase.execute(SECRETO, "ticket-1", "cliente@demo.com", TipoNotificacion.TICKET_ASIGNADO);

    assert.equal(notificacion.estadoEnvio, EstadoEnvio.FALLIDA);
  });

  it("rechaza la llamada si el secreto interno no coincide", async () => {
    const repo = new FakeNotificacionRepository();
    const useCase = new RegistrarNotificacionUseCase(repo, new FakeEmailSender(true), SECRETO);

    await assert.rejects(
      () => useCase.execute("otro-secreto", "ticket-1", "cliente@demo.com", TipoNotificacion.TICKET_CREADO),
      SecretoInternoInvalidoError
    );
    assert.equal(repo.notificaciones.length, 0);
  });
});
