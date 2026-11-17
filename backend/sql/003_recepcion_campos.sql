-- =========================================================================
-- 003_recepcion_campos.sql: Campos adicionales para Recepción de Documentos
-- =========================================================================

-- 1. Secuencia para el Número de recepción automático (REC-0001)
CREATE SEQUENCE IF NOT EXISTS seq_numero_recepcion START 1;

-- 2. Agregar las columnas de recepción a la tabla documentos
ALTER TABLE documentos
    ADD COLUMN IF NOT EXISTS numero_recepcion      VARCHAR(30),
    ADD COLUMN IF NOT EXISTS hora_recepcion        TIME DEFAULT CURRENT_TIME,
    ADD COLUMN IF NOT EXISTS destinatario          VARCHAR(200),
    ADD COLUMN IF NOT EXISTS responsable_recepcion VARCHAR(150),
    ADD COLUMN IF NOT EXISTS medio_recepcion       VARCHAR(30) DEFAULT 'Presencial',
    ADD COLUMN IF NOT EXISTS cantidad_anexos       INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS observaciones         TEXT;

-- 3. Ampliar la restricción CHECK de estado para soportar Recibido, Pendiente, Derivado, Finalizado
--    además de los estados originales (Pendiente, Respondido, Archivado)
ALTER TABLE documentos DROP CONSTRAINT IF EXISTS documentos_estado_check;
ALTER TABLE documentos ADD CONSTRAINT documentos_estado_check
    CHECK (estado IN ('Recibido', 'Pendiente', 'Derivado', 'Finalizado', 'Respondido', 'Archivado'));

-- 4. Poblar numero_recepcion en documentos existentes que no lo tengan
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN SELECT id_documento FROM documentos WHERE numero_recepcion IS NULL ORDER BY id_documento LOOP
        UPDATE documentos
        SET numero_recepcion = 'REC-' || lpad(nextval('seq_numero_recepcion')::text, 4, '0')
        WHERE id_documento = r.id_documento;
    END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_documentos_numero_recepcion
    ON documentos(numero_recepcion) WHERE numero_recepcion IS NOT NULL;

-- 5. Actualizar el trigger BEFORE INSERT para generar también numero_recepcion (REC-0001)
--    y asegurar fecha_recepcion + hora_recepcion automáticas
CREATE OR REPLACE FUNCTION fn_generar_numero() RETURNS TRIGGER AS $$
BEGIN
    IF NEW.numero_documento IS NULL OR NEW.numero_documento = '' THEN
        NEW.numero_documento := 'DOC-' || to_char(CURRENT_DATE, 'YYYY') || '-'
                                || lpad(nextval('seq_numero_documento')::text, 4, '0');
    END IF;

    IF NEW.numero_recepcion IS NULL OR NEW.numero_recepcion = '' THEN
        NEW.numero_recepcion := 'REC-' || lpad(nextval('seq_numero_recepcion')::text, 4, '0');
    END IF;

    IF NEW.fecha_recepcion IS NULL THEN
        NEW.fecha_recepcion := CURRENT_TIMESTAMP;
    END IF;

    IF NEW.hora_recepcion IS NULL THEN
        NEW.hora_recepcion := CURRENT_TIME;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
