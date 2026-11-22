import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  apiFetch,
  getStoredUser,
  saveSession,
  clearSession,
  fetchBlobUrl,
} from './api.js';
import ModalVisor from './components/ModalVisor.jsx';
import './App.css';

const TIPOS_DOCUMENTO = ['Carta', 'Solicitud', 'Informe', 'Memorandum', 'Otro'];

function formatearFechaCorta(fechaStr) {
  if (!fechaStr) return '—';
  const d = new Date(String(fechaStr).slice(0, 10) + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return String(fechaStr).slice(0, 10);
  const dia = String(d.getDate()).padStart(2, '0');
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const anio = d.getFullYear();
  return `${dia}/${mes}/${anio}`;
}

function formatearFechaHora(fechaStr, horaStr) {
  if (!fechaStr) return '—';
  const f = String(fechaStr).slice(0, 10);
  const h = horaStr ? ` ${String(horaStr).slice(0, 5)}` : '';
  const d = new Date(f + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return f + h;
  const dia = String(d.getDate()).padStart(2, '0');
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const anio = d.getFullYear();
  return `${dia}/${mes}/${anio}${h}`;
}

function obtenerPeriodoTexto(fechaStr) {
  if (!fechaStr) return '—';
  const d = new Date(String(fechaStr).slice(0, 10) + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return '—';
  const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const mesNombre = meses[d.getMonth()];
  const anio = d.getFullYear();
  const dia = d.getDate();
  const sem = dia <= 15 ? '1er sem.' : '2do sem.';
  return `${mesNombre} ${anio} · ${sem}`;
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
    return { clase: 'expirado', texto: 'Expirado', icono: '⚠️' };
  }
  if (diffDias <= 3) {
    return { clase: 'por-vencer', texto: 'Por vencer', icono: '⏳' };
  }
  return { clase: 'en-plazo', texto: 'En plazo', icono: '✓' };
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
  const [toastMsg, setToastMsg] = useState('');

  // Filtros de Bandeja
  const [filtroBusqueda, setFiltroBusqueda] = useState('');
  const [filtroCategoria, setFiltroCategoria] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('');
  const [filtroMes, setFiltroMes] = useState('');

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

  // Mostrar mensaje temporal tipo Toast
  const mostrarToast = (texto) => {
    setToastMsg(texto);
    setTimeout(() => setToastMsg(''), 4500);
  };

  // Carga general de datos desde PostgreSQL
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

  // Filtrado adicional en cliente por mes si está seleccionado
  const documentosFiltrados = useMemo(() => {
    if (!filtroMes) return documentos;
    return documentos.filter((d) => {
      const mesDoc = String(d.fecha_recepcion || '').slice(5, 7);
      return mesDoc === filtroMes;
    });
  }, [documentos, filtroMes]);

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
      mostrarToast(`Documento ${creado.numero_documento} registrado con éxito.`);

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
      mostrarToast(`Estado actualizado a "${nuevoEstado}".`);
      await cargarTodo();
      if (detalleDoc && detalleDoc.id_documento === idDoc) {
        const actualizado = await apiFetch(`/documentos/${idDoc}`);
        setDetalleDoc(actualizado);
      }
    } catch (err) {
      alert(`Error al cambiar estado: ${err.message}`);
    }
  }

  // Eliminar documento real
  async function handleEliminarDoc(id, num) {
    const confirmacion = window.confirm(
      `¿Deseas ELIMINAR el documento ${num || id}?\nEsta acción eliminará el registro de la base de datos y su archivo digitalizado de forma permanente.`
    );
    if (!confirmacion) return;

    try {
      const res = await apiFetch(`/documentos/${id}`, { method: 'DELETE' });
      if (detalleDoc?.id_documento === id) setDetalleDoc(null);
      if (visorDoc?.id === id) setVisorDoc(null);
      mostrarToast(res.mensaje || `Documento ${num || id} eliminado correctamente.`);
      await cargarTodo();
    } catch (err) {
      alert(`Error al eliminar documento: ${err.message}`);
    }
  }

  // Descargar archivo real
  async function handleDescargarDoc(id, nombre) {
    try {
      const blob = await fetchBlobUrl(`/documentos/${id}/archivo`, false);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = nombre || `documento-${id}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(`No se pudo descargar el archivo: ${err.message}`);
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
      mostrarToast('Documento actualizado correctamente.');
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
      mostrarToast('Carpeta creada con éxito.');
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
      mostrarToast(`Carpeta "${nombre}" eliminada.`);
      await cargarTodo();
    } catch (err) {
      alert(`Error: ${err.message}`);
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
      mostrarToast('Carpeta actualizada correctamente.');
      await cargarTodo();
    } catch (err) {
      alert(`Error: ${err.message}`);
    }
  }

  // Crear usuario
  async function handleCrearUsuario(e) {
    e.preventDefault();
    setUserMsg({ tipo: '', texto: '' });
    try {
      await apiFetch('/auth/usuarios', {
        method: 'POST',
        body: JSON.stringify(nuevoUsuario),
      });
      setNuevoUsuario({ nombre: '', usuario: '', contrasena: '', rol: 'Secretaria' });
      setUserMsg({ tipo: 'ok', texto: 'Usuario registrado con éxito.' });
      mostrarToast('Nuevo usuario creado exitosamente.');
      await cargarTodo();
    } catch (err) {
      setUserMsg({ tipo: 'error', texto: err.message });
    }
  }

  // Eliminar usuario
  async function handleEliminarUsuario(id, nom) {
    if (!window.confirm(`¿Eliminar al usuario ${nom}?`)) return;
    try {
      await apiFetch(`/auth/usuarios/${id}`, { method: 'DELETE' });
      mostrarToast(`Usuario ${nom} eliminado.`);
      await cargarTodo();
    } catch (err) {
      alert(`Error: ${err.message}`);
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
      mostrarToast('Usuario actualizado con éxito.');
      await cargarTodo();
    } catch (err) {
      alert(`Error: ${err.message}`);
    }
  }

  // Disparador manual del cron de alertas
  async function handleGenerarAlertas() {
    try {
      const res = await apiFetch('/notificaciones/generar-alertas', { method: 'POST' });
      mostrarToast(res.mensaje || 'Alertas sincronizadas.');
      await cargarTodo();
    } catch (err) {
      alert(`Error: ${err.message}`);
    }
  }

  // Abrir detalle
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
      {/* Toast Notification */}
      {toastMsg && (
        <div className="floating-toast">
          <span>✓ {toastMsg}</span>
        </div>
      )}

      {/* ==================== FILA 1: BARRA SUPERIOR INSTITUCIONAL ==================== */}
      <header className="top-institutional-bar">
        <div className="top-bar-left">
          <div className="top-header-title">
            <span className="header-icon">🏛️</span>
            <span>UNIDAD DE ARCHIVO Y CORRESPONDENCIA</span>
          </div>
        </div>

        <div className="top-bar-right">
          <div className="top-format-tags">
            <span className="tag-btn" title="Formato PDF institucional">PDF</span>
            <span className="tag-btn" title="Formato Microsoft Word">DOC</span>
            <span className="tag-btn" title="Sistema de Gestión Documental">SGD</span>
          </div>
        </div>
      </header>

      {/* ==================== FILA 2: SUB-BARRA DE IDENTIDAD Y USUARIO ==================== */}
      <div className="sub-institutional-bar">
        <div className="sub-bar-left">
          <div className="badge-system-pill">
            <span>🛡️</span>
            <span>Sistema Automatizado de Archivos</span>
          </div>
          <div className="sub-header-label">
            S.G.D. · GESTIÓN DOCUMENTAL
          </div>
        </div>

        <div className="sub-bar-right">
          <div className="user-profile-widget">
            <div className="user-profile-text">
              <span className="user-name-bold">{user.nombre || 'Administrador'}</span>
              <span className="user-role-sub">{user.rol || 'Administrador'}</span>
            </div>
            <div className="user-avatar-badge" title={`Usuario activo: ${user.usuario}`}>
              👤
            </div>
          </div>
        </div>
      </div>

      {/* ==================== CUERPO PRINCIPAL ==================== */}
      <div className="main-region">
        {/* ==================== SIDEBAR IZQUIERDO ("Consultas y Módulos") ==================== */}
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
              className={`sidebar-btn ${vistaActiva === 'bandeja' && !filtroEstado ? 'active' : ''}`}
              onClick={() => {
                setFiltroEstado('');
                setFiltroCategoria('');
                setFiltroMes('');
                setVistaActiva('bandeja');
              }}
            >
              <span>Bandeja General</span>
              <span className="sidebar-badge-circle">{resumen.total_documentos || documentos.length}</span>
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
            <div className="hero-left-col">
              <div className="hero-icon-box">📄</div>
              <div className="hero-content">
                <div className="hero-status-tag">
                  <span className="pulse-dot">●</span>
                  <span>SESIÓN ACTIVA</span>
                </div>
                <h2 className="hero-title">
                  Sistema <span>AUTOMATIZADO DE ARCHIVOS</span>
                </h2>
                <p className="hero-subtitle">
                  Panel de gestión de documentos digitalizados · Usuario: {user.nombre} ({user.rol})
                </p>
              </div>
            </div>

            <div className="hero-right-col">
              <button
                type="button"
                className="hero-action-pill-btn"
                onClick={() => setVistaActiva('recepcion')}
              >
                <span>+</span>
                <span>Nuevo Documento</span>
              </button>
            </div>
          </div>

          {/* ==================== RESUMEN HORIZONTAL DE ESTADO DOCUMENTAL ==================== */}
          <div className="resumen-horizontal-card">
            <div className="resumen-card-left">
              <div className="resumen-icon-square">🗓️</div>
              <div className="resumen-title-group">
                <h4 className="resumen-title">Resumen de Estado Documental</h4>
                <p className="resumen-subtitle">Conteo en tiempo real por etapa y control de vencimientos</p>
              </div>
            </div>

            <div className="resumen-card-right">
              <button
                type="button"
                className={`resumen-pill-btn pill-pendientes ${filtroEstado === 'Pendiente' ? 'selected' : ''}`}
                onClick={() => {
                  setFiltroEstado('Pendiente');
                  setVistaActiva('bandeja');
                }}
                title="Filtrar pendientes"
              >
                <span className="dot-indicator">●</span>
                <span>{resumen.pendientes || 0} Pendientes</span>
              </button>

              <button
                type="button"
                className={`resumen-pill-btn pill-respondidos ${filtroEstado === 'Respondido' ? 'selected' : ''}`}
                onClick={() => {
                  setFiltroEstado('Respondido');
                  setVistaActiva('bandeja');
                }}
                title="Filtrar respondidos"
              >
                <span>✓</span>
                <span>{resumen.respondidos || 0} Respondidos</span>
              </button>

              <button
                type="button"
                className={`resumen-pill-btn pill-archivados ${filtroEstado === 'Archivado' ? 'selected' : ''}`}
                onClick={() => {
                  setFiltroEstado('Archivado');
                  setVistaActiva('bandeja');
                }}
                title="Filtrar archivados"
              >
                <span>📁</span>
                <span>{resumen.archivados || 0} Archivados</span>
              </button>

              <button
                type="button"
                className="resumen-pill-btn pill-expirados"
                onClick={() => {
                  setVistaActiva('alertas');
                }}
                title="Ver alertas de vencimiento"
              >
                <span>⚠️</span>
                <span>{(resumen.vencidos || 0) + (resumen.por_vencer || 0)} Expirados</span>
              </button>

              <span className="resumen-chevron-arrow">›</span>
            </div>
          </div>

          {/* ==================== VISTA 1: BANDEJA / MIS DOCUMENTOS ==================== */}
          {vistaActiva === 'bandeja' && (
            <div className="main-table-card">
              <div className="mis-documentos-header">
                <div className="mis-docs-title">
                  <span className="doc-icon-blue">📄</span>
                  <span>Mis Documentos</span>
                </div>
              </div>

              {/* Barra de Filtros idéntica a la captura */}
              <div className="table-toolbar-exact">
                <div className="toolbar-dropdown-group">
                  {/* 1. Selector de Estado */}
                  <select
                    className="select-custom"
                    value={filtroEstado}
                    onChange={(e) => setFiltroEstado(e.target.value)}
                  >
                    <option value="">Todos los estados</option>
                    <option value="Pendiente">Pendiente</option>
                    <option value="Respondido">Respondido</option>
                    <option value="Archivado">Archivado</option>
                  </select>

                  {/* 2. Selector de Categorías */}
                  <select
                    className="select-custom"
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

                  {/* 3. Selector de Meses */}
                  <select
                    className="select-custom"
                    value={filtroMes}
                    onChange={(e) => setFiltroMes(e.target.value)}
                  >
                    <option value="">Todos los meses</option>
                    <option value="11">Noviembre 2026</option>
                    <option value="10">Octubre 2026</option>
                    <option value="09">Septiembre 2026</option>
                    <option value="08">Agosto 2026</option>
                    <option value="07">Julio 2026</option>
                  </select>

                  {/* 4. Buscador */}
                  <div className="search-pill-box">
                    <input
                      className="search-input-exact"
                      placeholder="Buscar por Nº, asunto o remit..."
                      value={filtroBusqueda}
                      onChange={(e) => setFiltroBusqueda(e.target.value)}
                    />
                  </div>
                </div>

                <div className="toolbar-stats-group">
                  <span className="stats-count-label">
                    {documentosFiltrados.length} resultados
                  </span>
                  <button
                    type="button"
                    className="btn-refresh-icon"
                    onClick={cargarTodo}
                    title="Recargar datos desde PostgreSQL"
                  >
                    ↻
                  </button>
                </div>
              </div>

              {/* Tabla de Documentos o Estado Vacío */}
              <div className="docs-table-wrapper">
                {documentosFiltrados.length === 0 ? (
                  <div className="empty-state-container">
                    <p className="empty-state-text">
                      No hay documentos registrados con los filtros seleccionados.
                    </p>
                    <button
                      type="button"
                      className="btn-register-first"
                      onClick={() => setVistaActiva('recepcion')}
                    >
                      + Registrar primer documento
                    </button>
                  </div>
                ) : (
                  <table className="docs-table-clean">
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>TÍTULO / ASUNTO</th>
                        <th>CATEGORÍA</th>
                        <th>PERIODO / REMITENTE</th>
                        <th>CREADO</th>
                        <th>ESTADO</th>
                        <th>ETAPA</th>
                        <th style={{ textAlign: 'center' }}>ACCIONES</th>
                      </tr>
                    </thead>
                    <tbody>
                      {documentosFiltrados.map((d) => {
                        const plazo = calcularEstadoPlazo(d.fecha_vencimiento, d.estado);
                        return (
                          <tr key={d.id_documento}>
                            {/* ID */}
                            <td className="col-id-cell">
                              <span className="id-tag-num">#{d.numero_documento}</span>
                              <span className="id-sub-rec">{d.numero_recepcion}</span>
                            </td>

                            {/* TÍTULO / ASUNTO */}
                            <td>
                              <div className="col-asunto-bold">{d.asunto}</div>
                              <div className="col-tipo-meta">
                                {d.tipo_documento} · De: {d.remitente}
                                {d.cantidad_anexos > 0 ? ` (${d.cantidad_anexos} anexos)` : ''}
                              </div>
                            </td>

                            {/* CATEGORÍA */}
                            <td>
                              <span className="badge-cat-rounded">
                                {d.categoria ? `${d.categoria.toUpperCase()} / ${d.categoria.slice(0, 3).toUpperCase()}` : (d.tipo_documento || 'CORR')}
                              </span>
                            </td>

                            {/* PERIODO / REMITENTE */}
                            <td>
                              <div className="col-periodo-top">{obtenerPeriodoTexto(d.fecha_recepcion)}</div>
                              <div className="col-remitente-sub">{d.remitente}</div>
                            </td>

                            {/* CREADO */}
                            <td style={{ whiteSpace: 'nowrap', fontSize: '0.8rem', color: '#64748B' }}>
                              {formatearFechaHora(d.fecha_recepcion, d.hora_recepcion)}
                            </td>

                            {/* ESTADO CON SELECTOR RÁPIDO */}
                            <td>
                              <select
                                className={`select-estado-inline ${d.estado}`}
                                value={d.estado}
                                onChange={(e) => handleCambiarEstado(d.id_documento, e.target.value)}
                                title="Cambiar estado del documento"
                              >
                                <option value="Pendiente">⏳ Pendiente</option>
                                <option value="Respondido">✓ Respondido</option>
                                <option value="Archivado">📁 Archivado</option>
                              </select>
                            </td>

                            {/* ETAPA / SEMÁFORO */}
                            <td>
                              <span className={`badge-etapa-pill ${plazo.clase}`}>
                                <span>{plazo.icono}</span>
                                <span>{plazo.texto}</span>
                              </span>
                            </td>

                            {/* ACCIONES REALES */}
                            <td style={{ textAlign: 'center' }}>
                              <div className="table-actions-real">
                                {/* VER DOCUMENTO REAL */}
                                <button
                                  type="button"
                                  className="btn-action-ver"
                                  onClick={() => setVisorDoc({ id: d.id_documento, titulo: `${d.numero_documento} - ${d.asunto}` })}
                                  title="Ver archivo digitalizado (PDF)"
                                >
                                  👁️ Ver
                                </button>

                                {/* DESCARGAR */}
                                <button
                                  type="button"
                                  className="btn-action-download"
                                  onClick={() => handleDescargarDoc(d.id_documento, `${d.numero_documento}.pdf`)}
                                  title="Descargar archivo físico"
                                >
                                  ⬇
                                </button>

                                {/* EDITAR */}
                                <button
                                  type="button"
                                  className="btn-action-edit"
                                  onClick={() => setEditandoDoc({ ...d })}
                                  title="Editar documento"
                                >
                                  ✏️
                                </button>

                                {/* ELIMINAR REAL */}
                                <button
                                  type="button"
                                  className="btn-action-delete"
                                  onClick={() => handleEliminarDoc(d.id_documento, d.numero_documento)}
                                  title="Eliminar documento del sistema"
                                >
                                  🗑️
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
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

              {recepcionMsg.texto && (
                <div className={`alert-${recepcionMsg.tipo === 'ok' ? 'success' : 'error'}`} style={{ marginTop: 14 }}>
                  {recepcionMsg.tipo === 'ok' ? '✓ ' : '⚠️ '}
                  {recepcionMsg.texto}
                </div>
              )}

              <form onSubmit={handleCrearDocumento} style={{ marginTop: 18 }}>
                <div className="form-grid">
                  <div className="form-group">
                    <label>1. Número Correlativo de Documento</label>
                    <input
                      className="form-control"
                      value="Se genera automáticamente (DOC-2026-XXXX)"
                      readOnly
                      style={{ background: '#F1F5F9', color: '#475569', fontWeight: 700 }}
                    />
                  </div>

                  <div className="form-group">
                    <label>2. Código de Recepción Automático</label>
                    <input
                      className="form-control"
                      value={recepcionForm.numero_recepcion}
                      readOnly
                      style={{ background: '#EFF6FF', color: '#1D4ED8', fontWeight: 800 }}
                    />
                  </div>

                  <div className="form-group">
                    <label>3. Fecha de Recepción</label>
                    <input
                      type="date"
                      className="form-control"
                      value={recepcionForm.fecha_recepcion}
                      onChange={(e) => setRecepcionForm({ ...recepcionForm, fecha_recepcion: e.target.value })}
                      required
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
                        ✓ Archivo seleccionado: {recepcionForm.archivo.name} ({(recepcionForm.archivo.size / 1024).toFixed(1)} KB)
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
            <div>
              <div className="section-heading-group">
                <h3 className="section-heading-title">📁 Categorías y Carpetas de Almacenamiento</h3>
                <p className="section-heading-sub">Organización física del almacenamiento de correspondencia en el servidor</p>
              </div>

              {puedeEscribir && (
                <div className="main-table-card" style={{ marginBottom: 20 }}>
                  <h4 style={{ fontSize: '0.92rem', fontWeight: 800, color: '#0B223D', marginBottom: 12 }}>
                    ＋ Crear Nueva Carpeta de Clasificación
                  </h4>
                  {catMsg && (
                    <div className="alert-success" style={{ marginBottom: 12 }}>
                      {catMsg}
                    </div>
                  )}
                  <form onSubmit={handleCrearCategoria} style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <input
                      className="form-control"
                      placeholder="Nombre de categoría (ej. Actas, Resoluciones)"
                      style={{ flex: 1, minWidth: 200 }}
                      value={nuevaCat.nombre}
                      onChange={(e) => setNuevaCat({ ...nuevaCat, nombre: e.target.value })}
                      required
                    />
                    <input
                      className="form-control"
                      placeholder="Descripción breve..."
                      style={{ flex: 2, minWidth: 250 }}
                      value={nuevaCat.descripcion}
                      onChange={(e) => setNuevaCat({ ...nuevaCat, descripcion: e.target.value })}
                    />
                    <button type="submit" className="btn-primary">
                      ＋ Crear Carpeta
                    </button>
                  </form>
                </div>
              )}

              <div className="folders-grid">
                {categorias.map((c) => {
                  const conteo = documentos.filter((d) => d.categoria === c.nombre || String(d.id_categoria) === String(c.id_categoria)).length;
                  return (
                    <div key={c.id_categoria} className="folder-card">
                      <div className="folder-icon">📁</div>
                      <div className="folder-name">{c.nombre}</div>
                      <div className="folder-desc">{c.descripcion || 'Sin descripción'}</div>
                      <div className="folder-path">{c.carpeta}</div>
                      <div className="folder-counter">
                        {conteo} {conteo === 1 ? 'documento' : 'documentos'}
                      </div>
                      <div className="folder-actions" style={{ marginTop: 12, display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        <button
                          type="button"
                          className="btn-table-action"
                          onClick={() => {
                            setFiltroCategoria(String(c.id_categoria));
                            setVistaActiva('bandeja');
                          }}
                          title="Ver documentos de esta carpeta"
                        >
                          👁️ Ver docs
                        </button>
                        {puedeEscribir && (
                          <>
                            <button
                              type="button"
                              className="btn-table-action btn-edit"
                              onClick={() => setEditandoCategoria({ ...c })}
                              title="Editar carpeta"
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
                  <h3 className="section-heading-title">🔔 Automatización de Alertas y Vencimientos</h3>
                  <p className="section-heading-sub">Notificaciones generadas automáticamente para documentos pendientes o por vencer</p>
                </div>
                {puedeEscribir && (
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={handleGenerarAlertas}
                    title="Ejecutar verificación de vencimientos ahora"
                  >
                    ⚡ Forzar Verificación de Alertas
                  </button>
                )}
              </div>

              <div className="docs-table-wrapper" style={{ marginTop: 16 }}>
                <table className="docs-table-clean">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>DOCUMENTO</th>
                      <th>MENSAJE DE ALERTA GENERADO</th>
                      <th>FECHA</th>
                      <th>ESTADO</th>
                    </tr>
                  </thead>
                  <tbody>
                    {notificaciones.length === 0 ? (
                      <tr>
                        <td colSpan={5} style={{ textAlign: 'center', padding: '32px', color: '#64748B' }}>
                          No hay alertas activas en este momento.
                        </td>
                      </tr>
                    ) : (
                      notificaciones.map((n) => (
                        <tr key={n.id_notificacion}>
                          <td style={{ fontWeight: 700, color: '#64748B' }}>#{n.id_notificacion}</td>
                          <td>
                            <span className="badge-cat-rounded" style={{ background: '#EFF6FF', color: '#1D4ED8' }}>
                              DOC-{n.id_documento}
                            </span>
                          </td>
                          <td style={{ fontSize: '0.85rem', color: '#1E293B', fontWeight: 600 }}>
                            {n.mensaje}
                          </td>
                          <td style={{ fontSize: '0.8rem', color: '#64748B', whiteSpace: 'nowrap' }}>
                            {formatearFechaCorta(n.fecha_notificacion || n.creado_en)}
                          </td>
                          <td>
                            <span className="badge-etapa-pill en-plazo">
                              ✓ Procesada
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ==================== VISTA 5: GESTIÓN DE USUARIOS ==================== */}
          {vistaActiva === 'usuarios' && esAdmin && (
            <div>
              <div className="section-heading-group">
                <h3 className="section-heading-title">👥 Gestión de Usuarios del Sistema</h3>
                <p className="section-heading-sub">Administración de credenciales y roles institucionales</p>
              </div>

              <div className="main-table-card" style={{ marginBottom: 20 }}>
                <h4 style={{ fontSize: '0.92rem', fontWeight: 800, color: '#0B223D', marginBottom: 12 }}>
                  ＋ Crear Nuevo Usuario
                </h4>
                {userMsg.texto && (
                  <div className={`alert-${userMsg.tipo === 'ok' ? 'success' : 'error'}`} style={{ marginBottom: 12 }}>
                    {userMsg.texto}
                  </div>
                )}
                <form onSubmit={handleCrearUsuario} style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr) auto', gap: 10, alignItems: 'flex-end' }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label>Nombre Completo</label>
                    <input
                      className="form-control"
                      placeholder="Ej. Juan Pérez"
                      value={nuevoUsuario.nombre}
                      onChange={(e) => setNuevoUsuario({ ...nuevoUsuario, nombre: e.target.value })}
                      required
                    />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label>Usuario (Login)</label>
                    <input
                      className="form-control"
                      placeholder="ej. jperez"
                      value={nuevoUsuario.usuario}
                      onChange={(e) => setNuevoUsuario({ ...nuevoUsuario, usuario: e.target.value })}
                      required
                    />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label>Contraseña</label>
                    <input
                      type="password"
                      className="form-control"
                      placeholder="Mínimo 6 caracteres"
                      value={nuevoUsuario.contrasena}
                      onChange={(e) => setNuevoUsuario({ ...nuevoUsuario, contrasena: e.target.value })}
                      required
                    />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label>Rol</label>
                    <select
                      className="form-control"
                      value={nuevoUsuario.rol}
                      onChange={(e) => setNuevoUsuario({ ...nuevoUsuario, rol: e.target.value })}
                    >
                      <option value="Administrador">Administrador</option>
                      <option value="Secretaria">Secretaria</option>
                      <option value="Consulta">Consulta</option>
                    </select>
                  </div>
                  <button type="submit" className="btn-primary" style={{ height: 38 }}>
                    ＋ Crear
                  </button>
                </form>
              </div>

              <div className="main-table-card">
                <div className="docs-table-wrapper">
                  <table className="docs-table-clean">
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>NOMBRE</th>
                        <th>USUARIO</th>
                        <th>ROL</th>
                        <th style={{ textAlign: 'right' }}>ACCIONES</th>
                      </tr>
                    </thead>
                    <tbody>
                      {usuariosList.map((u) => (
                        <tr key={u.id_usuario}>
                          <td style={{ fontWeight: 700, color: '#64748B' }}>#{u.id_usuario}</td>
                          <td style={{ fontWeight: 700, color: '#0F172A' }}>{u.nombre}</td>
                          <td><code>{u.usuario}</code></td>
                          <td>
                            <span className="badge-cat-rounded" style={{ background: u.rol === 'Administrador' ? '#EFF6FF' : '#F1F5F9' }}>
                              {u.rol}
                            </span>
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <div className="table-actions-real" style={{ justifyContent: 'flex-end' }}>
                              <button
                                type="button"
                                className="btn-action-edit"
                                onClick={() => setEditandoUsuario({ ...u, contrasena: '' })}
                                title="Editar usuario"
                              >
                                ✏️
                              </button>
                              {u.usuario !== user.usuario && (
                                <button
                                  type="button"
                                  className="btn-action-delete"
                                  onClick={() => handleEliminarUsuario(u.id_usuario, u.nombre)}
                                  title="Eliminar usuario"
                                >
                                  🗑️
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

          {/* ==================== VISTA 6: DATOS PERSONALES ==================== */}
          {vistaActiva === 'perfil' && (
            <div className="main-table-card" style={{ maxWidth: 650, margin: '0 auto 24px' }}>
              <div className="section-heading-group">
                <h3 className="section-heading-title">👤 Datos Personales del Usuario</h3>
                <p className="section-heading-sub">Información de la sesión activa en el Sistema Automatizado de Archivos</p>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16, marginTop: 18 }}>
                <div className="form-group">
                  <label>Nombre Completo</label>
                  <input className="form-control" value={user.nombre} readOnly style={{ background: '#F8FAFC' }} />
                </div>
                <div className="form-group">
                  <label>Nombre de Usuario</label>
                  <input className="form-control" value={user.usuario} readOnly style={{ background: '#F8FAFC' }} />
                </div>
                <div className="form-group">
                  <label>Rol Asignado</label>
                  <input className="form-control" value={user.rol} readOnly style={{ background: '#F8FAFC', fontWeight: 800 }} />
                </div>
                <div className="form-group">
                  <label>Estado de Sesión</label>
                  <input className="form-control" value="🟢 Activa y autenticada" readOnly style={{ background: '#ECFDF5', color: '#047857', fontWeight: 700 }} />
                </div>
              </div>

              <div style={{ marginTop: 24, paddingTop: 14, borderTop: '1px solid #E2E8F0', display: 'flex', justifyContent: 'flex-end' }}>
                <button type="button" className="sidebar-btn btn-logout" style={{ maxWidth: 160 }} onClick={handleLogout}>
                  Cerrar Sesión
                </button>
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
          onDescargar={() => handleDescargarDoc(visorDoc.id, `${visorDoc.titulo}.pdf`)}
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
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => handleDescargarDoc(detalleDoc.id_documento, `${detalleDoc.numero_documento}.pdf`)}
                >
                  ⬇ Descargar Archivo
                </button>
              </div>

              <div>
                <h4 style={{ fontSize: '0.86rem', fontWeight: 800, color: '#0B223D', marginBottom: 8 }}>
                  🕒 Historial de Trazabilidad y Cambios de Estado
                </h4>
                <div className="docs-table-wrapper">
                  <table className="docs-table-clean">
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
