import { useState, useEffect, useCallback } from 'react';
import { apiFetch, fetchBlobUrl } from '../api.js';

export default function DocumentosRecibidos({ user, categorias, onVerDetalle }) {
  const [documentos, setDocumentos] = useState([]);
  const [total, setTotal] = useState(0);
  const [filtroSemaforo, setFiltroSemaforo] = useState('');
  const [filtroRequiere, setFiltroRequiere] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [cargando, setCargando] = useState(false);
  const [modalNuevo, setModalNuevo] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const [msg, setMsg] = useState({ tipo: '', texto: '' });

  // Resumen de semáforo
  const [stats, setStats] = useState({
    total: 0,
    rojo: 0,
    amarillo: 0,
    verde: 0,
    requieren_respuesta: 0,
  });

  const [form, setForm] = useState({
    numero_recepcion: 'REC-0001',
    fecha_auto: new Date().toISOString().slice(0, 10),
    hora_auto: new Date().toTimeString().slice(0, 8),
    tipo_documento: 'Carta',
    remitente: '',
    destinatario: 'Dirección de Carrera',
    responsable_recepcion: user?.nombre || '',
    medio_recepcion: 'Presencial',
    cantidad_anexos: 0,
    requiere_respuesta: false,
    estado_semaforo: 'Pendiente',
    asunto: '',
    id_categoria: '',
    fecha_vencimiento: '',
    observaciones: '',
    archivo: null,
  });

  const puedeEscribir = user?.rol === 'Administrador' || user?.rol === 'Secretaria';

  const cargarDatos = useCallback(async () => {
    setCargando(true);
    try {
      const params = new URLSearchParams();
      params.set('flujo', 'Recibido');
      if (filtroSemaforo) params.set('semaforo', filtroSemaforo);
      if (busqueda.trim()) params.set('q', busqueda.trim());
      params.set('limit', '50');

      const [resList, resSummary] = await Promise.all([
        apiFetch(`/documentos?${params.toString()}`),
        apiFetch('/documentos/resumen'),
      ]);

      let items = resList.data || [];
      if (filtroRequiere === 'si') {
        items = items.filter((d) => d.requiere_respuesta === true);
      } else if (filtroRequiere === 'no') {
        items = items.filter((d) => !d.requiere_respuesta);
      }

      setDocumentos(items);
      setTotal(resList.total || 0);

      const r = Number(resSummary.semaforo_rojo) || 0;
      const a = Number(resSummary.semaforo_amarillo) || 0;
      const v = Number(resSummary.semaforo_verde) || 0;
      const reqCount = (resList.data || []).filter((d) => d.requiere_respuesta).length;

      setStats({
        total: Number(resSummary.total_recibidos) || (resList.total || 0),
        rojo: r,
        amarillo: a,
        verde: v,
        requieren_respuesta: reqCount,
      });
    } catch (err) {
      console.error(err);
    } finally {
      setCargando(false);
    }
  }, [filtroSemaforo, filtroRequiere, busqueda]);

  useEffect(() => {
    cargarDatos();
  }, [cargarDatos]);

  // Al abrir modal, obtener próximo número de recepción
  useEffect(() => {
    if (!modalNuevo) return;
    const ahora = new Date();
    setForm((prev) => ({
      ...prev,
      fecha_auto: ahora.toISOString().slice(0, 10),
      hora_auto: ahora.toTimeString().slice(0, 8),
      responsable_recepcion: prev.responsable_recepcion || user?.nombre || '',
      id_categoria: prev.id_categoria || (categorias[0] ? String(categorias[0].id_categoria) : ''),
    }));
    apiFetch('/documentos/proximo-recepcion')
      .then((info) => {
        if (info?.proximo_numero_recepcion) {
          setForm((prev) => ({
            ...prev,
            numero_recepcion: info.proximo_numero_recepcion,
            fecha_auto: info.fecha_actual || prev.fecha_auto,
            hora_auto: info.hora_actual || prev.hora_auto,
          }));
        }
      })
      .catch(() => {});
  }, [modalNuevo, user, categorias]);

  async function handleCambiarSemaforo(id, nuevoSemaforo) {
    try {
      await apiFetch(`/documentos/${id}/semaforo`, {
        method: 'PATCH',
        body: JSON.stringify({ estado_semaforo: nuevoSemaforo }),
      });
      await cargarDatos();
    } catch (err) {
      alert(err.message);
    }
  }

  async function handleDescargar(id, nombre) {
    try {
      const blob = await fetchBlobUrl(`/documentos/${id}/archivo`, false);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = nombre || `recibido-${id}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(err.message);
    }
  }

  async function handleVerInline(id) {
    try {
      const blob = await fetchBlobUrl(`/documentos/${id}/archivo`, true);
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
    } catch (err) {
      alert(err.message);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setMsg({ tipo: '', texto: '' });
    if (!form.archivo) {
      setMsg({ tipo: 'error', texto: 'Adjunta el archivo escaneado del documento recibido.' });
      return;
    }
    setSubiendo(true);
    try {
      const fd = new FormData();
      fd.append('clasificacion_flujo', 'Recibido');
      fd.append('tipo_documento', form.tipo_documento);
      fd.append('remitente', form.remitente);
      fd.append('destinatario', form.destinatario);
      fd.append('responsable_recepcion', form.responsable_recepcion || user?.nombre || '');
      fd.append('medio_recepcion', form.medio_recepcion);
      fd.append('cantidad_anexos', String(form.cantidad_anexos || 0));
      fd.append('requiere_respuesta', form.requiere_respuesta ? 'true' : 'false');
      fd.append('estado_semaforo', form.estado_semaforo);
      fd.append('estado', form.estado_semaforo === 'Completado' ? 'Respondido' : 'Recibido');
      fd.append('asunto', form.asunto);
      fd.append('id_categoria', form.id_categoria || (categorias[0] ? String(categorias[0].id_categoria) : '1'));
      if (form.fecha_vencimiento) fd.append('fecha_vencimiento', form.fecha_vencimiento);
      fd.append('observaciones', form.observaciones);
      fd.append('archivo', form.archivo);

      const res = await apiFetch('/documentos', {
        method: 'POST',
        body: fd,
      });

      setMsg({
        tipo: 'ok',
        texto: `Documento recepcionado exitosamente. Asignado correlativo: ${res.numero_recepcion || form.numero_recepcion}`,
      });
      setForm((prev) => ({
        ...prev,
        remitente: '',
        asunto: '',
        observaciones: '',
        fecha_vencimiento: '',
        archivo: null,
      }));
      await cargarDatos();
      setTimeout(() => {
        setModalNuevo(false);
        setMsg({ tipo: '', texto: '' });
      }, 1100);
    } catch (err) {
      setMsg({ tipo: 'error', texto: err.message });
    } finally {
      setSubiendo(false);
    }
  }

  return (
    <div className="module-container">
      {/* Encabezado */}
      <div className="module-header-box">
        <div className="module-header-info">
          <div className="module-icon-wrap" style={{ background: '#0284c7' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
          </div>
          <div>
            <h2 className="module-title">Documentos Recibidos (Mesa de Entradas)</h2>
            <p className="module-desc">
              Control de correspondencia de entrada con sistema de semáforo
              (🔴 Pendiente, 🟡 En curso, 🟢 Completado) e identificación de cartas o solicitudes con respuesta obligatoria.
            </p>
          </div>
        </div>
        {puedeEscribir && (
          <button
            type="button"
            className="btn-action-primary"
            onClick={() => setModalNuevo(true)}
          >
            + Registrar Recepción
          </button>
        )}
      </div>

      {/* Tarjetas de Semáforo */}
      <div className="module-kpi-grid">
        <div className="module-kpi-card">
          <div className="kpi-val" style={{ color: '#0f172a' }}>{stats.total}</div>
          <div className="kpi-lbl">Total Documentos Recibidos</div>
        </div>
        <div
          className="module-kpi-card semaforo-rojo"
          onClick={() => setFiltroSemaforo(filtroSemaforo === 'Pendiente' ? '' : 'Pendiente')}
          style={{ cursor: 'pointer' }}
          title="Clic para filtrar por estado rojo"
        >
          <div className="kpi-val" style={{ color: '#dc2626' }}>
            🔴 {stats.rojo}
          </div>
          <div className="kpi-lbl">Semáforo Rojo (Pendientes)</div>
        </div>
        <div
          className="module-kpi-card semaforo-amarillo"
          onClick={() => setFiltroSemaforo(filtroSemaforo === 'En curso' ? '' : 'En curso')}
          style={{ cursor: 'pointer' }}
          title="Clic para filtrar por estado amarillo"
        >
          <div className="kpi-val" style={{ color: '#d97706' }}>
            🟡 {stats.amarillo}
          </div>
          <div className="kpi-lbl">Semáforo Amarillo (En Curso)</div>
        </div>
        <div
          className="module-kpi-card semaforo-verde"
          onClick={() => setFiltroSemaforo(filtroSemaforo === 'Completado' ? '' : 'Completado')}
          style={{ cursor: 'pointer' }}
          title="Clic para filtrar por estado verde"
        >
          <div className="kpi-val" style={{ color: '#16a34a' }}>
            🟢 {stats.verde}
          </div>
          <div className="kpi-lbl">Semáforo Verde (Completados)</div>
        </div>
      </div>

      {/* Barra de Filtros */}
      <div className="module-filter-bar">
        <div className="filters-left">
          <select
            className="pill-select"
            value={filtroSemaforo}
            onChange={(e) => setFiltroSemaforo(e.target.value)}
          >
            <option value="">Todos los semáforos</option>
            <option value="Pendiente">🔴 Solo Pendientes (Rojo)</option>
            <option value="En curso">🟡 Solo En Curso (Amarillo)</option>
            <option value="Completado">🟢 Solo Completados (Verde)</option>
          </select>

          <select
            className="pill-select"
            value={filtroRequiere}
            onChange={(e) => setFiltroRequiere(e.target.value)}
          >
            <option value="">Respuesta: Todos</option>
            <option value="si">⚠️ Requieren Respuesta Obligatoria</option>
            <option value="no">ℹ️ Solo Informativos</option>
          </select>

          <input
            type="search"
            className="pill-input"
            placeholder="Buscar por N° recepción, remitente, asunto..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </div>
        <div className="filters-right">
          <span>{documentos.length} documentos recibidos</span>
        </div>
      </div>

      {/* Tabla de Documentos Recibidos */}
      <div className="docs-table-wrapper">
        <table className="docs-table">
          <thead>
            <tr>
              <th>N° RECEPCIÓN</th>
              <th>SEMÁFORO</th>
              <th>¿RESPUESTA?</th>
              <th>REMITENTE & MEDIO</th>
              <th>ASUNTO / DETALLE</th>
              <th>FECHA Y HORA</th>
              <th>ARCHIVO</th>
              <th>ACCIONES</th>
            </tr>
          </thead>
          <tbody>
            {cargando ? (
              <tr>
                <td colSpan="8" style={{ textAlign: 'center', padding: 30, color: '#64748b' }}>
                  Cargando documentos de recepción...
                </td>
              </tr>
            ) : documentos.length === 0 ? (
              <tr>
                <td colSpan="8" style={{ textAlign: 'center', padding: 36, color: '#64748b' }}>
                  No hay documentos recibidos con los filtros seleccionados.
                </td>
              </tr>
            ) : (
              documentos.map((doc) => {
                const semaforo = doc.estado_semaforo || 'Pendiente';
                return (
                  <tr key={doc.id_documento}>
                    <td>
                      <span className="badge-recepcion">
                        {doc.numero_recepcion || doc.numero_documento}
                      </span>
                      <span className="sub-text">{doc.tipo_documento}</span>
                    </td>
                    <td>
                      {puedeEscribir ? (
                        <select
                          className={`semaforo-select ${semaforo.toLowerCase().replace(' ', '-')}`}
                          value={semaforo}
                          onChange={(e) => handleCambiarSemaforo(doc.id_documento, e.target.value)}
                        >
                          <option value="Pendiente">🔴 Pendiente</option>
                          <option value="En curso">🟡 En curso</option>
                          <option value="Completado">🟢 Completado</option>
                        </select>
                      ) : (
                        <span className={`semaforo-pill ${semaforo.toLowerCase().replace(' ', '-')}`}>
                          {semaforo === 'Pendiente' ? '🔴 Pendiente' : semaforo === 'En curso' ? '🟡 En curso' : '🟢 Completado'}
                        </span>
                      )}
                    </td>
                    <td>
                      {doc.requiere_respuesta ? (
                        <span className="badge-requiere-si">⚠️ Requiere Resp.</span>
                      ) : (
                        <span className="badge-requiere-no">ℹ️ Informativo</span>
                      )}
                    </td>
                    <td>
                      <div style={{ fontWeight: 700, color: '#1e293b' }}>{doc.remitente}</div>
                      <span className="sub-text">
                        Medio: {doc.medio_recepcion || 'Presencial'} · Para: {doc.destinatario || 'Carrera'}
                      </span>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600, color: '#0f172a' }}>{doc.asunto}</div>
                      {doc.cantidad_anexos > 0 && (
                        <span className="sub-text">📎 {doc.cantidad_anexos} anexo(s)</span>
                      )}
                    </td>
                    <td className="col-creado">
                      <div>{doc.fecha_recepcion?.slice(0, 10)}</div>
                      <span className="sub-text">{doc.hora_recepcion || '08:00'}</span>
                    </td>
                    <td>
                      {doc.tiene_archivo ? (
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button
                            type="button"
                            className="btn-file-icon"
                            title="Previsualizar archivo"
                            onClick={() => handleVerInline(doc.id_documento)}
                          >
                            👁️ Ver
                          </button>
                          <button
                            type="button"
                            className="btn-file-icon"
                            title="Descargar copia"
                            onClick={() => handleDescargar(doc.id_documento, doc.numero_recepcion)}
                          >
                            ⬇️
                          </button>
                        </div>
                      ) : (
                        <span style={{ color: '#94a3b8', fontSize: '0.78rem' }}>Sin archivo</span>
                      )}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn-table-action"
                        onClick={() => onVerDetalle && onVerDetalle(doc.id_documento)}
                      >
                        Detalle
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Modal: Registrar Documento Recibido (9 Campos) */}
      {modalNuevo && (
        <div className="modal-backdrop" onClick={() => setModalNuevo(false)}>
          <div className="modal-card modal-lg" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>📥 Registrar Documento Recibido (Mesa de Entradas)</h3>
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

                {/* 1. N° Recepción Automático */}
                <div className="form-group">
                  <label>1. N° de Recepción (Automático)</label>
                  <input
                    type="text"
                    className="form-control"
                    value={form.numero_recepcion}
                    readOnly
                    style={{ backgroundColor: '#f1f5f9', fontWeight: 700, color: '#0284c7' }}
                  />
                </div>

                {/* Semáforo Inicial */}
                <div className="form-group">
                  <label>Estado de Semáforo *</label>
                  <select
                    className="form-control"
                    value={form.estado_semaforo}
                    onChange={(e) => setForm({ ...form, estado_semaforo: e.target.value })}
                    required
                  >
                    <option value="Pendiente">🔴 Pendiente (Atención pendiente)</option>
                    <option value="En curso">🟡 En curso (En trámite / derivado)</option>
                    <option value="Completado">🟢 Completado (Finalizado)</option>
                  </select>
                </div>

                {/* 2. Fecha automática */}
                <div className="form-group">
                  <label>2. Fecha de Recepción (Automática)</label>
                  <input
                    type="date"
                    className="form-control"
                    value={form.fecha_auto}
                    readOnly
                    style={{ backgroundColor: '#f8fafc' }}
                  />
                </div>

                {/* 3. Hora automática */}
                <div className="form-group">
                  <label>3. Hora de Recepción (Automática)</label>
                  <input
                    type="text"
                    className="form-control"
                    value={form.hora_auto}
                    readOnly
                    style={{ backgroundColor: '#f8fafc' }}
                  />
                </div>

                {/* Remitente */}
                <div className="form-group full">
                  <label>Remitente (Estudiante / Docente / Autoridad) *</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Ej. Univ. Daniela Rojas / Ing. Carlos Mendoza"
                    value={form.remitente}
                    onChange={(e) => setForm({ ...form, remitente: e.target.value })}
                    required
                  />
                </div>

                {/* 4. Destinatario */}
                <div className="form-group">
                  <label>4. Destinatario / Departamento *</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Ej. Dirección de Carrera / Consejo"
                    value={form.destinatario}
                    onChange={(e) => setForm({ ...form, destinatario: e.target.value })}
                    required
                  />
                </div>

                {/* 5. Responsable de recepción */}
                <div className="form-group">
                  <label>5. Responsable de Recepción *</label>
                  <input
                    type="text"
                    className="form-control"
                    value={form.responsable_recepcion}
                    onChange={(e) => setForm({ ...form, responsable_recepcion: e.target.value })}
                    required
                  />
                </div>

                {/* 6. Medio de recepción */}
                <div className="form-group">
                  <label>6. Medio de Recepción</label>
                  <select
                    className="form-control"
                    value={form.medio_recepcion}
                    onChange={(e) => setForm({ ...form, medio_recepcion: e.target.value })}
                  >
                    <option value="Presencial">Presencial (Ventanilla / Mesa de partes)</option>
                    <option value="Digital">Digital (Correo / Plataforma)</option>
                  </select>
                </div>

                {/* Tipo de Documento */}
                <div className="form-group">
                  <label>Tipo de Documento</label>
                  <select
                    className="form-control"
                    value={form.tipo_documento}
                    onChange={(e) => setForm({ ...form, tipo_documento: e.target.value })}
                  >
                    <option value="Carta">Carta</option>
                    <option value="Solicitud">Solicitud</option>
                    <option value="Informe">Informe</option>
                    <option value="Memorandum">Memorandum</option>
                    <option value="Circular">Circular</option>
                    <option value="Otro">Otro</option>
                  </select>
                </div>

                {/* Asunto */}
                <div className="form-group full">
                  <label>Título / Asunto del Trámite *</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Ej. Solicitud de convalidación de materias / Reclamo de notas"
                    value={form.asunto}
                    onChange={(e) => setForm({ ...form, asunto: e.target.value })}
                    required
                  />
                </div>

                {/* ¿Requiere Respuesta? */}
                <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 10 }}>
                  <input
                    type="checkbox"
                    id="chkResp"
                    style={{ width: 20, height: 20, cursor: 'pointer' }}
                    checked={form.requiere_respuesta}
                    onChange={(e) => setForm({ ...form, requiere_respuesta: e.target.checked })}
                  />
                  <label htmlFor="chkResp" style={{ cursor: 'pointer', fontWeight: 700, margin: 0 }}>
                    ¿Requiere Respuesta Obligatoria?
                  </label>
                </div>

                {/* 7. Cantidad de Anexos */}
                <div className="form-group">
                  <label>7. Cantidad de Anexos Físicos</label>
                  <input
                    type="number"
                    min="0"
                    className="form-control"
                    value={form.cantidad_anexos}
                    onChange={(e) => setForm({ ...form, cantidad_anexos: parseInt(e.target.value, 10) || 0 })}
                  />
                </div>

                {/* Categoría */}
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

                {/* Fecha Vencimiento */}
                <div className="form-group">
                  <label>Fecha Límite / Plazo (opcional)</label>
                  <input
                    type="date"
                    className="form-control"
                    value={form.fecha_vencimiento}
                    onChange={(e) => setForm({ ...form, fecha_vencimiento: e.target.value })}
                  />
                </div>

                {/* 8. Observaciones */}
                <div className="form-group full">
                  <label>8. Observaciones Adicionales</label>
                  <textarea
                    className="form-control"
                    rows="2"
                    placeholder="Instrucciones especiales, prioridad o estado físico..."
                    value={form.observaciones}
                    onChange={(e) => setForm({ ...form, observaciones: e.target.value })}
                  />
                </div>

                {/* Archivo Digitalizado */}
                <div className="form-group full">
                  <label>Archivo Digitalizado (PDF / Imagen) *</label>
                  <input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,.tif,.tiff"
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
                  {subiendo ? 'Registrando recepción...' : 'Guardar y Recepcionar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
