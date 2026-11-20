# Sistema Automatizado de Archivos y Gestión Documental (S.G.D.)

**Facultad Integral de Ichilo · Universidad Autónoma Gabriel René Moreno**  
*Módulos Oficiales de Dirección de Carrera (Ingeniería en Sistemas)*

Sistema integral web para la digitalización, recepción, clasificación, correlativos anuales, seguimiento y control documental institucional.

---

## 🏛️ Módulos Oficiales de Dirección de Carrera

Con base en la operativa real de la Dirección de Carrera (entrevista a la Dirección), el sistema cuenta con 5 módulos troncales:

### 1. 📤 Documentos Expedidos (Oficios y Notas Oficiales)
- Numeración correlativa anual obligatoria (`OF-2026-0112`, etc.) que se reinicia a `01` cada primero de enero.
- Control de notas y oficios emitidos hacia Decanato, Vicedecanatura, DPA, docentes y estudiantes.
- Adjunto digital escaneado con previsualización inline y descarga de copias originales.

### 2. 📥 Documentos Recibidos (Mesa de Entradas y Partes)
- Número de recepción correlativo automático (`REC-0001`, `REC-0002`...).
- Fecha y hora exactas registradas automáticamente al momento de la recepción.
- **Sistema de Semáforo de Gestión**:
  - 🔴 **Pendiente**: Trámite recibido en espera de atención o derivación.
  - 🟡 **En curso**: Trámite derivado o en revisión técnica.
  - 🟢 **Completado**: Trámite atendido con respuesta emitida o finalizado.
- **Control de Respuesta Obligatoria**: Identificación rápida de solicitudes de estudiantes o notas externas que requieren respuesta escrita frente a circulares puramente informativas.

### 3. 🎓 Actas de Graduación y Titulación
- Registro con **Código Único CPD** (proporcionado por el Centro de Procesamiento de Datos).
- Control de estudiante (Nombre completo, Registro Universitario, Cédula de Identidad).
- Calificación y nota final sobre 100 puntos.
- Clasificación por áreas y modalidades oficiales:
  - **Graduación Directa**: *Excelencia Académica*, *Buen Rendimiento*, *Buen Desempeño*.
  - **GRL001 - Modalidades con Defensa**: *Tesis de Grado*, *Trabajo Dirigido*, *Examen de Grado*, *Proyecto de Grado*, *Diplomado*.
- **Distribución Reglamentaria**: Registro de 1 ejemplar al CPD, 3 ejemplares a Caja Central y 1 ejemplar al Archivo de Dirección de Carrera.
- Archivo digitalizado del acta firmada con visor y descarga.

### 4. 👥 Auxiliares de Cátedra y Docencia
- Seguimiento por materia (ej. Cálculo I, Estructuras Discretas, Programación I) y periodo académico (`2026 - 2do Semestre`).
- Estudiante auxiliar: Nombre completo, Registro y CI.
- Nota del examen de concurso de méritos.
- **Tipo de Designación**:
  - **Convocatoria**: Concurso público de méritos y examen (1er semestre).
  - **Ratificación**: Ratificación semestral para el 2do semestre mediante propuesta al Consejo de Carrera.
- Registro de N° de oficio de propuesta de Dirección y N° de resolución de Consejo de Carrera.
- Botón de acción rápida: *Ratificar para el siguiente periodo*.

### 5. 👨‍🏫 Plantel Docente (Files Digitales de Cátedra)
- Carpeta digital por docente con control de 4 documentos clave:
  1. 📄 **Currículum Vitae (CV)** actualizado.
  2. 📑 **Programa Analítico** de la materia impartida.
  3. 📊 **Informe Final de Cátedra** semestral.
  4. 📝 **Lista de Asistencia** de alumnos para habilitación.
- **Indicador de Semáforo**: Identificación de docentes con *Informe Final Entregado* (Verde) vs. *Informe Pendiente* (Rojo).
- Carga y reemplazo independiente de archivos digitales en cada file de docente.

---

## 🛠️ Tecnologías Utilizadas

- **Frontend**: React 19, Vite, CSS modular institucional Gabriel René Moreno.
- **Backend**: Node.js (ES Modules), Express, Multer, pg, jsonwebtoken, bcryptjs, node-cron, helmet, cors.
- **Base de Datos**: PostgreSQL 17 con triggers automáticos de correlativos, historial y auditoría.

---

## 📁 Estructura del Repositorio

```text
├── backend/
│   ├── sql/
│   │   ├── 001_schema.sql             # Tablas base, roles y triggers
│   │   ├── 002_backend.sql            # Secuencias y categorías iniciales
│   │   ├── 003_recepcion_campos.sql   # Campos de mesa de partes
│   │   └── 004_direccion_carrera.sql  # Módulos: Expedidos, Actas, Auxiliares, Docentes
│   ├── src/
│   │   ├── routes/
│   │   │   ├── actas.js               # API Actas de Graduación y CPD
│   │   │   ├── auxiliares.js          # API Auxiliares de Cátedra
│   │   │   ├── docentes.js            # API Files Docentes y 4 documentos
│   │   │   ├── documentos.js          # API Documentos, Recepción y Oficios
│   │   │   ├── auth.js                # Login y usuarios
│   │   │   └── categorias.js          # Categorías
│   │   ├── db.js                      # Conexión pool PostgreSQL
│   │   └── server.js                  # Servidor Express
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── DocumentosExpedidos.jsx  # Vista y modal de Oficios expedidos
│   │   │   ├── DocumentosRecibidos.jsx   # Vista de Mesa de Partes y semáforos
│   │   │   ├── ActasGraduacion.jsx      # Vista de Actas CPD y modalidades
│   │   │   ├── AuxiliaresCatedra.jsx    # Vista de Auxiliares y ratificaciones
│   │   │   └── PlantelDocente.jsx       # Vista de files de docentes
│   │   ├── App.jsx                      # Shell principal y navegación
│   │   ├── App.css                      # Estilos institucionales
│   │   └── api.js                       # Cliente HTTP y gestión de sesión
│   └── package.json
└── README.md
```

---

## 🚀 Puesta en Marcha

### 1. Base de Datos (PostgreSQL 17)
Con la base de datos `gestor_de_documentos` creada en PostgreSQL:
```bash
psql -U postgres -d gestor_de_documentos -f backend/sql/001_schema.sql
psql -U postgres -d gestor_de_documentos -f backend/sql/002_backend.sql
psql -U postgres -d gestor_de_documentos -f backend/sql/003_recepcion_campos.sql
psql -U postgres -d gestor_de_documentos -f backend/sql/004_direccion_carrera.sql
```

### 2. Iniciar el Backend (Puerto 4000)
```bash
cd backend
npm install
npm run dev
```

### 3. Iniciar el Frontend (Puerto 5173)
```bash
cd frontend
npm install
npm run dev
```

Abre en tu navegador:  
👉 **`http://localhost:5173`**

### 🔑 Credenciales de Acceso
- **Usuario**: `admin` (o `www.pedrito7551@gmail.com`)
- **Contraseña**: `admin123456`
