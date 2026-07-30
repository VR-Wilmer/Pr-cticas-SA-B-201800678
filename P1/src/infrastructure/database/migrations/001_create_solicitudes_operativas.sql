CREATE TABLE IF NOT EXISTS solicitudes_operativas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    titulo VARCHAR(200) NOT NULL,
    area_solicitante VARCHAR(150) NOT NULL,
    prioridad SMALLINT NOT NULL CHECK (prioridad BETWEEN 1 AND 5),
    costo_estimado NUMERIC(12, 2) NOT NULL,
    estado VARCHAR(20) NOT NULL DEFAULT 'registrada'
        CHECK (estado IN ('registrada', 'en_proceso', 'finalizada'))
);
