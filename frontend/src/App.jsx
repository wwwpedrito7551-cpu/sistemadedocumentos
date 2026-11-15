import { useState, useEffect, useCallback } from 'react';
import {
  apiFetch,
  fetchArchivoBlob,
  getStoredUser,
  saveSession,
  clearSession,
} from './api.js';
import './App.css';

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

const TIPOS_DOCUMENTO = [
  'Carta',
  'Solicitud',
  'Informe',
  'Memorandum',
  'Resolución',
  'Contrato',
  'Oficio',
  'Otro',
];

function formatearFechaCorta(fechaStr) {
  if (!fechaStr) return '—';
  const d = new Date(fechaStr);
  if (Number.isNaN(d.getTime())) return String(fechaStr).slice(0, 10);
  const dia = String(d.getDate()).padStart(2, '0');
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const anio = d.getFullYear();
  return `${dia}/${mes}/${anio}`;
}

function formatearPeriodo(fechaStr) {
  if (!fechaStr) return { principal: '—', sub: '' };
  const d = new Date(fechaStr);
  if (Number.isNaN(d.getTime())) return { principal: String(fechaStr).slice(0, 10), sub: '' };
  const mesNombre = MESES[d.getMonth()];
  const anio = d.getFullYear();
  const semestre = d.getMonth() < 6 ? '1er sem.' : '2do sem.';
  return { principal: `${mesNombre} ${anio}`, sub: semestre };
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
    return { clase: 'expirado', texto: 'Expirado', icono: '⚠' };
  }
  if (diffDias <= 3) {
    return { clase: 'por-vencer', texto: 'Por vencer', icono: '⏳' };
  }
  return { clase: 'en-plazo', texto: 'En plazo', icono: '✓' };
}

function codigoCategoria(nombre = '') {
  const limpio = nombre.toUpperCase().replace(/[^A-Z]/g, '');
  return `${nombre.toUpperCase()} / ${limpio.slice(0, 3) || 'DOC'}`;
}

export default function App() {
  const [user, setUser] = useState(() => getStoredUser());
  const [vistaActiva, setVistaActiva] = useState('bandeja');
  const [resumenAbierto, setResumenAbierto] = useState(false);

  // Datos del backend
  const [resumen, setResumen] = useState({
    pendientes: 0,
    respondidos: 0,
    archivados: 0,
    vencidos: 0,
    por_vencer: 0,
  });
  const [categorias, setCategorias] = useState([]);
  const [documentos, setDocumentos] = useState([]);
  const [totalDocs, setTotalDocs] = useState(0);
  const [notificaciones, setNotificaciones] = useState([]);
  const [usuariosList, setUsuariosList] = useState([]);
  const [cargando, setCargando] = useState(false);

  // Filtros estilo píldora (como en la imagen de referencia)
  const [filtroEstado, setFiltroEstado] = useState('');
  const [filtroCategoria, setFiltroCategoria] = useState('');
  const [filtroMes, setFiltroMes] = useState('');
  const [filtroBusqueda, setFiltroBusqueda] = useState('');

  // Modales
  const [modalNuevoDoc, setModalNuevoDoc] = useState(false);
  const [docSeleccionado, setDocSeleccionado] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [previewMime, setPreviewMime] = useState('');

  // Login state
  const [loginUser, setLoginUser] = useState('admin');
  const [loginPass, setLoginPass] = useState('admin123456');
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  // Formulario Nuevo Documento
  const [nuevoDocForm, setNuevoDocForm] = useState({
    tipo_documento: 'Informe',
    remitente: '',
    asunto: '',
    id_categoria: '',
    fecha_vencimiento: '',
    archivo: null,
  });
  const [formMsg, setFormMsg] = useState({ tipo: '', texto: '' });
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

  const puedeEscribir =
    user?.rol === 'Administrador' || user?.rol === 'Secretaria';
  const esAdmin = user?.rol === 'Administrador';

  const cargarTodo = useCallback(async () => {
    if (!user) return;
    setCargando(true);
    try {
      const params = new URLSearchParams();
      if (filtroEstado) params.set('estado', filtroEstado);
      if (filtroCategoria) params.set('id_categoria', filtroCategoria);
      if (filtroBusqueda.trim()) params.set('q', filtroBusqueda.trim());
      params.set('limit', '50');

      const [resResumen, resCats, resDocs, resNotifs] = await Promise.all([
        apiFetch('/documentos/resumen'),
        apiFetch('/categorias'),
        apiFetch(`/documentos?${params.toString()}`),
        apiFetch('/notificaciones?limit=30'),
      ]);

      setResumen(resResumen);
      setCategorias(resCats);
      setDocumentos(resDocs.data || []);
      setTotalDocs(resDocs.total || 0);
      setNotificaciones(resNotifs || []);

      if (resCats.length > 0 && !nuevoDocForm.id_categoria) {
        setNuevoDocForm((prev) => ({
          ...prev,
          id_categoria: String(resCats[0].id_categoria),
        }));
      }

      if (user.rol === 'Administrador') {
        apiFetch('/auth/usuarios')
          .then(setUsuariosList)
          .catch(() => {});
      }
    } catch (err) {
      console.error(err);
    } finally {
      setCargando(false);
    }
  }, [user, filtroEstado, filtroCategoria, filtroBusqueda, nuevoDocForm.id_categoria]);

  useEffect(() => {
    cargarTodo();
  }, [cargarTodo]);

  async function handleLogin(e) {
    e.preventDefault();
    setLoginError('');
    setLoginLoading(true);
    try {
      const res = await apiFetch('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ usuario: loginUser, contrasena: loginPass }),
      });
      saveSession(res.token, res.usuario);
      setUser(res.usuario);
    } catch (err) {
      setLoginError(err.message);
    } finally {
      setLoginLoading(false);
    }
  }

  function handleLogout() {
    clearSession();
    setUser(null);
  }

  async function abrirDetalleDocumento(id) {
    try {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        setPreviewUrl(null);
      }
      const detalle = await apiFetch(`/documentos/${id}`);
      setDocSeleccionado(detalle);
    } catch (err) {
      alert(err.message);
    }
  }

  async function handleVerArchivoInline(id) {
    try {
      const blob = await fetchArchivoBlob(id, true);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      const url = URL.createObjectURL(blob);
      setPreviewMime(blob.type);
      setPreviewUrl(url);
    } catch (err) {
      alert(err.message);
    }
  }

  async function handleDescargarArchivo(id, nombreOriginal) {
    try {
      const blob = await fetchArchivoBlob(id, false);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = nombreOriginal || `documento-${id}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(err.message);
    }
  }

  async function handleCambiarEstado(id, nuevoEstado) {
    try {
      await apiFetch(`/documentos/${id}/estado`, {
        method: 'PATCH',
        body: JSON.stringify({ estado: nuevoEstado }),
      });
      await abrirDetalleDocumento(id);
      await cargarTodo();
    } catch (err) {
      alert(err.message);
    }
  }

  async function handleCrearDocumento(e) {
    e.preventDefault();
    setFormMsg({ tipo: '', texto: '' });
    if (!nuevoDocForm.archivo) {
      setFormMsg({ tipo: 'error', texto: 'Selecciona un archivo PDF o imagen digitalizada.' });
      return;
    }
    setSubiendoDoc(true);
    try {
      const fd = new FormData();
      fd.append('tipo_documento', nuevoDocForm.tipo_documento);
      fd.append('remitente', nuevoDocForm.remitente);
      fd.append('asunto', nuevoDocForm.asunto);
      fd.append('id_categoria', nuevoDocForm.id_categoria);
      if (nuevoDocForm.fecha_vencimiento) {
        fd.append('fecha_vencimiento', nuevoDocForm.fecha_vencimiento);
      }
      fd.append('archivo', nuevoDocForm.archivo);

      const creado = await apiFetch('/documentos', {
        method: 'POST',
        body: fd,
      });

      setFormMsg({
        tipo: 'ok',
        texto: `Documento registrado exitosamente con código ${creado.numero_documento}`,
      });
      setNuevoDocForm((prev) => ({
        ...prev,
        remitente: '',
        asunto: '',
        fecha_vencimiento: '',
        archivo: null,
      }));
      await cargarTodo();
      setTimeout(() => {
        setModalNuevoDoc(false);
        setFormMsg({ tipo: '', texto: '' });
      }, 900);
    } catch (err) {
      setFormMsg({ tipo: 'error', texto: err.message });
    } finally {
      setSubiendoDoc(false);
    }
  }

  async function handleCrearCategoria(e) {
    e.preventDefault();
    setCatMsg('');
    try {
      await apiFetch('/categorias', {
        method: 'POST',
        body: JSON.stringify(nuevaCat),
      });
      setNuevaCat({ nombre: '', descripcion: '' });
      setCatMsg('Categoría y carpeta física creadas correctamente.');
      await cargarTodo();
    } catch (err) {
      setCatMsg(`Error: ${err.message}`);
    }
  }

  async function handleCrearUsuario(e) {
    e.preventDefault();
    setUserMsg({ tipo: '', texto: '' });
    try {
      await apiFetch('/auth/usuarios', {
        method: 'POST',
        body: JSON.stringify(nuevoUsuario),
      });
      setNuevoUsuario({ nombre: '', usuario: '', contrasena: '', rol: 'Secretaria' });
      setUserMsg({ tipo: 'ok', texto: 'Usuario creado exitosamente.' });
      await cargarTodo();
    } catch (err) {
      setUserMsg({ tipo: 'error', texto: err.message });
    }
  }

  // Filtrado por mes en cliente (complementa los filtros del backend)
  const documentosFiltrados = documentos.filter((d) => {
    if (!filtroMes) return true;
    const fecha = new Date(d.fecha_recepcion);
    return String(fecha.getMonth() + 1) === String(filtroMes);
  });

  // ==================== PANTALLA DE LOGIN ====================
  if (!user) {
    return (
      <div className="login-screen">
        <div className="login-card">
          <div className="login-card-header">
            <div className="inst-pill" style={{ display: 'inline-flex', marginBottom: 10 }}>
              <span>🏛️ Sistema Institucional de Gestión</span>
            </div>
            <h2 style={{ fontSize: '1.35rem', fontWeight: 800 }}>
              Sistema Automatizado de Archivos
            </h2>
            <p style={{ fontSize: '0.82rem', color: '#bfdbfe', marginTop: 4 }}>
              Control, digitalización y seguimiento documental
            </p>
          </div>
          <form className="login-card-body" onSubmit={handleLogin}>
            {loginError && <div className="alert-error">{loginError}</div>}
            <div className="form-group">
              <label>Usuario</label>
              <input
                className="form-control"
                value={loginUser}
                onChange={(e) => setLoginUser(e.target.value)}
                placeholder="Ej. admin"
                required
              />
            </div>
            <div className="form-group">
              <label>Contraseña</label>
              <input
                type="password"
                className="form-control"
                value={loginPass}
                onChange={(e) => setLoginPass(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>
            <button type="submit" className="btn-primary" disabled={loginLoading}>
              {loginLoading ? 'Ingresando...' : 'Iniciar Sesión en el Panel'}
            </button>
            <div style={{ fontSize: '0.75rem', color: '#64748b', textAlign: 'center' }}>
              Acceso configurado con PostgreSQL · <code>gestor_de_documentos</code>
            </div>
          </form>
        </div>
      </div>
    );
  }

  // ==================== LAYOUT PRINCIPAL ====================
  return (
    <div className="app-shell">
      {/* Barra superior azul marino institucional */}
      <header className="top-institutional-bar">
        <div className="top-bar-brand">
          <span>🏛️ UNIDAD DE ARCHIVO Y CORRESPONDENCIA</span>
        </div>
        <div className="top-bar-decor">
          <div className="decor-card">PDF</div>
          <div className="decor-card">DOC</div>
          <div className="decor-card">SGD</div>
        </div>
      </header>

      <div className="main-region">
        {/* Sidebar clásico azul acero como en el diseño de referencia */}
        <aside className="classic-sidebar">
          <div className="sidebar-header-title">
            Consultas y<br />Módulos
          </div>
          <nav className="sidebar-menu-list">
            <button
              className={`sidebar-btn ${vistaActiva === 'bandeja' && !filtroEstado ? 'active' : ''}`}
              onClick={() => {
                setVistaActiva('bandeja');
                setFiltroEstado('');
              }}
            >
              <span>Bandeja General</span>
              <span className="sidebar-badge">{totalDocs}</span>
            </button>

            {puedeEscribir && (
              <button
                className="sidebar-btn"
                onClick={() => setModalNuevoDoc(true)}
              >
                <span>+ Registrar Documento</span>
              </button>
            )}

            <button
              className={`sidebar-btn ${vistaActiva === 'bandeja' && filtroEstado === 'Pendiente' ? 'active' : ''}`}
              onClick={() => {
                setVistaActiva('bandeja');
                setFiltroEstado('Pendiente');
              }}
            >
              <span>Pendientes</span>
              <span className="sidebar-badge">{resumen.pendientes}</span>
            </button>

            <button
              className={`sidebar-btn ${vistaActiva === 'bandeja' && filtroEstado === 'Respondido' ? 'active' : ''}`}
              onClick={() => {
                setVistaActiva('bandeja');
                setFiltroEstado('Respondido');
              }}
            >
              <span>Respondidos</span>
              <span className="sidebar-badge">{resumen.respondidos}</span>
            </button>

            <button
              className={`sidebar-btn ${vistaActiva === 'bandeja' && filtroEstado === 'Archivado' ? 'active' : ''}`}
              onClick={() => {
                setVistaActiva('bandeja');
                setFiltroEstado('Archivado');
              }}
            >
              <span>Histórico / Archivo</span>
              <span className="sidebar-badge">{resumen.archivados}</span>
            </button>

            <button
              className={`sidebar-btn ${vistaActiva === 'categorias' ? 'active' : ''}`}
              onClick={() => setVistaActiva('categorias')}
            >
              <span>Categorías y Carpetas</span>
            </button>

            <button
              className={`sidebar-btn ${vistaActiva === 'notificaciones' ? 'active' : ''}`}
              onClick={() => setVistaActiva('notificaciones')}
            >
              <span>Alertas y Avisos</span>
              {notificaciones.length > 0 && (
                <span className="sidebar-badge">{notificaciones.length}</span>
              )}
            </button>

            {esAdmin && (
              <button
                className={`sidebar-btn ${vistaActiva === 'usuarios' ? 'active' : ''}`}
                onClick={() => setVistaActiva('usuarios')}
              >
                <span>Gestión de Usuarios</span>
              </button>
            )}

            <button
              className={`sidebar-btn ${vistaActiva === 'perfil' ? 'active' : ''}`}
              onClick={() => setVistaActiva('perfil')}
            >
              <span>Datos Personales</span>
            </button>

            <button
              className="sidebar-btn"
              style={{ marginTop: 8, background: '#e2e8f0', color: '#991b1b' }}
              onClick={handleLogout}
            >
              <span>Cerrar Sesión</span>
            </button>
          </nav>
        </aside>

        {/* Columna derecha principal */}
        <div className="content-column">
          {/* Sub-barra institucional */}
          <div className="sub-navbar">
            <div className="inst-badge-wrap">
              <div className="inst-pill">
                <span>🛡️</span>
                <span>Sistema Automatizado de Archivos</span>
              </div>
              <div className="inst-pill-sub">
                <strong>S.G.D.</strong> · GESTIÓN DOCUMENTAL
              </div>
            </div>

            <div className="sub-navbar-user">
              <span style={{ fontSize: '0.78rem', color: '#dbeafe', fontWeight: 600 }}>
                {user.rol}
              </span>
              <div
                className="user-mini-avatar"
                title="Cerrar sesión"
                onClick={handleLogout}
              >
                👤
              </div>
            </div>
          </div>

          {/* Área de trabajo */}
          <main className="workspace-body">
            {/* Banner Hero azul profundo con saludo en celeste y botón blanco */}
            <section className="hero-banner">
              <div className="hero-left">
                <div className="hero-avatar-box">
                  <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="#6ec1ff" strokeWidth="1.8">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="16" y1="13" x2="8" y2="13" />
                    <line x1="16" y1="17" x2="8" y2="17" />
                    <polyline points="10 9 9 9 8 9" />
                  </svg>
                </div>
                <div>
                  <div className="hero-session-status">
                    <span className="status-dot" />
                    <span>SESIÓN ACTIVA</span>
                  </div>
                  <h1 className="hero-greeting">
                    Hola, <span className="user-highlight">{user.nombre}</span>
                  </h1>
                  <p className="hero-subtitle">
                    Panel de gestión de documentos digitalizados · Rol: {user.rol}
                  </p>
                </div>
              </div>

              {puedeEscribir && (
                <button
                  type="button"
                  className="btn-hero-cta"
                  onClick={() => setModalNuevoDoc(true)}
                >
                  <span>＋</span>
                  <span>Nuevo Documento</span>
                </button>
              )}
            </section>

            {/* Tarjeta desplegable de Resumen / Indicadores (idéntica a "Mis Materias Programadas") */}
            <section className="summary-strip-card">
              <div
                className="summary-strip-header"
                onClick={() => setResumenAbierto((v) => !v)}
              >
                <div className="summary-strip-left">
                  <div className="summary-icon-box">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                      <line x1="16" y1="2" x2="16" y2="6" />
                      <line x1="8" y1="2" x2="8" y2="6" />
                      <line x1="3" y1="10" x2="21" y2="10" />
                    </svg>
                  </div>
                  <div>
                    <div className="summary-title">Resumen de Estado Documental</div>
                    <div className="summary-subtitle">
                      Conteo en tiempo real por etapa y control de vencimientos
                    </div>
                  </div>
                </div>

                <div className="summary-kpis-inline">
                  <span
                    className="kpi-chip pendiente"
                    onClick={(e) => {
                      e.stopPropagation();
                      setVistaActiva('bandeja');
                      setFiltroEstado('Pendiente');
                    }}
                  >
                    ● {resumen.pendientes} Pendientes
                  </span>
                  <span
                    className="kpi-chip respondido"
                    onClick={(e) => {
                      e.stopPropagation();
                      setVistaActiva('bandeja');
                      setFiltroEstado('Respondido');
                    }}
                  >
                    ✓ {resumen.respondidos} Respondidos
                  </span>
                  <span
                    className="kpi-chip archivado"
                    onClick={(e) => {
                      e.stopPropagation();
                      setVistaActiva('bandeja');
                      setFiltroEstado('Archivado');
                    }}
                  >
                    📁 {resumen.archivados} Archivados
                  </span>
                  {Number(resumen.por_vencer) > 0 && (
                    <span className="kpi-chip por-vencer">
                      ⏳ {resumen.por_vencer} Por vencer
                    </span>
                  )}
                  {Number(resumen.vencidos) > 0 && (
                    <span className="kpi-chip vencido">
                      ⚠ {resumen.vencidos} Expirados
                    </span>
                  )}
                  <span style={{ color: '#94a3b8', fontWeight: 700, paddingLeft: 4 }}>
                    {resumenAbierto ? '⌄' : '›'}
                  </span>
                </div>
              </div>

              {resumenAbierto && (
                <div className="summary-expanded-grid">
                  <div className="stat-mini-box">
                    <span className="stat-mini-value">{resumen.pendientes}</span>
                    <span className="stat-mini-label">En Revisión / Pendientes</span>
                  </div>
                  <div className="stat-mini-box">
                    <span className="stat-mini-value">{resumen.respondidos}</span>
                    <span className="stat-mini-label">Documentos Respondidos</span>
                  </div>
                  <div className="stat-mini-box">
                    <span className="stat-mini-value">{resumen.archivados}</span>
                    <span className="stat-mini-label">Documentos Archivados</span>
                  </div>
                  <div className="stat-mini-box">
                    <span className="stat-mini-value" style={{ color: '#b45309' }}>
                      {resumen.por_vencer}
                    </span>
                    <span className="stat-mini-label">Próximos a vencer (3 días)</span>
                  </div>
                  <div className="stat-mini-box">
                    <span className="stat-mini-value" style={{ color: '#b91c1c' }}>
                      {resumen.vencidos}
                    </span>
                    <span className="stat-mini-label">Plazo Expirado</span>
                  </div>
                </div>
              )}
            </section>

            {/* ==================== VISTA 1: BANDEJA DE DOCUMENTOS ==================== */}
            {vistaActiva === 'bandeja' && (
              <section className="main-table-card">
                <div className="card-section-header">
                  <div className="card-title-group">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2.2">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                      <line x1="16" y1="13" x2="8" y2="13" />
                      <line x1="16" y1="17" x2="8" y2="17" />
                    </svg>
                    <span>Mis Documentos</span>
                  </div>
                </div>

                {/* Barra de filtros idéntica al diseño de referencia */}
                <div className="filters-bar">
                  <div className="filters-left">
                    <select
                      className="pill-select"
                      value={filtroEstado}
                      onChange={(e) => setFiltroEstado(e.target.value)}
                    >
                      <option value="">Todos los estados</option>
                      <option value="Pendiente">Pendiente (En Revisión)</option>
                      <option value="Respondido">Respondido</option>
                      <option value="Archivado">Archivado</option>
                    </select>

                    <select
                      className="pill-select"
                      value={filtroCategoria}
                      onChange={(e) => setFiltroCategoria(e.target.value)}
                    >
                      <option value="">Todas las categorías</option>
                      {categorias.map((c) => (
                        <option key={c.id_categoria} value={c.id_categoria}>
                          {c.nombre}
                        </option>
                      ))}
                    </select>

                    <select
                      className="pill-select"
                      value={filtroMes}
                      onChange={(e) => setFiltroMes(e.target.value)}
                    >
                      <option value="">Todos los meses</option>
                      {MESES.map((m, idx) => (
                        <option key={m} value={idx + 1}>
                          {m}
                        </option>
                      ))}
                    </select>

                    <input
                      type="search"
                      className="pill-input"
                      placeholder="Buscar por N°, asunto o remitente..."
                      value={filtroBusqueda}
                      onChange={(e) => setFiltroBusqueda(e.target.value)}
                    />
                  </div>

                  <div className="filters-right">
                    <span>
                      {documentosFiltrados.length}{' '}
                      {documentosFiltrados.length === 1 ? 'resultado' : 'resultados'}
                    </span>
                    <button
                      type="button"
                      className="btn-icon-refresh"
                      title="Actualizar bandeja"
                      onClick={cargarTodo}
                    >
                      ↻
                    </button>
                  </div>
                </div>

                {/* Tabla de documentos */}
                <div className="docs-table-wrapper">
                  <table className="docs-table">
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>TÍTULO / ASUNTO</th>
                        <th>CATEGORÍA</th>
                        <th>PERIODO / REMITENTE</th>
                        <th>CREADO</th>
                        <th>ESTADO</th>
                        <th>ETAPA</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {cargando ? (
                        <tr>
                          <td colSpan="8" style={{ textAlign: 'center', padding: 36, color: '#64748b' }}>
                            Cargando documentos...
                          </td>
                        </tr>
                      ) : documentosFiltrados.length === 0 ? (
                        <tr>
                          <td colSpan="8" style={{ textAlign: 'center', padding: 42, color: '#64748b' }}>
                            No hay documentos registrados con los filtros seleccionados.
                            {puedeEscribir && (
                              <div style={{ marginTop: 10 }}>
                                <button
                                  type="button"
                                  className="btn-primary"
                                  onClick={() => setModalNuevoDoc(true)}
                                >
                                  ＋ Registrar primer documento
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      ) : (
                        documentosFiltrados.map((d) => {
                          const periodo = formatearPeriodo(d.fecha_recepcion);
                          const plazo = calcularEstadoPlazo(d.fecha_vencimiento, d.estado);
                          return (
                            <tr key={d.id_documento}>
                              <td className="col-id">#{d.numero_documento}</td>
                              <td>
                                <div className="col-title-main">{d.asunto}</div>
                                <div className="col-title-sub">
                                  {d.tipo_documento} · De: {d.remitente}
                                </div>
                              </td>
                              <td>
                                <span className="badge-categoria">
                                  {codigoCategoria(d.categoria)}
                                </span>
                              </td>
                              <td>
                                <div className="col-periodo-main">{periodo.principal}</div>
                                <div className="col-periodo-sub">{periodo.sub}</div>
                              </td>
                              <td className="col-creado">
                                {formatearFechaCorta(d.fecha_recepcion)}
                              </td>
                              <td>
                                <span className={`badge-plazo ${plazo.clase}`}>
                                  <span>{plazo.icono}</span>
                                  <span>{plazo.texto}</span>
                                </span>
                              </td>
                              <td>
                                <span className={`badge-etapa ${d.estado}`}>
                                  <span>
                                    {d.estado === 'Pendiente'
                                      ? '👥 En Revisión'
                                      : d.estado === 'Respondido'
                                      ? '✓ Respondido'
                                      : '📁 Archivado'}
                                  </span>
                                </span>
                              </td>
                              <td style={{ textAlign: 'right' }}>
                                <button
                                  type="button"
                                  className="btn-ver-link"
                                  onClick={() => abrirDetalleDocumento(d.id_documento)}
                                >
                                  <span>Ver</span>
                                  <span>›</span>
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {/* ==================== VISTA 2: CATEGORÍAS Y CARPETAS ==================== */}
            {vistaActiva === 'categorias' && (
              <section className="main-table-card">
                <div className="card-section-header">
                  <div className="card-title-group">
                    <span>📂 Categorías y Carpetas de Almacenamiento</span>
                  </div>
                </div>
                <div style={{ padding: 24 }}>
                  {esAdmin && (
                    <form
                      onSubmit={handleCrearCategoria}
                      style={{
                        display: 'flex',
                        gap: 12,
                        flexWrap: 'wrap',
                        marginBottom: 24,
                        background: '#f8fafc',
                        padding: 16,
                        borderRadius: 12,
                        border: '1px solid #e2e8f0',
                      }}
                    >
                      <input
                        className="form-control"
                        placeholder="Nombre de nueva categoría (ej. Convenios)"
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
                        ＋ Crear Categoría
                      </button>
                      {catMsg && (
                        <div style={{ width: '100%', fontSize: '0.82rem', color: '#047857', fontWeight: 600 }}>
                          {catMsg}
                        </div>
                      )}
                    </form>
                  )}

                  <div className="docs-table-wrapper">
                    <table className="docs-table">
                      <thead>
                        <tr>
                          <th>ID</th>
                          <th>NOMBRE</th>
                          <th>DESCRIPCIÓN</th>
                          <th>RUTA FÍSICA EN STORAGE</th>
                        </tr>
                      </thead>
                      <tbody>
                        {categorias.map((c) => (
                          <tr key={c.id_categoria}>
                            <td className="col-id">#{c.id_categoria}</td>
                            <td className="col-title-main">{c.nombre}</td>
                            <td>{c.descripcion || '—'}</td>
                            <td>
                              <span className="badge-categoria">{c.carpeta}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>
            )}

            {/* ==================== VISTA 3: NOTIFICACIONES ==================== */}
            {vistaActiva === 'notificaciones' && (
              <section className="main-table-card">
                <div className="card-section-header">
                  <div className="card-title-group">
                    <span>🔔 Historial de Alertas y Notificaciones Automáticas</span>
                  </div>
                </div>
                <div className="docs-table-wrapper">
                  <table className="docs-table">
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>DOCUMENTO</th>
                        <th>MENSAJE GENERADO POR TRIGGER / CRON</th>
                        <th>FECHA</th>
                        <th>DESPACHADA</th>
                      </tr>
                    </thead>
                    <tbody>
                      {notificaciones.map((n) => (
                        <tr key={n.id_notificacion}>
                          <td className="col-id">#{n.id_notificacion}</td>
                          <td>
                            <span className="badge-categoria">
                              {n.numero_documento || `Doc #${n.id_documento}`}
                            </span>
                          </td>
                          <td className="col-title-main">{n.mensaje}</td>
                          <td className="col-creado">
                            {formatearFechaCorta(n.fecha_notificacion)}
                          </td>
                          <td>
                            <span className={`badge-plazo ${n.enviada ? 'en-plazo' : 'por-vencer'}`}>
                              {n.enviada ? '✓ Procesada' : '⏳ En cola'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {/* ==================== VISTA 4: USUARIOS (ADMIN) ==================== */}
            {vistaActiva === 'usuarios' && esAdmin && (
              <section className="main-table-card">
                <div className="card-section-header">
                  <div className="card-title-group">
                    <span>👥 Gestión de Usuarios y Roles del Sistema</span>
                  </div>
                </div>
                <div style={{ padding: 24 }}>
                  <form
                    onSubmit={handleCrearUsuario}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                      gap: 12,
                      background: '#f8fafc',
                      padding: 16,
                      borderRadius: 12,
                      border: '1px solid #e2e8f0',
                      marginBottom: 24,
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
                          <th>USUARIO</th>
                          <th>ROL ASIGNADO</th>
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
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>
            )}

            {/* ==================== VISTA 5: PERFIL ==================== */}
            {vistaActiva === 'perfil' && (
              <section className="main-table-card">
                <div className="card-section-header">
                  <div className="card-title-group">
                    <span>👤 Datos de Sesión Activa</span>
                  </div>
                </div>
                <div style={{ padding: 24, display: 'grid', gap: 12 }}>
                  <div><strong>ID de Usuario:</strong> #{user.id}</div>
                  <div><strong>Nombre:</strong> {user.nombre}</div>
                  <div><strong>Rol en el Sistema:</strong> <span className="badge-categoria">{user.rol}</span></div>
                  <div><strong>Permisos:</strong> {puedeEscribir ? 'Recepción, digitalización y cambio de estados' : 'Solo lectura y descarga'}</div>
                </div>
              </section>
            )}
          </main>
        </div>
      </div>

      {/* ==================== MODAL: NUEVO DOCUMENTO ==================== */}
      {modalNuevoDoc && (
        <div className="modal-backdrop" onClick={() => setModalNuevoDoc(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>＋ Registrar Nuevo Documento Digitalizado</h3>
              <button
                type="button"
                className="btn-close-modal"
                onClick={() => setModalNuevoDoc(false)}
              >
                ✕
              </button>
            </div>
            <form className="modal-body" onSubmit={handleCrearDocumento}>
              {formMsg.texto && (
                <div
                  className={formMsg.tipo === 'error' ? 'alert-error' : 'alert-success'}
                  style={{ marginBottom: 16 }}
                >
                  {formMsg.texto}
                </div>
              )}

              <div className="form-grid">
                <div className="form-group">
                  <label>Tipo de Documento *</label>
                  <select
                    className="form-control"
                    value={nuevoDocForm.tipo_documento}
                    onChange={(e) =>
                      setNuevoDocForm({ ...nuevoDocForm, tipo_documento: e.target.value })
                    }
                    required
                  >
                    {TIPOS_DOCUMENTO.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label>Categoría de Archivo *</label>
                  <select
                    className="form-control"
                    value={nuevoDocForm.id_categoria}
                    onChange={(e) =>
                      setNuevoDocForm({ ...nuevoDocForm, id_categoria: e.target.value })
                    }
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
                  <label>Título / Asunto del Documento *</label>
                  <input
                    className="form-control"
                    placeholder="Ej. Informe de actividades del mes de Noviembre - 2026"
                    value={nuevoDocForm.asunto}
                    onChange={(e) =>
                      setNuevoDocForm({ ...nuevoDocForm, asunto: e.target.value })
                    }
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Remitente / Institución *</label>
                  <input
                    className="form-control"
                    placeholder="Nombre o unidad remitente"
                    value={nuevoDocForm.remitente}
                    onChange={(e) =>
                      setNuevoDocForm({ ...nuevoDocForm, remitente: e.target.value })
                    }
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Fecha Límite / Vencimiento (opcional)</label>
                  <input
                    type="date"
                    className="form-control"
                    value={nuevoDocForm.fecha_vencimiento}
                    onChange={(e) =>
                      setNuevoDocForm({ ...nuevoDocForm, fecha_vencimiento: e.target.value })
                    }
                  />
                </div>

                <div className="form-group full">
                  <label>Archivo Digitalizado (PDF, JPG, PNG, TIFF · máx. 20 MB) *</label>
                  <input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,.tif,.tiff"
                    className="form-control"
                    onChange={(e) =>
                      setNuevoDocForm({
                        ...nuevoDocForm,
                        archivo: e.target.files?.[0] || null,
                      })
                    }
                    required
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 22 }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setModalNuevoDoc(false)}
                >
                  Cancelar
                </button>
                <button type="submit" className="btn-primary" disabled={subiendoDoc}>
                  {subiendoDoc ? 'Registrando y calculando SHA-256...' : 'Guardar y Clasificar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================== MODAL: DETALLE, VISOR E HISTORIAL ==================== */}
      {docSeleccionado && (
        <div
          className="modal-backdrop"
          onClick={() => {
            setDocSeleccionado(null);
            if (previewUrl) {
              URL.revokeObjectURL(previewUrl);
              setPreviewUrl(null);
            }
          }}
        >
          <div className="modal-card modal-lg" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>
                📄 Documento #{docSeleccionado.numero_documento} · {docSeleccionado.tipo_documento}
              </h3>
              <button
                type="button"
                className="btn-close-modal"
                onClick={() => {
                  setDocSeleccionado(null);
                  if (previewUrl) {
                    URL.revokeObjectURL(previewUrl);
                    setPreviewUrl(null);
                  }
                }}
              >
                ✕
              </button>
            </div>

            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                  gap: 14,
                  background: '#f8fafc',
                  padding: 16,
                  borderRadius: 12,
                  border: '1px solid #e2e8f0',
                }}
              >
                <div>
                  <div style={{ fontSize: '0.73rem', color: '#64748b', fontWeight: 700 }}>ASUNTO</div>
                  <div style={{ fontWeight: 700, marginTop: 2 }}>{docSeleccionado.asunto}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.73rem', color: '#64748b', fontWeight: 700 }}>REMITENTE</div>
                  <div style={{ fontWeight: 600, marginTop: 2 }}>{docSeleccionado.remitente}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.73rem', color: '#64748b', fontWeight: 700 }}>CATEGORÍA</div>
                  <div style={{ marginTop: 4 }}>
                    <span className="badge-categoria">{docSeleccionado.categoria}</span>
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.73rem', color: '#64748b', fontWeight: 700 }}>ETAPA ACTUAL</div>
                  <div style={{ marginTop: 4 }}>
                    <span className={`badge-etapa ${docSeleccionado.estado}`}>
                      {docSeleccionado.estado}
                    </span>
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.73rem', color: '#64748b', fontWeight: 700 }}>REGISTRADO POR</div>
                  <div style={{ marginTop: 2 }}>{docSeleccionado.registrado_por}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.73rem', color: '#64748b', fontWeight: 700 }}>ARCHIVO DIGITAL</div>
                  <div style={{ marginTop: 2 }}>{docSeleccionado.nombre_original || 'Adjunto'}</div>
                </div>
              </div>

              {/* Botones de archivo y transición de estado */}
              <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {docSeleccionado.tiene_archivo && (
                    <>
                      <button
                        type="button"
                        className="btn-primary"
                        onClick={() => handleVerArchivoInline(docSeleccionado.id_documento)}
                      >
                        👁️ Previsualizar Archivo
                      </button>
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() =>
                          handleDescargarArchivo(
                            docSeleccionado.id_documento,
                            docSeleccionado.nombre_original
                          )
                        }
                      >
                        ⬇️ Descargar Original
                      </button>
                    </>
                  )}
                </div>

                {puedeEscribir && (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {docSeleccionado.estado === 'Pendiente' && (
                      <button
                        type="button"
                        className="btn-primary"
                        style={{ background: '#047857' }}
                        onClick={() =>
                          handleCambiarEstado(docSeleccionado.id_documento, 'Respondido')
                        }
                      >
                        ✓ Marcar como Respondido
                      </button>
                    )}
                    {(docSeleccionado.estado === 'Pendiente' ||
                      docSeleccionado.estado === 'Respondido') && (
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() =>
                          handleCambiarEstado(docSeleccionado.id_documento, 'Archivado')
                        }
                      >
                        📁 Pasar a Archivo
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Visor embebido de PDF o imagen */}
              {previewUrl && (
                <div
                  style={{
                    border: '1px solid #cbd5e1',
                    borderRadius: 12,
                    overflow: 'hidden',
                    height: 420,
                    background: '#0f172a',
                  }}
                >
                  {previewMime.startsWith('image/') ? (
                    <img
                      src={previewUrl}
                      alt="Vista previa"
                      style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                    />
                  ) : (
                    <iframe
                      src={previewUrl}
                      title="Visor de documento"
                      style={{ width: '100%', height: '100%', border: 'none' }}
                    />
                  )}
                </div>
              )}

              {/* Línea de tiempo del historial (Trigger PostgreSQL) */}
              <div>
                <h4 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: 10 }}>
                  🕒 Historial de Trazabilidad (PostgreSQL Trigger)
                </h4>
                <div className="docs-table-wrapper">
                  <table className="docs-table">
                    <thead>
                      <tr>
                        <th>FECHA</th>
                        <th>ESTADO ANTERIOR</th>
                        <th>ESTADO NUEVO</th>
                        <th>OBSERVACIÓN</th>
                        <th>USUARIO</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(docSeleccionado.historial || []).map((h) => (
                        <tr key={h.id_historial}>
                          <td className="col-creado">{formatearFechaCorta(h.fecha_cambio)}</td>
                          <td>{h.estado_anterior || '—'}</td>
                          <td>
                            <span className={`badge-etapa ${h.estado_nuevo}`}>
                              {h.estado_nuevo}
                            </span>
                          </td>
                          <td>{h.observacion}</td>
                          <td>{h.usuario || 'Sistema'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
