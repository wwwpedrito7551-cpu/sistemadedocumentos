import { useState, useEffect, useCallback } from 'react';
import { apiFetch, fetchBlobUrl } from '../api.js';
import ModalVisor from './ModalVisor.jsx';

export default function AuxiliaresCatedra({ user }) {
  const [auxiliares, setAuxiliares] = useState([]);
  const [stats, setStats] = useState({
    total: 0,
    activos: 0,
    por_concurso: 0,
    ratificados: 0,
  });
  const [gestion, setGestion] = useState(new Date().getFullYear());
  const [semestre, setSemestre] = useState('2do Semestre');
  const [filtroTipo, setFiltroTipo] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [cargando, setCargando] = useState(false);
  const [modalNuevo, setModalNuevo] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const [msg, setMsg] = useState({ tipo: '', texto: '' });

  // Estados para Modal Visor y Edición
  const [visorDoc, setVisorDoc] = useState(null);
  const [editandoAux, setEditandoAux] = useState(null);

  const [form, setForm] = useState({
    gestion: new Date().getFullYear(),
    semestre: '2do Semestre',
    materia: '',
    registro_estudiante: '',
    nombre_estudiante: '',
    ci_estudiante: '',
    nota_examen: '',
    tipo_designacion: 'Convocatoria',
    numero_oficio_propuesta: '',
    resolucion_consejo: '',
    estado: 'Activo',
    observaciones: '',
    archivo: null,
  });

  const puedeEscribir = user?.rol === 'Administrador' || user?.rol === 'Secretaria';

  const cargarDatos = useCallback(async () => {
    setCargando(true);
    try {
      const params = new URLSearchParams();
      if (gestion) params.set('gestion', String(gestion));
      if (semestre) params.set('semestre', semestre);
      if (filtroTipo) params.set('tipo', filtroTipo);
      if (busqueda.trim()) params.set('q', busqueda.trim());

      const res = await apiFetch(`/auxiliares?${params.toString()}`);
      setAuxiliares(res.data || []);
      setStats({
        total: Number(res.stats?.total) || 0,
        activos: Number(res.stats?.activos) || 0,
        por_concurso: Number(res.stats?.por_concurso) || 0,
        ratificados: Number(res.stats?.ratificados) || 0,
      });
    } catch (err) {
      console.error(err);
    } finally {
      setCargando(false);
    }
  }, [gestion, semestre, filtroTipo, busqueda]);

  useEffect(() => {
    cargarDatos();
  }, [cargarDatos]);

  async function handleRatificar(id) {
    if (!window.confirm('¿Confirmas la ratificación de este auxiliar para el siguiente periodo académico?')) return;
    try {
      await apiFetch(`/auxiliares/${id}/estado`, {
        method: 'PATCH',
        body: JSON.stringify({
          estado: 'Ratificado',
          observaciones: 'Ratificado por cumplimiento de informe de actividades y evaluación favorable.',
        }),
      });
      await cargarDatos();
    } catch (err) {
      alert(err.message);
    }
  }

  async function handleDescargar(id, reg) {
    try {
      const blob = await fetchBlobUrl(`/auxiliares/${id}/archivo`, false);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Respaldo_Auxiliar_${reg}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(err.message);
    }
  }

  async function handleEliminar(id, nombre, materia) {
    if (!window.confirm(`¿Estás seguro de que deseas ELIMINAR al auxiliar ${nombre} (${materia})? Esta acción no se puede deshacer.`)) {
      return;
    }
    try {
      await apiFetch(`/auxiliares/${id}`, { method: 'DELETE' });
      await cargarDatos();
    } catch (err) {
      alert(err.message);
    }
  }

  async function handleGuardarEdicion(e) {
    e.preventDefault();
    if (!editandoAux) return;
    try {
      await apiFetch(`/auxiliares/${editandoAux.id_auxiliar}`, {
        method: 'PUT',
        body: JSON.stringify(editandoAux),
      });
      setEditandoAux(null);
      await cargarDatos();
    } catch (err) {
      alert(err.message);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setMsg({ tipo: '', texto: '' });
    if (!form.materia || !form.registro_estudiante || !form.nombre_estudiante) {
      setMsg({ tipo: 'error', texto: 'Materia, Registro Universitario y Nombre Completo son requeridos.' });
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

      await apiFetch('/auxiliares', {
        method: 'POST',
        body: fd,
      });

      setMsg({
        tipo: 'ok',
        texto: `Auxiliar ${form.nombre_estudiante} registrado exitosamente para la materia ${form.materia}.`,
      });
      setForm({
        gestion: new Date().getFullYear(),
        semestre: '2do Semestre',
        materia: '',
        registro_estudiante: '',
        nombre_estudiante: '',
        ci_estudiante: '',
        nota_examen: '',
        tipo_designacion: 'Convocatoria',
        numero_oficio_propuesta: '',
        resolucion_consejo: '',
        estado: 'Activo',
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
          <div className="module-icon-wrap" style={{ background: '#059669' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          </div>
          <div>
            <h2 className="module-title">Auxiliares de Cátedra y Docencia</h2>
            <p className="module-desc">
              Control de auxiliares de materias por semestre. En el 1er semestre ingresan mediante
              <strong> Convocatoria y Examen</strong> de concurso; en el 2do semestre procede la
              <strong> Ratificación</strong> previa presentación de informe.
            </p>
          </div>
        </div>
        {puedeEscribir && (
          <button
            type="button"
            className="btn-action-primary"
            style={{ background: '#059669' }}
            onClick={() => setModalNuevo(true)}
          >
            + Registrar Auxiliar
          </button>
        )}
      </div>

      {/* Tarjetas KPI */}
      <div className="module-kpi-grid">
        <div className="module-kpi-card">
          <div className="kpi-val" style={{ color: '#065f46' }}>{stats.total}</div>
          <div className="kpi-lbl">Total Auxiliares ({gestion} - {semestre})</div>
        </div>
        <div className="module-kpi-card">
          <div className="kpi-val" style={{ color: '#0284c7' }}>{stats.activos}</div>
          <div className="kpi-lbl">Auxiliares en Ejercicio Activo</div>
        </div>
        <div className="module-kpi-card">
          <div className="kpi-val" style={{ color: '#d97706' }}>{stats.por_concurso}</div>
          <div className="kpi-lbl">Por Concurso / Convocatoria</div>
        </div>
        <div className="module-kpi-card">
          <div className="kpi-val" style={{ color: '#7c3aed' }}>{stats.ratificados}</div>
          <div className="kpi-lbl">Ratificados (2do Semestre)</div>
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
          </select>

          <select
            className="pill-select"
            value={semestre}
            onChange={(e) => setSemestre(e.target.value)}
          >
            <option value="2do Semestre">2do Semestre</option>
            <option value="1er Semestre">1er Semestre</option>
          </select>

          <select
            className="pill-select"
            value={filtroTipo}
            onChange={(e) => setFiltroTipo(e.target.value)}
          >
            <option value="">Designación: Todas</option>
            <option value="Convocatoria">Convocatoria / Concurso</option>
            <option value="Ratificación">Ratificación</option>
          </select>

          <input
            type="search"
            className="pill-input"
            placeholder="Buscar por auxiliar, materia, registro..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </div>
        <div className="filters-right">
          <span>{auxiliares.length} registros de auxiliatura</span>
        </div>
      </div>

      {/* Tabla de Auxiliares */}
      <div className="docs-table-wrapper">
        <table className="docs-table">
          <thead>
            <tr>
              <th>MATERIA / ASIGNATURA</th>
              <th>ESTUDIANTE AUXILIAR</th>
              <th>REGISTRO Y C.I.</th>
              <th>DESIGNACIÓN & RESOLUCIÓN</th>
              <th>NOTA EXAMEN</th>
              <th>ESTADO</th>
              <th>RESPALDO DIGITAL</th>
              <th>ACCIONES</th>
            </tr>
          </thead>
          <tbody>
            {cargando ? (
              <tr>
                <td colSpan="8" style={{ textAlign: 'center', padding: 30, color: '#64748b' }}>
                  Cargando nómina de auxiliares...
                </td>
              </tr>
            ) : auxiliares.length === 0 ? (
              <tr>
                <td colSpan="8" style={{ textAlign: 'center', padding: 36, color: '#64748b' }}>
                  No se encontraron auxiliares registrados en {gestion} ({semestre}).
                </td>
              </tr>
            ) : (
              auxiliares.map((aux) => {
                const notaNum = parseFloat(aux.nota_examen) || null;
                const auxId = aux.id_auxiliar;
                return (
                  <tr key={auxId}>
                    <td>
                      <div style={{ fontWeight: 700, color: '#0f172a' }}>{aux.materia}</div>
                      <span className="sub-text">{aux.semestre} · {aux.gestion}</span>
                    </td>
                    <td>
                      <div style={{ fontWeight: 700, color: '#1e293b' }}>
                        {aux.nombre_estudiante}
                      </div>
                      {aux.observaciones && (
                        <span className="sub-text" style={{ fontStyle: 'italic' }}>
                          {aux.observaciones}
                        </span>
                      )}
                    </td>
                    <td>
                      <div style={{ fontWeight: 700, color: '#0284c7' }}>
                        Reg: {aux.registro_estudiante}
                      </div>
                      <span className="sub-text">CI: {aux.ci_estudiante}</span>
                    </td>
                    <td>
                      <span className={`badge-designacion ${aux.tipo_designacion === 'Ratificación' ? 'ratificado' : 'concurso'}`}>
                        {aux.tipo_designacion}
                      </span>
                      <span className="sub-text">
                        {aux.resolucion_consejo || aux.numero_oficio_propuesta || 'En trámite de consejo'}
                      </span>
                    </td>
                    <td>
                      {notaNum !== null ? (
                        <span className={`nota-badge ${notaNum >= 90 ? 'alta' : 'regular'}`}>
                          {notaNum.toFixed(1)} / 100
                        </span>
                      ) : (
                        <span style={{ color: '#94a3b8' }}>—</span>
                      )}
                    </td>
                    <td>
                      <span className={`badge-estado-aux ${aux.estado.toLowerCase()}`}>
                        {aux.estado}
                      </span>
                    </td>
                    <td>
                      {aux.ruta_archivo ? (
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button
                            type="button"
                            className="btn-file-icon"
                            title="Ver documento"
                            onClick={() =>
                              setVisorDoc({
                                endpoint: `/auxiliares/${auxId}/archivo`,
                                titulo: `Auxiliatura ${aux.materia} · ${aux.nombre_estudiante}`,
                                nombreOriginal: `Auxiliar_${aux.registro_estudiante}.pdf`,
                              })
                            }
                          >
                            👁️ Ver
                          </button>
                          <button
                            type="button"
                            className="btn-file-icon"
                            title="Descargar respaldo"
                            onClick={() => handleDescargar(auxId, aux.registro_estudiante)}
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
                        {puedeEscribir && aux.estado === 'Activo' && (
                          <button
                            type="button"
                            className="btn-ratificar-pill"
                            title="Ratificar para siguiente semestre"
                            onClick={() => handleRatificar(auxId)}
                          >
                            ✓ Ratificar
                          </button>
                        )}
                        {puedeEscribir && (
                          <>
                            <button
                              type="button"
                              className="btn-table-action btn-edit"
                              onClick={() => setEditandoAux({ ...aux })}
                              title="Editar datos de este auxiliar"
                            >
                              ✏️
                            </button>
                            <button
                              type="button"
                              className="btn-table-action btn-delete"
                              onClick={() => handleEliminar(auxId, aux.nombre_estudiante, aux.materia)}
                              title="Eliminar este auxiliar permanentemente"
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
          onDescargar={() => handleDescargar(visorDoc.endpoint.split('/')[2], 'auxiliar')}
        />
      )}

      {/* Modal: Editar Auxiliar */}
      {editandoAux && (
        <div className="modal-backdrop" onClick={() => setEditandoAux(null)}>
          <div className="modal-card modal-lg" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>✏️ Modificar Auxiliar de Cátedra ({editandoAux.nombre_estudiante})</h3>
              <button
                type="button"
                className="btn-close-modal"
                onClick={() => setEditandoAux(null)}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleGuardarEdicion}>
              <div className="modal-body modal-form-grid">
                <div className="form-group full">
                  <label>Materia / Asignatura *</label>
                  <input
                    type="text"
                    className="form-control"
                    value={editandoAux.materia || ''}
                    onChange={(e) => setEditandoAux({ ...editandoAux, materia: e.target.value })}
                    required
                  />
                </div>

                <div className="form-group full">
                  <label>Nombre del Auxiliar *</label>
                  <input
                    type="text"
                    className="form-control"
                    value={editandoAux.nombre_estudiante || ''}
                    onChange={(e) => setEditandoAux({ ...editandoAux, nombre_estudiante: e.target.value })}
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Registro Universitario *</label>
                  <input
                    type="text"
                    className="form-control"
                    value={editandoAux.registro_estudiante || ''}
                    onChange={(e) => setEditandoAux({ ...editandoAux, registro_estudiante: e.target.value })}
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Cédula de Identidad (CI)</label>
                  <input
                    type="text"
                    className="form-control"
                    value={editandoAux.ci_estudiante || ''}
                    onChange={(e) => setEditandoAux({ ...editandoAux, ci_estudiante: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label>Tipo de Designación</label>
                  <select
                    className="form-control"
                    value={editandoAux.tipo_designacion}
                    onChange={(e) => setEditandoAux({ ...editandoAux, tipo_designacion: e.target.value })}
                  >
                    <option value="Convocatoria">Convocatoria (Concurso y examen)</option>
                    <option value="Ratificación">Ratificación (2do Semestre)</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Nota de Examen / Concurso</label>
                  <input
                    type="number"
                    step="0.01"
                    min="51"
                    max="100"
                    className="form-control"
                    value={editandoAux.nota_examen || ''}
                    onChange={(e) => setEditandoAux({ ...editandoAux, nota_examen: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label>Estado</label>
                  <select
                    className="form-control"
                    value={editandoAux.estado}
                    onChange={(e) => setEditandoAux({ ...editandoAux, estado: e.target.value })}
                  >
                    <option value="Activo">Activo</option>
                    <option value="Ratificado">Ratificado</option>
                    <option value="Finalizado">Finalizado</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>N° Oficio Propuesta</label>
                  <input
                    type="text"
                    className="form-control"
                    value={editandoAux.numero_oficio_propuesta || ''}
                    onChange={(e) => setEditandoAux({ ...editandoAux, numero_oficio_propuesta: e.target.value })}
                  />
                </div>

                <div className="form-group full">
                  <label>Observaciones</label>
                  <textarea
                    className="form-control"
                    rows="2"
                    value={editandoAux.observaciones || ''}
                    onChange={(e) => setEditandoAux({ ...editandoAux, observaciones: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '16px 24px', borderTop: '1px solid #e2e8f0' }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setEditandoAux(null)}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  style={{ background: '#059669' }}
                >
                  Guardar Cambios
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Registrar Auxiliar */}
      {modalNuevo && (
        <div className="modal-backdrop" onClick={() => setModalNuevo(false)}>
          <div className="modal-card modal-lg" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>👥 Registrar Auxiliar de Cátedra</h3>
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
                  <label>Semestre Académico *</label>
                  <select
                    className="form-control"
                    value={form.semestre}
                    onChange={(e) => setForm({ ...form, semestre: e.target.value })}
                  >
                    <option value="1er Semestre">1er Semestre</option>
                    <option value="2do Semestre">2do Semestre</option>
                  </select>
                </div>

                <div className="form-group full">
                  <label>Materia / Asignatura Asignada *</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Ej. Cálculo I / Estructuras Discretas / Programación I"
                    value={form.materia}
                    onChange={(e) => setForm({ ...form, materia: e.target.value })}
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Registro Universitario *</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Ej. 220194832"
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
                    placeholder="Ej. 9845211 SC"
                    value={form.ci_estudiante}
                    onChange={(e) => setForm({ ...form, ci_estudiante: e.target.value })}
                    required
                  />
                </div>

                <div className="form-group full">
                  <label>Nombre Completo del Auxiliar *</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Ej. Univ. Victor Daniel Guayao Medina"
                    value={form.nombre_estudiante}
                    onChange={(e) => setForm({ ...form, nombre_estudiante: e.target.value })}
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Tipo de Designación *</label>
                  <select
                    className="form-control"
                    value={form.tipo_designacion}
                    onChange={(e) => setForm({ ...form, tipo_designacion: e.target.value })}
                  >
                    <option value="Convocatoria">Convocatoria (Concurso de méritos y examen)</option>
                    <option value="Ratificación">Ratificación (2do Semestre)</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Nota de Examen / Concurso (sobre 100)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="51"
                    max="100"
                    className="form-control"
                    placeholder="Ej. 92.00"
                    value={form.nota_examen}
                    onChange={(e) => setForm({ ...form, nota_examen: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label>N° Oficio Propuesta Dirección</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Ej. OF-2026-0098"
                    value={form.numero_oficio_propuesta}
                    onChange={(e) => setForm({ ...form, numero_oficio_propuesta: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label>Resolución de Consejo de Carrera</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Ej. RES-CC-014/2026"
                    value={form.resolucion_consejo}
                    onChange={(e) => setForm({ ...form, resolucion_consejo: e.target.value })}
                  />
                </div>

                <div className="form-group full">
                  <label>Observaciones</label>
                  <textarea
                    className="form-control"
                    rows="2"
                    placeholder="Detalles sobre grupo horario, cumplimiento de requisitos..."
                    value={form.observaciones}
                    onChange={(e) => setForm({ ...form, observaciones: e.target.value })}
                  />
                </div>

                <div className="form-group full">
                  <label>Respaldo Digital (Convocatoria / Nota / Resolución) en PDF</label>
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
                  style={{ background: '#059669' }}
                  disabled={subiendo}
                >
                  {subiendo ? 'Registrando...' : 'Guardar Auxiliar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
