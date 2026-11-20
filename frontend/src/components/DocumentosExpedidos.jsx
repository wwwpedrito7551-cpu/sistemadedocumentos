import { useState, useEffect, useCallback } from 'react';
import { apiFetch, fetchBlobUrl } from '../api.js';
import ModalVisor from './ModalVisor.jsx';

export default function DocumentosExpedidos({ user, categorias, onVerDetalle }) {
  const [oficios, setOficios] = useState([]);
  const [total, setTotal] = useState(0);
  const [proximoOficio, setProximoOficio] = useState('');
  const [gestion, setGestion] = useState(new Date().getFullYear());
  const [busqueda, setBusqueda] = useState('');
  const [cargando, setCargando] = useState(false);
  const [modalNuevo, setModalNuevo] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const [msg, setMsg] = useState({ tipo: '', texto: '' });

  // Estados para Modal Visor y Edición
  const [visorDoc, setVisorDoc] = useState(null);
  const [editandoDoc, setEditandoDoc] = useState(null);

  const [form, setForm] = useState({
    tipo_documento: 'Oficio',
    destinatario: '',
    asunto: '',
    id_categoria: '',
    gestion: new Date().getFullYear(),
    observaciones: '',
    archivo: null,
  });

  const puedeEscribir = user?.rol === 'Administrador' || user?.rol === 'Secretaria';

  const cargarDatos = useCallback(async () => {
    setCargando(true);
    try {
      const params = new URLSearchParams();
      params.set('flujo', 'Expedido');
      if (gestion) params.set('gestion', String(gestion));
      if (busqueda.trim()) params.set('q', busqueda.trim());
      params.set('limit', '50');

      const [resList, resProx] = await Promise.all([
        apiFetch(`/documentos?${params.toString()}`),
        apiFetch(`/documentos/proximo-oficio?gestion=${gestion}`),
      ]);

      setOficios(resList.data || []);
      setTotal(resList.total || 0);
      setProximoOficio(resProx.proximo_numero_oficio || `OF-${gestion}-0112`);
    } catch (err) {
      console.error(err);
    } finally {
      setCargando(false);
    }
  }, [gestion, busqueda]);

  useEffect(() => {
    cargarDatos();
  }, [cargarDatos]);

  useEffect(() => {
    if (categorias?.length > 0 && !form.id_categoria) {
      setForm((prev) => ({ ...prev, id_categoria: String(categorias[0].id_categoria) }));
    }
  }, [categorias, form.id_categoria]);

  async function handleDescargar(id, nombre) {
    try {
      const blob = await fetchBlobUrl(`/documentos/${id}/archivo`, false);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = nombre || `oficio-${id}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(err.message);
    }
  }

  async function handleEliminar(id, num) {
    if (!window.confirm(`¿Estás seguro de que deseas ELIMINAR el oficio ${num}? Esta acción no se puede deshacer.`)) {
      return;
    }
    try {
      await apiFetch(`/documentos/${id}`, { method: 'DELETE' });
      await cargarDatos();
    } catch (err) {
      alert(err.message);
    }
  }

  async function handleGuardarEdicion(e) {
    e.preventDefault();
    if (!editandoDoc) return;
    try {
      await apiFetch(`/documentos/${editandoDoc.id_documento}`, {
        method: 'PUT',
        body: JSON.stringify(editandoDoc),
      });
      setEditandoDoc(null);
      await cargarDatos();
    } catch (err) {
      alert(err.message);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setMsg({ tipo: '', texto: '' });
    if (!form.archivo) {
      setMsg({ tipo: 'error', texto: 'Adjunta el archivo escaneado o digital del oficio emitido.' });
      return;
    }
    setSubiendo(true);
    try {
      const fd = new FormData();
      fd.append('clasificacion_flujo', 'Expedido');
      fd.append('gestion', String(form.gestion || gestion));
      fd.append('tipo_documento', form.tipo_documento);
      fd.append('remitente', 'Dirección de Carrera');
      fd.append('destinatario', form.destinatario);
      fd.append('asunto', form.asunto);
      fd.append('id_categoria', form.id_categoria || (categorias[0] ? String(categorias[0].id_categoria) : '1'));
      fd.append('observaciones', form.observaciones);
      fd.append('estado', 'Respondido');
      fd.append('responsable_recepcion', user?.nombre || 'Dirección de Carrera');
      fd.append('medio_recepcion', 'Digital');
      fd.append('archivo', form.archivo);

      const res = await apiFetch('/documentos', {
        method: 'POST',
        body: fd,
      });

      setMsg({
        tipo: 'ok',
        texto: `Oficio emitido con éxito. Asignado correlativo: ${res.numero_oficio || proximoOficio}`,
      });
      setForm((prev) => ({
        ...prev,
        destinatario: '',
        asunto: '',
        observaciones: '',
        archivo: null,
      }));
      await cargarDatos();
      setTimeout(() => {
        setModalNuevo(false);
        setMsg({ tipo: '', texto: '' });
      }, 1200);
    } catch (err) {
      setMsg({ tipo: 'error', texto: err.message });
    } finally {
      setSubiendo(false);
    }
  }

  return (
    <div className="module-container">
      {/* Encabezado del Módulo */}
      <div className="module-header-box">
        <div className="module-header-info">
          <div className="module-icon-wrap" style={{ background: '#1e3a8a' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2">
              <path d="M22 2L11 13" />
              <path d="M22 2l-7 20-4-9-9-4 20-7z" />
            </svg>
          </div>
          <div>
            <h2 className="module-title">Documentos Expedidos (Oficios)</h2>
            <p className="module-desc">
              Control correlativo anual de notas y oficios emitidos por Dirección de Carrera.
              Cada 1 de enero la numeración se reinicia a 01. En la gestión 2026 ya van en el oficio <strong>N° 111</strong>.
            </p>
          </div>
        </div>
        {puedeEscribir && (
          <button
            type="button"
            className="btn-action-primary"
            onClick={() => setModalNuevo(true)}
          >
            + Emitir Nuevo Oficio
          </button>
        )}
      </div>

      {/* Tarjetas de Estadísticas */}
      <div className="module-kpi-grid">
        <div className="module-kpi-card">
          <div className="kpi-val" style={{ color: '#1e40af' }}>{total}</div>
          <div className="kpi-lbl">Total Oficios Emitidos en {gestion}</div>
        </div>
        <div className="module-kpi-card highlight">
          <div className="kpi-val" style={{ color: '#047857', fontFamily: 'monospace' }}>
            {proximoOficio}
          </div>
          <div className="kpi-lbl">Próximo Correlativo Asignable</div>
        </div>
        <div className="module-kpi-card">
          <div className="kpi-val" style={{ color: '#0284c7' }}>111</div>
          <div className="kpi-lbl">Último Oficio Registrado (Gestión 2026)</div>
        </div>
        <div className="module-kpi-card">
          <div className="kpi-val" style={{ color: '#b45309' }}>1 de Enero</div>
          <div className="kpi-lbl">Reinicio Anual a N° 01</div>
        </div>
      </div>

      {/* Barra de Filtros */}
      <div className="module-filter-bar">
        <div className="filters-left">
          <select
            className="pill-select"
            value={gestion}
            onChange={(e) => setGestion(Number(e.target.value))}
          >
            <option value="2026">Gestión 2026</option>
            <option value="2025">Gestión 2025</option>
            <option value="2024">Gestión 2024</option>
          </select>

          <input
            type="search"
            className="pill-input"
            placeholder="Buscar por N° oficio, destinatario, asunto..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </div>
        <div className="filters-right">
          <span>{oficios.length} de {total} oficios encontrados</span>
        </div>
      </div>

      {/* Tabla de Oficios Expedidos */}
      <div className="docs-table-wrapper">
        <table className="docs-table">
          <thead>
            <tr>
              <th>N° OFICIO / GESTIÓN</th>
              <th>DESTINATARIO / INSTITUCIÓN</th>
              <th>ASUNTO / REFERENCIA</th>
              <th>FECHA EMISIÓN</th>
              <th>CATEGORÍA</th>
              <th>EXPEDIENTE DIGITAL</th>
              <th>ACCIONES</th>
            </tr>
          </thead>
          <tbody>
            {cargando ? (
              <tr>
                <td colSpan="7" style={{ textAlign: 'center', padding: 30, color: '#64748b' }}>
                  Cargando documentos expedidos...
                </td>
              </tr>
            ) : oficios.length === 0 ? (
              <tr>
                <td colSpan="7" style={{ textAlign: 'center', padding: 36, color: '#64748b' }}>
                  No se encontraron oficios expedidos en la gestión {gestion}.
                </td>
              </tr>
            ) : (
              oficios.map((doc) => {
                const docId = doc.id_documento;
                const num = doc.numero_oficio || doc.numero_documento;
                return (
                  <tr key={docId}>
                    <td>
                      <span className="badge-oficio">
                        {num}
                      </span>
                      <span className="sub-text">Gestión {doc.gestion || gestion}</span>
                    </td>
                    <td>
                      <div style={{ fontWeight: 700, color: '#1e293b' }}>
                        {doc.destinatario || '—'}
                      </div>
                      <span className="sub-text">Emisor: {doc.remitente || 'Dirección de Carrera'}</span>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600, color: '#0f172a' }}>{doc.asunto}</div>
                      {doc.observaciones && (
                        <span className="sub-text" style={{ fontStyle: 'italic' }}>
                          {doc.observaciones}
                        </span>
                      )}
                    </td>
                    <td className="col-creado">
                      {doc.fecha_recepcion?.slice(0, 10) || '—'}
                    </td>
                    <td>
                      <span className="badge-categoria">{doc.categoria || 'Oficios'}</span>
                    </td>
                    <td>
                      {doc.tiene_archivo ? (
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button
                            type="button"
                            className="btn-file-icon"
                            title="Previsualizar archivo con visor institucional"
                            onClick={() =>
                              setVisorDoc({
                                endpoint: `/documentos/${docId}/archivo`,
                                titulo: `${num} · ${doc.asunto}`,
                                nombreOriginal: `${num}.pdf`,
                              })
                            }
                          >
                            👁️ Ver
                          </button>
                          <button
                            type="button"
                            className="btn-file-icon"
                            title="Descargar copia"
                            onClick={() => handleDescargar(docId, num)}
                          >
                            ⬇️
                          </button>
                        </div>
                      ) : (
                        <span style={{ color: '#94a3b8', fontSize: '0.78rem' }}>Sin archivo</span>
                      )}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <button
                          type="button"
                          className="btn-table-action"
                          onClick={() => onVerDetalle && onVerDetalle(docId)}
                        >
                          Detalle
                        </button>
                        {puedeEscribir && (
                          <>
                            <button
                              type="button"
                              className="btn-table-action btn-edit"
                              onClick={() => setEditandoDoc({ ...doc })}
                              title="Editar datos del oficio"
                            >
                              ✏️
                            </button>
                            <button
                              type="button"
                              className="btn-table-action btn-delete"
                              onClick={() => handleEliminar(docId, num)}
                              title="Eliminar este oficio permanentemente"
                            >
                              🗑️
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Modal Visor de Documento */}
      {visorDoc && (
        <ModalVisor
          endpoint={visorDoc.endpoint}
          titulo={visorDoc.titulo}
          onClose={() => setVisorDoc(null)}
          onDescargar={() => handleDescargar(visorDoc.endpoint.split('/')[2], visorDoc.nombreOriginal)}
        />
      )}

      {/* Modal: Editar Oficio Expedido */}
      {editandoDoc && (
        <div className="modal-backdrop" onClick={() => setEditandoDoc(null)}>
          <div className="modal-card modal-lg" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>✏️ Modificar Oficio ({editandoDoc.numero_oficio || editandoDoc.numero_documento})</h3>
              <button
                type="button"
                className="btn-close-modal"
                onClick={() => setEditandoDoc(null)}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleGuardarEdicion}>
              <div className="modal-body modal-form-grid">
                <div className="form-group full">
                  <label>Destinatario *</label>
                  <input
                    type="text"
                    className="form-control"
                    value={editandoDoc.destinatario || ''}
                    onChange={(e) => setEditandoDoc({ ...editandoDoc, destinatario: e.target.value })}
                    required
                  />
                </div>

                <div className="form-group full">
                  <label>Asunto / Referencia *</label>
                  <input
                    type="text"
                    className="form-control"
                    value={editandoDoc.asunto || ''}
                    onChange={(e) => setEditandoDoc({ ...editandoDoc, asunto: e.target.value })}
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Tipo de Documento</label>
                  <select
                    className="form-control"
                    value={editandoDoc.tipo_documento}
                    onChange={(e) => setEditandoDoc({ ...editandoDoc, tipo_documento: e.target.value })}
                  >
                    <option value="Oficio">Oficio</option>
                    <option value="Carta">Carta</option>
                    <option value="Informe">Informe</option>
                    <option value="Memorandum">Memorandum</option>
                    <option value="Resolución">Resolución</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Estado del Trámite</label>
                  <select
                    className="form-control"
                    value={editandoDoc.estado || 'Respondido'}
                    onChange={(e) => setEditandoDoc({ ...editandoDoc, estado: e.target.value })}
                  >
                    <option value="Respondido">Respondido / Emitido</option>
                    <option value="Finalizado">Finalizado</option>
                    <option value="Archivado">Archivado</option>
                  </select>
                </div>

                <div className="form-group full">
                  <label>Observaciones</label>
                  <textarea
                    className="form-control"
                    rows="2"
                    value={editandoDoc.observaciones || ''}
                    onChange={(e) => setEditandoDoc({ ...editandoDoc, observaciones: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '16px 24px', borderTop: '1px solid #e2e8f0' }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setEditandoDoc(null)}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                >
                  Guardar Cambios
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Emitir Nuevo Oficio Expedido */}
      {modalNuevo && (
        <div className="modal-backdrop" onClick={() => setModalNuevo(false)}>
          <div className="modal-card modal-md" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>📤 Emitir Nuevo Oficio Expedido ({gestion})</h3>
              <button
                type="button"
                className="btn-close-modal"
                onClick={() => setModalNuevo(false)}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="modal-body modal-form-grid">
                {msg.texto && (
                  <div className={`form-alert ${msg.tipo}`}>
                    {msg.texto}
                  </div>
                )}

                <div className="form-group">
                  <label>Próximo N° Correlativo Asignado</label>
                  <input
                    type="text"
                    className="form-control"
                    value={proximoOficio}
                    readOnly
                    style={{ backgroundColor: '#f1f5f9', fontWeight: 700, color: '#047857' }}
                  />
                  <small style={{ color: '#64748b' }}>Generado por correlativo automático de la carrera</small>
                </div>

                <div className="form-group">
                  <label>Gestión Anual *</label>
                  <input
                    type="number"
                    className="form-control"
                    value={form.gestion}
                    onChange={(e) => setForm({ ...form, gestion: parseInt(e.target.value, 10) })}
                    required
                  />
                </div>

                <div className="form-group full">
                  <label>Destinatario (Autoridad / Departamento / Persona) *</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Ej. Ing. Juan Pérez - Decano Facultad Integral de Ichilo / DPA"
                    value={form.destinatario}
                    onChange={(e) => setForm({ ...form, destinatario: e.target.value })}
                    required
                  />
                </div>

                <div className="form-group full">
                  <label>Asunto o Referencia del Oficio *</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Ej. Remisión de actas de graduación y nómina de auxiliares gestión 2026"
                    value={form.asunto}
                    onChange={(e) => setForm({ ...form, asunto: e.target.value })}
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Tipo de Documento</label>
                  <select
                    className="form-control"
                    value={form.tipo_documento}
                    onChange={(e) => setForm({ ...form, tipo_documento: e.target.value })}
                  >
                    <option value="Oficio">Oficio de Carrera</option>
                    <option value="Carta">Carta Oficial</option>
                    <option value="Informe">Informe Técnico</option>
                    <option value="Memorandum">Memorandum</option>
                    <option value="Resolución">Resolución</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Categoría / Carpeta *</label>
                  <select
                    className="form-control"
                    value={form.id_categoria}
                    onChange={(e) => setForm({ ...form, id_categoria: e.target.value })}
                    required
                  >
                    {categorias.map((c) => (
                      <option key={c.id_categoria} value={c.id_categoria}>
                        {c.nombre}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group full">
                  <label>Observaciones / Notas de Expedición</label>
                  <textarea
                    className="form-control"
                    rows="2"
                    placeholder="Detalle de sellos, remitente secundario, copias entregadas..."
                    value={form.observaciones}
                    onChange={(e) => setForm({ ...form, observaciones: e.target.value })}
                  />
                </div>

                <div className="form-group full">
                  <label>Copia Digitalizada del Oficio Firmado (PDF, Imagen) *</label>
                  <input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png"
                    className="form-control"
                    onChange={(e) => setForm({ ...form, archivo: e.target.files?.[0] || null })}
                    required
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '16px 24px', borderTop: '1px solid #e2e8f0' }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setModalNuevo(false)}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={subiendo}
                >
                  {subiendo ? 'Registrando oficio...' : 'Emitir y Archivar Oficio'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
