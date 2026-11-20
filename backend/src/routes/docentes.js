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

// Listar docentes con filtro de gestión y estado de informes
router.get('/', asyncH(async (req, res) => {
  const { gestion, semestre, q, informe } = req.query;
  const where = [];
  const params = [];

  const add = (sql, val) => {
    params.push(val);
    where.push(sql.replace('?', `$${params.length}`));
  };

  if (gestion) add('gestion = ?', parseInt(gestion, 10));
  if (semestre) add('semestre = ?', semestre);
  if (informe === 'true' || informe === 'false') add('informe_presentado = ?', informe === 'true');
  if (q) {
    params.push(`%${q}%`);
    const p = `$${params.length}`;
    where.push(`(nombre_completo ILIKE ${p} OR materias_asignadas ILIKE ${p} OR ci ILIKE ${p})`);
  }

  const filtro = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const { rows } = await query(
    `SELECT * FROM plantel_docente ${filtro} ORDER BY nombre_completo ASC`,
    params,
  );

  const stats = await query(`
    SELECT
      COUNT(*) AS total_docentes,
      COUNT(*) FILTER (WHERE informe_presentado = true) AS con_informe,
      COUNT(*) FILTER (WHERE informe_presentado = false) AS sin_informe
    FROM plantel_docente
    ${gestion ? `WHERE gestion = ${parseInt(gestion, 10)}` : ''}
  `);

  res.json({ data: rows, stats: stats.rows[0] });
}));

// Registrar nuevo docente en el plantel
router.post('/', ESCRITURA, asyncH(async (req, res) => {
  const {
    nombre_completo,
    ci,
    correo,
    telefono,
    materias_asignadas,
    gestion,
    semestre,
    informe_presentado,
    observaciones,
  } = req.body;

  if (!nombre_completo || !materias_asignadas) {
    throw new HttpError(400, 'Nombre completo y materias asignadas son obligatorios');
  }

  const { rows } = await query(
    `INSERT INTO plantel_docente
       (nombre_completo, ci, correo, telefono, materias_asignadas, gestion, semestre,
        informe_presentado, observaciones, id_usuario)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     RETURNING *`,
    [
      nombre_completo.trim(),
      ci?.trim() || null,
      correo?.trim() || null,
      telefono?.trim() || null,
      materias_asignadas.trim(),
      parseInt(gestion, 10) || new Date().getFullYear(),
      semestre || '2do Semestre',
      Boolean(informe_presentado),
      observaciones || null,
      req.user.id,
    ],
  );

  res.status(201).json(rows[0]);
}));

// Subir archivo específico a un docente (cv, programa, informe, asistencia)
router.post('/:id/subir/:tipo', ESCRITURA, upload.single('archivo'), asyncH(async (req, res) => {
  const { id, tipo } = req.params;
  const validos = ['cv', 'programa', 'informe', 'asistencia'];
  if (!validos.includes(tipo)) throw new HttpError(400, 'Tipo de archivo inválido');
  if (!req.file) throw new HttpError(400, 'Adjunta el archivo correspondiente');

  const dir = path.join(STORAGE_ROOT, 'archivos', 'docentes', tipo);
  await fs.mkdir(dir, { recursive: true });
  const ext = path.extname(req.file.originalname).toLowerCase();
  const dest = path.join(dir, `DOCENTE_${id}_${tipo}_${Date.now()}${ext}`);
  await fs.copyFile(req.file.path, dest);
  await fs.rm(req.file.path, { force: true });

  const rutaRelativa = path.relative(STORAGE_ROOT, dest);
  const nombreOriginal = req.file.originalname;

  let colRuta = 'cv_ruta';
  let colNombre = 'cv_nombre';
  if (tipo === 'programa') { colRuta = 'programa_analitico_ruta'; colNombre = 'programa_analitico_nombre'; }
  if (tipo === 'informe') { colRuta = 'informe_final_ruta'; colNombre = 'informe_final_nombre'; }
  if (tipo === 'asistencia') { colRuta = 'lista_asistencia_ruta'; colNombre = 'lista_asistencia_nombre'; }

  const sql = `UPDATE plantel_docente
               SET ${colRuta} = $1, ${colNombre} = $2,
                   fecha_actualizacion = CURRENT_TIMESTAMP
                   ${tipo === 'informe' ? ', informe_presentado = true' : ''}
               WHERE id_docente = $3 RETURNING *`;

  const { rows } = await query(sql, [rutaRelativa, nombreOriginal, id]);
  if (!rows.length) throw new HttpError(404, 'Docente no encontrado');
  res.json(rows[0]);
}));

// Marcar o desmarcar entrega de informe final
router.patch('/:id/informe', ESCRITURA, asyncH(async (req, res) => {
  const { presentado } = req.body;
  const { rows } = await query(
    'UPDATE plantel_docente SET informe_presentado = $1, fecha_actualizacion = CURRENT_TIMESTAMP WHERE id_docente = $2 RETURNING *',
    [Boolean(presentado), req.params.id],
  );
  if (!rows.length) throw new HttpError(404, 'Docente no encontrado');
  res.json(rows[0]);
}));

// Descargar o ver archivo del docente
router.get('/:id/archivo/:tipo', asyncH(async (req, res) => {
  const { id, tipo } = req.params;
  const { rows } = await query('SELECT * FROM plantel_docente WHERE id_docente = $1', [id]);
  if (!rows.length) throw new HttpError(404, 'Docente no encontrado');
  const d = rows[0];

  let ruta = d.cv_ruta;
  let nombre = d.cv_nombre || 'cv_docente.pdf';
  if (tipo === 'programa') { ruta = d.programa_analitico_ruta; nombre = d.programa_analitico_nombre || 'programa_analitico.pdf'; }
  if (tipo === 'informe') { ruta = d.informe_final_ruta; nombre = d.informe_final_nombre || 'informe_final.pdf'; }
  if (tipo === 'asistencia') { ruta = d.lista_asistencia_ruta; nombre = d.lista_asistencia_nombre || 'lista_asistencia.pdf'; }

  if (!ruta) throw new HttpError(404, `No se ha subido el archivo de ${tipo}`);
  const full = rutaSegura(ruta);
  if (req.query.inline === '1' || req.query.inline === 'true') {
    return res.sendFile(full);
  }
  res.download(full, nombre);
}));

export default router;
