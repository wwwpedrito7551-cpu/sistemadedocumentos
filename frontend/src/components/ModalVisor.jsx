import { useState, useEffect } from 'react';
import { fetchBlobUrl } from '../api.js';

export default function ModalVisor({ endpoint, titulo, onClose, onDescargar }) {
  const [blobUrl, setBlobUrl] = useState(null);
  const [mime, setMime] = useState('');
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

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
        setMime(blob.type || 'application/pdf');
      })
      .catch((err) => {
        if (!activo) return;
        setError(err.message || 'No se pudo cargar el archivo para previsualización.');
      })
      .finally(() => {
        if (activo) setCargando(false);
      });

    return () => {
      activo = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [endpoint]);

  return (
    <div className="modal-backdrop" onClick={onClose} style={{ zIndex: 9999 }}>
      <div
        className="modal-card modal-xl"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 960, width: '95vw', height: '90vh', display: 'flex', flexDirection: 'column' }}
      >
        {/* Encabezado del Visor */}
        <div className="modal-header" style={{ padding: '12px 20px', background: '#0D1B4C', color: '#ffffff' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, overflow: 'hidden' }}>
            <span style={{ fontSize: '1.2rem' }}>📄</span>
            <h3 style={{ margin: 0, fontSize: '1rem', color: '#ffffff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {titulo || 'Visor de Documento Institucional'}
            </h3>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {blobUrl && (
              <>
                <button
                  type="button"
                  className="btn-mini"
                  style={{ background: 'rgba(255,255,255,0.18)', color: '#ffffff', border: '1px solid rgba(255,255,255,0.35)' }}
                  onClick={() => window.open(blobUrl, '_blank')}
                  title="Abrir en pestaña nueva"
                >
                  ↗ Pestaña
                </button>
                {onDescargar && (
                  <button
                    type="button"
                    className="btn-mini"
                    style={{ background: '#2563eb', color: '#ffffff', border: 'none' }}
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
              style={{ color: '#ffffff' }}
              onClick={onClose}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Cuerpo del Visor */}
        <div style={{ flex: 1, position: 'relative', background: '#0f172a', overflow: 'hidden' }}>
          {cargando ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#94a3b8', gap: 12 }}>
              <div style={{ fontSize: '2rem' }}>⏳</div>
              <div>Cargando archivo digitalizado...</div>
            </div>
          ) : error ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#f87171', padding: 24, textAlign: 'center', gap: 14 }}>
              <div style={{ fontSize: '2.5rem' }}>⚠️</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>No se pudo previsualizar este archivo</div>
              <p style={{ color: '#cbd5e1', maxWidth: 500, margin: 0 }}>
                {error}. Si el archivo fue subido como prueba o tiene un formato no compatible con el navegador, puedes descargarlo directamente.
              </p>
              {onDescargar && (
                <button
                  type="button"
                  className="btn-primary"
                  style={{ background: '#2563eb', marginTop: 10 }}
                  onClick={onDescargar}
                >
                  ⬇️ Descargar archivo original
                </button>
              )}
            </div>
          ) : mime.startsWith('image/') ? (
            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'auto' }}>
              <img
                src={blobUrl}
                alt="Vista de documento"
                style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
              />
            </div>
          ) : (
            <iframe
              src={blobUrl}
              title="Visor PDF"
              style={{ width: '100%', height: '100%', border: 'none' }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
