import { useState, useEffect, useCallback } from 'react';
import { apiFetch, fetchBlobUrl } from '../api.js';
import ModalVisor from './ModalVisor.jsx';

const MODALIDADES = [
  { nombre: 'Excelencia Académica', area: 'Graduación Directa' },
  { nombre: 'Buen Rendimiento', area: 'Graduación Directa' },
  { nombre: 'Buen Desempeño', area: 'Graduación Directa' },
  { nombre: 'Tesis de Grado', area: 'GRL001 - Modalidad con Defensa' },
  { nombre: 'Trabajo Dirigido', area: 'GRL001 - Modalidad con Defensa' },
  { nombre: 'Examen de Grado', area: 'GRL001 - Modalidad con Defensa' },
  { nombre: 'Proyecto de Grado', area: 'GRL001 - Modalidad con Defensa' },
  { nombre: 'Diplomado', area: 'GRL001 - Modalidad con Defensa' },
];

export default function ActasGraduacion({ user }) {
  const [actas, setActas] = useState([]);
  const [stats, setStats] = useState({
    total_graduados: 0,
    excelencia: 0,
    rendimiento: 0,
    modalidades_defensa: 0,
  });
  const [gestion, setGestion] = useState(new Date().getFullYear());
  const [modalidadFiltro, setModalidadFiltro] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [cargando, setCargando] = useState(false);
  const [modalNuevo, setModalNuevo] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const [msg, setMsg] = useState({ tipo: '', texto: '' });

  // Estados para Modal Visor y Edición
  const [visorDoc, setVisorDoc] = useState(null);
  const [editandoActa, setEditandoActa] = useState(null);

  const [form, setForm] = useState({
    numero_acta: '',
    codigo_cpd: '',
    registro_estudiante: '',
    nombre_estudiante: '',
    ci_estudiante: '',
    nota: '',
    modalidad: 'Excelencia Académica',
    area_titulacion: 'Graduación Directa',
    gestion: new Date().getFullYear(),
    fecha_emision: new Date().toISOString().slice(0, 10),
    distribucion_actas: '1 CPD, 3 Caja, 1 Archivo Dirección',
    observaciones: '',
    archivo: null,
  });

  const puedeEscribir = user?.rol === 'Administrador' || user?.rol === 'Secretaria';

  const cargarDatos = useCallback(async () => {
    setCargando(true);
    try {
      const params = new URLSearchParams();
      if (gestion) params.set('gestion', String(gestion));
      if (modalidadFiltro) params.set('modalidad', modalidadFiltro);
      if (busqueda.trim()) params.set('q', busqueda.trim());

      const res = await apiFetch(`/actas?${params.toString()}`);
      setActas(res.data || []);
      setStats({
        total_graduados: Number(res.stats?.total_graduados) || 0,
        excelencia: Number(res.stats?.excelencia) || 0,
        rendimiento: Number(res.stats?.rendimiento) || 0,
        modalidades_defensa: Number(res.stats?.modalidades_defensa) || 0,
      });
    } catch (err) {
      console.error(err);
    } finally {
      setCargando(false);
    }
  }, [gestion, modalidadFiltro, busqueda]);

  useEffect(() => {
    cargarDatos();
  }, [cargarDatos]);

  function handleCambioModalidad(modNombre) {
    const found = MODALIDADES.find((m) => m.nombre === modNombre);
    setForm((prev) => ({
      ...prev,
      modalidad: modNombre,
      area_titulacion: found ? found.area : 'Graduación Directa',
    }));
  }

  async function handleDescargar(id, reg) {
    try {
      const blob = await fetchBlobUrl(`/actas/${id}/archivo`, false);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Acta_Graduacion_${reg}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(err.message);
    }
  }

  async function handleEliminar(id, cpd, nombre) {
    if (!window.confirm(`¿Estás seguro de que deseas ELIMINAR el acta ${cpd} de ${nombre}? Esta acción no se puede deshacer.`)) {
      return;
    }
    try {
      await apiFetch(`/actas/${id}`, { method: 'DELETE' });
      await cargarDatos();
    } catch (err) {
      alert(err.message);
    }
  }

  async function handleGuardarEdicion(e) {
    e.preventDefault();
    if (!editandoActa) return;
    try {
      await apiFetch(`/actas/${editandoActa.id_acta}`, {
        method: 'PUT',
        body: JSON.stringify(editandoActa),
      });
      setEditandoActa(null);
      await cargarDatos();
    } catch (err) {
      alert(err.message);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setMsg({ tipo: '', texto: '' });
    if (!form.codigo_cpd || !form.registro_estudiante || !form.nombre_estudiante || !form.nota) {
      setMsg({ tipo: 'error', texto: 'Completa todos los campos obligatorios del estudiante y calificación.' });
      return;
    }
    setSubiendo(true);
    try {
      const fd = new FormData();
      Object.keys(form).forEach((k) => {
        if (k === 'archivo') {
          if (form.archivo) fd.append('archivo', form.archivo);
        } else {
          fd.append(k, form[k]);
        }
      });

      await apiFetch('/actas', {
        method: 'POST',
        body: fd,
      });

      setMsg({
        tipo: 'ok',
        texto: `Acta registrada con éxito para ${form.nombre_estudiante} (CPD: ${form.codigo_cpd})`,
      });
      setForm({
        numero_acta: '',
        codigo_cpd: '',
        registro_estudiante: '',
        nombre_estudiante: '',
        ci_estudiante: '',
        nota: '',
        modalidad: 'Excelencia Académica',
        area_titulacion: 'Graduación Directa',
        gestion: new Date().getFullYear(),
        fecha_emision: new Date().toISOString().slice(0, 10),
        distribucion_actas: '1 CPD, 3 Caja, 1 Archivo Dirección',
        observaciones: '',
        archivo: null,
      });
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
      {/* Encabezado */}
      <div className="module-header-box">
        <div className="module-header-info">
          <div className="module-icon-wrap" style={{ background: '#7c3aed' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2">
              <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
              <path d="M6 12v5c3 3 9 3 12 0v-5" />
            </svg>
          </div>
          <div>
            <h2 className="module-title">Actas de Graduación y Titulación</h2>
            <p className="module-desc">
              Control oficial de graduados remitidos por CPD y Dirección de Carrera.
              Distribución reglamentaria: <strong>1 ejemplar CPD · 3 ejemplares Caja Central · 1 ejemplar Archivo Dirección</strong>.
            </p>
          </div>
        </div>
        {puedeEscribir && (
          <button
            type="button"
            className="btn-action-primary"
            style={{ background: '#7c3aed' }}
            onClick={() => setModalNuevo(true)}
          >
            + Registrar Acta de Graduación
          </button>
        )}
      </div>

      {/* Tarjetas de Estadísticas */}
      <div className="module-kpi-grid">
        <div className="module-kpi-card">
          <div className="kpi-val" style={{ color: '#4c1d95' }}>{stats.total_graduados}</div>
          <div className="kpi-lbl">Total Actas de Graduación ({gestion})</div>
        </div>
        <div className="module-kpi-card">
          <div className="kpi-val" style={{ color: '#047857' }}>{stats.excelencia}</div>
          <div className="kpi-lbl">🏆 Graduación por Excelencia</div>
        </div>
        <div className="module-kpi-card">
          <div className="kpi-val" style={{ color: '#0284c7' }}>{stats.rendimiento}</div>
          <div className="kpi-lbl">🌟 Buen Rendimiento / Desempeño</div>
        </div>
        <div className="module-kpi-card">
          <div className="kpi-val" style={{ color: '#b45309' }}>{stats.modalidades_defensa}</div>
          <div className="kpi-lbl">🎓 Modalidades con Defensa (GRL001)</div>
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

          <select
            className="pill-select"
            value={modalidadFiltro}
            onChange={(e) => setModalidadFiltro(e.target.value)}
          >
            <option value="">Todas las Modalidades</option>
            <optgroup label="Graduación Directa">
              <option value="Excelencia Académica">Excelencia Académica</option>
              <option value="Buen Rendimiento">Buen Rendimiento</option>
              <option value="Buen Desempeño">Buen Desempeño</option>
            </optgroup>
            <optgroup label="GRL001 - Con Defensa">
              <option value="Tesis de Grado">Tesis de Grado</option>
              <option value="Trabajo Dirigido">Trabajo Dirigido</option>
              <option value="Examen de Grado">Examen de Grado</option>
              <option value="Proyecto de Grado">Proyecto de Grado</option>
              <option value="Diplomado">Diplomado</option>
            </optgroup>
          </select>

          <input
            type="search"
            className="pill-input"
            placeholder="Buscar por estudiante, registro, CI, código CPD..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </div>
        <div className="filters-right">
          <span>{actas.length} actas registradas</span>
        </div>
      </div>

      {/* Tabla de Actas */}
      <div className="docs-table-wrapper">
        <table className="docs-table">
          <thead>
            <tr>
              <th>CÓDIGO CPD & N° ACTA</th>
              <th>ESTUDIANTE GRADUANDO</th>
              <th>REGISTRO Y C.I.</th>
              <th>MODALIDAD DE TITULACIÓN</th>
              <th>CALIFICACIÓN</th>
              <th>FECHA Y GESTIÓN</th>
              <th>ACTA ESCANEADA</th>
              <th>ACCIONES</th>
            </tr>
          </thead>
          <tbody>
            {cargando ? (
              <tr>
                <td colSpan="8" style={{ textAlign: 'center', padding: 30, color: '#64748b' }}>
                  Cargando actas de graduación...
                </td>
              </tr>
            ) : actas.length === 0 ? (
              <tr>
                <td colSpan="8" style={{ textAlign: 'center', padding: 36, color: '#64748b' }}>
                  No se encontraron actas de graduación con los filtros seleccionados.
                </td>
              </tr>
            ) : (
              actas.map((acta) => {
                const notaNum = parseFloat(acta.nota) || 0;
                const actaId = acta.id_acta;
                return (
                  <tr key={actaId}>
                    <td>
                      <span className="badge-cpd">{acta.codigo_cpd}</span>
                      <span className="sub-text">{acta.numero_acta}</span>
                    </td>
                    <td>
                      <div style={{ fontWeight: 700, color: '#1e293b' }}>
                        {acta.nombre_estudiante}
                      </div>
                      <span className="sub-text">{acta.distribucion_actas || '1 CPD, 3 Caja, 1 Dirección'}</span>
                    </td>
                    <td>
                      <div style={{ fontWeight: 700, color: '#0369a1' }}>
                        Reg: {acta.registro_estudiante}
                      </div>
                      <span className="sub-text">CI: {acta.ci_estudiante}</span>
                    </td>
                    <td>
                      <span className="badge-modalidad">
                        {acta.modalidad}
                      </span>
                      <span className="sub-text">{acta.area_titulacion}</span>
                    </td>
                    <td>
                      <span className={`nota-badge ${notaNum >= 90 ? 'alta' : 'regular'}`}>
                        {notaNum.toFixed(1)} / 100
                      </span>
                    </td>
                    <td className="col-creado">
                      <div>{acta.fecha_emision?.slice(0, 10)}</div>
                      <span className="sub-text">Gestión {acta.gestion}</span>
                    </td>
                    <td>
                      {acta.ruta_archivo ? (
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button
                            type="button"
                            className="btn-file-icon"
                            title="Ver acta escaneada"
                            onClick={() =>
                              setVisorDoc({
                                endpoint: `/actas/${actaId}/archivo`,
                                titulo: `Acta ${acta.codigo_cpd} · ${acta.nombre_estudiante}`,
                                nombreOriginal: `Acta_${acta.registro_estudiante}.pdf`,
                              })
                            }
                          >
                            👁️ Ver
                          </button>
                          <button
                            type="button"
                            className="btn-file-icon"
                            title="Descargar PDF"
                            onClick={() => handleDescargar(actaId, acta.registro_estudiante)}
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
                        {puedeEscribir && (
                          <>
                            <button
                              type="button"
                              className="btn-table-action btn-edit"
                              onClick={() => setEditandoActa({ ...acta })}
                              title="Editar datos de esta acta"
                            >
                              ✏️
                            </button>
                            <button
                              type="button"
                              className="btn-table-action btn-delete"
                              onClick={() => handleEliminar(actaId, acta.codigo_cpd, acta.nombre_estudiante)}
                              title="Eliminar esta acta permanentemente"
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

      {/* Modal Visor de Acta */}
      {visorDoc && (
        <ModalVisor
          endpoint={visorDoc.endpoint}
          titulo={visorDoc.titulo}
          onClose={() => setVisorDoc(null)}
          onDescargar={() => handleDescargar(visorDoc.endpoint.split('/')[2], 'acta')}
        />
      )}

      {/* Modal: Editar Acta de Graduación */}
      {editandoActa && (
        <div className="modal-backdrop" onClick={() => setEditandoActa(null)}>
          <div className="modal-card modal-lg" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>✏️ Modificar Acta de Graduación ({editandoActa.codigo_cpd})</h3>
              <button
                type="button"
                className="btn-close-modal"
                onClick={() => setEditandoActa(null)}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleGuardarEdicion}>
              <div className="modal-body modal-form-grid">
                <div className="form-group">
                  <label>Código CPD Único *</label>
                  <input
                    type="text"
                    className="form-control"
                    value={editandoActa.codigo_cpd || ''}
                    onChange={(e) => setEditandoActa({ ...editandoActa, codigo_cpd: e.target.value })}
                    required
                  />
                </div>

                <div className="form-group">
                  <label>N° de Acta</label>
                  <input
                    type="text"
                    className="form-control"
                    value={editandoActa.numero_acta || ''}
                    onChange={(e) => setEditandoActa({ ...editandoActa, numero_acta: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label>Registro Universitario *</label>
                  <input
                    type="text"
                    className="form-control"
                    value={editandoActa.registro_estudiante || ''}
                    onChange={(e) => setEditandoActa({ ...editandoActa, registro_estudiante: e.target.value })}
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Cédula de Identidad (CI) *</label>
                  <input
                    type="text"
                    className="form-control"
                    value={editandoActa.ci_estudiante || ''}
                    onChange={(e) => setEditandoActa({ ...editandoActa, ci_estudiante: e.target.value })}
                    required
                  />
                </div>

                <div className="form-group full">
                  <label>Nombre Completo del Graduando *</label>
                  <input
                    type="text"
                    className="form-control"
                    value={editandoActa.nombre_estudiante || ''}
                    onChange={(e) => setEditandoActa({ ...editandoActa, nombre_estudiante: e.target.value })}
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Modalidad de Titulación</label>
                  <select
                    className="form-control"
                    value={editandoActa.modalidad}
                    onChange={(e) => {
                      const found = MODALIDADES.find((m) => m.nombre === e.target.value);
                      setEditandoActa({
                        ...editandoActa,
                        modalidad: e.target.value,
                        area_titulacion: found ? found.area : editandoActa.area_titulacion,
                      });
                    }}
                  >
                    <optgroup label="Graduación Directa">
                      <option value="Excelencia Académica">Excelencia Académica</option>
                      <option value="Buen Rendimiento">Buen Rendimiento</option>
                      <option value="Buen Desempeño">Buen Desempeño</option>
                    </optgroup>
                    <optgroup label="GRL001 - Modalidad con Defensa">
                      <option value="Tesis de Grado">Tesis de Grado</option>
                      <option value="Trabajo Dirigido">Trabajo Dirigido</option>
                      <option value="Examen de Grado">Examen de Grado</option>
                      <option value="Proyecto de Grado">Proyecto de Grado</option>
                      <option value="Diplomado">Diplomado</option>
                    </optgroup>
                  </select>
                </div>

                <div className="form-group">
                  <label>Calificación Final (sobre 100)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="51"
                    max="100"
                    className="form-control"
                    value={editandoActa.nota}
                    onChange={(e) => setEditandoActa({ ...editandoActa, nota: e.target.value })}
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Gestión Anual</label>
                  <input
                    type="number"
                    className="form-control"
                    value={editandoActa.gestion}
                    onChange={(e) => setEditandoActa({ ...editandoActa, gestion: parseInt(e.target.value, 10) })}
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Fecha de Emisión</label>
                  <input
                    type="date"
                    className="form-control"
                    value={editandoActa.fecha_emision?.slice(0, 10) || ''}
                    onChange={(e) => setEditandoActa({ ...editandoActa, fecha_emision: e.target.value })}
                  />
                </div>

                <div className="form-group full">
                  <label>Observaciones</label>
                  <textarea
                    className="form-control"
                    rows="2"
                    value={editandoActa.observaciones || ''}
                    onChange={(e) => setEditandoActa({ ...editandoActa, observaciones: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '16px 24px', borderTop: '1px solid #e2e8f0' }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setEditandoActa(null)}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  style={{ background: '#7c3aed' }}
                >
                  Guardar Cambios
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Registrar Nueva Acta de Graduación */}
      {modalNuevo && (
        <div className="modal-backdrop" onClick={() => setModalNuevo(false)}>
          <div className="modal-card modal-lg" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>🎓 Registrar Acta de Graduación</h3>
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
                  <label>Código CPD Único *</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Ej. CPD-EXC-9941"
                    value={form.codigo_cpd}
                    onChange={(e) => setForm({ ...form, codigo_cpd: e.target.value })}
                    required
                  />
                  <small style={{ color: '#64748b' }}>Código oficial asignado por el CPD</small>
                </div>

                <div className="form-group">
                  <label>N° de Acta Oficial</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Ej. ACT-2026-004"
                    value={form.numero_acta}
                    onChange={(e) => setForm({ ...form, numero_acta: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label>Registro Universitario *</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Ej. 219084721"
                    value={form.registro_estudiante}
                    onChange={(e) => setForm({ ...form, registro_estudiante: e.target.value })}
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Cédula de Identidad (CI) *</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Ej. 8943212 SC"
                    value={form.ci_estudiante}
                    onChange={(e) => setForm({ ...form, ci_estudiante: e.target.value })}
                    required
                  />
                </div>

                <div className="form-group full">
                  <label>Nombre Completo del Graduando *</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Ej. Univ. Daniela Rojas Mendoza"
                    value={form.nombre_estudiante}
                    onChange={(e) => setForm({ ...form, nombre_estudiante: e.target.value })}
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Modalidad de Titulación *</label>
                  <select
                    className="form-control"
                    value={form.modalidad}
                    onChange={(e) => handleCambioModalidad(e.target.value)}
                    required
                  >
                    <optgroup label="Graduación Directa">
                      <option value="Excelencia Académica">Excelencia Académica</option>
                      <option value="Buen Rendimiento">Buen Rendimiento</option>
                      <option value="Buen Desempeño">Buen Desempeño</option>
                    </optgroup>
                    <optgroup label="GRL001 - Modalidad con Defensa">
                      <option value="Tesis de Grado">Tesis de Grado</option>
                      <option value="Trabajo Dirigido">Trabajo Dirigido</option>
                      <option value="Examen de Grado">Examen de Grado</option>
                      <option value="Proyecto de Grado">Proyecto de Grado</option>
                      <option value="Diplomado">Diplomado</option>
                    </optgroup>
                  </select>
                </div>

                <div className="form-group">
                  <label>Área de Titulación (Automática)</label>
                  <input
                    type="text"
                    className="form-control"
                    value={form.area_titulacion}
                    readOnly
                    style={{ backgroundColor: '#f1f5f9' }}
                  />
                </div>

                <div className="form-group">
                  <label>Calificación Final (sobre 100) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="51"
                    max="100"
                    className="form-control"
                    placeholder="Ej. 96.50"
                    value={form.nota}
                    onChange={(e) => setForm({ ...form, nota: e.target.value })}
                    required
                  />
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

                <div className="form-group">
                  <label>Fecha de Emisión del Acta</label>
                  <input
                    type="date"
                    className="form-control"
                    value={form.fecha_emision}
                    onChange={(e) => setForm({ ...form, fecha_emision: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label>Distribución Reglamentaria</label>
                  <input
                    type="text"
                    className="form-control"
                    value={form.distribucion_actas}
                    onChange={(e) => setForm({ ...form, distribucion_actas: e.target.value })}
                  />
                </div>

                <div className="form-group full">
                  <label>Observaciones / Detalle Adicional</label>
                  <textarea
                    className="form-control"
                    rows="2"
                    placeholder="Número de folio, resolución de aprobación, jurado calificador..."
                    value={form.observaciones}
                    onChange={(e) => setForm({ ...form, observaciones: e.target.value })}
                  />
                </div>

                <div className="form-group full">
                  <label>Acta Digitalizada / Escaneada (PDF, Imagen) *</label>
                  <input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png"
                    className="form-control"
                    onChange={(e) => setForm({ ...form, archivo: e.target.files?.[0] || null })}
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
                  style={{ background: '#7c3aed' }}
                  disabled={subiendo}
                >
                  {subiendo ? 'Registrando acta...' : 'Guardar y Archivar Acta'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
