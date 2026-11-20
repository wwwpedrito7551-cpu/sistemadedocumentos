-- =========================================================================
-- 004_direccion_carrera.sql: Módulos clave de Dirección de Carrera
-- 1. Documentos Expedidos (Oficios correlativos por gestión)
-- 2. Actas de Graduación (con registro, notas, modalidad: Excelencia, Tesis...)
-- 3. Auxiliares de Cátedra (convocatorias, ratificaciones, materias)
-- 4. Plantel Docente (Files digitales: CV, programa analítico, informes)
-- =========================================================================

-- 1. Ampliación a tabla documentos para flujo expedido / recibido y gestión anual
ALTER TABLE documentos
    ADD COLUMN IF NOT EXISTS clasificacion_flujo VARCHAR(20) NOT NULL DEFAULT 'Recibido',
    ADD COLUMN IF NOT EXISTS gestion             INTEGER NOT NULL DEFAULT EXTRACT(YEAR FROM CURRENT_DATE),
    ADD COLUMN IF NOT EXISTS numero_oficio       VARCHAR(50),
    ADD COLUMN IF NOT EXISTS requiere_respuesta  BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS estado_semaforo     VARCHAR(20) NOT NULL DEFAULT 'Pendiente';

-- Restricciones y valor por omisión para estado_semaforo (verde, amarillo, rojo)
ALTER TABLE documentos DROP CONSTRAINT IF EXISTS chk_estado_semaforo;
ALTER TABLE documentos ADD CONSTRAINT chk_estado_semaforo
    CHECK (estado_semaforo IN ('Pendiente', 'En curso', 'Completado'));

-- 2. Secuencia para correlativo de Oficios Expedidos (iniciando en 112 ya que van por el 111)
CREATE SEQUENCE IF NOT EXISTS seq_oficio_expedido START 112;

CREATE OR REPLACE FUNCTION fn_generar_numero_oficio() RETURNS TRIGGER AS $$
BEGIN
    IF NEW.clasificacion_flujo = 'Expedido' AND (NEW.numero_oficio IS NULL OR NEW.numero_oficio = '') THEN
        NEW.numero_oficio := 'OF-' || NEW.gestion || '-' || lpad(nextval('seq_oficio_expedido')::text, 4, '0');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_generar_numero_oficio ON documentos;
CREATE TRIGGER trg_generar_numero_oficio
    BEFORE INSERT ON documentos
    FOR EACH ROW
    EXECUTE FUNCTION fn_generar_numero_oficio();

-- 3. Tabla: Actas de Graduación
CREATE SEQUENCE IF NOT EXISTS seq_actas_graduacion START 1;

CREATE TABLE IF NOT EXISTS actas_graduacion (
    id_acta              SERIAL PRIMARY KEY,
    numero_acta          VARCHAR(50)  NOT NULL,
    codigo_cpd           VARCHAR(80)  NOT NULL,
    registro_estudiante  VARCHAR(30)  NOT NULL,
    nombre_estudiante    VARCHAR(150) NOT NULL,
    ci_estudiante        VARCHAR(30)  NOT NULL,
    nota                 NUMERIC(5,2) NOT NULL,
    modalidad            VARCHAR(80)  NOT NULL,
    area_titulacion      VARCHAR(80)  NOT NULL DEFAULT 'Graduación Directa',
    gestion              INTEGER      NOT NULL DEFAULT EXTRACT(YEAR FROM CURRENT_DATE),
    fecha_emision        DATE         NOT NULL DEFAULT CURRENT_DATE,
    distribucion_actas   VARCHAR(150) DEFAULT '1 CPD, 3 Caja, 1 Archivo Dirección',
    observaciones        TEXT,
    ruta_archivo         VARCHAR(500),
    nombre_original      VARCHAR(255),
    id_usuario           INTEGER      REFERENCES usuarios(id_usuario),
    fecha_registro       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_actas_gestion ON actas_graduacion(gestion);
CREATE INDEX IF NOT EXISTS idx_actas_modalidad ON actas_graduacion(modalidad);
CREATE INDEX IF NOT EXISTS idx_actas_registro ON actas_graduacion(registro_estudiante);

-- 4. Tabla: Auxiliares de Cátedra
CREATE TABLE IF NOT EXISTS auxiliares_catedra (
    id_auxiliar               SERIAL PRIMARY KEY,
    gestion                   INTEGER      NOT NULL DEFAULT EXTRACT(YEAR FROM CURRENT_DATE),
    semestre                  VARCHAR(30)  NOT NULL DEFAULT '2do Semestre',
    materia                   VARCHAR(150) NOT NULL,
    registro_estudiante       VARCHAR(30)  NOT NULL,
    nombre_estudiante         VARCHAR(150) NOT NULL,
    ci_estudiante             VARCHAR(30)  NOT NULL,
    nota_examen               NUMERIC(5,2),
    tipo_designacion          VARCHAR(50)  NOT NULL DEFAULT 'Convocatoria',
    numero_oficio_propuesta   VARCHAR(50),
    resolucion_consejo        VARCHAR(50),
    estado                    VARCHAR(30)  NOT NULL DEFAULT 'Activo'
                              CHECK (estado IN ('Activo', 'Finalizado', 'Ratificado', 'En proceso')),
    observaciones             TEXT,
    ruta_archivo              VARCHAR(500),
    nombre_original           VARCHAR(255),
    id_usuario                INTEGER      REFERENCES usuarios(id_usuario),
    fecha_registro            TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_auxiliares_gestion ON auxiliares_catedra(gestion, semestre);

-- 5. Tabla: Plantel Docente (Files y control de informes)
CREATE TABLE IF NOT EXISTS plantel_docente (
    id_docente                SERIAL PRIMARY KEY,
    nombre_completo           VARCHAR(150) NOT NULL,
    ci                        VARCHAR(30),
    correo                    VARCHAR(100),
    telefono                  VARCHAR(50),
    materias_asignadas        TEXT         NOT NULL,
    gestion                   INTEGER      NOT NULL DEFAULT EXTRACT(YEAR FROM CURRENT_DATE),
    semestre                  VARCHAR(30)  NOT NULL DEFAULT '2do Semestre',
    informe_presentado        BOOLEAN      NOT NULL DEFAULT false,
    cv_ruta                   VARCHAR(500),
    cv_nombre                 VARCHAR(255),
    programa_analitico_ruta   VARCHAR(500),
    programa_analitico_nombre VARCHAR(255),
    informe_final_ruta        VARCHAR(500),
    informe_final_nombre      VARCHAR(255),
    lista_asistencia_ruta     VARCHAR(500),
    lista_asistencia_nombre   VARCHAR(255),
    observaciones             TEXT,
    id_usuario                INTEGER      REFERENCES usuarios(id_usuario),
    fecha_actualizacion       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_docentes_gestion ON plantel_docente(gestion, semestre);

-- 6. Insertar datos de ejemplo reales acordes al audio de la Dirección
INSERT INTO actas_graduacion (
    numero_acta, codigo_cpd, registro_estudiante, nombre_estudiante, ci_estudiante, nota, modalidad, area_titulacion, gestion
) VALUES
    ('ACT-2026-001', 'CPD-EXC-9941', '219084721', 'Daniela Rojas Mendoza', '8943212 SC', 96.50, 'Excelencia Académica', 'Graduación Directa', 2026),
    ('ACT-2026-002', 'CPD-TES-8812', '218032114', 'Carlos Eduardo Flores', '7841203 SC', 91.00, 'Tesis de Grado', 'GRL001 - Modalidad con Defensa', 2026),
    ('ACT-2026-003', 'CPD-REN-7731', '219154889', 'Mariana Paz Salazar', '9321445 SC', 88.00, 'Buen Rendimiento', 'Graduación Directa', 2026)
ON CONFLICT DO NOTHING;

INSERT INTO auxiliares_catedra (
    gestion, semestre, materia, registro_estudiante, nombre_estudiante, ci_estudiante, nota_examen, tipo_designacion, numero_oficio_propuesta, resolucion_consejo, estado
) VALUES
    (2026, '2do Semestre', 'Cálculo I', '220194832', 'Victor Daniel Guayao Medina', '9845211 SC', 92.00, 'Convocatoria', 'OF-2026-0098', 'RES-CC-014/2026', 'Activo'),
    (2026, '2do Semestre', 'Estructuras Discretas', '221087441', 'Alejandro Torrico Vaca', '8741299 SC', 89.50, 'Ratificación', 'OF-2026-0105', 'RES-CC-021/2026', 'Activo'),
    (2026, '2do Semestre', 'Programación I', '220045129', 'Laura Fernandez Ortiz', '9032114 SC', 86.00, 'Convocatoria', 'OF-2026-0098', 'RES-CC-014/2026', 'Activo')
ON CONFLICT DO NOTHING;

INSERT INTO plantel_docente (
    nombre_completo, ci, materias_asignadas, gestion, semestre, informe_presentado, observaciones
) VALUES
    ('Ing. Mario Renato Chocala', '3489112 SC', 'Sistemas Operativos, Redes de Computadoras', 2026, '2do Semestre', true, 'Informe final de cátedra presentado y escaneado. CV actualizado.'),
    ('Ing. Wilson Balcazar', '4581290 SC', 'Base de Datos I, Programación Web', 2026, '2do Semestre', false, 'Pendiente entrega de informe final de cátedra gestión 2026.'),
    ('Lic. Carmen Rosa Aguilera', '5128941 SC', 'Cálculo I, Álgebra Lineal', 2026, '2do Semestre', true, 'Documentación completa en digital.')
ON CONFLICT DO NOTHING;
