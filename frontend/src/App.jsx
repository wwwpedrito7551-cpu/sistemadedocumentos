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
    return { clase: 'en-plazo', texto: 'Vigente', icono: '●' };
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
  const [usuariosList, setUsuariosList] = useState([]);
  const [cargando, setCargando] = useState(false);

  // Filtros de Bandeja
  const [filtroBusqueda, setFiltroBusqueda] = useState('');
  const [filtroCategoria, setFiltroCategoria] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('');

  // Modales
  const [visorDoc, setVisorDoc] = useState(null); // { id, titulo }
  const [detalleDoc, setDetalleDoc] = useState(null);
  const [editandoDoc, setEditandoDoc] = useState(null);
  const [editandoCategoria, setEditandoCategoria] = useState(null);
  const [editandoUsuario, setEditandoUsuario] = useState(null);

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

  // Formulario Nuevo Usuario
  const [nuevoUsuario, setNuevoUsuario] = useState({
    nombre: '',
    usuario: '',
    contrasena: '',
    rol: 'Secretaria',
  });
  const [userMsg, setUserMsg] = useState({ tipo: '', texto: '' });

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

      if (resCats?.length > 0 && !recepcionForm.id_categoria) {
        setRecepcionForm((prev) => ({
          ...prev,
          id_categoria: String(resCats[0].id_categoria),
        }));
      }

      if (user.rol === 'Administrador') {
        apiFetch('/auth/usuarios').then(setUsuariosList).catch(() => {});
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
      console.warn(err);
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

  // Auto-seleccionar categoría al cambiar tipo de documento
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
      fd.append('estado', 'Pendiente');
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

  // Cambiar estado (Pendiente -> Respondido -> Archivado)
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

  // Crear Usuario
  async function handleCrearUsuario(e) {
    e.preventDefault();
    setUserMsg({ tipo: '', texto: '' });
    try {
      await apiFetch('/auth/usuarios', {
        method: 'POST',
        body: JSON.stringify(nuevoUsuario),
      });
      setNuevoUsuario({ nombre: '', usuario: '', contrasena: '', rol: 'Secretaria' });
      setUserMsg({ tipo: 'ok', texto: 'Usuario registrado exitosamente.' });
      const uList = await apiFetch('/auth/usuarios');
      setUsuariosList(uList);
    } catch (err) {
      setUserMsg({ tipo: 'error', texto: err.message });
    }
  }

  // Eliminar Usuario
  async function handleEliminarUsuario(id, nombre) {
    if (id === user.id) {
      alert('No puedes eliminar tu propia cuenta en uso.');
      return;
    }
    if (!window.confirm(`¿Estás seguro de eliminar al usuario "${nombre}"?`)) return;
    try {
      await apiFetch(`/auth/usuarios/${id}`, { method: 'DELETE' });
      const uList = await apiFetch('/auth/usuarios');
      setUsuariosList(uList);
    } catch (err) {
      alert(err.message);
    }
  }

  // Guardar edición usuario
  async function handleGuardarEdicionUsuario(e) {
    e.preventDefault();
    if (!editandoUsuario) return;
    try {
      await apiFetch(`/auth/usuarios/${editandoUsuario.id_usuario}`, {
        method: 'PUT',
        body: JSON.stringify(editandoUsuario),
      });
      setEditandoUsuario(null);
      const uList = await apiFetch('/auth/usuarios');
      setUsuariosList(uList);
    } catch (err) {
      alert(err.message);
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
      alert(err.message);
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
            <div style={{ fontSize: '2.5rem', marginBottom: 8 }}>🏛️</div>
            <h2>UNIDAD DE ARCHIVO Y CORRESPONDENCIA</h2>
            <p>Sistema Automatizado de Archivos · S.G.D.</p>
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

  return (
    <div className="app-shell">
      {/* ==================== ENCABEZADO SUPERIOR (EXACTO DE LA FOTO) ==================== */}
      <header className="top-institutional-bar">
        <div className="top-bar-left">
          <div className="top-header-title">
            <span className="header-icon">🏛️</span>
            <span>UNIDAD DE ARCHIVO Y CORRESPONDENCIA</span>
          </div>
        </div>

        <div className="top-bar-right">
          <div className="badge-system-pill">
            <span>🛡️</span>
            <span>Sistema Automatizado de Archivos</span>
          </div>
          <div className="sub-header-label">
            S.G.D. · GESTIÓN DOCUMENTAL
          </div>
        </div>
      </header>

      {/* ==================== CUERPO PRINCIPAL ==================== */}
      <div className="main-region">
        {/* ==================== SIDEBAR IZQUIERDO (EXACTO DE LA FOTO) ==================== */}
        <aside className="classic-sidebar">
          <div className="sidebar-top-section">
            <div className="sidebar-main-heading">
              Consultas y<br />Módulos
            </div>
          </div>

          <nav className="sidebar-menu-list">
            {/* 1. Bandeja General */}
            <button
              type="button"
              className={`sidebar-btn ${vistaActiva === 'bandeja' ? 'active' : ''}`}
              onClick={() => {
                setFiltroEstado('');
                setFiltroCategoria('');
                setVistaActiva('bandeja');
              }}
            >
              <span>Bandeja General</span>
              <span className="sidebar-badge-circle">{documentos.length}</span>
            </button>

            {/* 2. + Registrar Documento */}
            <button
              type="button"
              className={`sidebar-btn ${vistaActiva === 'recepcion' ? 'active' : ''}`}
              onClick={() => setVistaActiva('recepcion')}
            >
              <span>+ Registrar Documento</span>
            </button>

            {/* 3. Pendientes */}
            <button
              type="button"
              className={`sidebar-btn ${vistaActiva === 'bandeja' && filtroEstado === 'Pendiente' ? 'active' : ''}`}
              onClick={() => {
                setFiltroEstado('Pendiente');
                setVistaActiva('bandeja');
              }}
            >
              <span>Pendientes</span>
              <span className="sidebar-badge-circle">{resumen.pendientes || 0}</span>
            </button>

            {/* 4. Respondidos */}
            <button
              type="button"
              className={`sidebar-btn ${vistaActiva === 'bandeja' && filtroEstado === 'Respondido' ? 'active' : ''}`}
              onClick={() => {
                setFiltroEstado('Respondido');
                setVistaActiva('bandeja');
              }}
            >
              <span>Respondidos</span>
              <span className="sidebar-badge-circle">{resumen.respondidos || 0}</span>
            </button>

            {/* 5. Histórico / Archivo */}
            <button
              type="button"
              className={`sidebar-btn ${vistaActiva === 'bandeja' && filtroEstado === 'Archivado' ? 'active' : ''}`}
              onClick={() => {
                setFiltroEstado('Archivado');
                setVistaActiva('bandeja');
              }}
            >
              <span>Histórico / Archivo</span>
              <span className="sidebar-badge-circle">{resumen.archivados || 0}</span>
            </button>

            {/* 6. Categorías y Carpetas */}
            <button
              type="button"
              className={`sidebar-btn ${vistaActiva === 'categorias' ? 'active' : ''}`}
              onClick={() => setVistaActiva('categorias')}
            >
              <span>Categorías y Carpetas</span>
            </button>

            {/* 7. Alertas y Avisos */}
            <button
              type="button"
              className={`sidebar-btn ${vistaActiva === 'alertas' ? 'active' : ''}`}
              onClick={() => setVistaActiva('alertas')}
            >
              <span>Alertas y Avisos</span>
              <span className="sidebar-badge-circle">{notificaciones.length}</span>
            </button>

            {/* 8. Gestión de Usuarios */}
            {esAdmin && (
              <button
                type="button"
                className={`sidebar-btn ${vistaActiva === 'usuarios' ? 'active' : ''}`}
                onClick={() => setVistaActiva('usuarios')}
              >
                <span>Gestión de Usuarios</span>
              </button>
            )}

            {/* 9. Datos Personales */}
            <button
              type="button"
              className={`sidebar-btn ${vistaActiva === 'perfil' ? 'active' : ''}`}
              onClick={() => setVistaActiva('perfil')}
            >
              <span>Datos Personales</span>
            </button>

            {/* 10. Cerrar Sesión */}
            <button
              type="button"
              className="sidebar-btn btn-logout"
              onClick={handleLogout}
            >
              <span>Cerrar Sesión</span>
            </button>
          </nav>
        </aside>

        {/* ==================== ÁREA DE CONTENIDO ==================== */}
        <main className="content-canvas">
          {/* ==================== BANNER HERO AZUL (COMO EN LA FOTO) ==================== */}
          <div className="hero-banner-card">
            <div className="hero-icon-box">📄</div>
            <div className="hero-content">
              <div className="hero-status-tag">
                <span>●</span>
                <span>SESIÓN ACTIVA · {user.nombre} ({user.rol})</span>
              </div>
              <h2 className="hero-title">
                Sistema <span>AUTOMATIZADO DE ARCHIVOS</span>
              </h2>
              <p className="hero-subtitle">
                Panel de gestión de documentos, correspondencia oficial y control de archivo institucional
              </p>
            </div>
          </div>

          {/* ==================== SECCIÓN 1: RESUMEN DE ESTADO DOCUMENTAL ==================== */}
          <div className="section-heading-group">
            <h3 className="section-heading-title">
              <span>🗓️</span>
              <span>Resumen de Estado Documental</span>
            </h3>
            <p className="section-heading-sub">
              Conteo en tiempo real por etapa y control de vencimientos de correspondencia
            </p>
          </div>

          <div className="metrics-row">
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
              <div className="metric-icon-bubble slate">📁</div>
              <div>
                <div className="metric-value">{resumen.archivados || 0}</div>
                <div className="metric-label">Histórico / Archivo</div>
              </div>
            </div>

            <div className="metric-card">
              <div className="metric-icon-bubble red">🚨</div>
              <div>
                <div className="metric-value">{(resumen.vencidos || 0) + (resumen.por_vencer || 0)}</div>
                <div className="metric-label">Vencidos / Por Vencer</div>
              </div>
            </div>
          </div>

          {/* ==================== VISTA 1: BANDEJA / MIS DOCUMENTOS ==================== */}
          {vistaActiva === 'bandeja' && (
            <div>
              <div className="section-heading-group" style={{ marginTop: 8 }}>
                <h3 className="section-heading-title">
                  <span>📄</span>
                  <span>Mis Documentos</span>
                </h3>
              </div>

              <div className="main-table-card">
                {/* Barra de herramientas / Filtros como en la foto */}
                <div className="table-toolbar">
                  <div className="toolbar-filters">
                    {/* Selector de Estado */}
                    <select
                      className="filter-select"
                      value={filtroEstado}
                      onChange={(e) => setFiltroEstado(e.target.value)}
                    >
                      <option value="">Todos los estados</option>
                      <option value="Pendiente">Pendiente</option>
                      <option value="Respondido">Respondido</option>
                      <option value="Archivado">Archivado</option>
                    </select>

                    {/* Selector de Categoría */}
                    <select
                      className="filter-select"
                      value={filtroCategoria}
                      onChange={(e) => setFiltroCategoria(e.target.value)}
                    >
                      <option value="">Todas las categorias</option>
                      {categorias.map((c) => (
                        <option key={c.id_categoria} value={c.id_categoria}>
                          {c.nombre}
                        </option>
                      ))}
                    </select>

                    {/* Buscador de texto */}
                    <div className="search-input-box">
                      <span className="search-icon">🔍</span>
                      <input
                        placeholder="Buscar por asunto, remitente o correlativo..."
                        value={filtroBusqueda}
                        onChange={(e) => setFiltroBusqueda(e.target.value)}
                      />
                    </div>

                    {(filtroEstado || filtroCategoria || filtroBusqueda) && (
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => {
                          setFiltroEstado('');
                          setFiltroCategoria('');
                          setFiltroBusqueda('');
                        }}
                      >
                        Limpiar
                      </button>
                    )}
                  </div>

                  {puedeEscribir && (
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={() => setVistaActiva('recepcion')}
                    >
                      ＋ Registrar Documento
                    </button>
                  )}
                </div>

                {/* Tabla de Documentos */}
                <div className="docs-table-wrapper">
                  <table className="docs-table">
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>TITULO / ASUNTO</th>
                        <th>CATEGORÍA</th>
                        <th>FECHA INGRESO</th>
                        <th>PLAZO</th>
                        <th>ESTADO</th>
                        <th style={{ textAlign: 'right' }}>ACCIONES</th>
                      </tr>
                    </thead>
                    <tbody>
                      {documentos.length === 0 ? (
                        <tr>
                          <td colSpan={7} style={{ textAlign: 'center', padding: '36px', color: '#64748b' }}>
                            {cargando ? 'Cargando documentos...' : 'No se encontraron documentos registrados.'}
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
                                <div className="col-title-main" style={{ fontSize: '0.85rem' }}>{d.asunto}</div>
                                <div className="col-subtext">De: {d.remitente} {d.destinatario ? `| Para: ${d.destinatario}` : ''}</div>
                              </td>
                              <td>
                                <span className="badge-categoria">{d.categoria || d.tipo_documento}</span>
                              </td>
                              <td style={{ whiteSpace: 'nowrap' }}>
                                {formatearFechaCorta(d.fecha_recepcion)}
                              </td>
                              <td>
                                <span className={`badge-plazo ${plazo.clase}`}>
                                  <span>{plazo.icono}</span>
                                  <span>{d.fecha_vencimiento ? formatearFechaCorta(d.fecha_vencimiento) : 'Vigente'}</span>
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
                                    ℹ️
                                  </button>
                                  {puedeEscribir && (
                                    <>
                                      {d.estado === 'Pendiente' && (
                                        <button
                                          type="button"
                                          className="btn-table-action"
                                          style={{ background: '#D1FAE5', color: '#065F46', borderColor: '#A7F3D0' }}
                                          onClick={() => handleCambiarEstado(d.id_documento, 'Respondido')}
                                          title="Marcar como Respondido"
                                        >
                                          ✓
                                        </button>
                                      )}
                                      {d.estado !== 'Archivado' && (
                                        <button
                                          type="button"
                                          className="btn-table-action"
                                          style={{ background: '#E2E8F0', color: '#334155', borderColor: '#CBD5E1' }}
                                          onClick={() => handleCambiarEstado(d.id_documento, 'Archivado')}
                                          title="Pasar a Archivo"
                                        >
                                          📁
                                        </button>
                                      )}
                                      {d.estado === 'Archivado' && (
                                        <button
                                          type="button"
                                          className="btn-table-action"
                                          style={{ background: '#FEF3C7', color: '#92400E', borderColor: '#FDE68A' }}
                                          onClick={() => handleCambiarEstado(d.id_documento, 'Pendiente')}
                                          title="Reabrir a Pendiente"
                                        >
                                          ⏳
                                        </button>
                                      )}
                                      <button
                                        type="button"
                                        className="btn-table-action btn-edit"
                                        onClick={() => setEditandoDoc({ ...d })}
                                        title="Editar documento"
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
            <div className="main-table-card" style={{ maxWidth: 880, margin: '0 auto 24px' }}>
              <div className="table-toolbar">
                <div className="section-heading-group" style={{ margin: 0 }}>
                  <h3 className="section-heading-title">📄 Recepción y Digitalización de Documentos</h3>
                  <p className="section-heading-sub">Registro de correspondencia con número correlativo automático y clasificación en carpetas</p>
                </div>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setVistaActiva('bandeja')}
                >
                  ← Volver a Bandeja
                </button>
              </div>

              <form className="modal-body" onSubmit={handleCrearDocumento} style={{ padding: '24px' }}>
                {recepcionMsg.texto && (
                  <div
                    className={recepcionMsg.tipo === 'error' ? 'alert-error' : 'alert-success'}
                    style={{ marginBottom: 16 }}
                  >
                    {recepcionMsg.tipo === 'error' ? '⚠️' : '✓'} {recepcionMsg.texto}
                  </div>
                )}

                <div className="form-grid">
                  <div className="form-group">
                    <label>1. N° de Recepción (Automático)</label>
                    <input
                      className="form-control"
                      value={recepcionForm.numero_recepcion}
                      readOnly
                      style={{ background: '#F1F5F9', fontWeight: 800, color: '#0B223D' }}
                    />
                  </div>

                  <div className="form-group">
                    <label>2. N° de Documento (Secuencia Institucional)</label>
                    <input
                      className="form-control"
                      value="DOC-2026-XXXX (Automático al guardar)"
                      readOnly
                      style={{ background: '#F1F5F9', fontWeight: 700, color: '#475569' }}
                    />
                  </div>

                  <div className="form-group">
                    <label>3. Fecha de Recepción</label>
                    <input
                      type="date"
                      className="form-control"
                      value={recepcionForm.fecha_recepcion}
                      readOnly
                      style={{ background: '#F8FAFC' }}
                    />
                  </div>

                  <div className="form-group">
                    <label>4. Hora de Recepción</label>
                    <input
                      className="form-control"
                      value={recepcionForm.hora_recepcion}
                      readOnly
                      style={{ background: '#F8FAFC' }}
                    />
                  </div>

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

                  <div className="form-group">
                    <label>7. Remitente / Entidad Emisora *</label>
                    <input
                      className="form-control"
                      placeholder="Persona o institución que envía"
                      value={recepcionForm.remitente}
                      onChange={(e) => setRecepcionForm({ ...recepcionForm, remitente: e.target.value })}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label>8. Destinatario / Para *</label>
                    <input
                      className="form-control"
                      placeholder="Ej. Dirección General / Jefatura"
                      value={recepcionForm.destinatario}
                      onChange={(e) => setRecepcionForm({ ...recepcionForm, destinatario: e.target.value })}
                      required
                    />
                  </div>

                  <div className="form-group" style={{ gridColumn: 'span 2' }}>
                    <label>9. Asunto del Documento *</label>
                    <input
                      className="form-control"
                      placeholder="Resumen del trámite o contenido..."
                      value={recepcionForm.asunto}
                      onChange={(e) => setRecepcionForm({ ...recepcionForm, asunto: e.target.value })}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label>10. Fecha Límite / Vencimiento (Para alertas)</label>
                    <input
                      type="date"
                      className="form-control"
                      value={recepcionForm.fecha_vencimiento}
                      onChange={(e) => setRecepcionForm({ ...recepcionForm, fecha_vencimiento: e.target.value })}
                    />
                  </div>

                  <div className="form-group">
                    <label>11. Estado Inicial</label>
                    <input
                      className="form-control"
                      value="⏳ Pendiente"
                      readOnly
                      style={{ background: '#FFFBEB', color: '#B45309', fontWeight: 800 }}
                    />
                  </div>

                  <div className="form-group" style={{ gridColumn: 'span 2' }}>
                    <label>12. Digitalización de Archivo (PDF / DOC / Imagen) *</label>
                    <input
                      type="file"
                      className="form-control"
                      accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                      onChange={(e) => setRecepcionForm({ ...recepcionForm, archivo: e.target.files[0] })}
                      required
                    />
                    {recepcionForm.archivo && (
                      <div style={{ fontSize: '0.78rem', color: '#059669', marginTop: 4, fontWeight: 700 }}>
                        ✓ Archivo: {recepcionForm.archivo.name} ({(recepcionForm.archivo.size / 1024).toFixed(1)} KB)
                      </div>
                    )}
                  </div>

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
                    <label>Observaciones</label>
                    <input
                      className="form-control"
                      placeholder="Notas de recepción..."
                      value={recepcionForm.observaciones}
                      onChange={(e) => setRecepcionForm({ ...recepcionForm, observaciones: e.target.value })}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20, paddingTop: 14, borderTop: '1px solid #E2E8F0' }}>
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
                    {subiendoDoc ? 'Registrando...' : '📥 Registrar y Almacenar Documento'}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* ==================== VISTA 3: CATEGORÍAS Y CARPETAS ==================== */}
          {vistaActiva === 'categorias' && (
            <div className="main-table-card">
              <div className="table-toolbar">
                <div className="section-heading-group" style={{ margin: 0 }}>
                  <h3 className="section-heading-title">📂 Categorías y Carpetas de Almacenamiento</h3>
                  <p className="section-heading-sub">Estructura física de carpetas organizadas en storage según su clasificación</p>
                </div>
              </div>

              {esAdmin && (
                <div style={{ padding: '16px 20px', background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                  <h4 style={{ fontSize: '0.84rem', fontWeight: 800, color: '#0B223D', marginBottom: 10 }}>
                    ＋ Crear Nueva Carpeta / Categoría
                  </h4>
                  <form onSubmit={handleCrearCategoria} style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <input
                      className="form-control"
                      placeholder="Nombre de categoría (ej. Resoluciones)"
                      value={nuevaCat.nombre}
                      onChange={(e) => setNuevaCat({ ...nuevaCat, nombre: e.target.value })}
                      required
                      style={{ flex: 1, minWidth: 180 }}
                    />
                    <input
                      className="form-control"
                      placeholder="Descripción"
                      value={nuevaCat.descripcion}
                      onChange={(e) => setNuevaCat({ ...nuevaCat, descripcion: e.target.value })}
                      style={{ flex: 2, minWidth: 220 }}
                    />
                    <button type="submit" className="btn-primary">
                      ＋ Crear Carpeta
                    </button>
                  </form>
                  {catMsg && <div style={{ fontSize: '0.78rem', color: '#059669', fontWeight: 700, marginTop: 6 }}>{catMsg}</div>}
                </div>
              )}

              <div className="folders-grid">
                {categorias.map((c) => {
                  const cantDocs = documentos.filter((d) => d.id_categoria === c.id_categoria).length;
                  return (
                    <div key={c.id_categoria} className="folder-card">
                      <div className="folder-card-header">
                        <div className="folder-card-icon">📁</div>
                        <div>
                          <div className="folder-card-title">{c.nombre}</div>
                          <div style={{ fontSize: '0.72rem', color: '#64748B' }}>#{c.id_categoria}</div>
                        </div>
                      </div>

                      <div className="folder-card-desc">
                        {c.descripcion || 'Sin descripción'}
                      </div>

                      <div className="folder-card-path">
                        {c.carpeta}
                      </div>

                      <div className="folder-card-footer">
                        <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#0B223D' }}>
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
                            title="Ver documentos de esta carpeta"
                          >
                            🔍 Ver
                          </button>
                          {esAdmin && (
                            <>
                              <button
                                type="button"
                                className="btn-table-action btn-edit"
                                onClick={() => setEditandoCategoria({ ...c })}
                                title="Editar categoría"
                              >
                                ✏️
                              </button>
                              <button
                                type="button"
                                className="btn-table-action btn-delete"
                                onClick={() => handleEliminarCategoria(c.id_categoria, c.nombre)}
                                title="Eliminar categoría"
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
          )}

          {/* ==================== VISTA 4: ALERTAS Y AVISOS ==================== */}
          {vistaActiva === 'alertas' && (
            <div className="main-table-card">
              <div className="table-toolbar">
                <div className="section-heading-group" style={{ margin: 0 }}>
                  <h3 className="section-heading-title">🔔 Automatización de Tareas: Alertas y Avisos</h3>
                  <p className="section-heading-sub">Historial automático de alertas generadas por vencimientos de trámites y cambios de estado</p>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={handleGenerarAlertas}
                  >
                    ⚡ Chequear Vencimientos Ahora
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

              <div className="docs-table-wrapper">
                <table className="docs-table">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>DOCUMENTO</th>
                      <th>MENSAJE DE ALERTA GENERADO POR EL SISTEMA</th>
                      <th>FECHA Y HORA</th>
                      <th>ESTADO</th>
                      <th style={{ textAlign: 'right' }}>ACCIONES</th>
                    </tr>
                  </thead>
                  <tbody>
                    {notificaciones.length === 0 ? (
                      <tr>
                        <td colSpan={6} style={{ textAlign: 'center', padding: '36px', color: '#64748B' }}>
                          No hay alertas registradas en este momento.
                        </td>
                      </tr>
                    ) : (
                      notificaciones.map((n) => {
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
                                {esVencido ? 'Vencido' : esPorVencer ? 'Por Vencer' : 'Procesada'}
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
                                    👁️ Ver
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
          )}

          {/* ==================== VISTA 5: GESTIÓN DE USUARIOS ==================== */}
          {vistaActiva === 'usuarios' && esAdmin && (
            <div className="main-table-card">
              <div className="table-toolbar">
                <div className="section-heading-group" style={{ margin: 0 }}>
                  <h3 className="section-heading-title">👥 Gestión de Usuarios y Roles del Sistema</h3>
                  <p className="section-heading-sub">Administración de credenciales de acceso para Administradores, Secretarias y Personal de Consulta</p>
                </div>
              </div>

              <div style={{ padding: '20px' }}>
                <form
                  onSubmit={handleCrearUsuario}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                    gap: 10,
                    background: '#F8FAFC',
                    padding: 16,
                    borderRadius: 8,
                    border: '1px solid #E2E8F0',
                    marginBottom: 20,
                  }}
                >
                  <input
                    className="form-control"
                    placeholder="Nombre completo"
                    value={nuevoUsuario.nombre}
                    onChange={(e) => setNuevoUsuario({ ...nuevoUsuario, nombre: e.target.value })}
                    required
                  />
                  <input
                    className="form-control"
                    placeholder="Usuario (login)"
                    value={nuevoUsuario.usuario}
                    onChange={(e) => setNuevoUsuario({ ...nuevoUsuario, usuario: e.target.value })}
                    required
                  />
                  <input
                    type="password"
                    className="form-control"
                    placeholder="Contraseña (mín. 8 caracteres)"
                    value={nuevoUsuario.contrasena}
                    onChange={(e) => setNuevoUsuario({ ...nuevoUsuario, contrasena: e.target.value })}
                    required
                  />
                  <select
                    className="form-control"
                    value={nuevoUsuario.rol}
                    onChange={(e) => setNuevoUsuario({ ...nuevoUsuario, rol: e.target.value })}
                  >
                    <option value="Administrador">Administrador</option>
                    <option value="Secretaria">Secretaria</option>
                    <option value="Consulta">Consulta</option>
                  </select>
                  <button type="submit" className="btn-primary">
                    ＋ Registrar Usuario
                  </button>
                </form>

                {userMsg.texto && (
                  <div
                    className={userMsg.tipo === 'error' ? 'alert-error' : 'alert-success'}
                    style={{ marginBottom: 16 }}
                  >
                    {userMsg.texto}
                  </div>
                )}

                <div className="docs-table-wrapper">
                  <table className="docs-table">
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>NOMBRE COMPLETO</th>
                        <th>USUARIO (LOGIN)</th>
                        <th>ROL ASIGNADO</th>
                        <th style={{ textAlign: 'right' }}>ACCIONES</th>
                      </tr>
                    </thead>
                    <tbody>
                      {usuariosList.map((u) => (
                        <tr key={u.id_usuario}>
                          <td className="col-id">#{u.id_usuario}</td>
                          <td className="col-title-main">{u.nombre}</td>
                          <td>{u.usuario}</td>
                          <td>
                            <span className="badge-categoria">{u.rol}</span>
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <div className="table-action-group" style={{ justifyContent: 'flex-end' }}>
                              <button
                                type="button"
                                className="btn-table-action btn-edit"
                                onClick={() => setEditandoUsuario({ ...u, contrasena: '' })}
                                title="Editar usuario"
                              >
                                ✏️ Editar
                              </button>
                              {u.id_usuario !== user.id && (
                                <button
                                  type="button"
                                  className="btn-table-action btn-delete"
                                  onClick={() => handleEliminarUsuario(u.id_usuario, u.nombre)}
                                  title="Eliminar usuario"
                                >
                                  🗑️ Eliminar
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ==================== VISTA 6: DATOS PERSONALES / PERFIL ==================== */}
          {vistaActiva === 'perfil' && (
            <div className="main-table-card" style={{ maxWidth: 650, margin: '0 auto 24px' }}>
              <div className="table-toolbar">
                <div className="section-heading-group" style={{ margin: 0 }}>
                  <h3 className="section-heading-title">👤 Datos Personales y Sesión Activa</h3>
                  <p className="section-heading-sub">Información del usuario autenticado en el sistema</p>
                </div>
              </div>
              <div style={{ padding: '24px', display: 'grid', gap: 14 }}>
                <div><strong>ID de Usuario:</strong> #{user.id}</div>
                <div><strong>Nombre Completo:</strong> {user.nombre}</div>
                <div><strong>Rol Asignado:</strong> <span className="badge-categoria">{user.rol}</span></div>
                <div><strong>Permisos:</strong> {puedeEscribir ? 'Recepción, digitalización, control de estados y edición' : 'Solo lectura y visualización'}</div>
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

              <div>
                <h4 style={{ fontSize: '0.86rem', fontWeight: 800, color: '#0B223D', marginBottom: 8 }}>
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

      {/* ==================== MODAL: EDITAR USUARIO ==================== */}
      {editandoUsuario && (
        <div className="modal-backdrop" onClick={() => setEditandoUsuario(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
            <div className="modal-header">
              <h3>✏️ Editar Usuario #{editandoUsuario.id_usuario}</h3>
              <button type="button" className="btn-close-modal" onClick={() => setEditandoUsuario(null)}>✕</button>
            </div>
            <form className="modal-body" onSubmit={handleGuardarEdicionUsuario}>
              <div className="form-group" style={{ marginBottom: 14 }}>
                <label>Nombre Completo *</label>
                <input
                  className="form-control"
                  value={editandoUsuario.nombre}
                  onChange={(e) => setEditandoUsuario({ ...editandoUsuario, nombre: e.target.value })}
                  required
                />
              </div>
              <div className="form-group" style={{ marginBottom: 14 }}>
                <label>Usuario (Login) *</label>
                <input
                  className="form-control"
                  value={editandoUsuario.usuario}
                  onChange={(e) => setEditandoUsuario({ ...editandoUsuario, usuario: e.target.value })}
                  required
                />
              </div>
              <div className="form-group" style={{ marginBottom: 14 }}>
                <label>Rol Asignado *</label>
                <select
                  className="form-control"
                  value={editandoUsuario.rol}
                  onChange={(e) => setEditandoUsuario({ ...editandoUsuario, rol: e.target.value })}
                  required
                >
                  <option value="Administrador">Administrador</option>
                  <option value="Secretaria">Secretaria</option>
                  <option value="Consulta">Consulta</option>
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: 14 }}>
                <label>Nueva Contraseña (dejar en blanco para mantener la actual)</label>
                <input
                  type="password"
                  className="form-control"
                  placeholder="Nueva contraseña (opcional)"
                  value={editandoUsuario.contrasena || ''}
                  onChange={(e) => setEditandoUsuario({ ...editandoUsuario, contrasena: e.target.value })}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 14 }}>
                <button type="button" className="btn-secondary" onClick={() => setEditandoUsuario(null)}>Cancelar</button>
                <button type="submit" className="btn-primary">💾 Guardar Cambios</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
