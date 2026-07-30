import { Request, Response, NextFunction } from "express";
import { ListarSolicitudesUseCase } from "../../../application/use-cases/ListarSolicitudesUseCase";
import { CrearSolicitudUseCase } from "../../../application/use-cases/CrearSolicitudUseCase";
import { ActualizarSolicitudUseCase } from "../../../application/use-cases/ActualizarSolicitudUseCase";
import { ActualizarEstadoSolicitudUseCase } from "../../../application/use-cases/ActualizarEstadoSolicitudUseCase";
import { EliminarSolicitudUseCase } from "../../../application/use-cases/EliminarSolicitudUseCase";
import { SolicitudOperativaPresenter } from "../mappers/SolicitudOperativaPresenter";
import {
  crearSolicitudSchema,
  actualizarSolicitudSchema,
  actualizarEstadoSchema,
  idParamSchema,
} from "../validators/solicitudOperativaSchemas";

// SRP: esta clase solo traduce HTTP <-> casos de uso; no contiene reglas de negocio.
export class SolicitudOperativaController {
  constructor(
    private readonly listarSolicitudes: ListarSolicitudesUseCase,
    private readonly crearSolicitud: CrearSolicitudUseCase,
    private readonly actualizarSolicitud: ActualizarSolicitudUseCase,
    private readonly actualizarEstadoSolicitud: ActualizarEstadoSolicitudUseCase,
    private readonly eliminarSolicitud: EliminarSolicitudUseCase
  ) {}

  async listar(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const solicitudes = await this.listarSolicitudes.execute();
      res.status(200).json(solicitudes.map(SolicitudOperativaPresenter.toHttp));
    } catch (err) {
      next(err);
    }
  }

  async crear(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const body = crearSolicitudSchema.parse(req.body);
      const solicitud = await this.crearSolicitud.execute({
        titulo: body.titulo,
        areaSolicitante: body.area_solicitante,
        prioridad: body.prioridad,
        costoEstimado: body.costo_estimado,
      });
      res.status(201).json(SolicitudOperativaPresenter.toHttp(solicitud));
    } catch (err) {
      next(err);
    }
  }

  async actualizar(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = idParamSchema.parse(req.params);
      const body = actualizarSolicitudSchema.parse(req.body);
      const solicitud = await this.actualizarSolicitud.execute(id, {
        titulo: body.titulo,
        areaSolicitante: body.area_solicitante,
        prioridad: body.prioridad,
        costoEstimado: body.costo_estimado,
        estado: body.estado,
      });
      res.status(200).json(SolicitudOperativaPresenter.toHttp(solicitud));
    } catch (err) {
      next(err);
    }
  }

  async actualizarEstado(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = idParamSchema.parse(req.params);
      const body = actualizarEstadoSchema.parse(req.body);
      const solicitud = await this.actualizarEstadoSolicitud.execute(id, { estado: body.estado });
      res.status(200).json(SolicitudOperativaPresenter.toHttp(solicitud));
    } catch (err) {
      next(err);
    }
  }

  async eliminar(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = idParamSchema.parse(req.params);
      await this.eliminarSolicitud.execute(id);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  }
}
