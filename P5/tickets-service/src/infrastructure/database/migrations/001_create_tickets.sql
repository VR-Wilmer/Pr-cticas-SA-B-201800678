CREATE TABLE IF NOT EXISTS tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    titulo TEXT NOT NULL,
    descripcion TEXT NOT NULL,
    categoria VARCHAR(20) NOT NULL CHECK (categoria IN ('SOFTWARE', 'HARDWARE', 'RED', 'CUENTA')),
    estado VARCHAR(20) NOT NULL DEFAULT 'ABIERTO'
        CHECK (estado IN ('ABIERTO', 'ASIGNADO', 'EN_PROGRESO', 'RESUELTO', 'CERRADO')),
    cliente_id UUID NOT NULL,
    cliente_correo TEXT NOT NULL,
    agente_id UUID,
    agente_nombre TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tickets_cliente_id ON tickets (cliente_id);
