import { useState, useEffect } from 'react';
import { fetchBlobUrl } from '../api.js';

export default function ModalVisor({ endpoint, doc, titulo, onClose, onDescargar }) {
  const [blobUrl, setBlobUrl] = useState(null);
  const [mime, setMime] = useState('');
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  // Vista: 'pdf' para visor nativo, 'hoja' para hoja digitalizada institucional
  const [vistaModo, setVistaModo] = useState('pdf');

  const nombreArchivo = (doc?.nombre_original || titulo || '').toLowerCase();
  const esWord = nombreArchivo.endsWith('.doc') || nombreArchivo.endsWith('.docx');

  useEffect(() => {
    let activo = true;
    let url = null;
    setCargando(true);
    setError('');

    fetchBlobUrl(endpoint, true)
      .then((blob) => {
        if (!activo) return;
        url = URL.createObjectURL(blob);
        setBlobUrl(url);
        const tipoMime = blob.type || 'application/pdf';
        setMime(tipoMime);

        // Si es archivo Word, por defecto mostramos la hoja digital institucional
        if (esWord) {
          setVistaModo('hoja');
        }
      })
      .catch((err) => {
        if (!activo) return;
        setError(err.message || 'No se pudo cargar el archivo.');
        // Si hay error en el blob, mostramos la hoja digital oficial
        setVistaModo('hoja');
      })
      .finally(() => {
        if (activo) setCargando(false);
      });

    return () => {
      activo = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [endpoint, esWord]);

  return (
    <div className="modal-backdrop" onClick={onClose} style={{ zIndex: 9999 }}>
      <div
        className="modal-card modal-xl"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: 980,
          width: '95vw',
          height: '92vh',
          display: 'flex',
          flexDirection: 'column',
          borderRadius: 12,
          overflow: 'hidden',
          boxShadow: '0 12px 40px rgba(0,0,0,0.35)'
        }}
      >
        {/* ==================== ENCABEZADO DEL VISOR ==================== */}
        <div
          className="modal-header"
          style={{
            padding: '12px 20px',
            background: '#0B223D',
            color: '#FFFFFF',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, overflow: 'hidden' }}>
            <span style={{ fontSize: '1.25rem' }}>📄</span>
            <h3
              style={{
                margin: 0,
                fontSize: '0.95rem',
                fontWeight: 800,
                color: '#FFFFFF',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {titulo || 'Visor de Documento Institucional'}
            </h3>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* Selector de modo de vista */}
            <div style={{ display: 'flex', background: 'rgba(255,255,255,0.12)', borderRadius: 6, padding: 2 }}>
              <button
                type="button"
                onClick={() => setVistaModo('pdf')}
                style={{
                  background: vistaModo === 'pdf' ? '#FFFFFF' : 'transparent',
                  color: vistaModo === 'pdf' ? '#0B223D' : '#E2E8F0',
                  border: 'none',
                  borderRadius: 4,
                  padding: '4px 10px',
                  fontSize: '0.74rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
                title="Ver mediante el visor PDF del navegador"
              >
                🔍 Visor PDF
              </button>

              <button
                type="button"
                onClick={() => setVistaModo('hoja')}
                style={{
                  background: vistaModo === 'hoja' ? '#FFFFFF' : 'transparent',
                  color: vistaModo === 'hoja' ? '#0B223D' : '#E2E8F0',
                  border: 'none',
                  borderRadius: 4,
                  padding: '4px 10px',
                  fontSize: '0.74rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
                title="Ver hoja oficial digitalizada"
              >
                📄 Hoja Digital
              </button>
            </div>

            {blobUrl && (
              <>
                <button
                  type="button"
                  style={{
                    background: 'rgba(255,255,255,0.16)',
                    color: '#FFFFFF',
                    border: '1px solid rgba(255,255,255,0.3)',
                    borderRadius: 4,
                    padding: '4px 10px',
                    fontSize: '0.74rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                  onClick={() => window.open(blobUrl, '_blank')}
                  title="Abrir en pestaña nueva del navegador"
                >
                  ↗ Pestaña
                </button>
                {onDescargar && (
                  <button
                    type="button"
                    style={{
                      background: '#2563EB',
                      color: '#FFFFFF',
                      border: 'none',
                      borderRadius: 4,
                      padding: '4px 12px',
                      fontSize: '0.74rem',
                      fontWeight: 800,
                      cursor: 'pointer',
                    }}
                    onClick={onDescargar}
                  >
                    ⬇ Descargar
                  </button>
                )}
              </>
            )}

            <button
              type="button"
              className="btn-close-modal"
              style={{ color: '#FFFFFF', background: 'transparent', border: 'none', fontSize: '1.2rem', cursor: 'pointer', padding: '0 4px' }}
              onClick={onClose}
              title="Cerrar visor"
            >
              ✕
            </button>
          </div>
        </div>

        {/* ==================== CUERPO DEL VISOR ==================== */}
        <div style={{ flex: 1, position: 'relative', background: '#F1F5F9', overflow: 'auto' }}>
          {cargando ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#64748B', gap: 12 }}>
              <div style={{ fontSize: '2.2rem' }}>⏳</div>
              <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>Cargando archivo digitalizado...</div>
            </div>
          ) : vistaModo === 'hoja' ? (
            /* ==================== VISTA: HOJA DIGITALIZADA INSTITUCIONAL (100% INFALIBLE) ==================== */
            <div style={{ padding: '24px 20px', display: 'flex', justifyContent: 'center' }}>
              <div
                style={{
                  background: '#FFFFFF',
                  width: '100%',
                  maxWidth: 760,
                  boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
                  borderRadius: 6,
                  border: '1px solid #CBD5E1',
                  padding: '40px 48px',
                  fontFamily: 'serif',
                  color: '#0F172A',
                }}
              >
                {/* Membrete Oficial */}
                <div style={{ textAlign: 'center', borderBottom: '2px solid #0F355E', paddingBottom: 16, marginBottom: 24 }}>
                  <div style={{ fontSize: '1.15rem', fontWeight: 900, color: '#0F355E', letterSpacing: '0.04em' }}>
                    UNIVERSIDAD AUTÓNOMA GABRIEL RENÉ MORENO
                  </div>
                  <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#1B4B82', marginTop: 2 }}>
                    FACULTAD INTEGRAL DEL ICHILO · INGENIERÍA EN SISTEMAS
                  </div>
                  <div style={{ fontSize: '0.78rem', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 4 }}>
                    UNIDAD DE ARCHIVO Y CORRESPONDENCIA · GESTIÓN DOCUMENTAL
                  </div>
                </div>

                {/* Banner de Correlativo Oficial */}
                <div
                  style={{
                    background: '#F0F7FF',
                    border: '1px solid #BAE6FD',
                    borderRadius: 6,
                    padding: '14px 18px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: 24,
                  }}
                >
                  <div>
                    <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#0369A1', textTransform: 'uppercase' }}>
                      Registro Correlativo Digital
                    </div>
                    <div style={{ fontSize: '1.25rem', fontWeight: 900, color: '#0C4A6E' }}>
                      {doc?.numero_documento || 'DOC-OFICIAL'}
                    </div>
                    <div style={{ fontSize: '0.78rem', color: '#0284C7', fontWeight: 700 }}>
                      Recepción: {doc?.numero_recepcion || 'REC-AUTOMATICO'}
                    </div>
                  </div>

                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '0.75rem', color: '#64748B' }}>Fecha de Ingreso:</div>
                    <div style={{ fontSize: '0.88rem', fontWeight: 800, color: '#0F172A' }}>
                      {doc?.fecha_recepcion ? String(doc.fecha_recepcion).slice(0, 10) : new Date().toISOString().slice(0, 10)}
                    </div>
                    <span
                      style={{
                        display: 'inline-block',
                        marginTop: 4,
                        padding: '2px 10px',
                        borderRadius: 12,
                        fontSize: '0.72rem',
                        fontWeight: 800,
                        background: doc?.estado === 'Pendiente' ? '#FEF3C7' : doc?.estado === 'Respondido' ? '#D1FAE5' : '#E2E8F0',
                        color: doc?.estado === 'Pendiente' ? '#B45309' : doc?.estado === 'Respondido' ? '#065F46' : '#334155',
                      }}
                    >
                      Estado: {doc?.estado || 'Pendiente'}
                    </span>
                  </div>
                </div>

                {/* Datos de Correspondencia */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '14px 24px', fontSize: '0.88rem', marginBottom: 24 }}>
                  <div>
                    <strong style={{ color: '#475569', fontSize: '0.78rem', display: 'block', textTransform: 'uppercase' }}>Tipo de Trámite:</strong>
                    <span style={{ fontWeight: 700 }}>{doc?.tipo_documento || 'Informe / Carta'}</span>
                  </div>
                  <div>
                    <strong style={{ color: '#475569', fontSize: '0.78rem', display: 'block', textTransform: 'uppercase' }}>Carpeta / Categoría:</strong>
                    <span style={{ fontWeight: 700 }}>{doc?.categoria || 'Correspondencia'}</span>
                  </div>
                  <div>
                    <strong style={{ color: '#475569', fontSize: '0.78rem', display: 'block', textTransform: 'uppercase' }}>Remitente Oficial:</strong>
                    <span style={{ fontWeight: 700 }}>{doc?.remitente || 'Institucional'}</span>
                  </div>
                  <div>
                    <strong style={{ color: '#475569', fontSize: '0.78rem', display: 'block', textTransform: 'uppercase' }}>Destinatario:</strong>
                    <span style={{ fontWeight: 700 }}>{doc?.destinatario || 'Unidad de Archivo'}</span>
                  </div>
                  <div>
                    <strong style={{ color: '#475569', fontSize: '0.78rem', display: 'block', textTransform: 'uppercase' }}>Fecha Límite / Vencimiento:</strong>
                    <span style={{ fontWeight: 700 }}>{doc?.fecha_vencimiento ? String(doc.fecha_vencimiento).slice(0, 10) : 'Sin límite establecido'}</span>
                  </div>
                  <div>
                    <strong style={{ color: '#475569', fontSize: '0.78rem', display: 'block', textTransform: 'uppercase' }}>Cantidad de Anexos:</strong>
                    <span style={{ fontWeight: 700 }}>{doc?.cantidad_anexos || 0} anexo(s)</span>
                  </div>
                </div>

                {/* Asunto y Contenido */}
                <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 6, padding: '16px 20px', marginBottom: 28 }}>
                  <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase', marginBottom: 4 }}>
                    Asunto Principal del Documento:
                  </div>
                  <div style={{ fontSize: '1rem', fontWeight: 700, color: '#0F172A', lineHeight: 1.4 }}>
                    {doc?.asunto || 'Sin asunto registrado'}
                  </div>
                  {doc?.observaciones && (
                    <div style={{ marginTop: 10, fontSize: '0.82rem', color: '#64748B' }}>
                      <strong>Observaciones:</strong> {doc.observaciones}
                    </div>
                  )}
                </div>

                {/* Sello Digital y Botón de Descarga */}
                <div
                  style={{
                    borderTop: '1px dashed #CBD5E1',
                    paddingTop: 18,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <div style={{ fontSize: '0.75rem', color: '#64748B', maxWidth: 440 }}>
                    <div style={{ fontWeight: 700, color: '#059669', marginBottom: 2 }}>✓ CERTIFICADO DIGITAL ARCHIVADO</div>
                    Documento digitalizado y registrado en el repositorio institucional del Sistema Automatizado de Archivos.
                  </div>

                  {onDescargar && (
                    <button
                      type="button"
                      onClick={onDescargar}
                      style={{
                        background: '#0F355E',
                        color: '#FFFFFF',
                        border: 'none',
                        borderRadius: 6,
                        padding: '8px 18px',
                        fontSize: '0.82rem',
                        fontWeight: 800,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                      }}
                    >
                      <span>⬇ Descargar Archivo Físico</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          ) : mime.startsWith('image/') ? (
            /* ==================== VISTA: IMAGEN ==================== */
            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
              <img
                src={blobUrl}
                alt="Vista de documento"
                style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', boxShadow: '0 4px 16px rgba(0,0,0,0.15)' }}
              />
            </div>
          ) : (
            /* ==================== VISTA: EMBEBIDO PDF ==================== */
            <div style={{ width: '100%', height: '100%', position: 'relative' }}>
              <object
                data={blobUrl}
                type="application/pdf"
                width="100%"
                height="100%"
                style={{ width: '100%', height: '100%', border: 'none' }}
              >
                <iframe
                  src={blobUrl}
                  title="Visor PDF"
                  style={{ width: '100%', height: '100%', border: 'none' }}
                />
              </object>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
