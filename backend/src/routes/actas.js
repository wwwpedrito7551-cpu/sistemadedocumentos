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

// Listar actas de graduación con filtros (modalidad, gestión, búsqueda)
router.get('/', asyncH(async (req, res) => {
  const { gestion, modalidad, q } = req.query;
  const where = [];
  const params = [];

  const add = (sql, val) => {
    params.push(val);
    where.push(sql.replace('?', `$${params.length}`));
  };

  if (gestion) add('gestion = ?', parseInt(gestion, 10));
  if (modalidad) add('modalidad = ?', modalidad);
  if (q) {
    params.push(`%${q}%`);
    const p = `$${params.length}`;
    where.push(`(nombre_estudiante ILIKE ${p} OR registro_estudiante ILIKE ${p} OR ci_estudiante ILIKE ${p} OR codigo_cpd ILIKE ${p} OR numero_acta ILIKE ${p})`);
  }

  const filtro = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const { rows } = await query(
    `SELECT * FROM actas_graduacion ${filtro} ORDER BY gestion DESC, id_acta DESC`,
    params,
  );

  // Estadísticas para las tarjetas superiores de Actas
  const stats = await query(`
    SELECT
      COUNT(*) AS total_graduados,
      COUNT(*) FILTER (WHERE modalidad = 'Excelencia Académica') AS excelencia,
      COUNT(*) FILTER (WHERE modalidad IN ('Buen Rendimiento', 'Buen Desempeño')) AS rendimiento,
      COUNT(*) FILTER (WHERE modalidad IN ('Tesis de Grado', 'Trabajo Dirigido', 'Proyecto de Grado', 'Examen de Grado')) AS modalidades_defensa
    FROM actas_graduacion
    ${gestion ? `WHERE gestion = ${parseInt(gestion, 10)}` : ''}
  `);

  res.json({ data: rows, stats: stats.rows[0] });
}));

// Registrar nueva acta de graduación (con archivo escaneado opcional)
router.post('/', ESCRITURA, upload.single('archivo'), asyncH(async (req, res) => {
  const {
    numero_acta,
    codigo_cpd,
    registro_estudiante,
    nombre_estudiante,
    ci_estudiante,
    nota,
    modalidad,
    area_titulacion,
    gestion,
    fecha_emision,
    distribucion_actas,
    observaciones,
  } = req.body;

  if (!codigo_cpd || !registro_estudiante || !nombre_estudiante || !ci_estudiante || !nota || !modalidad) {
    throw new HttpError(400, 'Faltan campos obligatorios: Código CPD, Registro, Nombre, CI, Nota y Modalidad');
  }

  let rutaArchivo = null;
  let nombreOriginal = null;

  if (req.file) {
    const dir = path.join(STORAGE_ROOT, 'archivos', 'actas_graduacion');
    await fs.mkdir(dir, { recursive: true });
    const ext = path.extname(req.file.originalname).toLowerCase();
    const dest = path.join(dir, `ACTA_${registro_estudiante}_${Date.now()}${ext}`);
    await fs.copyFile(req.file.path, dest);
    await fs.rm(req.file.path, { force: true });
    rutaArchivo = path.relative(STORAGE_ROOT, dest);
    nombreOriginal = req.file.originalname;
  }

  const numActaFinal = numero_acta?.trim() || `ACT-${gestion || new Date().getFullYear()}-${Date.now().toString().slice(-4)}`;

  const { rows } = await query(
    `INSERT INTO actas_graduacion
       (numero_acta, codigo_cpd, registro_estudiante, nombre_estudiante, ci_estudiante, nota,
        modalidad, area_titulacion, gestion, fecha_emision, distribucion_actas, observaciones,
        ruta_archivo, nombre_original, id_usuario)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
     RETURNING *`,
    [
      numActaFinal,
      codigo_cpd.trim(),
      registro_estudiante.trim(),
      nombre_estudiante.trim(),
      ci_estudiante.trim(),
      parseFloat(nota),
      modalidad,
      area_titulacion || 'Graduación Directa',
      parseInt(gestion, 10) || new Date().getFullYear(),
      fecha_emision || new Date().toISOString().slice(0, 10),
      distribucion_actas || '1 CPD, 3 Caja, 1 Archivo Dirección',
      observaciones || null,
      rutaArchivo,
      nombreOriginal,
      req.user.id,
    ],
  );

  res.status(201).json(rows[0]);
}));

// Descargar o previsualizar acta escaneada
router.get('/:id/archivo', asyncH(async (req, res) => {
  const { rows } = await query('SELECT ruta_archivo, nombre_original FROM actas_graduacion WHERE id_acta = $1', [req.params.id]);
  if (!rows[0]?.ruta_archivo) throw new HttpError(404, 'Esta acta no tiene archivo escaneado');
  const full = rutaSegura(rows[0].ruta_archivo);
  if (req.query.inline === '1' || req.query.inline === 'true') {
    return res.sendFile(full);
  }
  res.download(full, rows[0].nombre_original || 'acta_graduacion.pdf');
}));

// Modificar datos de un acta de graduación
router.put('/:id', ESCRITURA, asyncH(async (req, res) => {
  const {
    numero_acta,
    codigo_cpd,
    registro_estudiante,
    nombre_estudiante,
    ci_estudiante,
    nota,
    modalidad,
    area_titulacion,
    gestion,
    fecha_emision,
    distribucion_actas,
    observaciones,
  } = req.body;

  const { rows } = await query(
    `UPDATE actas_graduacion
     SET numero_acta = COALESCE($1, numero_acta),
         codigo_cpd = COALESCE($2, codigo_cpd),
         registro_estudiante = COALESCE($3, registro_estudiante),
         nombre_estudiante = COALESCE($4, nombre_estudiante),
         ci_estudiante = COALESCE($5, ci_estudiante),
         nota = COALESCE($6, nota),
         modalidad = COALESCE($7, modalidad),
         area_titulacion = COALESCE($8, area_titulacion),
         gestion = COALESCE($9, gestion),
         fecha_emision = COALESCE($10, fecha_emision),
         distribucion_actas = COALESCE($11, distribucion_actas),
         observaciones = $12
     WHERE id_acta = $13
     RETURNING *`,
    [
      numero_acta?.trim() || null,
      codigo_cpd?.trim() || null,
      registro_estudiante?.trim() || null,
      nombre_estudiante?.trim() || null,
      ci_estudiante?.trim() || null,
      nota !== undefined ? parseFloat(nota) : null,
      modalidad || null,
      area_titulacion || null,
      gestion ? parseInt(gestion, 10) : null,
      fecha_emision || null,
      distribucion_actas || null,
      observaciones || null,
      req.params.id,
    ],
  );

  if (!rows.length) throw new HttpError(404, 'Acta no encontrada');
  res.json(rows[0]);
}));

// Eliminar acta de graduación
router.delete('/:id', ESCRITURA, asyncH(async (req, res) => {
  const { rows } = await query('SELECT ruta_archivo, codigo_cpd, nombre_estudiante FROM actas_graduacion WHERE id_acta = $1', [req.params.id]);
  if (!rows.length) throw new HttpError(404, 'Acta no encontrada');

  const acta = rows[0];
  if (acta.ruta_archivo) {
    try {
      const full = rutaSegura(acta.ruta_archivo);
      await fs.rm(full, { force: true });
    } catch {
      // Ignorar si el archivo no existía físicamente
    }
  }

  await query('DELETE FROM actas_graduacion WHERE id_acta = $1', [req.params.id]);
  res.json({ ok: true, mensaje: `Acta ${acta.codigo_cpd} de ${acta.nombre_estudiante} eliminada exitosamente` });
}));

export default router;
