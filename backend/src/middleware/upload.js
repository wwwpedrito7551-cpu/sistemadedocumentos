import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import { HttpError } from '../utils.js';

export const STORAGE_ROOT = path.resolve(process.env.STORAGE_ROOT || './storage');
const TMP_DIR = path.join(STORAGE_ROOT, '_tmp');
fs.mkdirSync(TMP_DIR, { recursive: true });

const PERMITIDOS = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/tiff']);

// El archivo llega primero a _tmp; el número de documento lo genera la base de datos,
// así que el archivo se mueve a su carpeta definitiva después del INSERT.
export const upload = multer({
  dest: TMP_DIR,
  limits: { fileSize: (Number(process.env.MAX_FILE_MB) || 20) * 1024 * 1024 },
  fileFilter: (_req, file, cb) =>
    PERMITIDOS.has(file.mimetype)
      ? cb(null, true)
      : cb(new HttpError(400, 'Solo se permiten PDF, JPG, PNG o TIFF')),
});
