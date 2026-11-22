import { Router } from 'express';
import { query } from '../db.js';
import { asyncH, HttpError } from '../utils.js';

const router = Router();

router.get('/', asyncH(async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 30, 100);
  const { rows } = await query(
    `SELECT n.*, d.numero_documento
     FROM notificaciones n
     LEFT JOIN documentos d USING (id_documento)
     ORDER BY n.fecha_notificacion DESC
     LIMIT $1`,
    [limit],
  );
  res.json(rows);
}));

// Marcar notificación como leída
router.patch('/:id/leida', asyncH(async (req, res) => {
  const { rows } = await query(
    'UPDATE notificaciones SET leida = true WHERE id_notificacion = $1 RETURNING *',
    [req.params.id],
  );
  if (!rows.length) throw new HttpError(404, 'Notificación no encontrada');
  res.json(rows[0]);
}));

// Eliminar una notificación
router.delete('/:id', asyncH(async (req, res) => {
  const { rowCount } = await query('DELETE FROM notificaciones WHERE id_notificacion = $1', [req.params.id]);
  if (!rowCount) throw new HttpError(404, 'Notificación no encontrada');
  res.json({ ok: true });
}));

// Limpiar todas las notificaciones
router.delete('/', asyncH(async (_req, res) => {
  await query('DELETE FROM notificaciones');
  res.json({ ok: true, mensaje: 'Todas las notificaciones fueron eliminadas' });
}));

export default router;
