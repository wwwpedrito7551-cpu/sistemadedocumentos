-- Migración 005: Unificar estados exactamente en tres: Pendiente, Respondido y Archivado

UPDATE documentos 
SET estado = 'Pendiente' 
WHERE estado IS NULL OR estado IN ('Recibido', 'Pendiente');

UPDATE documentos 
SET estado = 'Respondido' 
WHERE estado IN ('Derivado', 'Finalizado', 'Respondido');

UPDATE documentos 
SET estado = 'Archivado' 
WHERE estado = 'Archivado';

ALTER TABLE documentos DROP CONSTRAINT IF EXISTS documentos_estado_check;
ALTER TABLE documentos ADD CONSTRAINT documentos_estado_check 
  CHECK (estado IN ('Pendiente', 'Respondido', 'Archivado'));

ALTER TABLE documentos ALTER COLUMN estado SET DEFAULT 'Pendiente';
