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

const WEEKDAY_LABELS = {
  0: "Domingo",
  1: "Lunes",
  2: "Martes",
  3: "Miércoles",
  4: "Jueves",
  5: "Viernes",
  6: "Sábado",
};

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
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  created_by_user_id INTEGER,
  created_by_username TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_weekly_reservations_main
ON weekly_reservations(spot, weekday, start_time, end_time);

CREATE TABLE IF NOT EXISTS head_spots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  spot INTEGER NOT NULL CHECK(spot >= 1 AND spot <= 18),
  UNIQUE(user_id, spot),
  UNIQUE(spot),
  FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_head_spots_user
ON head_spots(user_id);

CREATE TABLE IF NOT EXISTS teachers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  plate TEXT NOT NULL,
  phone TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_teachers_user
ON teachers(user_id);
`);

const rowUsers = db.prepare("SELECT COUNT(1) as cnt FROM users").get();

if (rowUsers.cnt === 0) {
  const initialUsers = [
        // administadores
    { username: "Global", password: "Admin2026*", role: "admin" },
    { username: "marcelabastias", password: "marcela.2026*", role: "admin" },
    { username: "daphnehernandez", password: "daphne.2026$", role: "admin" },
    { username: "jaimeguajardo", password: "jaime.2026_", role: "admin" }
    
   
  
  ];

  const insertUser = db.prepare(`
    INSERT INTO users (username, password_hash, role)
    VALUES (?, ?, ?)
  `);

  for (const user of initialUsers) {
    const hash = bcrypt.hashSync(user.password, 10);
    insertUser.run(user.username, hash, user.role);
  }

  console.log("Usuarios iniciales creados:");
  console.log("admin / Admin2026*");
  console.log("marcelabastias / marcela.2026*");
  console.log("daphnehernandez / daphne.2026$");
  console.log("jaimeguajardo / jaime.2026_");

}

// ---------- Helpers ----------
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
    throw new Error("Hora inválida. Usa formato HH:mm.");
  }

  const startMinutes = timeToMinutes(startTime);
  const endMinutes = timeToMinutes(endTime);

  if (startMinutes >= endMinutes) {
    throw new Error("La hora de inicio debe ser menor que la hora de término.");
  }
}

function hasWeeklyOverlap(spot, weekday, startTime, endTime) {
  const stmt = db.prepare(`
    SELECT COUNT(1) as cnt
    FROM weekly_reservations
    WHERE spot = ?
      AND weekday = ?
      AND start_time < ?
      AND ? < end_time
  `);

  const row = stmt.get(spot, weekday, endTime, startTime);
  return row.cnt > 0;
}

function authRequired(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: "No autenticado." });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ error: "Token inválido o expirado." });
  }
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({ error: "Solo el administrador puede realizar esta acción." });
  }
  next();
}

function getAssignedSpots(userId) {
  const rows = db
    .prepare("SELECT spot FROM head_spots WHERE user_id = ? ORDER BY spot ASC")
    .all(userId);

  return rows.map((r) => Number(r.spot));
}

function isSpotAssignedToUser(userId, spot) {
  const row = db
    .prepare("SELECT 1 FROM head_spots WHERE user_id = ? AND spot = ?")
    .get(userId, spot);

  return !!row;
}

// ---------- Schemas ----------
const CreateWeeklySchema = z.object({
  spot: z.number().int().min(1).max(TOTAL_SPOTS),
  name: z.string().trim().max(120).optional(),
  plate: z.string().trim().max(120).optional(),
  phone: z.string().trim().max(20).optional(),
  weekday: z.number().int().min(0).max(6),
  startTime: z.string().min(5).max(5),
  endTime: z.string().min(5).max(5),
  teacherId: z.number().int().positive().optional(),
});

const CreateHeadSchema = z.object({
  username: z.string().trim().min(3).max(50),
  password: z.string().min(6).max(100),
  spots: z.array(z.number().int().min(1).max(TOTAL_SPOTS)).min(1).max(2),
});

const CreateTeacherSchema = z.object({
  name: z.string().trim().min(1).max(120),
  plate: z.string().trim().min(1).max(120),
  phone: z.string().trim().min(1).max(20),
});

// ---------- API ----------
app.get("/health", (_, res) => res.json({ ok: true }));

app.get("/", (_, res) => {
  res.send("API Estacionamientos OK");
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

// Usuario actual
app.get("/me", authRequired, (req, res) => {
  const assignedSpots =
    req.user.role === "user"
      ? getAssignedSpots(req.user.id)
      : Array.from({ length: TOTAL_SPOTS }, (_, i) => i + 1);

  res.json({
    id: req.user.id,
    username: req.user.username,
    role: req.user.role,
    assignedSpots,
  });
});

// ---------- Jefes ----------
app.get("/heads", authRequired, requireAdmin, (req, res) => {
  const users = db
    .prepare(`
      SELECT id, username, role
      FROM users
      WHERE role = 'user'
      ORDER BY username ASC
    `)
    .all();

  const result = users.map((u) => ({
    ...u,
    assignedSpots: getAssignedSpots(u.id),
  }));

  res.json(result);
});

app.post("/heads", authRequired, requireAdmin, (req, res) => {
  try {
    const parsed = CreateHeadSchema.parse(req.body);
    const { username, password, spots } = parsed;

    const uniqueSpots = [...new Set(spots)];

    if (uniqueSpots.length < 1 || uniqueSpots.length > 2) {
      return res.status(400).json({ error: "Debes asignar 1 o 2 estacionamientos distintos." });
    }

    const existingUser = db.prepare("SELECT id FROM users WHERE username = ?").get(username);
    if (existingUser) {
      return res.status(409).json({ error: "Ese username ya existe." });
    }

    for (const spot of uniqueSpots) {
      const spotTaken = db.prepare("SELECT user_id FROM head_spots WHERE spot = ?").get(spot);
      if (spotTaken) {
        return res.status(409).json({ error: `El estacionamiento ${spot} ya está asignado a otro jefe.` });
      }
    }

    const passwordHash = bcrypt.hashSync(password, 10);

    const tx = db.transaction(() => {
      const userInfo = db
        .prepare(`
          INSERT INTO users (username, password_hash, role)
          VALUES (?, ?, 'user')
        `)
        .run(username, passwordHash);

      const newUserId = Number(userInfo.lastInsertRowid);

      const insertSpot = db.prepare(`
        INSERT INTO head_spots (user_id, spot)
        VALUES (?, ?)
      `);

      for (const spot of uniqueSpots) {
        insertSpot.run(newUserId, spot);
      }

      return newUserId;
    });

    const newUserId = tx();

    const created = db
      .prepare(`
        SELECT id, username, role
        FROM users
        WHERE id = ?
      `)
      .get(newUserId);

    return res.status(201).json({
      ...created,
      assignedSpots: getAssignedSpots(newUserId),
    });
  } catch (e) {
    if (e?.name === "ZodError") {
      return res.status(400).json({ error: "Datos inválidos", details: e.errors });
    }
    return res.status(400).json({ error: e.message });
  }
});

// ---------- Docentes ----------
app.get("/teachers", authRequired, (req, res) => {
  let rows = [];

  if (req.user.role === "admin") {
    rows = db
      .prepare(`
        SELECT
          t.id,
          t.user_id,
          u.username as owner_username,
          t.name,
          t.plate,
          t.phone,
          t.active,
          t.created_at
        FROM teachers t
        JOIN users u ON u.id = t.user_id
        ORDER BY u.username ASC, t.name ASC
      `)
      .all();
  } else {
    rows = db
      .prepare(`
        SELECT
          id,
          user_id,
          name,
          plate,
          phone,
          active,
          created_at
        FROM teachers
        WHERE user_id = ?
        ORDER BY name ASC
      `)
      .all(req.user.id);
  }

  res.json(rows);
});

app.post("/teachers", authRequired, (req, res) => {
  try {
    if (req.user.role !== "user") {
      return res.status(403).json({ error: "Solo los jefes pueden crear docentes." });
    }

    const parsed = CreateTeacherSchema.parse(req.body);

    const info = db
      .prepare(`
        INSERT INTO teachers (user_id, name, plate, phone, active)
        VALUES (?, ?, ?, ?, 1)
      `)
      .run(req.user.id, parsed.name, parsed.plate, parsed.phone);

    const created = db
      .prepare(`
        SELECT id, user_id, name, plate, phone, active, created_at
        FROM teachers
        WHERE id = ?
      `)
      .get(info.lastInsertRowid);

    return res.status(201).json(created);
  } catch (e) {
    if (e?.name === "ZodError") {
      return res.status(400).json({ error: "Datos inválidos", details: e.errors });
    }
    return res.status(400).json({ error: e.message });
  }
});

app.delete("/teachers/:id", authRequired, (req, res) => {
  const teacherId = Number(req.params.id);

  const teacher = db
    .prepare(`
      SELECT id, user_id
      FROM teachers
      WHERE id = ?
    `)
    .get(teacherId);

  if (!teacher) {
    return res.status(404).json({ error: "No existe ese docente." });
  }

  const isAdmin = req.user.role === "admin";
  const isOwner = Number(teacher.user_id) === Number(req.user.id);

  if (!isAdmin && !isOwner) {
    return res.status(403).json({ error: "No tienes permiso para borrar este docente." });
  }

  db.prepare("DELETE FROM teachers WHERE id = ?").run(teacherId);
  return res.json({ ok: true });
});

// ---------- Público ----------
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

  sql += " ORDER BY spot ASC, weekday ASC, start_time ASC";

  const rows = db.prepare(sql).all(...params);

  const result = rows.map((r) => ({
    ...r,
    weekday_label: WEEKDAY_LABELS[r.weekday] ?? String(r.weekday),
  }));

  res.json(result);
});

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

// ---------- Reservas ----------
app.post("/weekly-reservations", authRequired, (req, res) => {
  try {
    const parsed = CreateWeeklySchema.parse(req.body);
    let { spot, name, plate, phone, weekday, startTime, endTime, teacherId } = parsed;

    assertSpot(spot);
    assertWeekday(weekday);
    assertTimeRange(startTime, endTime);

    if (req.user.role === "user" && !isSpotAssignedToUser(req.user.id, spot)) {
      return res.status(403).json({
        error: "Solo puedes reservar en los estacionamientos asignados a tu jefatura.",
      });
    }

    if (teacherId) {
      const teacher = db
        .prepare(`
          SELECT id, user_id, name, plate, phone, active
          FROM teachers
          WHERE id = ?
        `)
        .get(teacherId);

      if (!teacher) {
        return res.status(404).json({ error: "No existe el docente seleccionado." });
      }

      if (req.user.role === "user" && Number(teacher.user_id) !== Number(req.user.id)) {
        return res.status(403).json({ error: "Ese docente no pertenece a tu jefatura." });
      }

      if (Number(teacher.active) !== 1) {
        return res.status(400).json({ error: "Ese docente está inactivo." });
      }

      name = teacher.name;
      plate = teacher.plate;
      phone = teacher.phone;
    }

    if (!String(name || "").trim()) return res.status(400).json({ error: "Escribe un nombre." });
    if (!String(plate || "").trim()) return res.status(400).json({ error: "Escribe una patente." });
    if (!String(phone || "").trim()) return res.status(400).json({ error: "Escribe un teléfono." });

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
      String(name).trim(),
      String(plate).trim(),
      String(phone).trim(),
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

  if (!isAdmin && !isOwner) {
    return res.status(403).json({
      error: "No tienes permiso para borrar una reserva creada por otro usuario.",
    });
  }

  db.prepare("DELETE FROM weekly_reservations WHERE id = ?").run(id);
  return res.json({ ok: true });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`API en http://localhost:${PORT}`);
});