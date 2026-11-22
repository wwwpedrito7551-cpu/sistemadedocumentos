import { useState, useEffect, useCallback } from 'react';
import {
  apiFetch,
  getStoredUser,
  saveSession,
  clearSession,
} from './api.js';
import ModalVisor from './components/ModalVisor.jsx';
import './App.css';

const TIPOS_DOCUMENTO = ['Carta', 'Solicitud', 'Informe', 'Memorandum', 'Otro'];

function formatearFechaCorta(fechaStr) {
  if (!fechaStr) return '—';
  const d = new Date(fechaStr);
  if (Number.isNaN(d.getTime())) return String(fechaStr).slice(0, 10);
  const dia = String(d.getDate()).padStart(2, '0');
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const anio = d.getFullYear();
  return `${dia}/${mes}/${anio}`;
}

function calcularEstadoPlazo(fechaVencimiento, estadoDoc) {
  if (estadoDoc === 'Respondido' || estadoDoc === 'Archivado') {
    return { clase: 'en-plazo', texto: 'Atendido', icono: '✓' };
  }
  if (!fechaVencimiento) {
    return { clase: 'en-plazo', texto: 'Sin límite', icono: '●' };
  }
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const venc = new Date(String(fechaVencimiento).slice(0, 10) + 'T00:00:00');
  const diffDias = Math.ceil((venc - hoy) / (1000 * 60 * 60 * 24));
  if (diffDias < 0) {
    return { clase: 'expirado', texto: 'Vencido', icono: '🚨' };
  }
  if (diffDias <= 3) {
    return { clase: 'por-vencer', texto: 'Por vencer', icono: '⏳' };
  }
  return { clase: 'en-plazo', texto: 'En plazo', icono: '🟢' };
}

export default function App() {
  const [user, setUser] = useState(() => getStoredUser());
  const [vistaActiva, setVistaActiva] = useState('bandeja');
  const [menuColapsado, setMenuColapsado] = useState(false);

  // Estados de métricas y datos
  const [resumen, setResumen] = useState({
    total_documentos: 0,
    pendientes: 0,
    respondidos: 0,
    archivados: 0,
    vencidos: 0,
    por_vencer: 0,
  });
  const [categorias, setCategorias] = useState([]);
  const [documentos, setDocumentos] = useState([]);
  const [notificaciones, setNotificaciones] = useState([]);
  const [cargando, setCargando] = useState(false);

  // Filtros de Bandeja
  const [filtroBusqueda, setFiltroBusqueda] = useState('');
  const [filtroCategoria, setFiltroCategoria] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('');

  // Sub-filtro para la Vista de Control de Estados ('Pendiente' | 'Respondido' | 'Archivado')
  const [tabEstadoControl, setTabEstadoControl] = useState('Pendiente');

  // Filtro de Alertas ('todas' | 'vencidos' | 'por_vencer')
  const [filtroAlertas, setFiltroAlertas] = useState('todas');

  // Modales
  const [visorDoc, setVisorDoc] = useState(null); // { id, titulo }
  const [detalleDoc, setDetalleDoc] = useState(null);
  const [editandoDoc, setEditandoDoc] = useState(null);
  const [editandoCategoria, setEditandoCategoria] = useState(null);

  // Login
  const [loginUser, setLoginUser] = useState('');
  const [loginPass, setLoginPass] = useState('');
  const [mostrarPass, setMostrarPass] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  // Formulario Recepción y Digitalización
  const [recepcionForm, setRecepcionForm] = useState({
    numero_recepcion: 'REC-0001',
    fecha_recepcion: new Date().toISOString().slice(0, 10),
    hora_recepcion: new Date().toTimeString().slice(0, 8),
    tipo_documento: 'Carta',
    id_categoria: '',
    remitente: '',
    destinatario: '',
    asunto: '',
    fecha_vencimiento: '',
    observaciones: '',
    cantidad_anexos: 0,
    archivo: null,
  });
  const [recepcionMsg, setRecepcionMsg] = useState({ tipo: '', texto: '' });
  const [subiendoDoc, setSubiendoDoc] = useState(false);

  // Formulario Nueva Categoría
  const [nuevaCat, setNuevaCat] = useState({ nombre: '', descripcion: '' });
  const [catMsg, setCatMsg] = useState('');

  const puedeEscribir = user?.rol === 'Administrador' || user?.rol === 'Secretaria';
  const esAdmin = user?.rol === 'Administrador';

  // Carga general de datos
  const cargarTodo = useCallback(async () => {
    if (!user) return;
    setCargando(true);
    try {
      const params = new URLSearchParams();
      if (filtroEstado) params.set('estado', filtroEstado);
      if (filtroCategoria) params.set('id_categoria', filtroCategoria);
      if (filtroBusqueda.trim()) params.set('q', filtroBusqueda.trim());
      params.set('limit', '100');

      const [resResumen, resCats, resDocs, resNotifs] = await Promise.all([
        apiFetch('/documentos/resumen'),
        apiFetch('/categorias'),
        apiFetch(`/documentos?${params.toString()}`),
        apiFetch('/notificaciones?limit=50'),
      ]);

      setResumen(resResumen);
      setCategorias(resCats || []);
      setDocumentos(resDocs.data || []);
      setNotificaciones(resNotifs || []);

      // Si no hay categoría asignada en el formulario de recepción, asignar la primera
      if (resCats?.length > 0 && !recepcionForm.id_categoria) {
        setRecepcionForm((prev) => ({
          ...prev,
          id_categoria: String(resCats[0].id_categoria),
        }));
      }
    } catch (err) {
      console.error('Error cargando datos:', err);
    } finally {
      setCargando(false);
    }
  }, [user, filtroEstado, filtroCategoria, filtroBusqueda, recepcionForm.id_categoria]);

  useEffect(() => {
    if (user) {
      cargarTodo();
    }
  }, [user, cargarTodo]);

  // Cargar número correlativo de recepción al abrir el formulario
  const refrescarProximoRecepcion = useCallback(async () => {
    try {
      const datos = await apiFetch('/documentos/proximo-recepcion');
      setRecepcionForm((prev) => ({
        ...prev,
        numero_recepcion: datos.proximo_numero_recepcion || 'REC-0001',
        fecha_recepcion: datos.fecha_actual || new Date().toISOString().slice(0, 10),
        hora_recepcion: datos.hora_actual || new Date().toTimeString().slice(0, 8),
      }));
    } catch (err) {
      console.warn('No se pudo obtener el próximo número de recepción:', err);
    }
  }, []);

  useEffect(() => {
    if (vistaActiva === 'recepcion') {
      refrescarProximoRecepcion();
    }
  }, [vistaActiva, refrescarProximoRecepcion]);

  // Login handler
  async function handleLogin(e) {
    e.preventDefault();
    setLoginError('');
    setLoginLoading(true);
    try {
      const data = await apiFetch('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ usuario: loginUser.trim(), contrasena: loginPass }),
      });
      saveSession(data.token, data.usuario);
      setUser(data.usuario);
      setVistaActiva('bandeja');
    } catch (err) {
      setLoginError(err.message || 'Credenciales incorrectas');
    } finally {
      setLoginLoading(false);
    }
  }

  function handleLogout() {
    clearSession();
    setUser(null);
  }

  // Auto-seleccionar categoría al cambiar el tipo de documento
  function handleCambioTipoDocumento(nuevoTipo) {
    let catCoincidente = null;
    const tipoLower = nuevoTipo.toLowerCase();
    if (tipoLower.includes('carta')) {
      catCoincidente = categorias.find((c) => c.nombre.toLowerCase().includes('carta'));
    } else if (tipoLower.includes('solicitud')) {
      catCoincidente = categorias.find((c) => c.nombre.toLowerCase().includes('solicitud'));
    } else if (tipoLower.includes('informe')) {
      catCoincidente = categorias.find((c) => c.nombre.toLowerCase().includes('informe'));
    } else if (tipoLower.includes('memo')) {
      catCoincidente = categorias.find((c) => c.nombre.toLowerCase().includes('memo'));
    }

    setRecepcionForm((prev) => ({
      ...prev,
      tipo_documento: nuevoTipo,
      id_categoria: catCoincidente ? String(catCoincidente.id_categoria) : prev.id_categoria,
    }));
  }

  // Guardar documento digitalizado
  async function handleCrearDocumento(e) {
    e.preventDefault();
    setRecepcionMsg({ tipo: '', texto: '' });
    if (!recepcionForm.archivo) {
      setRecepcionMsg({ tipo: 'error', texto: 'Por favor, adjunta el archivo digitalizado (PDF/DOC).' });
      return;
    }
    setSubiendoDoc(true);
    try {
      const fd = new FormData();
      fd.append('tipo_documento', recepcionForm.tipo_documento);
      fd.append('remitente', recepcionForm.remitente);
      fd.append('destinatario', recepcionForm.destinatario);
      fd.append('asunto', recepcionForm.asunto);
      fd.append('id_categoria', recepcionForm.id_categoria);
      fd.append('estado', 'Pendiente'); // Estado unificado inicial
      if (recepcionForm.fecha_vencimiento) {
        fd.append('fecha_vencimiento', recepcionForm.fecha_vencimiento);
      }
      fd.append('observaciones', recepcionForm.observaciones || '');
      fd.append('cantidad_anexos', String(recepcionForm.cantidad_anexos || 0));
      fd.append('archivo', recepcionForm.archivo);

      const creado = await apiFetch('/documentos', {
        method: 'POST',
        body: fd,
      });

      setRecepcionMsg({
        tipo: 'ok',
        texto: `Documento registrado con éxito: ${creado.numero_documento} (${creado.numero_recepcion})`,
      });

      // Limpiar formulario y cargar próximo número
      setRecepcionForm((prev) => ({
        ...prev,
        remitente: '',
        destinatario: '',
        asunto: '',
        fecha_vencimiento: '',
        observaciones: '',
        cantidad_anexos: 0,
        archivo: null,
      }));
      await cargarTodo();
      refrescarProximoRecepcion();
    } catch (err) {
      setRecepcionMsg({ tipo: 'error', texto: err.message });
    } finally {
      setSubiendoDoc(false);
    }
  }

  // Cambiar estado unificado (Pendiente -> Respondido -> Archivado)
  async function handleCambiarEstado(idDoc, nuevoEstado) {
    try {
      await apiFetch(`/documentos/${idDoc}/estado`, {
        method: 'PATCH',
        body: JSON.stringify({ estado: nuevoEstado }),
      });
      await cargarTodo();
      if (detalleDoc && detalleDoc.id_documento === idDoc) {
        const actualizado = await apiFetch(`/documentos/${idDoc}`);
        setDetalleDoc(actualizado);
      }
    } catch (err) {
      alert(`Error al cambiar estado: ${err.message}`);
    }
  }

  // Eliminar documento
  async function handleEliminarDoc(id, num) {
    if (!window.confirm(`¿Estás seguro de que deseas ELIMINAR el documento ${num || id}? Esta acción eliminará el registro y sus archivos asociados.`)) {
      return;
    }
    try {
      await apiFetch(`/documentos/${id}`, { method: 'DELETE' });
      if (detalleDoc?.id_documento === id) setDetalleDoc(null);
      await cargarTodo();
    } catch (err) {
      alert(`Error al eliminar documento: ${err.message}`);
    }
  }

  // Guardar edición de documento
  async function handleGuardarEdicionDoc(e) {
    e.preventDefault();
    if (!editandoDoc) return;
    try {
      await apiFetch(`/documentos/${editandoDoc.id_documento}`, {
        method: 'PUT',
        body: JSON.stringify(editandoDoc),
      });
      setEditandoDoc(null);
      await cargarTodo();
    } catch (err) {
      alert(`Error al actualizar documento: ${err.message}`);
    }
  }

  // Crear categoría
  async function handleCrearCategoria(e) {
    e.preventDefault();
    setCatMsg('');
    try {
      await apiFetch('/categorias', {
        method: 'POST',
        body: JSON.stringify(nuevaCat),
      });
      setNuevaCat({ nombre: '', descripcion: '' });
      setCatMsg('Carpeta física creada exitosamente en storage.');
      await cargarTodo();
    } catch (err) {
      setCatMsg(`Error: ${err.message}`);
    }
  }

  // Eliminar categoría
  async function handleEliminarCategoria(id, nombre) {
    if (!window.confirm(`¿Estás seguro de eliminar la carpeta/categoría "${nombre}"?`)) {
      return;
    }
    try {
      await apiFetch(`/categorias/${id}`, { method: 'DELETE' });
      await cargarTodo();
    } catch (err) {
      alert(err.message);
    }
  }

  // Guardar edición categoría
  async function handleGuardarEdicionCategoria(e) {
    e.preventDefault();
    if (!editandoCategoria) return;
    try {
      await apiFetch(`/categorias/${editandoCategoria.id_categoria}`, {
        method: 'PUT',
        body: JSON.stringify(editandoCategoria),
      });
      setEditandoCategoria(null);
      await cargarTodo();
    } catch (err) {
      alert(`Error al actualizar categoría: ${err.message}`);
    }
  }

  // Forzar chequeo de alertas
  async function handleGenerarAlertas() {
    try {
      const res = await apiFetch('/notificaciones/generar-alertas', { method: 'POST' });
      alert(res.mensaje || 'Chequeo de vencimientos ejecutado.');
      await cargarTodo();
    } catch (err) {
      alert(`Error: ${err.message}`);
    }
  }

  // Limpiar historial de notificaciones
  async function handleLimpiarNotificaciones() {
    if (!window.confirm('¿Deseas vaciar todo el historial de alertas y avisos?')) return;
    try {
      await apiFetch('/notificaciones', { method: 'DELETE' });
      await cargarTodo();
    } catch (err) {
      alert(`Error: ${err.message}`);
    }
  }

  // Abrir detalle completo de un documento
  async function abrirDetalleDocumento(id) {
    try {
      const doc = await apiFetch(`/documentos/${id}`);
      setDetalleDoc(doc);
    } catch (err) {
      alert(`No se pudo cargar el documento: ${err.message}`);
    }
  }

  // ==================== PANTALLA DE LOGIN ====================
  if (!user) {
    return (
      <div className="login-screen">
        <div className="login-card">
          <div className="login-header">
            <div className="login-header-emblem">🏛️</div>
            <h2>Universidad Autónoma Gabriel René Moreno</h2>
            <p>Sistema Automatizado de Archivos y Control Documental</p>
          </div>
          <form className="login-body" onSubmit={handleLogin}>
            {loginError && <div className="alert-error">⚠️ {loginError}</div>}
            <div className="form-group">
              <label>Usuario / Correo Institucional</label>
              <input
                className="form-control"
                placeholder="Ej. admin"
                value={loginUser}
                onChange={(e) => setLoginUser(e.target.value)}
                required
                autoFocus
              />
            </div>
            <div className="form-group">
              <label>Contraseña de Acceso</label>
              <div style={{ position: 'relative' }}>
                <input
                  type={mostrarPass ? 'text' : 'password'}
                  className="form-control"
                  placeholder="Contraseña"
                  value={loginPass}
                  onChange={(e) => setLoginPass(e.target.value)}
                  required
                />
                <button
                  type="button"
                  onClick={() => setMostrarPass(!mostrarPass)}
                  style={{
                    position: 'absolute',
                    right: 10,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '0.9rem',
                  }}
                >
                  {mostrarPass ? '🙈' : '👁️'}
                </button>
              </div>
            </div>
            <button type="submit" className="btn-primary" style={{ justifyContent: 'center', marginTop: 8 }} disabled={loginLoading}>
              {loginLoading ? 'Ingresando...' : 'Ingresar al Sistema →'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Filtrado de documentos para la vista de Control de Estados
  const documentosPorEstado = documentos.filter((d) => d.estado === tabEstadoControl);

  // Filtrado de notificaciones para la vista de Alertas y Avisos
  const notificacionesFiltradas = notificaciones.filter((n) => {
    if (filtroAlertas === 'vencidos') return n.mensaje.includes('VENCIDO');
    if (filtroAlertas === 'por_vencer') return n.mensaje.includes('vence el');
    return true;
  });

  return (
    <div className="app-shell">
      {/* ==================== ENCABEZADO SUPERIOR UAGRM ==================== */}
      <header className="top-institutional-bar">
        <div className="top-bar-brand">
          <div className="uagrm-emblem">🏛️</div>
          <div className="brand-titles">
            <span className="brand-main">Universidad Autónoma Gabriel René Moreno</span>
            <span className="brand-sub">Sistema Automatizado de Archivos · Gestión y Control Documental</span>
          </div>
        </div>

        <div className="top-bar-actions">
          {puedeEscribir && (
            <button
              type="button"
              className="btn-header-cta"
              onClick={() => setVistaActiva('recepcion')}
            >
              <span>＋</span>
              <span>Digitalizar Documento</span>
            </button>
          )}

          <div className="user-badge-header">
            <span>👤 {user.nombre}</span>
            <span className="user-role-pill">{user.rol}</span>
          </div>
        </div>
      </header>

      {/* ==================== REGIÓN PRINCIPAL (SIDEBAR + CONTENIDO) ==================== */}
      <div className="main-region">
        {/* ==================== SIDEBAR IZQUIERDO ==================== */}
        <aside className={`classic-sidebar ${menuColapsado ? 'collapsed' : ''}`}>
          {/* Botón superior para Ocultar / Mostrar menú */}
          <button
            type="button"
            className="btn-toggle-menu"
            onClick={() => setMenuColapsado(!menuColapsado)}
            title={menuColapsado ? 'Mostrar menú lateral' : 'Ocultar menú lateral'}
          >
            <span>{menuColapsado ? '▶' : '◀'}</span>
            {!menuColapsado && <span>Ocultar menú</span>}
          </button>

          {!menuColapsado && <div className="sidebar-section-title">GESTIÓN DOCUMENTAL</div>}

          {/* Menú con los bloques rectangulares celestes (#DCE8F5) */}
          <nav className="sidebar-menu-list">
            {/* 1. Bandeja General */}
            <button
              type="button"
              className={`sidebar-btn ${vistaActiva === 'bandeja' ? 'active' : ''}`}
              onClick={() => setVistaActiva('bandeja')}
              title="Bandeja General"
            >
              <span className="sidebar-icon">📥</span>
              <span className="btn-label">Bandeja General</span>
            </button>

            {/* 2. Recepción y Digitalización */}
            <button
              type="button"
              className={`sidebar-btn ${vistaActiva === 'recepcion' ? 'active' : ''}`}
              onClick={() => setVistaActiva('recepcion')}
              title="Recepción y Digitalización"
            >
              <span className="sidebar-icon">📄</span>
              <span className="btn-label">Recepción y Digitalización</span>
            </button>

            {/* 3. Categorías y Carpetas */}
            <button
              type="button"
              className={`sidebar-btn ${vistaActiva === 'categorias' ? 'active' : ''}`}
              onClick={() => setVistaActiva('categorias')}
              title="Categorías y Carpetas"
            >
              <span className="sidebar-icon">📂</span>
              <span className="btn-label">Categorías y Carpetas</span>
            </button>

            {/* 4. Alertas y Avisos */}
            <button
              type="button"
              className={`sidebar-btn ${vistaActiva === 'alertas' ? 'active' : ''}`}
              onClick={() => setVistaActiva('alertas')}
              title="Alertas y Avisos"
            >
              <span className="sidebar-icon">🔔</span>
              <span className="btn-label">Alertas y Avisos</span>
            </button>

            {/* 5. Control de Estados */}
            <button
              type="button"
              className={`sidebar-btn ${vistaActiva === 'estados' ? 'active' : ''}`}
              onClick={() => setVistaActiva('estados')}
              title="Control de Estados (Pendientes / Respondidos / Archivados)"
            >
              <span className="sidebar-icon">⚖️</span>
              <span className="btn-label">Control de Estados</span>
            </button>

            {/* 6. Cerrar Sesión */}
            <button
              type="button"
              className="sidebar-btn btn-logout"
              onClick={handleLogout}
              title="Cerrar Sesión"
            >
              <span className="sidebar-icon">🚪</span>
              <span className="btn-label">Cerrar Sesión</span>
            </button>
          </nav>
        </aside>

        {/* ==================== ÁREA DE CONTENIDO ==================== */}
        <main className="content-canvas">
          {/* ==================== VISTA 1: BANDEJA GENERAL ==================== */}
          {vistaActiva === 'bandeja' && (
            <div>
              {/* Tarjetas de Métricas de la Bandeja */}
              <div className="metrics-row">
                <div className="metric-card">
                  <div className="metric-icon-bubble blue">📁</div>
                  <div>
                    <div className="metric-value">{documentos.length}</div>
                    <div className="metric-label">Total Documentos</div>
                  </div>
                </div>

                <div className="metric-card">
                  <div className="metric-icon-bubble amber">⏳</div>
                  <div>
                    <div className="metric-value">{resumen.pendientes || 0}</div>
                    <div className="metric-label">Pendientes</div>
                  </div>
                </div>

                <div className="metric-card">
                  <div className="metric-icon-bubble green">✓</div>
                  <div>
                    <div className="metric-value">{resumen.respondidos || 0}</div>
                    <div className="metric-label">Respondidos</div>
                  </div>
                </div>

                <div className="metric-card">
                  <div className="metric-icon-bubble slate">🗄️</div>
                  <div>
                    <div className="metric-value">{resumen.archivados || 0}</div>
                    <div className="metric-label">Archivados</div>
                  </div>
                </div>

                <div className="metric-card">
                  <div className="metric-icon-bubble red">🚨</div>
                  <div>
                    <div className="metric-value">{(resumen.vencidos || 0) + (resumen.por_vencer || 0)}</div>
                    <div className="metric-label">Vencidos / Próximos</div>
                  </div>
                </div>
              </div>

              {/* Tarjeta Principal de la Tabla */}
              <div className="main-table-card">
                <div className="card-section-header">
                  <div className="card-title-group">
                    <span className="card-title-main">📥 Bandeja General de Archivos</span>
                    <span className="card-title-sub">Listado oficial de documentos registrados con control de estados y plazos</span>
                  </div>
                  {puedeEscribir && (
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={() => setVistaActiva('recepcion')}
                    >
                      ＋ Recepcionar Documento
                    </button>
                  )}
                </div>

                {/* Filtros */}
                <div className="filter-toolbar">
                  <div className="search-input-box">
                    <span className="search-icon">🔍</span>
                    <input
                      placeholder="Buscar por asunto, remitente o número correlativo..."
                      value={filtroBusqueda}
                      onChange={(e) => setFiltroBusqueda(e.target.value)}
                    />
                  </div>

                  <select
                    className="filter-select"
                    value={filtroCategoria}
                    onChange={(e) => setFiltroCategoria(e.target.value)}
                  >
                    <option value="">-- Todas las Categorías --</option>
                    {categorias.map((c) => (
                      <option key={c.id_categoria} value={c.id_categoria}>
                        {c.nombre}
                      </option>
                    ))}
                  </select>

                  <select
                    className="filter-select"
                    value={filtroEstado}
                    onChange={(e) => setFiltroEstado(e.target.value)}
                  >
                    <option value="">-- Todos los Estados --</option>
                    <option value="Pendiente">⏳ Pendientes</option>
                    <option value="Respondido">✓ Respondidos</option>
                    <option value="Archivado">📁 Archivados</option>
                  </select>

                  {(filtroBusqueda || filtroCategoria || filtroEstado) && (
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => {
                        setFiltroBusqueda('');
                        setFiltroCategoria('');
                        setFiltroEstado('');
                      }}
                    >
                      Limpiar Filtros
                    </button>
                  )}
                </div>

                {/* Tabla */}
                <div className="docs-table-wrapper">
                  <table className="docs-table">
                    <thead>
                      <tr>
                        <th>CORRELATIVO</th>
                        <th>CATEGORÍA / TIPO</th>
                        <th>REMITENTE / DESTINATARIO</th>
                        <th>ASUNTO / DETALLE</th>
                        <th>FECHA INGRESO</th>
                        <th>PLAZO / VENCIMIENTO</th>
                        <th>ESTADO</th>
                        <th style={{ textAlign: 'right' }}>ACCIONES</th>
                      </tr>
                    </thead>
                    <tbody>
                      {documentos.length === 0 ? (
                        <tr>
                          <td colSpan={8} style={{ textAlign: 'center', padding: '36px', color: '#64748b' }}>
                            {cargando ? 'Cargando documentos...' : 'No se encontraron documentos en la bandeja.'}
                          </td>
                        </tr>
                      ) : (
                        documentos.map((d) => {
                          const plazo = calcularEstadoPlazo(d.fecha_vencimiento, d.estado);
                          return (
                            <tr key={d.id_documento}>
                              <td className="col-id">
                                <div>{d.numero_documento}</div>
                                <div className="col-subtext">{d.numero_recepcion}</div>
                              </td>
                              <td>
                                <span className="badge-categoria">{d.categoria || d.tipo_documento}</span>
                              </td>
                              <td>
                                <div className="col-title-main">{d.remitente}</div>
                                {d.destinatario && <div className="col-subtext">Para: {d.destinatario}</div>}
                              </td>
                              <td>
                                <div className="col-title-main">{d.asunto}</div>
                                {d.observaciones && <div className="col-subtext">{d.observaciones}</div>}
                              </td>
                              <td style={{ whiteSpace: 'nowrap' }}>
                                {formatearFechaCorta(d.fecha_recepcion)}
                              </td>
                              <td>
                                <span className={`badge-plazo ${plazo.clase}`}>
                                  <span>{plazo.icono}</span>
                                  <span>{d.fecha_vencimiento ? formatearFechaCorta(d.fecha_vencimiento) : 'Sin límite'}</span>
                                </span>
                              </td>
                              <td>
                                <span className={`badge-estado ${d.estado}`}>
                                  {d.estado === 'Pendiente' && '⏳ '}
                                  {d.estado === 'Respondido' && '✓ '}
                                  {d.estado === 'Archivado' && '📁 '}
                                  {d.estado}
                                </span>
                              </td>
                              <td style={{ textAlign: 'right' }}>
                                <div className="table-action-group" style={{ justifyContent: 'flex-end' }}>
                                  <button
                                    type="button"
                                    className="btn-table-action btn-view"
                                    onClick={() => setVisorDoc({ id: d.id_documento, titulo: `${d.numero_documento} - ${d.asunto}` })}
                                    title="Previsualizar archivo digitalizado"
                                  >
                                    👁️ Ver
                                  </button>
                                  <button
                                    type="button"
                                    className="btn-table-action"
                                    onClick={() => abrirDetalleDocumento(d.id_documento)}
                                    title="Ver detalle y trazabilidad"
                                  >
                                    ℹ️ Detalle
                                  </button>
                                  {puedeEscribir && (
                                    <>
                                      <button
                                        type="button"
                                        className="btn-table-action btn-edit"
                                        onClick={() => setEditandoDoc({ ...d })}
                                        title="Editar datos del documento"
                                      >
                                        ✏️
                                      </button>
                                      <button
                                        type="button"
                                        className="btn-table-action btn-delete"
                                        onClick={() => handleEliminarDoc(d.id_documento, d.numero_documento)}
                                        title="Eliminar documento"
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
              </div>
            </div>
          )}

          {/* ==================== VISTA 2: RECEPCIÓN Y DIGITALIZACIÓN ==================== */}
          {vistaActiva === 'recepcion' && (
            <div className="main-table-card" style={{ maxWidth: 900, margin: '0 auto 24px' }}>
              <div className="card-section-header">
                <div className="card-title-group">
                  <span className="card-title-main">📄 Recepción y Digitalización de Documentos</span>
                  <span className="card-title-sub">
                    Ingreso oficial con generación automática de correlativo y clasificación en carpetas institucionales
                  </span>
                </div>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setVistaActiva('bandeja')}
                >
                  ← Ir a Bandeja General
                </button>
              </div>

              <form className="modal-body" onSubmit={handleCrearDocumento} style={{ padding: '24px 28px' }}>
                {recepcionMsg.texto && (
                  <div
                    className={recepcionMsg.tipo === 'error' ? 'alert-error' : 'alert-success'}
                    style={{ marginBottom: 18 }}
                  >
                    {recepcionMsg.tipo === 'error' ? '⚠️' : '✓'} {recepcionMsg.texto}
                  </div>
                )}

                <div className="form-grid">
                  {/* Correlativos Automáticos */}
                  <div className="form-group">
                    <label>1. N° de Recepción (Correlativo Automático)</label>
                    <input
                      className="form-control"
                      value={recepcionForm.numero_recepcion}
                      readOnly
                      style={{ background: '#F1F5F9', fontWeight: 800, color: '#0F355E' }}
                    />
                  </div>

                  <div className="form-group">
                    <label>2. N° de Documento (Correlativo Institucional)</label>
                    <input
                      className="form-control"
                      value="DOC-2026-XXXX (Generado al guardar)"
                      readOnly
                      style={{ background: '#F1F5F9', fontWeight: 700, color: '#475569' }}
                    />
                  </div>

                  {/* Fecha y Hora Automáticas */}
                  <div className="form-group">
                    <label>3. Fecha de Recepción (Automática)</label>
                    <input
                      type="date"
                      className="form-control"
                      value={recepcionForm.fecha_recepcion}
                      readOnly
                      style={{ background: '#F8FAFC' }}
                    />
                  </div>

                  <div className="form-group">
                    <label>4. Hora de Recepción (Automática)</label>
                    <input
                      className="form-control"
                      value={recepcionForm.hora_recepcion}
                      readOnly
                      style={{ background: '#F8FAFC' }}
                    />
                  </div>

                  {/* Tipo de Documento */}
                  <div className="form-group">
                    <label>5. Tipo de Documento *</label>
                    <select
                      className="form-control"
                      value={recepcionForm.tipo_documento}
                      onChange={(e) => handleCambioTipoDocumento(e.target.value)}
                      required
                    >
                      {TIPOS_DOCUMENTO.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>

                  {/* Categoría / Carpeta destino */}
                  <div className="form-group">
                    <label>6. Carpeta de Almacenamiento *</label>
                    <select
                      className="form-control"
                      value={recepcionForm.id_categoria}
                      onChange={(e) => setRecepcionForm({ ...recepcionForm, id_categoria: e.target.value })}
                      required
                    >
                      {categorias.map((c) => (
                        <option key={c.id_categoria} value={c.id_categoria}>
                          {c.nombre} ({c.carpeta})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Remitente y Destinatario */}
                  <div className="form-group">
                    <label>7. Remitente / Institución Emisora *</label>
                    <input
                      className="form-control"
                      placeholder="Persona o institución que envía"
                      value={recepcionForm.remitente}
                      onChange={(e) => setRecepcionForm({ ...recepcionForm, remitente: e.target.value })}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label>8. Destinatario / Departamento *</label>
                    <input
                      className="form-control"
                      placeholder="Ej. Dirección / Jefatura / Secretaría"
                      value={recepcionForm.destinatario}
                      onChange={(e) => setRecepcionForm({ ...recepcionForm, destinatario: e.target.value })}
                      required
                    />
                  </div>

                  {/* Asunto */}
                  <div className="form-group" style={{ gridColumn: 'span 2' }}>
                    <label>9. Asunto del Documento *</label>
                    <input
                      className="form-control"
                      placeholder="Descripción breve del contenido o trámite solicitado"
                      value={recepcionForm.asunto}
                      onChange={(e) => setRecepcionForm({ ...recepcionForm, asunto: e.target.value })}
                      required
                    />
                  </div>

                  {/* Plazo / Fecha Límite */}
                  <div className="form-group">
                    <label>10. Fecha Límite / Vencimiento (Para Alertas)</label>
                    <input
                      type="date"
                      className="form-control"
                      value={recepcionForm.fecha_vencimiento}
                      onChange={(e) => setRecepcionForm({ ...recepcionForm, fecha_vencimiento: e.target.value })}
                    />
                  </div>

                  {/* Estado inicial unificado */}
                  <div className="form-group">
                    <label>11. Estado Inicial</label>
                    <input
                      className="form-control"
                      value="⏳ Pendiente (Inicial)"
                      readOnly
                      style={{ background: '#FFFBEB', color: '#B45309', fontWeight: 800 }}
                    />
                  </div>

                  {/* Digitalización de archivo */}
                  <div className="form-group" style={{ gridColumn: 'span 2' }}>
                    <label>12. Digitalización de Archivo (PDF / DOC / JPG / PNG) *</label>
                    <input
                      type="file"
                      className="form-control"
                      accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                      onChange={(e) => setRecepcionForm({ ...recepcionForm, archivo: e.target.files[0] })}
                      required
                    />
                    {recepcionForm.archivo && (
                      <div style={{ fontSize: '0.8rem', color: '#059669', marginTop: 4, fontWeight: 600 }}>
                        ✓ Archivo seleccionado: {recepcionForm.archivo.name} ({(recepcionForm.archivo.size / 1024).toFixed(1)} KB)
                      </div>
                    )}
                  </div>

                  {/* Observaciones y Anexos */}
                  <div className="form-group">
                    <label>Cantidad de Anexos Físicos</label>
                    <input
                      type="number"
                      min={0}
                      className="form-control"
                      value={recepcionForm.cantidad_anexos}
                      onChange={(e) => setRecepcionForm({ ...recepcionForm, cantidad_anexos: parseInt(e.target.value, 10) || 0 })}
                    />
                  </div>

                  <div className="form-group">
                    <label>Observaciones Adicionales</label>
                    <input
                      className="form-control"
                      placeholder="Notas de recepción..."
                      value={recepcionForm.observaciones}
                      onChange={(e) => setRecepcionForm({ ...recepcionForm, observaciones: e.target.value })}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 24, paddingTop: 16, borderTop: '1px solid #E2E8F0' }}>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setVistaActiva('bandeja')}
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="btn-primary"
                    disabled={subiendoDoc}
                  >
                    {subiendoDoc ? 'Registrando...' : '📥 Registrar y Guardar Documento'}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* ==================== VISTA 3: CATEGORÍAS Y CARPETAS ==================== */}
          {vistaActiva === 'categorias' && (
            <div>
              <div className="main-table-card">
                <div className="card-section-header">
                  <div className="card-title-group">
                    <span className="card-title-main">📂 Clasificación y Almacenamiento por Carpetas</span>
                    <span className="card-title-sub">
                      Organización y guardado de documentos en carpetas físicas según su categoría (Cartas, Solicitudes, Informes, Memorándums)
                    </span>
                  </div>
                </div>

                {esAdmin && (
                  <div style={{ padding: '20px 24px', background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                    <h4 style={{ fontSize: '0.85rem', fontWeight: 800, color: '#0F355E', marginBottom: 12 }}>
                      ＋ Crear Nueva Carpeta / Categoría
                    </h4>
                    <form onSubmit={handleCrearCategoria} style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      <input
                        className="form-control"
                        placeholder="Nombre de carpeta (ej. Circulares)"
                        value={nuevaCat.nombre}
                        onChange={(e) => setNuevaCat({ ...nuevaCat, nombre: e.target.value })}
                        required
                        style={{ flex: 1, minWidth: 200 }}
                      />
                      <input
                        className="form-control"
                        placeholder="Descripción"
                        value={nuevaCat.descripcion}
                        onChange={(e) => setNuevaCat({ ...nuevaCat, descripcion: e.target.value })}
                        style={{ flex: 2, minWidth: 240 }}
                      />
                      <button type="submit" className="btn-primary">
                        ＋ Crear Carpeta
                      </button>
                    </form>
                    {catMsg && <div style={{ fontSize: '0.8rem', color: '#059669', fontWeight: 600, marginTop: 8 }}>{catMsg}</div>}
                  </div>
                )}

                {/* Grid de Carpetas */}
                <div className="folders-grid">
                  {categorias.map((c) => {
                    const cantDocs = documentos.filter((d) => d.id_categoria === c.id_categoria).length;
                    return (
                      <div key={c.id_categoria} className="folder-card">
                        <div className="folder-card-header">
                          <div className="folder-card-icon">📁</div>
                          <div>
                            <div className="folder-card-title">{c.nombre}</div>
                            <div style={{ fontSize: '0.74rem', color: '#64748B' }}>#{c.id_categoria}</div>
                          </div>
                        </div>

                        <div className="folder-card-desc">
                          {c.descripcion || 'Sin descripción'}
                        </div>

                        <div className="folder-card-path">
                          {c.carpeta}
                        </div>

                        <div className="folder-card-footer">
                          <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#0F355E' }}>
                            {cantDocs} documento(s)
                          </span>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button
                              type="button"
                              className="btn-table-action btn-view"
                              onClick={() => {
                                setFiltroCategoria(String(c.id_categoria));
                                setVistaActiva('bandeja');
                              }}
                              title="Explorar documentos en esta carpeta"
                            >
                              🔍 Ver
                            </button>
                            {esAdmin && (
                              <>
                                <button
                                  type="button"
                                  className="btn-table-action btn-edit"
                                  onClick={() => setEditandoCategoria({ ...c })}
                                  title="Editar nombre/descripción"
                                >
                                  ✏️
                                </button>
                                <button
                                  type="button"
                                  className="btn-table-action btn-delete"
                                  onClick={() => handleEliminarCategoria(c.id_categoria, c.nombre)}
                                  title="Eliminar carpeta"
                                >
                                  🗑️
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ==================== VISTA 4: ALERTAS Y AVISOS ==================== */}
          {vistaActiva === 'alertas' && (
            <div>
              {/* Tarjetas de Métricas de Alertas */}
              <div className="metrics-row">
                <div className="metric-card">
                  <div className="metric-icon-bubble red">🚨</div>
                  <div>
                    <div className="metric-value">{resumen.vencidos || 0}</div>
                    <div className="metric-label">Documentos Vencidos</div>
                  </div>
                </div>

                <div className="metric-card">
                  <div className="metric-icon-bubble amber">⏳</div>
                  <div>
                    <div className="metric-value">{resumen.por_vencer || 0}</div>
                    <div className="metric-label">Próximos a Vencer (3 días)</div>
                  </div>
                </div>

                <div className="metric-card">
                  <div className="metric-icon-bubble green">🟢</div>
                  <div>
                    <div className="metric-value">{resumen.pendientes || 0}</div>
                    <div className="metric-label">Pendientes en Monitoreo</div>
                  </div>
                </div>
              </div>

              <div className="main-table-card">
                <div className="card-section-header">
                  <div className="card-title-group">
                    <span className="card-title-main">🔔 Automatización de Tareas: Alertas y Avisos</span>
                    <span className="card-title-sub">
                      Monitoreo inteligente de documentos pendientes, alertas de plazos por vencer y registro cronológico
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={handleGenerarAlertas}
                    >
                      ⚡ Ejecutar Chequeo Ahora
                    </button>
                    {notificaciones.length > 0 && esAdmin && (
                      <button
                        type="button"
                        className="btn-danger"
                        onClick={handleLimpiarNotificaciones}
                      >
                        🗑️ Limpiar Historial
                      </button>
                    )}
                  </div>
                </div>

                {/* Filtro de alertas */}
                <div className="filter-toolbar">
                  <select
                    className="filter-select"
                    value={filtroAlertas}
                    onChange={(e) => setFiltroAlertas(e.target.value)}
                  >
                    <option value="todas">-- Todas las Alertas ({notificaciones.length}) --</option>
                    <option value="vencidos">🚨 Solo Documentos Vencidos</option>
                    <option value="por_vencer">⏳ Solo Próximos a Vencer</option>
                  </select>
                </div>

                <div className="docs-table-wrapper">
                  <table className="docs-table">
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>DOCUMENTO</th>
                        <th>MENSAJE DE ALERTA GENERADO POR EL SISTEMA</th>
                        <th>FECHA DE EMISIÓN</th>
                        <th>ESTADO DE ALERTA</th>
                        <th style={{ textAlign: 'right' }}>ACCIONES</th>
                      </tr>
                    </thead>
                    <tbody>
                      {notificacionesFiltradas.length === 0 ? (
                        <tr>
                          <td colSpan={6} style={{ textAlign: 'center', padding: '36px', color: '#64748B' }}>
                            No hay alertas registradas en este momento.
                          </td>
                        </tr>
                      ) : (
                        notificacionesFiltradas.map((n) => {
                          const esVencido = n.mensaje.includes('VENCIDO');
                          const esPorVencer = n.mensaje.includes('vence el');
                          return (
                            <tr key={n.id_notificacion}>
                              <td className="col-id">#{n.id_notificacion}</td>
                              <td>
                                <span className="badge-categoria">
                                  {n.numero_documento || `Doc #${n.id_documento}`}
                                </span>
                              </td>
                              <td className="col-title-main">
                                <span style={{ marginRight: 6 }}>
                                  {esVencido ? '🚨' : esPorVencer ? '⏳' : 'ℹ️'}
                                </span>
                                {n.mensaje}
                              </td>
                              <td style={{ whiteSpace: 'nowrap' }}>
                                {formatearFechaCorta(n.fecha_notificacion)}
                              </td>
                              <td>
                                <span className={`badge-plazo ${esVencido ? 'expirado' : esPorVencer ? 'por-vencer' : 'en-plazo'}`}>
                                  {esVencido ? 'Expirado' : esPorVencer ? 'Por Vencer' : 'Procesada'}
                                </span>
                              </td>
                              <td style={{ textAlign: 'right' }}>
                                <div className="table-action-group" style={{ justifyContent: 'flex-end' }}>
                                  {n.id_documento && (
                                    <button
                                      type="button"
                                      className="btn-table-action btn-view"
                                      onClick={() => abrirDetalleDocumento(n.id_documento)}
                                      title="Ver documento relacionado"
                                    >
                                      👁️ Ver Doc
                                    </button>
                                  )}
                                  {esAdmin && (
                                    <button
                                      type="button"
                                      className="btn-table-action btn-delete"
                                      onClick={async () => {
                                        await apiFetch(`/notificaciones/${n.id_notificacion}`, { method: 'DELETE' });
                                        cargarTodo();
                                      }}
                                      title="Eliminar aviso"
                                    >
                                      🗑️
                                    </button>
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
              </div>
            </div>
          )}

          {/* ==================== VISTA 5: CONTROL DE ESTADOS (UNIFICADO EN 3) ==================== */}
          {vistaActiva === 'estados' && (
            <div>
              <div className="main-table-card">
                <div className="card-section-header">
                  <div className="card-title-group">
                    <span className="card-title-main">⚖️ Control de Estados del Ciclo de Vida Documental</span>
                    <span className="card-title-sub">
                      Unificación exacta en tres estados: Pendientes, Respondidos y Archivados
                    </span>
                  </div>
                </div>

                {/* Pestañas grandes de los 3 estados */}
                <div className="status-tabs-nav">
                  <button
                    type="button"
                    className={`status-tab-btn pending ${tabEstadoControl === 'Pendiente' ? 'active' : ''}`}
                    onClick={() => setTabEstadoControl('Pendiente')}
                  >
                    <span>⏳ PENDIENTES</span>
                    <span className="tab-count-badge">{resumen.pendientes || 0}</span>
                  </button>

                  <button
                    type="button"
                    className={`status-tab-btn answered ${tabEstadoControl === 'Respondido' ? 'active' : ''}`}
                    onClick={() => setTabEstadoControl('Respondido')}
                  >
                    <span>✓ RESPONDIDOS</span>
                    <span className="tab-count-badge">{resumen.respondidos || 0}</span>
                  </button>

                  <button
                    type="button"
                    className={`status-tab-btn archived ${tabEstadoControl === 'Archivado' ? 'active' : ''}`}
                    onClick={() => setTabEstadoControl('Archivado')}
                  >
                    <span>📁 ARCHIVADOS</span>
                    <span className="tab-count-badge">{resumen.archivados || 0}</span>
                  </button>
                </div>

                {/* Tabla de documentos filtrados por el estado seleccionado */}
                <div className="docs-table-wrapper">
                  <table className="docs-table">
                    <thead>
                      <tr>
                        <th>CORRELATIVO</th>
                        <th>CATEGORÍA</th>
                        <th>REMITENTE</th>
                        <th>ASUNTO</th>
                        <th>FECHA INGRESO</th>
                        <th>PLAZO / VENCIMIENTO</th>
                        <th style={{ textAlign: 'right' }}>CAMBIO DE ESTADO Y ACCIONES</th>
                      </tr>
                    </thead>
                    <tbody>
                      {documentosPorEstado.length === 0 ? (
                        <tr>
                          <td colSpan={7} style={{ textAlign: 'center', padding: '36px', color: '#64748B' }}>
                            No hay documentos con estado &quot;{tabEstadoControl}&quot;.
                          </td>
                        </tr>
                      ) : (
                        documentosPorEstado.map((d) => {
                          const plazo = calcularEstadoPlazo(d.fecha_vencimiento, d.estado);
                          return (
                            <tr key={d.id_documento}>
                              <td className="col-id">
                                <div>{d.numero_documento}</div>
                                <div className="col-subtext">{d.numero_recepcion}</div>
                              </td>
                              <td>
                                <span className="badge-categoria">{d.categoria || d.tipo_documento}</span>
                              </td>
                              <td>
                                <div className="col-title-main">{d.remitente}</div>
                                {d.destinatario && <div className="col-subtext">Para: {d.destinatario}</div>}
                              </td>
                              <td>
                                <div className="col-title-main">{d.asunto}</div>
                              </td>
                              <td style={{ whiteSpace: 'nowrap' }}>
                                {formatearFechaCorta(d.fecha_recepcion)}
                              </td>
                              <td>
                                <span className={`badge-plazo ${plazo.clase}`}>
                                  <span>{plazo.icono}</span>
                                  <span>{d.fecha_vencimiento ? formatearFechaCorta(d.fecha_vencimiento) : 'Sin límite'}</span>
                                </span>
                              </td>
                              <td style={{ textAlign: 'right' }}>
                                <div className="table-action-group" style={{ justifyContent: 'flex-end' }}>
                                  {/* Botones de acción directa según el estado actual */}
                                  {d.estado === 'Pendiente' && puedeEscribir && (
                                    <>
                                      <button
                                        type="button"
                                        className="btn-table-action"
                                        style={{ background: '#D1FAE5', color: '#065F46', borderColor: '#A7F3D0' }}
                                        onClick={() => handleCambiarEstado(d.id_documento, 'Respondido')}
                                        title="Marcar este trámite como Respondido"
                                      >
                                        ✓ Responder
                                      </button>
                                      <button
                                        type="button"
                                        className="btn-table-action"
                                        style={{ background: '#E2E8F0', color: '#334155', borderColor: '#CBD5E1' }}
                                        onClick={() => handleCambiarEstado(d.id_documento, 'Archivado')}
                                        title="Pasar documento a Archivo definitivo"
                                      >
                                        📁 Archivar
                                      </button>
                                    </>
                                  )}

                                  {d.estado === 'Respondido' && puedeEscribir && (
                                    <>
                                      <button
                                        type="button"
                                        className="btn-table-action"
                                        style={{ background: '#E2E8F0', color: '#334155', borderColor: '#CBD5E1' }}
                                        onClick={() => handleCambiarEstado(d.id_documento, 'Archivado')}
                                        title="Pasar documento a Archivo definitivo"
                                      >
                                        📁 Archivar
                                      </button>
                                      <button
                                        type="button"
                                        className="btn-table-action"
                                        style={{ background: '#FEF3C7', color: '#92400E', borderColor: '#FDE68A' }}
                                        onClick={() => handleCambiarEstado(d.id_documento, 'Pendiente')}
                                        title="Reabrir a Pendiente"
                                      >
                                        ⏳ Reabrir
                                      </button>
                                    </>
                                  )}

                                  {d.estado === 'Archivado' && puedeEscribir && (
                                    <>
                                      <button
                                        type="button"
                                        className="btn-table-action"
                                        style={{ background: '#FEF3C7', color: '#92400E', borderColor: '#FDE68A' }}
                                        onClick={() => handleCambiarEstado(d.id_documento, 'Pendiente')}
                                        title="Reabrir y mover a Pendiente"
                                      >
                                        ⏳ Reabrir
                                      </button>
                                      <button
                                        type="button"
                                        className="btn-table-action"
                                        style={{ background: '#D1FAE5', color: '#065F46', borderColor: '#A7F3D0' }}
                                        onClick={() => handleCambiarEstado(d.id_documento, 'Respondido')}
                                        title="Mover a Respondido"
                                      >
                                        ✓ Respondido
                                      </button>
                                    </>
                                  )}

                                  <button
                                    type="button"
                                    className="btn-table-action btn-view"
                                    onClick={() => setVisorDoc({ id: d.id_documento, titulo: `${d.numero_documento} - ${d.asunto}` })}
                                    title="Previsualizar archivo digitalizado"
                                  >
                                    👁️ Ver
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* ==================== MODAL VISOR INSTITUCIONAL ==================== */}
      {visorDoc && (
        <ModalVisor
          endpoint={`/documentos/${visorDoc.id}/archivo`}
          titulo={visorDoc.titulo}
          onClose={() => setVisorDoc(null)}
        />
      )}

      {/* ==================== MODAL DETALLE Y TRAZABILIDAD ==================== */}
      {detalleDoc && (
        <div className="modal-backdrop" onClick={() => setDetalleDoc(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 750 }}>
            <div className="modal-header">
              <h3>📄 Detalle y Trazabilidad: {detalleDoc.numero_documento}</h3>
              <button type="button" className="btn-close-modal" onClick={() => setDetalleDoc(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, marginBottom: 18 }}>
                <div><strong>N° Recepción:</strong> {detalleDoc.numero_recepcion || '—'}</div>
                <div><strong>Tipo / Categoría:</strong> {detalleDoc.categoria || detalleDoc.tipo_documento}</div>
                <div><strong>Remitente:</strong> {detalleDoc.remitente}</div>
                <div><strong>Destinatario:</strong> {detalleDoc.destinatario || '—'}</div>
                <div><strong>Fecha de Ingreso:</strong> {formatearFechaCorta(detalleDoc.fecha_recepcion)} {detalleDoc.hora_recepcion || ''}</div>
                <div><strong>Fecha Límite:</strong> {detalleDoc.fecha_vencimiento ? formatearFechaCorta(detalleDoc.fecha_vencimiento) : 'Sin límite'}</div>
                <div><strong>Estado Actual:</strong> <span className={`badge-estado ${detalleDoc.estado}`}>{detalleDoc.estado}</span></div>
                <div><strong>Anexos:</strong> {detalleDoc.cantidad_anexos || 0}</div>
                <div style={{ gridColumn: 'span 2' }}><strong>Asunto:</strong> {detalleDoc.asunto}</div>
                {detalleDoc.observaciones && (
                  <div style={{ gridColumn: 'span 2' }}><strong>Observaciones:</strong> {detalleDoc.observaciones}</div>
                )}
              </div>

              {/* Botón para previsualizar documento en el visor */}
              <div style={{ display: 'flex', gap: 10, marginBottom: 18 }}>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => {
                    setVisorDoc({ id: detalleDoc.id_documento, titulo: `${detalleDoc.numero_documento} - ${detalleDoc.asunto}` });
                  }}
                >
                  👁️ Abrir en Visor de Documento
                </button>
              </div>

              {/* Historial de Trazabilidad (Trigger de PostgreSQL) */}
              <div>
                <h4 style={{ fontSize: '0.86rem', fontWeight: 800, color: '#0F355E', marginBottom: 8 }}>
                  🕒 Historial de Trazabilidad y Cambios de Estado
                </h4>
                <div className="docs-table-wrapper">
                  <table className="docs-table">
                    <thead>
                      <tr>
                        <th>FECHA Y HORA</th>
                        <th>ESTADO ANTERIOR</th>
                        <th>ESTADO NUEVO</th>
                        <th>DETALLE</th>
                        <th>USUARIO</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(detalleDoc.historial || []).length === 0 ? (
                        <tr><td colSpan={5} style={{ textAlign: 'center', padding: 12, color: '#64748B' }}>Sin cambios registrados</td></tr>
                      ) : (
                        (detalleDoc.historial || []).map((h) => (
                          <tr key={h.id_historial}>
                            <td>{formatearFechaCorta(h.fecha_cambio)}</td>
                            <td>{h.estado_anterior || '—'}</td>
                            <td><span className={`badge-estado ${h.estado_nuevo}`}>{h.estado_nuevo}</span></td>
                            <td>{h.observacion}</td>
                            <td>{h.usuario || 'Sistema'}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================== MODAL: EDITAR DOCUMENTO ==================== */}
      {editandoDoc && (
        <div className="modal-backdrop" onClick={() => setEditandoDoc(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 650 }}>
            <div className="modal-header">
              <h3>✏️ Editar Documento {editandoDoc.numero_documento}</h3>
              <button type="button" className="btn-close-modal" onClick={() => setEditandoDoc(null)}>✕</button>
            </div>
            <form className="modal-body" onSubmit={handleGuardarEdicionDoc}>
              <div className="form-grid">
                <div className="form-group">
                  <label>Tipo de Documento *</label>
                  <select
                    className="form-control"
                    value={editandoDoc.tipo_documento}
                    onChange={(e) => setEditandoDoc({ ...editandoDoc, tipo_documento: e.target.value })}
                    required
                  >
                    {TIPOS_DOCUMENTO.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label>Categoría / Carpeta *</label>
                  <select
                    className="form-control"
                    value={editandoDoc.id_categoria || ''}
                    onChange={(e) => setEditandoDoc({ ...editandoDoc, id_categoria: e.target.value })}
                    required
                  >
                    {categorias.map((c) => (
                      <option key={c.id_categoria} value={c.id_categoria}>{c.nombre}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label>Remitente *</label>
                  <input
                    className="form-control"
                    value={editandoDoc.remitente}
                    onChange={(e) => setEditandoDoc({ ...editandoDoc, remitente: e.target.value })}
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Destinatario *</label>
                  <input
                    className="form-control"
                    value={editandoDoc.destinatario || ''}
                    onChange={(e) => setEditandoDoc({ ...editandoDoc, destinatario: e.target.value })}
                    required
                  />
                </div>

                <div className="form-group" style={{ gridColumn: 'span 2' }}>
                  <label>Asunto *</label>
                  <input
                    className="form-control"
                    value={editandoDoc.asunto}
                    onChange={(e) => setEditandoDoc({ ...editandoDoc, asunto: e.target.value })}
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Fecha Límite / Vencimiento</label>
                  <input
                    type="date"
                    className="form-control"
                    value={editandoDoc.fecha_vencimiento ? editandoDoc.fecha_vencimiento.slice(0, 10) : ''}
                    onChange={(e) => setEditandoDoc({ ...editandoDoc, fecha_vencimiento: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label>Estado del Documento</label>
                  <select
                    className="form-control"
                    value={editandoDoc.estado}
                    onChange={(e) => setEditandoDoc({ ...editandoDoc, estado: e.target.value })}
                  >
                    <option value="Pendiente">⏳ Pendiente</option>
                    <option value="Respondido">✓ Respondido</option>
                    <option value="Archivado">📁 Archivado</option>
                  </select>
                </div>

                <div className="form-group" style={{ gridColumn: 'span 2' }}>
                  <label>Observaciones</label>
                  <textarea
                    className="form-control"
                    rows={2}
                    value={editandoDoc.observaciones || ''}
                    onChange={(e) => setEditandoDoc({ ...editandoDoc, observaciones: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
                <button type="button" className="btn-secondary" onClick={() => setEditandoDoc(null)}>Cancelar</button>
                <button type="submit" className="btn-primary">💾 Guardar Cambios</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================== MODAL: EDITAR CATEGORÍA ==================== */}
      {editandoCategoria && (
        <div className="modal-backdrop" onClick={() => setEditandoCategoria(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 500 }}>
            <div className="modal-header">
              <h3>✏️ Editar Carpeta #{editandoCategoria.id_categoria}</h3>
              <button type="button" className="btn-close-modal" onClick={() => setEditandoCategoria(null)}>✕</button>
            </div>
            <form className="modal-body" onSubmit={handleGuardarEdicionCategoria}>
              <div className="form-group" style={{ marginBottom: 14 }}>
                <label>Nombre de la Categoría *</label>
                <input
                  className="form-control"
                  value={editandoCategoria.nombre}
                  onChange={(e) => setEditandoCategoria({ ...editandoCategoria, nombre: e.target.value })}
                  required
                />
              </div>
              <div className="form-group" style={{ marginBottom: 14 }}>
                <label>Descripción</label>
                <textarea
                  className="form-control"
                  rows={3}
                  value={editandoCategoria.descripcion || ''}
                  onChange={(e) => setEditandoCategoria({ ...editandoCategoria, descripcion: e.target.value })}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 14 }}>
                <button type="button" className="btn-secondary" onClick={() => setEditandoCategoria(null)}>Cancelar</button>
                <button type="submit" className="btn-primary">💾 Guardar Cambios</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
