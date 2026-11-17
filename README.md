# Sistema Automatizado de Archivos y Gestión Documental (S.G.D.)

**Facultad Integral de Ichilo · Ingeniería en Sistemas**

Sistema web integral para la digitalización, recepción, clasificación, seguimiento y control de vencimiento de documentos institucionales.

---

## 🏛️ Características Principales

- **Módulo de Recepción y Registro de Documentos**:
  - Número de recepción automático con secuencia correlativa (`REC-0001`, `REC-0002`...).
  - Registro automático de fecha y hora exacta de recepción.
  - Registro de remitente, destinatario o departamento, responsable de recepción y medio (presencial o digital).
  - Control de cantidad de anexos y observaciones del trámite.
  - Gestión de estados de trámite: `Recibido`, `Pendiente`, `Derivado`, `Respondido`, `Finalizado`, `Archivado`.
- **Digitalización y Deduplicación**:
  - Almacenamiento seguro en disco con control de rutas y prevención de path traversal.
  - Deduplicación por hash criptográfico **SHA-256** para evitar archivos duplicados.
  - Visor integrado de archivos PDF e imágenes en la plataforma.
- **Trazabilidad y Auditoría (PostgreSQL Triggers)**:
  - Registro automático de cada cambio de estado en `historial_documentos` asociando al usuario responsable.
  - Cola automatizada de alertas y notificaciones con soporte de despachador cron diario.
- **Seguridad y Control de Acceso (RBAC)**:
  - Autenticación mediante tokens JWT y contraseñas cifradas con bcrypt (coste 12).
  - Roles definidos: **`Administrador`**, **`Secretaria`** y **`Consulta`**.

---

## 🛠️ Tecnologías Utilizadas

- **Frontend**: React 19, Vite, CSS modular institucional.
- **Backend**: Node.js (ES Modules), Express, Multer, pg, jsonwebtoken, bcryptjs, node-cron, helmet, cors.
- **Base de Datos**: PostgreSQL 17.

---

## 📁 Estructura del Repositorio

```text
├── backend/
│   ├── sql/                 # Scripts SQL (esquema, triggers y recepción)
│   ├── src/
│   │   ├── routes/          # Endpoints: auth, categorias, documentos, notificaciones
│   │   ├── middleware/      # Autenticación JWT, control de roles y subida con multer
│   │   ├── jobs/            # Tareas programadas (alertas de vencimiento)
│   │   ├── db.js            # Conexión y transacciones a PostgreSQL
│   │   └── server.js        # Punto de entrada de la API Express
│   └── package.json
├── frontend/
│   ├── src/                 # Componentes React, interfaz institucional y llamadas API
│   ├── index.html           # Plantilla principal
│   └── package.json
└── README.md
```

---

## 🚀 Puesta en Marcha

### 1. Requisitos Previos
- **Node.js** v20 o superior.
- **PostgreSQL** v15 o superior con una base de datos creada (ej. `gestor_de_documentos`).

### 2. Configurar el Backend
```bash
cd backend
npm install
```
Crear o verificar el archivo `.env` en la carpeta `backend/`:
```env
PORT=4000
DATABASE_URL=postgresql://postgres:tu_password@localhost:5432/gestor_de_documentos
JWT_SECRET=tu_secreto_jwt_seguro
STORAGE_ROOT=./storage
CORS_ORIGIN=http://localhost:5173
```
Ejecutar los scripts de base de datos en PostgreSQL:
```bash
psql -U postgres -d gestor_de_documentos -f sql/001_schema.sql
psql -U postgres -d gestor_de_documentos -f sql/002_backend.sql
psql -U postgres -d gestor_de_documentos -f sql/003_recepcion_campos.sql
```
Iniciar el servidor:
```bash
npm run dev
```

### 3. Configurar el Frontend
```bash
cd frontend
npm install
npm run dev
```
La aplicación estará disponible en `http://localhost:5173`.
