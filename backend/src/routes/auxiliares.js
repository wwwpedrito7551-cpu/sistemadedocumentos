import fs from 'node:fs/promises';
import path from 'node:path';
import { Router } from 'express';
import { query } from '../db.js';
import { asyncH, HttpError } from '../utils.js';
import { requireRol } from '../middleware/auth.js';
import { upload, STORAGE_ROOT } from '../middleware/upload.js';

const router = Router();
const ESCRITURA = requireRol('Administrador', 'Secretaria');

function rutaSegura(relativa) {
  const abs = path.resolve(STORAGE_ROOT, relativa);
  if (!abs.startsWith(STORAGE_ROOT + path.sep)) throw new HttpError(400, 'Ruta inválida');
  return abs;
}

// Listar auxiliares de cátedra por gestión, semestre o búsqueda
router.get('/', asyncH(async (req, res) => {
  const { gestion, semestre, estado, q } = req.query;
  const where = [];
  const params = [];

  const add = (sql, val) => {
    params.push(val);
    where.push(sql.replace('?', `$${params.length}`));
  };

  if (gestion) add('gestion = ?', parseInt(gestion, 10));
  if (semestre) add('semestre = ?', semestre);
  if (estado) add('estado = ?', estado);
  if (q) {
    params.push(`%${q}%`);
    const p = `$${params.length}`;
    where.push(`(nombre_estudiante ILIKE ${p} OR registro_estudiante ILIKE ${p} OR materia ILIKE ${p} OR numero_oficio_propuesta ILIKE ${p} OR resolucion_consejo ILIKE ${p})`);
  }

  const filtro = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const { rows } = await query(
    `SELECT * FROM auxiliares_catedra ${filtro} ORDER BY gestion DESC, id_auxiliar DESC`,
    params,
  );

  const stats = await query(`
    SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE estado = 'Activo') AS activos,
      COUNT(*) FILTER (WHERE tipo_designacion = 'Convocatoria') AS por_concurso,
      COUNT(*) FILTER (WHERE tipo_designacion = 'Ratificación') AS ratificados
    FROM auxiliares_catedra
    ${gestion ? `WHERE gestion = ${parseInt(gestion, 10)}` : ''}
  `);

  res.json({ data: rows, stats: stats.rows[0] });
}));

// Registrar auxiliar
router.post('/', ESCRITURA, upload.single('archivo'), asyncH(async (req, res) => {
  const {
    gestion,
    semestre,
    materia,
    registro_estudiante,
    nombre_estudiante,
    ci_estudiante,
    nota_examen,
    tipo_designacion,
    numero_oficio_propuesta,
    resolucion_consejo,
    estado,
    observaciones,
  } = req.body;

  if (!materia || !registro_estudiante || !nombre_estudiante || !ci_estudiante) {
    throw new HttpError(400, 'Materia, Registro Universitario, Nombre Completo y CI son requeridos');
  }

  let rutaArchivo = null;
  let nombreOriginal = null;

  if (req.file) {
    const dir = path.join(STORAGE_ROOT, 'archivos', 'auxiliares');
    await fs.mkdir(dir, { recursive: true });
    const ext = path.extname(req.file.originalname).toLowerCase();
    const dest = path.join(dir, `AUX_${registro_estudiante}_${Date.now()}${ext}`);
    await fs.copyFile(req.file.path, dest);
    await fs.rm(req.file.path, { force: true });
    rutaArchivo = path.relative(STORAGE_ROOT, dest);
    nombreOriginal = req.file.originalname;
  }

  const { rows } = await query(
    `INSERT INTO auxiliares_catedra
       (gestion, semestre, materia, registro_estudiante, nombre_estudiante, ci_estudiante,
        nota_examen, tipo_designacion, numero_oficio_propuesta, resolucion_consejo,
        estado, observaciones, ruta_archivo, nombre_original, id_usuario)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
     RETURNING *`,
    [
      parseInt(gestion, 10) || new Date().getFullYear(),
      semestre || '2do Semestre',
      materia.trim(),
      registro_estudiante.trim(),
      nombre_estudiante.trim(),
      ci_estudiante.trim(),
      nota_examen ? parseFloat(nota_examen) : null,
      tipo_designacion || 'Convocatoria',
      numero_oficio_propuesta || null,
      resolucion_consejo || null,
      estado || 'Activo',
      observaciones || null,
      rutaArchivo,
      nombreOriginal,
      req.user.id,
    ],
  );

  res.status(201).json(rows[0]);
}));

// Descargar respaldo de auxiliatura
router.get('/:id/archivo', asyncH(async (req, res) => {
  const { rows } = await query('SELECT ruta_archivo, nombre_original FROM auxiliares_catedra WHERE id_auxiliar = $1', [req.params.id]);
  if (!rows[0]?.ruta_archivo) throw new HttpError(404, 'Este registro no tiene archivo adjunto');
  const full = rutaSegura(rows[0].ruta_archivo);
  if (req.query.inline === '1' || req.query.inline === 'true') {
    return res.sendFile(full);
  }
  res.download(full, rows[0].nombre_original || 'documento_auxiliar.pdf');
}));

// Actualizar estado (ej. Ratificar o Finalizar)
router.patch('/:id/estado', ESCRITURA, asyncH(async (req, res) => {
  const { estado, observaciones } = req.body;
  const { rows } = await query(
    'UPDATE auxiliares_catedra SET estado = $1, observaciones = COALESCE($2, observaciones) WHERE id_auxiliar = $3 RETURNING *',
    [estado, observaciones || null, req.params.id],
  );
  if (!rows.length) throw new HttpError(404, 'Auxiliar no encontrado');
  res.json(rows[0]);
}));

// Modificar datos de auxiliar
router.put('/:id', ESCRITURA, asyncH(async (req, res) => {
  const {
    gestion,
    semestre,
    materia,
    registro_estudiante,
    nombre_estudiante,
    ci_estudiante,
    nota_examen,
    tipo_designacion,
    numero_oficio_propuesta,
    resolucion_consejo,
    estado,
    observaciones,
  } = req.body;

  const { rows } = await query(
    `UPDATE auxiliares_catedra
     SET gestion = COALESCE($1, gestion),
         semestre = COALESCE($2, semestre),
         materia = COALESCE($3, materia),
         registro_estudiante = COALESCE($4, registro_estudiante),
         nombre_estudiante = COALESCE($5, nombre_estudiante),
         ci_estudiante = COALESCE($6, ci_estudiante),
         nota_examen = $7,
         tipo_designacion = COALESCE($8, tipo_designacion),
         numero_oficio_propuesta = $9,
         resolucion_consejo = $10,
         estado = COALESCE($11, estado),
         observaciones = $12
     WHERE id_auxiliar = $13
     RETURNING *`,
    [
      gestion ? parseInt(gestion, 10) : null,
      semestre || null,
      materia?.trim() || null,
      registro_estudiante?.trim() || null,
      nombre_estudiante?.trim() || null,
      ci_estudiante?.trim() || null,
      nota_examen !== undefined && nota_examen !== '' ? parseFloat(nota_examen) : null,
      tipo_designacion || null,
      numero_oficio_propuesta || null,
      resolucion_consejo || null,
      estado || null,
      observaciones || null,
      req.params.id,
    ],
  );

  if (!rows.length) throw new HttpError(404, 'Auxiliar no encontrado');
  res.json(rows[0]);
}));

// Eliminar auxiliar
router.delete('/:id', ESCRITURA, asyncH(async (req, res) => {
  const { rows } = await query('SELECT ruta_archivo, nombre_estudiante, materia FROM auxiliares_catedra WHERE id_auxiliar = $1', [req.params.id]);
  if (!rows.length) throw new HttpError(404, 'Auxiliar no encontrado');

  const aux = rows[0];
  if (aux.ruta_archivo) {
    try {
      const full = rutaSegura(aux.ruta_archivo);
      await fs.rm(full, { force: true });
    } catch {
      // Ignorar si el archivo no existía físicamente
    }
  }

  await query('DELETE FROM auxiliares_catedra WHERE id_auxiliar = $1', [req.params.id]);
  res.json({ ok: true, mensaje: `Auxiliar ${aux.nombre_estudiante} (${aux.materia}) eliminado exitosamente` });
}));

export default router;
