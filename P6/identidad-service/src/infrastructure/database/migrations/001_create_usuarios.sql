-- A diferencia de P2 (que cifraba nombre/correo/contrasena con AES reversible),
-- aqui solo la contrasena se guarda protegida, y como hash de un solo sentido
-- (bcrypt) en vez de cifrado reversible: es la practica recomendada para
-- contrasenas y P4 no exige que sean recuperables en texto plano.
CREATE TABLE IF NOT EXISTS usuarios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre TEXT NOT NULL,
    correo TEXT NOT NULL UNIQUE,
    contrasena_hash TEXT NOT NULL,
    rol VARCHAR(20) NOT NULL DEFAULT 'CLIENTE'
        CHECK (rol IN ('ADMIN', 'AGENTE', 'CLIENTE'))
);
