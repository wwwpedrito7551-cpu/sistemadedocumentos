import fs from 'node:fs/promises';
import path from 'node:path';
import { Router } from 'express';
import { query, tx } from '../db.js';
import { asyncH, HttpError, sha256 } from '../utils.js';
import { requireRol } from '../middleware/auth.js';
import { upload, STORAGE_ROOT } from '../middleware/upload.js';

const router = Router();
const ESCRITURA = requireRol('Administrador', 'Secretaria');

// Transiciones permitidas entre estados (incluye estados originales y de recepción)
const TRANSICIONES = {
  Recibido: ['Pendiente', 'Derivado', 'Respondido', 'Finalizado', 'Archivado'],
  Pendiente: ['Derivado', 'Respondido', 'Finalizado', 'Archivado'],
  Derivado: ['Pendiente', 'Respondido', 'Finalizado', 'Archivado'],
  Respondido: ['Finalizado', 'Archivado'],
  Finalizado: ['Archivado'],
  Archivado: [],
};

// Resuelve una ruta guardada en BD y evita que salga de STORAGE_ROOT
function rutaSegura(relativa) {
  const abs = path.resolve(STORAGE_ROOT, relativa);
  if (!abs.startsWith(STORAGE_ROOT + path.sep)) throw new HttpError(400, 'Ruta inválida');
  return abs;
}

// ---------- Obtener datos automáticos para el formulario de recepción ----------
router.get('/proximo-recepcion', asyncH(async (_req, res) => {
  const { rows } = await query(`
    SELECT
      'REC-' || lpad(
        (COALESCE((SELECT last_value FROM seq_numero_recepcion WHERE is_called), 0) + 1)::text,
        4,
        '0'
      ) AS proximo_numero_recepcion,
      to_char(CURRENT_DATE, 'YYYY-MM-DD') AS fecha_actual,
      to_char(CURRENT_TIMESTAMP, 'HH24:MI:SS') AS hora_actual
  `);
  res.json(rows[0]);
}));

// ---------- Registrar documento (recepción + registro + clasificación) ----------
router.post('/', ESCRITURA, upload.single('archivo'), asyncH(async (req, res) => {
  const file = req.file;
  if (!file) throw new HttpError(400, 'Adjunta el archivo digitalizado en el campo "archivo"');

  const limpiar = () => fs.rm(file.path, { force: true });
  try {
    const {
      tipo_documento,
      remitente,
      asunto,
      id_categoria,
      fecha_vencimiento,
      destinatario,
      responsable_recepcion,
      medio_recepcion,
      cantidad_anexos,
      observaciones,
      estado,
    } = req.body;

    if (!tipo_documento || !remitente || !asunto || !id_categoria) {
      throw new HttpError(400, 'Faltan: tipo_documento, remitente, asunto, id_categoria');
    }

    const hash = await sha256(file.path);
    const dup = await query('SELECT numero_documento FROM documentos WHERE hash_archivo = $1', [hash]);
    if (dup.rowCount) throw new HttpError(409, `Este archivo ya fue registrado como ${dup.rows[0].numero_documento}`);

    const cat = await query('SELECT carpeta FROM categorias WHERE id_categoria = $1', [id_categoria]);
    if (!cat.rowCount) throw new HttpError(400, 'La categoría no existe');

    const dir = rutaSegura(cat.rows[0].carpeta);
    await fs.mkdir(dir, { recursive: true });

    const estadoValido = ['Recibido', 'Pendiente', 'Derivado', 'Finalizado', 'Respondido', 'Archivado'].includes(estado)
      ? estado
      : 'Recibido';
    const medioValido = medio_recepcion || 'Presencial';
    const anexosNum = Math.max(parseInt(cantidad_anexos, 10) || 0, 0);
    const responsableFinal = (responsable_recepcion || req.user.nombre || '').trim();

    let destino;
    const doc = await tx(async (c) => {
      // Para que el trigger de historial sepa quién hizo el cambio
      await c.query("SELECT set_config('app.id_usuario', $1, true)", [String(req.user.id)]);

      // numero_documento, numero_recepcion, fecha_recepcion y hora_recepcion los genera trg_generar_numero
      const { rows } = await c.query(
        `INSERT INTO documentos
           (tipo_documento, remitente, asunto, id_categoria, id_usuario, fecha_vencimiento, hash_archivo,
            destinatario, responsable_recepcion, medio_recepcion, cantidad_anexos, observaciones, estado)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         RETURNING id_documento, numero_documento, numero_recepcion, fecha_recepcion, hora_recepcion`,
        [
          tipo_documento,
          remitente,
          asunto,
          id_categoria,
          req.user.id,
          fecha_vencimiento || null,
          hash,
          destinatario || null,
          responsableFinal || null,
          medioValido,
          anexosNum,
          observaciones || null,
          estadoValido,
        ],
      );
      const { id_documento, numero_documento, numero_recepcion } = rows[0];

      const ext = path.extname(file.originalname).toLowerCase();
      destino = path.join(dir, `${numero_documento}${ext}`);
      await fs.copyFile(file.path, destino);

      const ruta = path.relative(STORAGE_ROOT, destino);
      await c.query(
        'UPDATE documentos SET ruta_archivo = $1, nombre_original = $2 WHERE id_documento = $3',
        [ruta, file.originalname, id_documento],
      );
      return { id_documento, numero_documento, numero_recepcion, ruta_archivo: ruta };
    }).catch(async (err) => {
      if (destino) await fs.rm(destino, { force: true });
      throw err;
    });

    res.status(201).json(doc);
  } finally {
    await limpiar();
  }
}));

// ---------- Resumen para el dashboard ----------
router.get('/resumen', asyncH(async (_req, res) => {
  const { rows } = await query(`
    SELECT
      COUNT(*) FILTER (WHERE estado IN ('Pendiente', 'Recibido', 'Derivado')) AS pendientes,
      COUNT(*) FILTER (WHERE estado IN ('Respondido', 'Finalizado'))          AS respondidos,
      COUNT(*) FILTER (WHERE estado = 'Archivado')                            AS archivados,
      COUNT(*) FILTER (WHERE estado IN ('Pendiente', 'Recibido', 'Derivado')
                         AND fecha_vencimiento < CURRENT_DATE)                AS vencidos,
      COUNT(*) FILTER (WHERE estado IN ('Pendiente', 'Recibido', 'Derivado')
                         AND fecha_vencimiento BETWEEN CURRENT_DATE AND CURRENT_DATE + 3) AS por_vencer
    FROM documentos`);
  res.json(rows[0]);
}));

// ---------- Listado con filtros y paginación ----------
router.get('/', asyncH(async (req, res) => {
  const { estado, id_categoria, q, desde, hasta } = req.query;
  const limit = Math.min(Number(req.query.limit) || 20, 100);
  const offset = (Math.max(Number(req.query.page) || 1, 1) - 1) * limit;

  const where = [];
  const params = [];
  const add = (sql, value) => { params.push(value); where.push(sql.replace('?', `$${params.length}`)); };

  if (estado) add('d.estado = ?', estado);
  if (id_categoria) add('d.id_categoria = ?', id_categoria);
  if (desde) add('d.fecha_recepcion >= ?', desde);
  if (hasta) add("d.fecha_recepcion < (?::date + 1)", hasta);
  if (q) {
    params.push(`%${q}%`);
    const p = `$${params.length}`;
    where.push(
      `(d.remitente ILIKE ${p} OR d.asunto ILIKE ${p} OR d.numero_documento ILIKE ${p} OR d.numero_recepcion ILIKE ${p} OR d.destinatario ILIKE ${p})`,
    );
  }

  const filtro = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = await query(`SELECT COUNT(*)::int AS n FROM documentos d ${filtro}`, params);
  const { rows } = await query(
    `SELECT d.id_documento, d.numero_documento, d.numero_recepcion, d.tipo_documento,
            d.remitente, d.destinatario, d.responsable_recepcion, d.medio_recepcion,
            d.cantidad_anexos, d.observaciones, d.asunto, d.estado,
            d.fecha_recepcion, d.hora_recepcion, d.fecha_vencimiento, c.nombre AS categoria
     FROM documentos d JOIN categorias c USING (id_categoria)
     ${filtro}
     ORDER BY d.fecha_recepcion DESC
     LIMIT ${limit} OFFSET ${offset}`,
    params,
  );
  res.json({ total: total.rows[0].n, page: offset / limit + 1, limit, data: rows });
}));

// ---------- Detalle + historial ----------
router.get('/:id', asyncH(async (req, res) => {
  const doc = await query(
    `SELECT d.*, c.nombre AS categoria, u.nombre AS registrado_por
     FROM documentos d
     JOIN categorias c USING (id_categoria)
     JOIN usuarios u ON u.id_usuario = d.id_usuario
     WHERE d.id_documento = $1`,
    [req.params.id],
  );
  if (!doc.rowCount) throw new HttpError(404, 'Documento no encontrado');

  const historial = await query(
    `SELECT h.*, u.nombre AS usuario
     FROM historial_documentos h
     LEFT JOIN usuarios u ON u.id_usuario = h.id_usuario
     WHERE h.id_documento = $1 ORDER BY h.id_historial`,
    [req.params.id],
  ).catch(() => query('SELECT * FROM historial_documentos WHERE id_documento = $1', [req.params.id]));

  const { ruta_archivo, hash_archivo, ...visible } = doc.rows[0];
  res.json({ ...visible, tiene_archivo: Boolean(ruta_archivo), historial: historial.rows });
}));

// ---------- Descargar o visualizar el archivo digitalizado ----------
router.get('/:id/archivo', asyncH(async (req, res) => {
  const { rows } = await query(
    'SELECT ruta_archivo, nombre_original FROM documentos WHERE id_documento = $1',
    [req.params.id],
  );
  if (!rows[0]?.ruta_archivo) throw new HttpError(404, 'El documento no tiene archivo');
  const fullPath = rutaSegura(rows[0].ruta_archivo);
  if (req.query.inline === '1' || req.query.inline === 'true') {
    return res.sendFile(fullPath);
  }
  res.download(fullPath, rows[0].nombre_original);
}));

// ---------- Cambiar estado ----------
router.patch('/:id/estado', ESCRITURA, asyncH(async (req, res) => {
  const { estado } = req.body;

  const result = await tx(async (c) => {
    await c.query("SELECT set_config('app.id_usuario', $1, true)", [String(req.user.id)]);

    const actual = await c.query(
      'SELECT estado FROM documentos WHERE id_documento = $1 FOR UPDATE',
      [req.params.id],
    );
    if (!actual.rowCount) throw new HttpError(404, 'Documento no encontrado');

    const desde = actual.rows[0].estado;
    if (!TRANSICIONES[desde]?.includes(estado)) {
      throw new HttpError(400, `No se puede pasar de ${desde} a ${estado}`);
    }
    // Los triggers registran historial y notificación automáticamente
    const { rows } = await c.query(
      'UPDATE documentos SET estado = $1 WHERE id_documento = $2 RETURNING id_documento, numero_documento, estado',
      [estado, req.params.id],
    );
    return rows[0];
  });
  res.json(result);
}));

export default router;
