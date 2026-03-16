import express from "express";
import cors from "cors";
import Database from "better-sqlite3";
import { z } from "zod";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const app = express();
app.use(cors());
app.use(express.json());

const TOTAL_SPOTS = 18;
const JWT_SECRET = process.env.JWT_SECRET || "cambia_este_secreto_super_largo";

// me gusta más utilizar el 1 para el Lunes y el 0 lo dejamos para el domingo.
const WEEKDAY_LABELS = {
  0: "Domingo",
  1: "Lunes",
  2: "Martes",
  3: "Miércoles",
  4: "Jueves",
  5: "Viernes",
  6: "Sábado",
};

// --- DB ---
const db = new Database("parking.db");
db.pragma("journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('admin', 'user'))
);

CREATE TABLE IF NOT EXISTS weekly_reservations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  spot INTEGER NOT NULL,
  name TEXT NOT NULL,
  plate TEXT NOT NULL,
  phone TEXT NOT NULL,
  weekday INTEGER NOT NULL CHECK(weekday >= 0 AND weekday <= 6),
  start_time TEXT NOT NULL,   -- HH:mm
  end_time TEXT NOT NULL,     -- HH:mm
  created_by_user_id INTEGER,
  created_by_username TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_weekly_reservations_main
ON weekly_reservations(spot, weekday, start_time, end_time);
`);

// Usuarios iniciales
const rowUsers = db.prepare("SELECT COUNT(1) as cnt FROM users").get();

if (rowUsers.cnt === 0) {
  const initialUsers = [
    { username: "admin", password: "Admin2026*", role: "admin" },
    { username: "usuario1", password: "Clave124*", role: "user" },
    { username: "usuario2", password: "Clave155*", role: "user" },
    { username: "usuario3", password: "Clave366*", role: "user" },
    { username: "usuario4", password: "Clave475*", role: "user" },
    { username: "usuario5", password: "Clave325*", role: "user" },
    { username: "usuario6", password: "Clave825*", role: "user" },
    { username: "usuario7", password: "Clave955*", role: "user" },
  ];

  const insertUser = db.prepare(`
    INSERT INTO users (username, password_hash, role)
    VALUES (?, ?, ?)
  `);

  for (const user of initialUsers) {
    const hash = bcrypt.hashSync(user.password, 10);
    insertUser.run(user.username, hash, user.role);
  }

  console.log("Raul anota los usuarios iniciales creados:");
  console.log("admin / Admin2026*");
  console.log("usuario1 / Clave124*");
  console.log("usuario2 / Clave155*");
  console.log("usuario3 / Clave366*");
  console.log("usuario4 / Clave475*");
  console.log("usuario5 / Clave325*");
  console.log("usuario6 / Clave825*");
  console.log("usuario7 / Clave955*");
}

// Estas funciones las dejo por si en algun momento lo sacas de local y alguien quiere modificar algo desde el front. 
function assertSpot(spot) {
  if (!Number.isInteger(spot) || spot < 1 || spot > TOTAL_SPOTS) {
    throw new Error(`Estacionamiento fuera de rango (1-${TOTAL_SPOTS}).`);
  }
}

function assertWeekday(weekday) {
  if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
    throw new Error("Día inválido. Usa 0=Domingo ... 6=Sábado.");
  }
}

function isValidTimeHHMM(value) {
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(value);
}

function timeToMinutes(value) {
  const [hh, mm] = value.split(":").map(Number);
  return hh * 60 + mm;
}

function assertTimeRange(startTime, endTime) {
  if (!isValidTimeHHMM(startTime) || !isValidTimeHHMM(endTime)) {
    throw new Error("Hora inválida. Usa formato HH:mm, por ejemplo 10:30.");
  }

  const startMinutes = timeToMinutes(startTime);
  const endMinutes = timeToMinutes(endTime);

  if (startMinutes >= endMinutes) {
    throw new Error("La hora de inicio debe ser menor que la hora de término.");
  }
}

function hasWeeklyOverlap(spot, weekday, startTime, endTime, ignoreId = null) {
  const stmt = db.prepare(`
    SELECT COUNT(1) as cnt
    FROM weekly_reservations
    WHERE spot = ?
      AND weekday = ?
      AND start_time < ?
      AND ? < end_time
      ${ignoreId ? "AND id != ?" : ""}
  `);

  const row = ignoreId
    ? stmt.get(spot, weekday, endTime, startTime, ignoreId)
    : stmt.get(spot, weekday, endTime, startTime);

  return row.cnt > 0;
}

function authRequired(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : null;

  if (!token) {
    return res.status(401).json({ error: "No autenticado." });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload; // { id, username, role }
    next();
  } catch {
    return res.status(401).json({ error: "Token inválido o expirado." });
  }
}

const CreateWeeklySchema = z.object({
  spot: z.number().int().min(1).max(TOTAL_SPOTS),
  name: z.string().min(1).max(120),
  plate: z.string().min(1).max(120),
  phone: z.string().min(1).max(20),
  weekday: z.number().int().min(0).max(6),
  startTime: z.string().min(5).max(5),
  endTime: z.string().min(5).max(5),
});

// las rutas de la API, mantenemos todo en ingles para seguir un estandar, no me las doy de gringo

app.get("/health", (_, res) => res.json({ ok: true }));

app.get("/", (_, res) => {
  res.send("API Estacionamientos OK ✅ Usa /health, /login, /weekly-reservations, /weekly-availability");
});

// Login
app.post("/login", (req, res) => {
  const { username, password } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({ error: "Faltan username o password." });
  }

  const user = db.prepare("SELECT * FROM users WHERE username = ?").get(username);

  if (!user) {
    return res.status(401).json({ error: "Usuario o clave inválidos." });
  }

  const ok = bcrypt.compareSync(password, user.password_hash);

  if (!ok) {
    return res.status(401).json({ error: "Usuario o clave inválidos." });
  }

  const token = jwt.sign(
    {
      id: user.id,
      username: user.username,
      role: user.role,
    },
    JWT_SECRET,
    { expiresIn: "8h" }
  );

  return res.json({
    token,
    id: user.id,
    username: user.username,
    role: user.role,
  });
});

// Público: listar reservas semanales recuerda que no es necesario iniciar sesión esta información es publica
app.get("/weekly-reservations", (req, res) => {
  const { spot, weekday } = req.query;

  let sql = `
    SELECT
      id,
      spot,
      name,
      plate,
      phone,
      weekday,
      start_time,
      end_time,
      created_by_user_id,
      created_by_username,
      created_at
    FROM weekly_reservations
  `;

  const params = [];
  const where = [];

  if (spot !== undefined && spot !== "") {
    where.push("spot = ?");
    params.push(Number(spot));
  }

  if (weekday !== undefined && weekday !== "") {
    where.push("weekday = ?");
    params.push(Number(weekday));
  }

  if (where.length) {
    sql += " WHERE " + where.join(" AND ");
  }
  //aca hago el ordenamiento por el estacionamiento, el día y el horario de inicio para que sea más fácil de visualizar, primero se muestran los estacionamientos con sus respectivas reservas ordenadas por día y hora.

  sql += " ORDER BY spot ASC, weekday ASC, start_time ASC";

  const rows = db.prepare(sql).all(...params);

  const result = rows.map((r) => ({
    ...r,
    weekday_label: WEEKDAY_LABELS[r.weekday] ?? String(r.weekday),
  }));

  res.json(result);
});

// Público: ver disponibilidad semanal de un día/rango horario
app.get("/weekly-availability", (req, res) => {
  try {
    const { weekday, startTime, endTime } = req.query;

    if (weekday === undefined || !startTime || !endTime) {
      throw new Error("Faltan weekday, startTime o endTime.");
    }

    const weekdayNumber = Number(weekday);

    assertWeekday(weekdayNumber);
    assertTimeRange(String(startTime), String(endTime));

    const available = [];

    for (let spot = 1; spot <= TOTAL_SPOTS; spot++) {
      if (!hasWeeklyOverlap(spot, weekdayNumber, String(startTime), String(endTime))) {
        available.push(spot);
      }
    }

    res.json({
      weekday: weekdayNumber,
      weekdayLabel: WEEKDAY_LABELS[weekdayNumber],
      startTime: String(startTime),
      endTime: String(endTime),
      total: TOTAL_SPOTS,
      available,
    });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Crear reserva semanal
app.post("/weekly-reservations", authRequired, (req, res) => {
  try {
    const parsed = CreateWeeklySchema.parse(req.body);
    const { spot, name, plate, phone, weekday, startTime, endTime } = parsed;

    assertSpot(spot);
    assertWeekday(weekday);
    assertTimeRange(startTime, endTime);

    if (hasWeeklyOverlap(spot, weekday, startTime, endTime)) {
      return res.status(409).json({
        error: "Choque de horario: ese estacionamiento ya está asignado en ese día y rango.",
      });
    }

    const stmt = db.prepare(`
      INSERT INTO weekly_reservations (
        spot,
        name,
        plate,
        phone,
        weekday,
        start_time,
        end_time,
        created_by_user_id,
        created_by_username
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const info = stmt.run(
      spot,
      name.trim(),
      plate.trim(),
      phone.trim(),
      weekday,
      startTime,
      endTime,
      req.user.id,
      req.user.username
    );

    const created = db
      .prepare("SELECT * FROM weekly_reservations WHERE id = ?")
      .get(info.lastInsertRowid);

    return res.status(201).json({
      ...created,
      weekday_label: WEEKDAY_LABELS[created.weekday] ?? String(created.weekday),
    });
  } catch (e) {
    if (e?.name === "ZodError") {
      return res.status(400).json({
        error: "Datos inválidos",
        details: e.errors,
      });
    }

    return res.status(400).json({ error: e.message });
  }
});

// Borrar reserva semanal
app.delete("/weekly-reservations/:id", authRequired, (req, res) => {
  const id = Number(req.params.id);

  const reservation = db
    .prepare("SELECT * FROM weekly_reservations WHERE id = ?")
    .get(id);

  if (!reservation) {
    return res.status(404).json({ error: "No existe esa reserva." });
  }

  const isAdmin = req.user.role === "admin";
  const isOwner = Number(reservation.created_by_user_id) === Number(req.user.id);

  // Solo el admin o el usuario que creó la reserva pueden borrarla
  if (!isAdmin && !isOwner) {
    return res.status(403).json({
      error: "No tienes permiso para borrar una reserva creada por otro usuario.",
    });
  }

  const info = db.prepare("DELETE FROM weekly_reservations WHERE id = ?").run(id);

  if (info.changes === 0) {
    return res.status(404).json({ error: "No existe esa reserva." });
  }

  return res.json({ ok: true });
});

// Usuario actual
app.get("/me", authRequired, (req, res) => {
  res.json({
    id: req.user.id,
    username: req.user.username,
    role: req.user.role,
  });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`API en http://localhost:${PORT}`);
});