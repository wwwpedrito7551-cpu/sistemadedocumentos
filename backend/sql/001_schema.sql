-- =========================================================================
-- 001_schema.sql: Esquema base para el Sistema Automatizado de Archivos
-- Base de datos: gestor_de_documentos
-- =========================================================================

-- 1. Tabla de usuarios
CREATE TABLE IF NOT EXISTS usuarios (
    id_usuario     SERIAL PRIMARY KEY,
    nombre         VARCHAR(150) NOT NULL,
    usuario        VARCHAR(80)  NOT NULL UNIQUE,
    contrasena     VARCHAR(255) NOT NULL,
    rol            VARCHAR(30)  NOT NULL CHECK (rol IN ('Administrador', 'Secretaria', 'Consulta')),
    fecha_creacion TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 2. Tabla de categorías
CREATE TABLE IF NOT EXISTS categorias (
    id_categoria SERIAL PRIMARY KEY,
    nombre       VARCHAR(100) NOT NULL UNIQUE,
    descripcion  TEXT,
    carpeta      VARCHAR(255) NOT NULL
);

-- 3. Secuencia y tabla de documentos
CREATE SEQUENCE IF NOT EXISTS seq_numero_documento START 1;

CREATE TABLE IF NOT EXISTS documentos (
    id_documento      SERIAL PRIMARY KEY,
    numero_documento  VARCHAR(50)  UNIQUE,
    tipo_documento    VARCHAR(100) NOT NULL,
    remitente         VARCHAR(200) NOT NULL,
    asunto            TEXT         NOT NULL,
    id_categoria      INTEGER      NOT NULL REFERENCES categorias(id_categoria),
    id_usuario        INTEGER      NOT NULL REFERENCES usuarios(id_usuario),
    estado            VARCHAR(30)  NOT NULL DEFAULT 'Pendiente'
                      CHECK (estado IN ('Pendiente', 'Respondido', 'Archivado')),
    fecha_recepcion   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_vencimiento DATE
);

-- 4. Tabla de historial de documentos
CREATE TABLE IF NOT EXISTS historial_documentos (
    id_historial    SERIAL PRIMARY KEY,
    id_documento    INTEGER     NOT NULL REFERENCES documentos(id_documento) ON DELETE CASCADE,
    estado_anterior VARCHAR(30),
    estado_nuevo    VARCHAR(30) NOT NULL,
    observacion     TEXT,
    fecha_cambio    TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 5. Tabla de notificaciones
CREATE TABLE IF NOT EXISTS notificaciones (
    id_notificacion    SERIAL PRIMARY KEY,
    id_documento       INTEGER   REFERENCES documentos(id_documento) ON DELETE CASCADE,
    mensaje            TEXT      NOT NULL,
    leida              BOOLEAN   NOT NULL DEFAULT false,
    fecha_notificacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 6. Trigger para generar numero_documento automáticamente (ej. DOC-2026-0001)
CREATE OR REPLACE FUNCTION fn_generar_numero() RETURNS TRIGGER AS $$
BEGIN
    IF NEW.numero_documento IS NULL OR NEW.numero_documento = '' THEN
        NEW.numero_documento := 'DOC-' || to_char(CURRENT_DATE, 'YYYY') || '-'
                                || lpad(nextval('seq_numero_documento')::text, 4, '0');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_generar_numero ON documentos;
CREATE TRIGGER trg_generar_numero
    BEFORE INSERT ON documentos
    FOR EACH ROW
    EXECUTE FUNCTION fn_generar_numero();

-- 7. Trigger base de registro de estado (ampliado en 002_backend.sql)
CREATE OR REPLACE FUNCTION fn_registrar_estado() RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO historial_documentos (id_documento, estado_anterior, estado_nuevo, observacion)
        VALUES (NEW.id_documento, NULL, NEW.estado, 'Documento registrado');

        INSERT INTO notificaciones (id_documento, mensaje)
        VALUES (NEW.id_documento, 'Nuevo documento ' || NEW.numero_documento || ' de ' || NEW.remitente);
    ELSIF NEW.estado IS DISTINCT FROM OLD.estado THEN
        INSERT INTO historial_documentos (id_documento, estado_anterior, estado_nuevo, observacion)
        VALUES (NEW.id_documento, OLD.estado, NEW.estado, 'Cambio de estado');

        INSERT INTO notificaciones (id_documento, mensaje)
        VALUES (NEW.id_documento, 'El documento ' || NEW.numero_documento
                || ' pasó de ' || OLD.estado || ' a ' || NEW.estado);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_registrar_estado ON documentos;
CREATE TRIGGER trg_registrar_estado
    AFTER INSERT OR UPDATE ON documentos
    FOR EACH ROW
    EXECUTE FUNCTION fn_registrar_estado();

-- 8. Función de alerta diaria de vencimientos llamada por el cron job
CREATE OR REPLACE FUNCTION fn_alertar_vencimientos() RETURNS VOID AS $$
BEGIN
    -- Documentos vencidos
    INSERT INTO notificaciones (id_documento, mensaje)
    SELECT d.id_documento,
           'ALERTA: El documento ' || d.numero_documento || ' (' || d.asunto || ') está VENCIDO desde ' || d.fecha_vencimiento
    FROM documentos d
    WHERE d.estado = 'Pendiente'
      AND d.fecha_vencimiento < CURRENT_DATE
      AND NOT EXISTS (
          SELECT 1 FROM notificaciones n
          WHERE n.id_documento = d.id_documento
            AND n.fecha_notificacion::date = CURRENT_DATE
            AND n.mensaje LIKE 'ALERTA: El documento % está VENCIDO%'
      );

    -- Documentos próximos a vencer (en los próximos 3 días)
    INSERT INTO notificaciones (id_documento, mensaje)
    SELECT d.id_documento,
           'AVISO: El documento ' || d.numero_documento || ' (' || d.asunto || ') vence el ' || d.fecha_vencimiento
    FROM documentos d
    WHERE d.estado = 'Pendiente'
      AND d.fecha_vencimiento BETWEEN CURRENT_DATE AND CURRENT_DATE + 3
      AND NOT EXISTS (
          SELECT 1 FROM notificaciones n
          WHERE n.id_documento = d.id_documento
            AND n.fecha_notificacion::date = CURRENT_DATE
            AND n.mensaje LIKE 'AVISO: El documento % vence el%'
      );
END;
$$ LANGUAGE plpgsql;

-- 9. Categorías iniciales por defecto
INSERT INTO categorias (nombre, descripcion, carpeta) VALUES
    ('Correspondencia', 'Cartas, oficios y notas recibidas o emitidas', 'archivos/correspondencia/'),
    ('Informes', 'Informes técnicos, administrativos y financieros', 'archivos/informes/'),
    ('Resoluciones', 'Resoluciones y normativas institucionales', 'archivos/resoluciones/'),
    ('Contratos', 'Contratos, convenios y documentos legales', 'archivos/contratos/')
ON CONFLICT (nombre) DO NOTHING;
