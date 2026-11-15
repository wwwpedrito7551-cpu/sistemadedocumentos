import fs from 'node:fs/promises';
import path from 'node:path';
import { Router } from 'express';
import { query } from '../db.js';
import { asyncH, HttpError } from '../utils.js';
import { requireRol } from '../middleware/auth.js';
import { STORAGE_ROOT } from '../middleware/upload.js';

const router = Router();

router.get('/', asyncH(async (_req, res) => {
  const { rows } = await query('SELECT * FROM categorias ORDER BY nombre');
  res.json(rows);
}));

router.post('/', requireRol('Administrador'), asyncH(async (req, res) => {
  const { nombre, descripcion } = req.body;
  if (!nombre) throw new HttpError(400, 'El nombre es obligatorio');

  // Misma regla que tu UPDATE: archivos/<nombre en minúsculas>/
  const carpeta = `archivos/${nombre.trim().toLowerCase().replace(/[^a-z0-9áéíóúñ]+/gi, '_')}/`;
  const { rows } = await query(
    'INSERT INTO categorias (nombre, descripcion, carpeta) VALUES ($1,$2,$3) RETURNING *',
    [nombre.trim(), descripcion ?? null, carpeta],
  );
  await fs.mkdir(path.join(STORAGE_ROOT, carpeta), { recursive: true });
  res.status(201).json(rows[0]);
}));

export default router;
