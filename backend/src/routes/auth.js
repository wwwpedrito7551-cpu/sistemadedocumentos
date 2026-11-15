import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query } from '../db.js';
import { asyncH, HttpError } from '../utils.js';
import { requireAuth, requireRol } from '../middleware/auth.js';

const router = Router();
const ROLES = ['Administrador', 'Secretaria', 'Consulta'];

router.post('/login', asyncH(async (req, res) => {
  const { usuario, contrasena } = req.body;
  if (!usuario || !contrasena) throw new HttpError(400, 'Usuario y contraseña son obligatorios');

  const { rows } = await query('SELECT * FROM usuarios WHERE usuario = $1', [usuario]);
  const u = rows[0];
  // Mismo mensaje en ambos casos para no revelar si el usuario existe
  if (!u || !(await bcrypt.compare(contrasena, u.contrasena))) {
    throw new HttpError(401, 'Credenciales incorrectas');
  }

  const token = jwt.sign(
    { sub: u.id_usuario, rol: u.rol, nombre: u.nombre },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES || '8h' },
  );
  res.json({ token, usuario: { id: u.id_usuario, nombre: u.nombre, rol: u.rol } });
}));

router.get('/me', requireAuth, (req, res) => res.json(req.user));

router.get('/usuarios', requireAuth, requireRol('Administrador'), asyncH(async (_req, res) => {
  const { rows } = await query(
    'SELECT id_usuario, nombre, usuario, rol FROM usuarios ORDER BY id_usuario',
  );
  res.json(rows);
}));

// Solo el administrador crea usuarios; la contraseña se guarda con hash bcrypt.
router.post('/usuarios', requireAuth, requireRol('Administrador'), asyncH(async (req, res) => {
  const { nombre, usuario, contrasena, rol } = req.body;
  if (!nombre || !usuario || !contrasena) throw new HttpError(400, 'Faltan datos');
  if (contrasena.length < 8) throw new HttpError(400, 'La contraseña debe tener al menos 8 caracteres');
  if (!ROLES.includes(rol)) throw new HttpError(400, `Rol inválido. Usa: ${ROLES.join(', ')}`);

  const hash = await bcrypt.hash(contrasena, 12);
  const { rows } = await query(
    `INSERT INTO usuarios (nombre, usuario, contrasena, rol)
     VALUES ($1,$2,$3,$4) RETURNING id_usuario, nombre, usuario, rol`,
    [nombre, usuario, hash, rol],
  );
  res.status(201).json(rows[0]);
}));

export default router;
