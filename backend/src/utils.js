import crypto from 'node:crypto';
import fs from 'node:fs';

// Permite usar async/await en rutas Express sin try/catch en cada una.
export const asyncH = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function sha256(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    fs.createReadStream(filePath)
      .on('data', (chunk) => hash.update(chunk))
      .on('end', () => resolve(hash.digest('hex')))
      .on('error', reject);
  });
}

// Genera un archivo PDF institucional válido estándar (PDF 1.4) con membrete y metadatos oficiales
export function generarPdfInstitucional(doc) {
  const escapePdfText = (str) =>
    String(str || '')
      .replace(/\\/g, '\\\\')
      .replace(/\(/g, '\\(')
      .replace(/\)/g, '\\)');

  const numDoc = escapePdfText(doc.numero_documento || 'DOC-2026-0001');
  const numRec = escapePdfText(doc.numero_recepcion || 'REC-0001');
  const asunto = escapePdfText(doc.asunto || 'Sin asunto');
  const remitente = escapePdfText(doc.remitente || 'Institucional');
  const destinatario = escapePdfText(doc.destinatario || 'Unidad de Archivo y Correspondencia');
  const tipo = escapePdfText(doc.tipo_documento || 'Documento Oficial');
  const cat = escapePdfText(doc.categoria || 'Correspondencia');
  const fecha = escapePdfText(String(doc.fecha_recepcion || new Date().toISOString()).slice(0, 10));
  const venc = escapePdfText(doc.fecha_vencimiento ? String(doc.fecha_vencimiento).slice(0, 10) : 'Sin vencimiento establecido');
  const estado = escapePdfText(doc.estado || 'Pendiente');

  let stream = '';
  // Encabezado institucional UAGRM
  stream += 'BT /F1 14 Tf 50 780 Td (UNIVERSIDAD AUTONOMA GABRIEL RENE MORENO) Tj ET\n';
  stream += 'BT /F2 11 Tf 50 762 Td (UNIDAD DE ARCHIVO Y CORRESPONDENCIA - SISTEMA AUTOMATIZADO DE ARCHIVOS) Tj ET\n';
  
  // Línea divisoria azul
  stream += '0.08 0.22 0.38 rg 50 748 495 2 re f\n';

  // Cuadro resumen de correlativo
  stream += '0.94 0.96 0.98 rg 50 670 495 65 re f\n';
  stream += '0.7 0.8 0.9 RG 1 w 50 670 495 65 re s\n';

  stream += `BT /F1 12 Tf 65 715 Td (DOCUMENTO DIGITALIZADO OFICIAL: ${numDoc}) Tj ET\n`;
  stream += `BT /F2 10 Tf 65 698 Td (Correlativo de Recepcion: ${numRec}   |   Fecha de Ingreso: ${fecha}) Tj ET\n`;
  stream += `BT /F2 10 Tf 65 682 Td (Tipo: ${tipo}   |   Categoria: ${cat}   |   Estado: ${estado}) Tj ET\n`;

  // Cuerpo del documento
  stream += 'BT /F1 11 Tf 50 640 Td (DATOS DE LA CORRESPONDENCIA) Tj ET\n';
  stream += `BT /F2 10 Tf 50 620 Td (Remitente Oficial:    ${remitente}) Tj ET\n`;
  stream += `BT /F2 10 Tf 50 600 Td (Destinatario:          ${destinatario}) Tj ET\n`;
  stream += `BT /F2 10 Tf 50 580 Td (Fecha Limite / Plazo:  ${venc}) Tj ET\n`;

  stream += 'BT /F1 11 Tf 50 545 Td (ASUNTO / CONTENIDO PRINCIPAL:) Tj ET\n';
  stream += `BT /F2 10 Tf 50 525 Td (${asunto}) Tj ET\n`;

  // Marco de verificación digital
  stream += '0.92 0.94 0.97 rg 50 420 495 75 re f\n';
  stream += '0.5 0.6 0.7 RG 1 w 50 420 495 75 re s\n';
  stream += 'BT /F1 9 Tf 65 475 Td (CONSTANCIA DE DIGITALIZACION Y ARCHIVO SISTEMATIZADO) Tj ET\n';
  stream += 'BT /F2 8 Tf 65 458 Td (El presente documento ha sido procesado mediante el Sistema Automatizado de Archivos.) Tj ET\n';
  stream += 'BT /F2 8 Tf 65 444 Td (Facultad Integral del Ichilo - Ingenieria en Sistemas - Gestion Documental Institucional.) Tj ET\n';
  stream += `BT /F2 8 Tf 65 430 Td (Sello y Registro Digital Correlativo: SGD-${numDoc}-VALIDO) Tj ET\n`;

  // Pie de página
  stream += '0.8 0.8 0.8 RG 0.5 w 50 60 495 0.5 re s\n';
  stream += 'BT /F2 8 Tf 50 45 Td (S.G.D. UAGRM - Sistema Automatizado de Archivos - Documento Digitalizado Conforme a Requerimientos) Tj ET\n';

  const streamLen = Buffer.byteLength(stream, 'utf-8');

  let pdf = '%PDF-1.4\n';
  const offsets = [];

  const addObj = (str) => {
    offsets.push(Buffer.byteLength(pdf, 'utf-8'));
    pdf += str;
  };

  addObj('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
  addObj('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n');
  addObj('3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>\nendobj\n');
  addObj(`4 0 obj\n<< /Length ${streamLen} >>\nstream\n${stream}\nendstream\nendobj\n`);
  addObj('5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n');
  addObj('6 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n');

  const startxref = Buffer.byteLength(pdf, 'utf-8');
  pdf += 'xref\n0 7\n0000000000 65535 f \n';
  offsets.forEach((off) => {
    pdf += String(off).padStart(10, '0') + ' 00000 n \n';
  });
  pdf += `trailer\n<< /Size 7 /Root 1 0 R >>\nstartxref\n${startxref}\n%%EOF\n`;

  return Buffer.from(pdf, 'utf-8');
}
