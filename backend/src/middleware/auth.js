import jwt from 'jsonwebtoken';
import { HttpError } from '../utils.js';

export function requireAuth(req, _res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return next(new HttpError(401, 'Falta el token'));
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = { id: payload.sub, rol: payload.rol, nombre: payload.nombre };
    next();
  } catch {
    next(new HttpError(401, 'Token inválido o vencido'));
  }
}

// Uso: requireRol('Administrador', 'Secretaria')
export const requireRol = (...roles) => (req, _res, next) =>
  roles.includes(req.user?.rol)
    ? next()
    : next(new HttpError(403, 'No tienes permiso para esta acción'));
