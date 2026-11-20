import { useState, useEffect, useCallback } from 'react';
import { apiFetch, fetchBlobUrl } from '../api.js';
import ModalVisor from './ModalVisor.jsx';

export default function PlantelDocente({ user }) {
  const [docentes, setDocentes] = useState([]);
  const [stats, setStats] = useState({
    total_docentes: 0,
    con_informe: 0,
    sin_informe: 0,
  });
  const [gestion, setGestion] = useState(new Date().getFullYear());
  const [semestre, setSemestre] = useState('2do Semestre');
  const [filtroInforme, setFiltroInforme] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [cargando, setCargando] = useState(false);

  // Modales
  const [modalNuevo, setModalNuevo] = useState(false);
  const [modalSubir, setModalSubir] = useState({ abierto: false, id_docente: null, nombre: '', tipo: 'informe' });
  const [visorDoc, setVisorDoc] = useState(null);
  const [editandoDocente, setEditandoDocente] = useState(null);
  const [subiendo, setSubiendo] = useState(false);
  const [msg, setMsg] = useState({ tipo: '', texto: '' });

  const [form, setForm] = useState({
    nombre_completo: '',
    ci: '',
    correo: '',
    telefono: '',
    materias_asignadas: '',
    gestion: new Date().getFullYear(),
    semestre: '2do Semestre',
    informe_presentado: false,
    observaciones: '',
  });

  const [archivoASubir, setArchivoASubir] = useState(null);

  const puedeEscribir = user?.rol === 'Administrador' || user?.rol === 'Secretaria';

  const cargarDatos = useCallback(async () => {
    setCargando(true);
    try {
      const params = new URLSearchParams();
      if (gestion) params.set('gestion', String(gestion));
      if (semestre) params.set('semestre', semestre);
      if (filtroInforme === 'con') params.set('informe', 'true');
      if (filtroInforme === 'sin') params.set('informe', 'false');
      if (busqueda.trim()) params.set('q', busqueda.trim());

      const res = await apiFetch(`/docentes?${params.toString()}`);
      setDocentes(res.data || []);
      setStats({
        total_docentes: Number(res.stats?.total_docentes) || 0,
        con_informe: Number(res.stats?.con_informe) || 0,
        sin_informe: Number(res.stats?.sin_informe) || 0,
      });
    } catch (err) {
      console.error(err);
    } finally {
      setCargando(false);
    }
  }, [gestion, semestre, filtroInforme, busqueda]);

  useEffect(() => {
    cargarDatos();
  }, [cargarDatos]);

  async function handleToggleInforme(id, actual) {
    if (!puedeEscribir) return;
    try {
      await apiFetch(`/docentes/${id}/informe`, {
        method: 'PATCH',
        body: JSON.stringify({ presentado: !actual }),
      });
      await cargarDatos();
    } catch (err) {
      alert(err.message);
    }
  }

  async function handleDescargarArchivo(id, tipo, nombreDocente) {
    try {
      const blob = await fetchBlobUrl(`/docentes/${id}/archivo/${tipo}`, false);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${tipo.toUpperCase()}_${nombreDocente.replace(/\s+/g, '_')}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(err.message);
    }
  }

  async function handleEliminarDocente(id, nombre) {
    if (!window.confirm(`¿Estás seguro de que deseas ELIMINAR al docente ${nombre} y todos sus archivos digitales del sistema? Esta acción no se puede deshacer.`)) {
      return;
    }
    try {
      await apiFetch(`/docentes/${id}`, { method: 'DELETE' });
      await cargarDatos();
    } catch (err) {
      alert(err.message);
    }
  }

  async function handleGuardarEdicion(e) {
    e.preventDefault();
    if (!editandoDocente) return;
    try {
      await apiFetch(`/docentes/${editandoDocente.id_docente}`, {
        method: 'PUT',
        body: JSON.stringify(editandoDocente),
      });
      setEditandoDocente(null);
      await cargarDatos();
    } catch (err) {
      alert(err.message);
    }
  }

  async function handleSubmitNuevoDocente(e) {
    e.preventDefault();
    setMsg({ tipo: '', texto: '' });
    if (!form.nombre_completo || !form.materias_asignadas) {
      setMsg({ tipo: 'error', texto: 'Nombre completo y materias asignadas son obligatorios.' });
      return;
    }
    setSubiendo(true);
    try {
      await apiFetch('/docentes', {
        method: 'POST',
        body: JSON.stringify(form),
      });

      setMsg({ tipo: 'ok', texto: `Docente ${form.nombre_completo} registrado en el plantel.` });
      setForm({
        nombre_completo: '',
        ci: '',
        correo: '',
        telefono: '',
        materias_asignadas: '',
        gestion: new Date().getFullYear(),
        semestre: '2do Semestre',
        informe_presentado: false,
        observaciones: '',
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

  async function handleSubmitSubirArchivo(e) {
    e.preventDefault();
    if (!archivoASubir) {
      alert('Selecciona un archivo PDF o digital.');
      return;
    }
    setSubiendo(true);
    try {
      const fd = new FormData();
      fd.append('archivo', archivoASubir);

      await apiFetch(`/docentes/${modalSubir.id_docente}/subir/${modalSubir.tipo}`, {
        method: 'POST',
        body: fd,
      });

      setModalSubir({ abierto: false, id_docente: null, nombre: '', tipo: 'informe' });
      setArchivoASubir(null);
      await cargarDatos();
    } catch (err) {
      alert(err.message);
    } finally {
      setSubiendo(false);
    }
  }

  return (
    <div className="module-container">
      {/* Encabezado */}
      <div className="module-header-box">
        <div className="module-header-info">
          <div className="module-icon-wrap" style={{ background: '#b91c1c' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          </div>
          <div>
            <h2 className="module-title">Plantel Docente (Files Digitales de Cátedra)</h2>
            <p className="module-desc">
              Control institucional de files docentes por semestre: <strong>Currículum Vitae</strong>, 
              <strong> Programa Analítico</strong>, y al finalizar clases: <strong>Informe Final de Cátedra</strong> 
              junto con la <strong>Lista de Asistencia</strong> para habilitación.
            </p>
          </div>
        </div>
        {puedeEscribir && (
          <button
            type="button"
            className="btn-action-primary"
            style={{ background: '#b91c1c' }}
            onClick={() => setModalNuevo(true)}
          >
            + Registrar Docente
          </button>
        )}
      </div>

      {/* Tarjetas KPI */}
      <div className="module-kpi-grid">
        <div className="module-kpi-card">
          <div className="kpi-val" style={{ color: '#0f172a' }}>{stats.total_docentes}</div>
          <div className="kpi-lbl">Total Docentes Activos ({gestion})</div>
        </div>
        <div className="module-kpi-card">
          <div className="kpi-val" style={{ color: '#15803d' }}>
            ✓ {stats.con_informe}
          </div>
          <div className="kpi-lbl">Informes Finales Entregados</div>
        </div>
        <div className="module-kpi-card">
          <div className="kpi-val" style={{ color: '#b91c1c' }}>
            ⏳ {stats.sin_informe}
          </div>
          <div className="kpi-lbl">Pendientes de Informe Final</div>
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
            value={filtroInforme}
            onChange={(e) => setFiltroInforme(e.target.value)}
          >
            <option value="">Informe Final: Todos</option>
            <option value="con">✓ Con Informe Presentado</option>
            <option value="sin">⏳ Pendientes de Informe</option>
          </select>

          <input
            type="search"
            className="pill-input"
            placeholder="Buscar por docente, materia o C.I..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </div>
        <div className="filters-right">
          <span>{docentes.length} docentes en nómina</span>
        </div>
      </div>

      {/* Lista de Files Docentes */}
      <div className="docentes-cards-grid">
        {cargando ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#64748b', gridColumn: '1 / -1' }}>
            Cargando expedientes de docentes...
          </div>
        ) : docentes.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#64748b', gridColumn: '1 / -1' }}>
            No se encontraron docentes registrados para este periodo.
          </div>
        ) : (
          docentes.map((doc) => (
            <div key={doc.id_docente} className="docente-file-card">
              <div className="docente-card-header">
                <div>
                  <h3 className="docente-name">{doc.nombre_completo}</h3>
                  <div className="docente-meta">
                    {doc.ci ? `CI: ${doc.ci} · ` : ''}
                    {doc.correo ? `${doc.correo} · ` : ''}
                    {doc.telefono ? `Tel: ${doc.telefono}` : ''}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div
                    className={`docente-status-badge ${doc.informe_presentado ? 'entregado' : 'pendiente'}`}
                    onClick={() => handleToggleInforme(doc.id_docente, doc.informe_presentado)}
                    title={puedeEscribir ? 'Clic para alternar estado de informe final' : ''}
                    style={{ cursor: puedeEscribir ? 'pointer' : 'default' }}
                  >
                    {doc.informe_presentado ? '✓ Informe Final Entregado' : '⏳ Informe Pendiente'}
                  </div>
                  {puedeEscribir && (
                    <>
                      <button
                        type="button"
                        className="btn-table-action btn-edit"
                        onClick={() => setEditandoDocente({ ...doc })}
                        title="Editar datos del docente"
                      >
                        ✏️
                      </button>
                      <button
                        type="button"
                        className="btn-table-action btn-delete"
                        onClick={() => handleEliminarDocente(doc.id_docente, doc.nombre_completo)}
                        title="Eliminar este docente"
                      >
                        🗑️
                      </button>
                    </>
                  )}
                </div>
              </div>

              <div className="docente-materias-box">
                <span className="materias-label">Materias Asignadas:</span>
                <span className="materias-text">{doc.materias_asignadas}</span>
              </div>

              {/* Los 4 Documentos Clave de Dirección */}
              <div className="docente-docs-shelf">
                {/* 1. CV */}
                <div className={`doc-item ${doc.cv_ruta ? 'cargado' : 'vacio'}`}>
                  <div className="doc-item-title">
                    <span>📄 Currículum Vitae (CV)</span>
                    {doc.cv_ruta ? <span className="check-ok">✓</span> : <span className="alert-faltante">!</span>}
                  </div>
                  <div className="doc-item-actions">
                    {doc.cv_ruta ? (
                      <>
                        <button
                          type="button"
                          className="btn-mini"
                          onClick={() =>
                            setVisorDoc({
                              endpoint: `/docentes/${doc.id_docente}/archivo/cv`,
                              titulo: `CV · ${doc.nombre_completo}`,
                              nombreOriginal: `CV_${doc.nombre_completo}.pdf`,
                            })
                          }
                        >
                          Ver
                        </button>
                        <button type="button" className="btn-mini" onClick={() => handleDescargarArchivo(doc.id_docente, 'cv', doc.nombre_completo)}>
                          ⬇
                        </button>
                        {puedeEscribir && (
                          <button
                            type="button"
                            className="btn-mini-subir"
                            onClick={() => setModalSubir({ abierto: true, id_docente: doc.id_docente, nombre: doc.nombre_completo, tipo: 'cv' })}
                          >
                            🔄
                          </button>
                        )}
                      </>
                    ) : puedeEscribir ? (
                      <button
                        type="button"
                        className="btn-mini-subir"
                        onClick={() => setModalSubir({ abierto: true, id_docente: doc.id_docente, nombre: doc.nombre_completo, tipo: 'cv' })}
                      >
                        + Subir CV
                      </button>
                    ) : (
                      <span className="sin-doc">Sin subir</span>
                    )}
                  </div>
                </div>

                {/* 2. Programa Analítico */}
                <div className={`doc-item ${doc.programa_analitico_ruta ? 'cargado' : 'vacio'}`}>
                  <div className="doc-item-title">
                    <span>📑 Programa Analítico</span>
                    {doc.programa_analitico_ruta ? <span className="check-ok">✓</span> : <span className="alert-faltante">!</span>}
                  </div>
                  <div className="doc-item-actions">
                    {doc.programa_analitico_ruta ? (
                      <>
                        <button
                          type="button"
                          className="btn-mini"
                          onClick={() =>
                            setVisorDoc({
                              endpoint: `/docentes/${doc.id_docente}/archivo/programa`,
                              titulo: `Programa Analítico · ${doc.nombre_completo}`,
                              nombreOriginal: `Programa_${doc.nombre_completo}.pdf`,
                            })
                          }
                        >
                          Ver
                        </button>
                        <button type="button" className="btn-mini" onClick={() => handleDescargarArchivo(doc.id_docente, 'programa', doc.nombre_completo)}>
                          ⬇
                        </button>
                        {puedeEscribir && (
                          <button
                            type="button"
                            className="btn-mini-subir"
                            onClick={() => setModalSubir({ abierto: true, id_docente: doc.id_docente, nombre: doc.nombre_completo, tipo: 'programa' })}
                          >
                            🔄
                          </button>
                        )}
                      </>
                    ) : puedeEscribir ? (
                      <button
                        type="button"
                        className="btn-mini-subir"
                        onClick={() => setModalSubir({ abierto: true, id_docente: doc.id_docente, nombre: doc.nombre_completo, tipo: 'programa' })}
                      >
                        + Subir Programa
                      </button>
                    ) : (
                      <span className="sin-doc">Sin subir</span>
                    )}
                  </div>
                </div>

                {/* 3. Informe Final de Cátedra */}
                <div className={`doc-item ${doc.informe_final_ruta ? 'cargado' : 'vacio'}`}>
                  <div className="doc-item-title">
                    <span>📊 Informe Final Cátedra</span>
                    {doc.informe_final_ruta ? <span className="check-ok">✓</span> : <span className="alert-faltante">!</span>}
                  </div>
                  <div className="doc-item-actions">
                    {doc.informe_final_ruta ? (
                      <>
                        <button
                          type="button"
                          className="btn-mini"
                          onClick={() =>
                            setVisorDoc({
                              endpoint: `/docentes/${doc.id_docente}/archivo/informe`,
                              titulo: `Informe Final Cátedra · ${doc.nombre_completo}`,
                              nombreOriginal: `Informe_${doc.nombre_completo}.pdf`,
                            })
                          }
                        >
                          Ver
                        </button>
                        <button type="button" className="btn-mini" onClick={() => handleDescargarArchivo(doc.id_docente, 'informe', doc.nombre_completo)}>
                          ⬇
                        </button>
                        {puedeEscribir && (
                          <button
                            type="button"
                            className="btn-mini-subir"
                            onClick={() => setModalSubir({ abierto: true, id_docente: doc.id_docente, nombre: doc.nombre_completo, tipo: 'informe' })}
                          >
                            🔄
                          </button>
                        )}
                      </>
                    ) : puedeEscribir ? (
                      <button
                        type="button"
                        className="btn-mini-subir"
                        onClick={() => setModalSubir({ abierto: true, id_docente: doc.id_docente, nombre: doc.nombre_completo, tipo: 'informe' })}
                      >
                        + Subir Informe
                      </button>
                    ) : (
                      <span className="sin-doc">Sin subir</span>
                    )}
                  </div>
                </div>

                {/* 4. Lista de Asistencia */}
                <div className={`doc-item ${doc.lista_asistencia_ruta ? 'cargado' : 'vacio'}`}>
                  <div className="doc-item-title">
                    <span>📝 Lista de Asistencia</span>
                    {doc.lista_asistencia_ruta ? <span className="check-ok">✓</span> : <span className="alert-faltante">!</span>}
                  </div>
                  <div className="doc-item-actions">
                    {doc.lista_asistencia_ruta ? (
                      <>
                        <button
                          type="button"
                          className="btn-mini"
                          onClick={() =>
                            setVisorDoc({
                              endpoint: `/docentes/${doc.id_docente}/archivo/asistencia`,
                              titulo: `Lista de Asistencia · ${doc.nombre_completo}`,
                              nombreOriginal: `Asistencia_${doc.nombre_completo}.pdf`,
                            })
                          }
                        >
                          Ver
                        </button>
                        <button type="button" className="btn-mini" onClick={() => handleDescargarArchivo(doc.id_docente, 'asistencia', doc.nombre_completo)}>
                          ⬇
                        </button>
                        {puedeEscribir && (
                          <button
                            type="button"
                            className="btn-mini-subir"
                            onClick={() => setModalSubir({ abierto: true, id_docente: doc.id_docente, nombre: doc.nombre_completo, tipo: 'asistencia' })}
                          >
                            🔄
                          </button>
                        )}
                      </>
                    ) : puedeEscribir ? (
                      <button
                        type="button"
                        className="btn-mini-subir"
                        onClick={() => setModalSubir({ abierto: true, id_docente: doc.id_docente, nombre: doc.nombre_completo, tipo: 'asistencia' })}
                      >
                        + Subir Lista
                      </button>
                    ) : (
                      <span className="sin-doc">Sin subir</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Modal Visor de Documento */}
      {visorDoc && (
        <ModalVisor
          endpoint={visorDoc.endpoint}
          titulo={visorDoc.titulo}
          onClose={() => setVisorDoc(null)}
          onDescargar={() => handleDescargarArchivo(visorDoc.endpoint.split('/')[2], visorDoc.endpoint.split('/')[4], visorDoc.titulo)}
        />
      )}

      {/* Modal: Editar Docente */}
      {editandoDocente && (
        <div className="modal-backdrop" onClick={() => setEditandoDocente(null)}>
          <div className="modal-card modal-lg" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>✏️ Modificar Docente ({editandoDocente.nombre_completo})</h3>
              <button
                type="button"
                className="btn-close-modal"
                onClick={() => setEditandoDocente(null)}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleGuardarEdicion}>
              <div className="modal-body modal-form-grid">
                <div className="form-group full">
                  <label>Nombre y Apellidos del Docente *</label>
                  <input
                    type="text"
                    className="form-control"
                    value={editandoDocente.nombre_completo || ''}
                    onChange={(e) => setEditandoDocente({ ...editandoDocente, nombre_completo: e.target.value })}
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Cédula de Identidad (CI)</label>
                  <input
                    type="text"
                    className="form-control"
                    value={editandoDocente.ci || ''}
                    onChange={(e) => setEditandoDocente({ ...editandoDocente, ci: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label>Teléfono de Contacto</label>
                  <input
                    type="text"
                    className="form-control"
                    value={editandoDocente.telefono || ''}
                    onChange={(e) => setEditandoDocente({ ...editandoDocente, telefono: e.target.value })}
                  />
                </div>

                <div className="form-group full">
                  <label>Correo Electrónico</label>
                  <input
                    type="email"
                    className="form-control"
                    value={editandoDocente.correo || ''}
                    onChange={(e) => setEditandoDocente({ ...editandoDocente, correo: e.target.value })}
                  />
                </div>

                <div className="form-group full">
                  <label>Materias Asignadas *</label>
                  <input
                    type="text"
                    className="form-control"
                    value={editandoDocente.materias_asignadas || ''}
                    onChange={(e) => setEditandoDocente({ ...editandoDocente, materias_asignadas: e.target.value })}
                    required
                  />
                </div>

                <div className="form-group full">
                  <label>Observaciones del Archivo</label>
                  <textarea
                    className="form-control"
                    rows="2"
                    value={editandoDocente.observaciones || ''}
                    onChange={(e) => setEditandoDocente({ ...editandoDocente, observaciones: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '16px 24px', borderTop: '1px solid #e2e8f0' }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setEditandoDocente(null)}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  style={{ background: '#b91c1c' }}
                >
                  Guardar Cambios
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Registrar Nuevo Docente */}
      {modalNuevo && (
        <div className="modal-backdrop" onClick={() => setModalNuevo(false)}>
          <div className="modal-card modal-lg" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>👨‍🏫 Registrar Nuevo Docente en Plantel</h3>
              <button
                type="button"
                className="btn-close-modal"
                onClick={() => setModalNuevo(false)}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmitNuevoDocente}>
              <div className="modal-body modal-form-grid">
                {msg.texto && (
                  <div className={`form-alert ${msg.tipo}`}>
                    {msg.texto}
                  </div>
                )}

                <div className="form-group full">
                  <label>Nombre y Apellidos del Docente (con grado) *</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Ej. Ing. Wilson Balcazar / Lic. Carmen Rosa Aguilera"
                    value={form.nombre_completo}
                    onChange={(e) => setForm({ ...form, nombre_completo: e.target.value })}
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Cédula de Identidad (CI)</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Ej. 4581290 SC"
                    value={form.ci}
                    onChange={(e) => setForm({ ...form, ci: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label>Teléfono / Celular de Contacto</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Ej. 78451290"
                    value={form.telefono}
                    onChange={(e) => setForm({ ...form, telefono: e.target.value })}
                  />
                </div>

                <div className="form-group full">
                  <label>Correo Electrónico Institucional</label>
                  <input
                    type="email"
                    className="form-control"
                    placeholder="docente@uagrm.edu.bo"
                    value={form.correo}
                    onChange={(e) => setForm({ ...form, correo: e.target.value })}
                  />
                </div>

                <div className="form-group full">
                  <label>Materias Asignadas *</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Ej. Base de Datos I, Programación Web, Redes I"
                    value={form.materias_asignadas}
                    onChange={(e) => setForm({ ...form, materias_asignadas: e.target.value })}
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
                  <label>Semestre *</label>
                  <select
                    className="form-control"
                    value={form.semestre}
                    onChange={(e) => setForm({ ...form, semestre: e.target.value })}
                  >
                    <option value="2do Semestre">2do Semestre</option>
                    <option value="1er Semestre">1er Semestre</option>
                  </select>
                </div>

                <div className="form-group full">
                  <label>Observaciones del Expediente</label>
                  <textarea
                    className="form-control"
                    rows="2"
                    placeholder="Detalles sobre carga horaria, turno o resoluciones..."
                    value={form.observaciones}
                    onChange={(e) => setForm({ ...form, observaciones: e.target.value })}
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
                  style={{ background: '#b91c1c' }}
                  disabled={subiendo}
                >
                  {subiendo ? 'Registrando docente...' : 'Guardar Docente'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Subir Archivo a Slot del Docente */}
      {modalSubir.abierto && (
        <div className="modal-backdrop" onClick={() => setModalSubir({ abierto: false, id_docente: null, nombre: '', tipo: 'informe' })}>
          <div className="modal-card modal-md" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>
                📎 Adjuntar {modalSubir.tipo === 'cv' ? 'Currículum Vitae' : modalSubir.tipo === 'programa' ? 'Programa Analítico' : modalSubir.tipo === 'informe' ? 'Informe Final de Cátedra' : 'Lista de Asistencia'}
              </h3>
              <button
                type="button"
                className="btn-close-modal"
                onClick={() => setModalSubir({ abierto: false, id_docente: null, nombre: '', tipo: 'informe' })}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmitSubirArchivo}>
              <div className="modal-body modal-form-grid">
                <div className="form-group full">
                  <label>Docente</label>
                  <input
                    type="text"
                    className="form-control"
                    value={modalSubir.nombre}
                    readOnly
                    style={{ backgroundColor: '#f1f5f9', fontWeight: 700 }}
                  />
                </div>

                <div className="form-group full">
                  <label>Tipo de Documento a Cargar</label>
                  <select
                    className="form-control"
                    value={modalSubir.tipo}
                    onChange={(e) => setModalSubir({ ...modalSubir, tipo: e.target.value })}
                  >
                    <option value="cv">Currículum Vitae (CV)</option>
                    <option value="programa">Programa Analítico</option>
                    <option value="informe">Informe Final de Cátedra (Marca entrega automática)</option>
                    <option value="asistencia">Lista de Asistencia de Alumnos</option>
                  </select>
                </div>

                <div className="form-group full">
                  <label>Selecciona el Archivo Escaneado (PDF o Imagen) *</label>
                  <input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,.tif,.tiff"
                    className="form-control"
                    onChange={(e) => setArchivoASubir(e.target.files?.[0] || null)}
                    required
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '16px 24px', borderTop: '1px solid #e2e8f0' }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setModalSubir({ abierto: false, id_docente: null, nombre: '', tipo: 'informe' })}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  style={{ background: '#b91c1c' }}
                  disabled={subiendo}
                >
                  {subiendo ? 'Subiendo archivo...' : 'Cargar y Guardar en File'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
