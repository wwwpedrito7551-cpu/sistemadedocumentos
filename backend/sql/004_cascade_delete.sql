-- Migración 004: Cascadas y eliminación segura en todas las tablas

-- 1. historial_documentos se borra automáticamente si el documento es eliminado
ALTER TABLE historial_documentos
  DROP CONSTRAINT IF EXISTS historial_documentos_id_documento_fkey,
  ADD CONSTRAINT historial_documentos_id_documento_fkey
    FOREIGN KEY (id_documento) REFERENCES documentos(id_documento) ON DELETE CASCADE;

-- 2. notificaciones se borran automáticamente si el documento es eliminado
ALTER TABLE notificaciones
  DROP CONSTRAINT IF EXISTS notificaciones_id_documento_fkey,
  ADD CONSTRAINT notificaciones_id_documento_fkey
    FOREIGN KEY (id_documento) REFERENCES documentos(id_documento) ON DELETE CASCADE;

-- 3. Si un usuario es eliminado, sus registros conservan trazabilidad (id_usuario = NULL)
ALTER TABLE documentos ALTER COLUMN id_usuario DROP NOT NULL;

ALTER TABLE documentos
  DROP CONSTRAINT IF EXISTS documentos_id_usuario_fkey,
  ADD CONSTRAINT documentos_id_usuario_fkey
    FOREIGN KEY (id_usuario) REFERENCES usuarios(id_usuario) ON DELETE SET NULL;

ALTER TABLE historial_documentos
  DROP CONSTRAINT IF EXISTS historial_documentos_id_usuario_fkey,
  ADD CONSTRAINT historial_documentos_id_usuario_fkey
    FOREIGN KEY (id_usuario) REFERENCES usuarios(id_usuario) ON DELETE SET NULL;

ALTER TABLE actas_graduacion
  DROP CONSTRAINT IF EXISTS actas_graduacion_id_usuario_fkey,
  ADD CONSTRAINT actas_graduacion_id_usuario_fkey
    FOREIGN KEY (id_usuario) REFERENCES usuarios(id_usuario) ON DELETE SET NULL;

ALTER TABLE auxiliares_catedra
  DROP CONSTRAINT IF EXISTS auxiliares_catedra_id_usuario_fkey,
  ADD CONSTRAINT auxiliares_catedra_id_usuario_fkey
    FOREIGN KEY (id_usuario) REFERENCES usuarios(id_usuario) ON DELETE SET NULL;

ALTER TABLE plantel_docente
  DROP CONSTRAINT IF EXISTS plantel_docente_id_usuario_fkey,
  ADD CONSTRAINT plantel_docente_id_usuario_fkey
    FOREIGN KEY (id_usuario) REFERENCES usuarios(id_usuario) ON DELETE SET NULL;

-- 4. Si una categoría es eliminada, los documentos pasan a id_categoria = NULL (sin categoría)
ALTER TABLE documentos ALTER COLUMN id_categoria DROP NOT NULL;

ALTER TABLE documentos
  DROP CONSTRAINT IF EXISTS documentos_id_categoria_fkey,
  ADD CONSTRAINT documentos_id_categoria_fkey
    FOREIGN KEY (id_categoria) REFERENCES categorias(id_categoria) ON DELETE SET NULL;
