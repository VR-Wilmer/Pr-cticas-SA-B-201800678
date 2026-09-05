CREATE TABLE IF NOT EXISTS agentes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre TEXT NOT NULL,
    categoria VARCHAR(20) NOT NULL CHECK (categoria IN ('SOFTWARE', 'HARDWARE', 'RED', 'CUENTA')),
    carga_actual INTEGER NOT NULL DEFAULT 0,
    activo BOOLEAN NOT NULL DEFAULT TRUE
);
