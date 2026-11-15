import { Router } from 'express';
import { query } from '../db.js';
import { asyncH } from '../utils.js';

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

export default router;
