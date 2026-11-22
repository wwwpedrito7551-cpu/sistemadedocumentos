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

// Editar categoría
router.put('/:id', requireRol('Administrador'), asyncH(async (req, res) => {
  const { nombre, descripcion } = req.body;
  if (!nombre?.trim()) throw new HttpError(400, 'El nombre de la categoría es obligatorio');

  const { rows } = await query(
    'UPDATE categorias SET nombre = $1, descripcion = $2 WHERE id_categoria = $3 RETURNING *',
    [nombre.trim(), descripcion?.trim() || null, req.params.id],
  );
  if (!rows.length) throw new HttpError(404, 'Categoría no encontrada');
  res.json(rows[0]);
}));

// Eliminar categoría
router.delete('/:id', requireRol('Administrador'), asyncH(async (req, res) => {
  const { rows: cat } = await query('SELECT * FROM categorias WHERE id_categoria = $1', [req.params.id]);
  if (!cat.length) throw new HttpError(404, 'Categoría no encontrada');

  // Desvincular cualquier documento que tuviera esta categoría asignada
  await query('UPDATE documentos SET id_categoria = NULL WHERE id_categoria = $1', [req.params.id]);

  await query('DELETE FROM categorias WHERE id_categoria = $1', [req.params.id]);
  res.json({ ok: true, mensaje: `Categoría "${cat[0].nombre}" eliminada exitosamente` });
}));

export default router;
