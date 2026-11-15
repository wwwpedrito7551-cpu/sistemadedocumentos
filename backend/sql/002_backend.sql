-- Ajustes que necesita el backend (ejecutar una vez, después de tu script actual)

-- Datos del archivo digitalizado
ALTER TABLE documentos
    ADD COLUMN IF NOT EXISTS ruta_archivo     VARCHAR(500),
    ADD COLUMN IF NOT EXISTS nombre_original  VARCHAR(255),
    ADD COLUMN IF NOT EXISTS hash_archivo     CHAR(64);

CREATE UNIQUE INDEX IF NOT EXISTS idx_documentos_hash
    ON documentos(hash_archivo) WHERE hash_archivo IS NOT NULL;

-- Cola de envío de notificaciones
ALTER TABLE notificaciones
    ADD COLUMN IF NOT EXISTS enviada BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_notificaciones_pendientes
    ON notificaciones(enviada) WHERE enviada = false;

-- Quién hizo el cambio de estado
ALTER TABLE historial_documentos
    ADD COLUMN IF NOT EXISTS id_usuario INTEGER REFERENCES usuarios(id_usuario);

-- Mismo trigger de historial, ahora registrando al usuario.
-- El backend ejecuta: SELECT set_config('app.id_usuario', '<id>', true) dentro de la transacción.
CREATE OR REPLACE FUNCTION fn_registrar_estado() RETURNS TRIGGER AS $$
DECLARE
    v_usuario INTEGER := NULLIF(current_setting('app.id_usuario', true), '')::INTEGER;
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO historial_documentos (id_documento, estado_anterior, estado_nuevo, observacion, id_usuario)
        VALUES (NEW.id_documento, NULL, NEW.estado, 'Documento registrado', v_usuario);

        INSERT INTO notificaciones (id_documento, mensaje)
        VALUES (NEW.id_documento, 'Nuevo documento ' || NEW.numero_documento || ' de ' || NEW.remitente);

    ELSIF NEW.estado IS DISTINCT FROM OLD.estado THEN
        INSERT INTO historial_documentos (id_documento, estado_anterior, estado_nuevo, observacion, id_usuario)
        VALUES (NEW.id_documento, OLD.estado, NEW.estado, 'Cambio de estado', v_usuario);

        INSERT INTO notificaciones (id_documento, mensaje)
        VALUES (NEW.id_documento, 'El documento ' || NEW.numero_documento
                || ' pasó de ' || OLD.estado || ' a ' || NEW.estado);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
