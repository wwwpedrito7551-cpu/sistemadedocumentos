# Backend – Sistema automatizado de archivos

Node.js + Express + PostgreSQL.

## Puesta en marcha

1. Ejecuta tu script SQL original y luego `sql/002_backend.sql`.
2. `cp .env.example .env` y completa `DATABASE_URL` y `JWT_SECRET`.
3. `npm install`
4. Crea el primer administrador (el endpoint de usuarios exige estar logueado como admin):

   ```bash
   node -e "import('bcryptjs').then(async b=>console.log(await b.default.hash('TuClave123',12)))"
   ```
   ```sql
   INSERT INTO usuarios (nombre, usuario, contrasena, rol)
   VALUES ('Administrador', 'admin', '<hash generado>', 'Administrador');
   ```
5. `npm run dev`

## Endpoints (todos bajo /api, salvo login, con `Authorization: Bearer <token>`)

| Método | Ruta | Rol |
|---|---|---|
| POST | /auth/login | público |
| POST | /auth/usuarios | Administrador |
| GET | /categorias | todos |
| POST | /categorias | Administrador |
| POST | /documentos (multipart: archivo, tipo_documento, remitente, asunto, id_categoria, fecha_vencimiento) | Administrador, Secretaria |
| GET | /documentos?estado=&id_categoria=&q=&desde=&hasta=&page=&limit= | todos |
| GET | /documentos/resumen | todos |
| GET | /documentos/:id | todos |
| GET | /documentos/:id/archivo | todos |
| PATCH | /documentos/:id/estado `{ "estado": "Respondido" }` | Administrador, Secretaria |
| GET | /notificaciones | todos |
