import cron from 'node-cron';
import nodemailer from 'nodemailer';
import { query } from '../db.js';

const transporter = process.env.SMTP_HOST
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    })
  : null;

// Envía las notificaciones que aún no salieron (la tabla funciona como cola).
async function enviarPendientes() {
  const { rows } = await query(
    'SELECT id_notificacion, mensaje FROM notificaciones WHERE enviada = false ORDER BY id_notificacion LIMIT 50',
  );
  for (const n of rows) {
    try {
      if (transporter) {
        await transporter.sendMail({
          from: process.env.MAIL_FROM,
          to: process.env.NOTIFY_TO,
          subject: 'Sistema de archivos: aviso',
          text: n.mensaje,
        });
      } else {
        console.log('[notificación]', n.mensaje); // sin SMTP configurado, solo consola
      }
      await query('UPDATE notificaciones SET enviada = true WHERE id_notificacion = $1', [n.id_notificacion]);
    } catch (err) {
      console.error('No se pudo enviar la notificación', n.id_notificacion, err.message);
      break; // se reintenta en la siguiente vuelta
    }
  }
}

export function iniciarTareas() {
  // Todos los días 08:00 (hora de La Paz): genera alertas de documentos por vencer
  cron.schedule('0 8 * * *', async () => {
    try { await query('SELECT fn_alertar_vencimientos()'); }
    catch (err) { console.error('Error en alertas de vencimiento:', err.message); }
  }, { timezone: 'America/La_Paz' });

  // Cada minuto: despacha lo pendiente
  cron.schedule('* * * * *', () => enviarPendientes().catch((e) => console.error(e.message)));
}
