Sistema de Reservas de Estacionamientos

Aplicación web para gestionar reservas de estacionamientos por día y hora.

El sistema permite reservar un total de **18 estacionamientos**, evitando conflictos de horario mediante validación en el backend.

---

# Tecnologías utilizadas

Frontend:
- React
- Vite

Backend:
- Node.js
- Express

Base de datos:
- SQLite

---

# Estructura del proyecto


estacionamiento/
│
├── client/ # Aplicación React (frontend)
│
├── server/ # API Node.js (backend)
│
└── README.md


---

# Requisitos

Antes de ejecutar el sistema se necesita tener instalado:

- Node.js **v18 o superior**
- npm

Verificar instalación:


node -v
npm -v


---

# Instalación

Clonar el repositorio:


git clone <URL_DEL_REPOSITORIO>
cd estacionamiento


---

# Ejecutar el Backend (API)

Ir a la carpeta del servidor:


cd server


Instalar dependencias:


npm install


Ejecutar el servidor:


npm run dev


El backend quedará disponible en:


http://localhost:4000


Endpoint de prueba:


http://localhost:4000/health


---

# Ejecutar el Frontend

Abrir una nueva terminal y entrar al frontend:


cd client


Instalar dependencias:


npm install


Ejecutar la aplicación:


npm run dev


El frontend estará disponible en:


http://localhost:5173


---

# Comunicación Frontend – Backend

El frontend utiliza la variable de entorno:


VITE_API_URL


Si es necesario modificar la URL de la API, crear un archivo:


client/.env


Con el contenido:


VITE_API_URL=http://localhost:4000


---

# Base de datos

El sistema utiliza **SQLite**.

El archivo de base de datos se genera automáticamente en:


server/parking.db


Archivos asociados:


parking.db
parking.db-shm
parking.db-wal


Estos archivos **no se incluyen en el repositorio Git**, ya que son generados automáticamente.

---

# Endpoints de la API

### Ver estado del servidor


GET /health


---

### Obtener reservas


GET /reservations


---

### Ver disponibilidad de estacionamientos


GET /availability?startAt=YYYY-MM-DDTHH:mm&endAt=YYYY-MM-DDTHH:mm


Ejemplo:


/availability?startAt=2026-03-05T09:00&endAt=2026-03-05T11:00


---

### Crear reserva


POST /reservations


Body ejemplo:


{
"name": "Felipe",
"spot": 5,
"startAt": "2026-03-05T09:00",
"endAt": "2026-03-05T11:00"
}


---

### Cancelar reserva


DELETE /reservations/:id


---

# Build para producción (Frontend)

En caso que se requiere generar el build del frontend:


cd client
npm run build


Esto generará la carpeta:


client/dist


La cual puede ser desplegada en un servidor web como:

- Docker
- Node static server

---

# Notas

- El proyecto fue diseñado para uso en red local.
- La base de datos SQLite se crea automáticamente.
- No es necesario configurar la base de datos manualmente.

---

# Autor

Desarrollado por **Felipe Toro**
