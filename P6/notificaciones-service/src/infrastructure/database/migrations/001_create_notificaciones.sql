CREATE TABLE IF NOT EXISTS notificaciones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID NOT NULL,
    destinatario TEXT NOT NULL,
    tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('TICKET_CREADO', 'TICKET_ASIGNADO', 'TICKET_RESUELTO')),
    estado_envio VARCHAR(10) NOT NULL CHECK (estado_envio IN ('ENVIADA', 'FALLIDA')),
    fecha_envio TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notificaciones_ticket_id ON notificaciones (ticket_id);
