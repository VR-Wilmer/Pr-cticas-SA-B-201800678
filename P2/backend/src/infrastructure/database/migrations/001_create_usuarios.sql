-- Los campos sensibles (nombre, correo, contrasena) se almacenan cifrados con AES-256-GCM
-- como un unico texto compuesto (iv:authTag:cifrado en hexadecimal), generado por
-- AesCifradoService. correo_hash es un HMAC-SHA256 determinista del correo en texto
-- plano, usado unicamente para poder buscar por correo (WHERE correo_hash = $1) sin
-- tener que desencriptar toda la tabla.
CREATE TABLE IF NOT EXISTS usuarios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre TEXT NOT NULL,
    correo TEXT NOT NULL,
    correo_hash CHAR(64) NOT NULL UNIQUE,
    contrasena TEXT NOT NULL,
    rol VARCHAR(20) NOT NULL DEFAULT 'cliente'
        CHECK (rol IN ('admin', 'cliente'))
);
