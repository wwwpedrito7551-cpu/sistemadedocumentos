import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';

import authRoutes from './routes/auth.js';
import categoriasRoutes from './routes/categorias.js';
import documentosRoutes from './routes/documentos.js';
import notificacionesRoutes from './routes/notificaciones.js';
import { requireAuth } from './middleware/auth.js';
import { iniciarTareas } from './jobs/scheduler.js';

if (!process.env.JWT_SECRET || !process.env.DATABASE_URL) {
  console.error('Faltan JWT_SECRET o DATABASE_URL en el archivo .env');
  process.exit(1);
}

const app = express();
app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN?.split(',') || true }));
app.use(express.json());

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api/auth', authRoutes);
app.use('/api/categorias', requireAuth, categoriasRoutes);
app.use('/api/documentos', requireAuth, documentosRoutes);
app.use('/api/notificaciones', requireAuth, notificacionesRoutes);

// Manejo central de errores
app.use((err, _req, res, _next) => {
  if (err.code === '23505') return res.status(409).json({ error: 'Ya existe un registro con esos datos' });
  if (err.code === '23503') return res.status(400).json({ error: 'Referencia inválida (categoría o usuario)' });
  if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'El archivo es demasiado grande' });
  const status = err.status || 500;
  if (status === 500) console.error(err);
  res.status(status).json({ error: status === 500 ? 'Error interno del servidor' : err.message });
});

const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log(`API escuchando en http://localhost:${port}`);
  iniciarTareas();
});
