import express from "express";
import cors from "cors";
import Database from "better-sqlite3";
import { z } from "zod";
import bcrypt from "bcryptjs";        // 👈 NUEVO
import jwt from "jsonwebtoken";       // 👈 NUEVO

const app = express();
app.use(cors());
app.use(express.json());

const TOTAL_SPOTS = 18;
const JWT_SECRET = process.env.JWT_SECRET || "cambia_este_secreto_super_largo"; // 👈 cambia esto en producción

// --- DB ---
const db = new Database("parking.db");
db.pragma("journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS reservations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  spot INTEGER NOT NULL,
  name TEXT NOT NULL,
  plate TEXT NOT NULL,
  phone TEXT NOT NULL,
  start_at TEXT NOT NULL, -- ISO string
  end_at TEXT NOT NULL,   -- ISO string
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_res_spot_start_end
ON reservations(spot, start_at, end_at);

-- 👇 Tabla de administradores
CREATE TABLE IF NOT EXISTS admins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL
);
`);

// 👇 Crear admin por defecto si no hay ninguno
const rowAdmins = db.prepare("SELECT COUNT(1) as cnt FROM admins").get();
if (rowAdmins.cnt === 0) {
  const hash = bcrypt.hashSync("1234", 10); // clave: 1234
  db.prepare(`
    INSERT INTO admins (username, password_hash)
    VALUES (?, ?)
  `).run("admin", hash);

  console.log("Admin por defecto creado: admin / 1234");
}

// --- helpers ---
function assertSpot(spot) {
  if (!Number.isInteger(spot) || spot < 1 || spot > TOTAL_SPOTS) {
    throw new Error(`Estacionamiento fuera de rango (1-${TOTAL_SPOTS}).`);
  }
}

function assertInterval(startAt, endAt) {
  const start = new Date(startAt);
  const end = new Date(endAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new Error("startAt/endAt inválidos. Usa ISO (ej: 2026-02-13T09:00:00-03:00)");
  }
  if (start >= end) throw new Error("startAt debe ser menor que endAt.");
}

function hasOverlap(spot, startAt, endAt, ignoreId = null) {
  const stmt = db.prepare(`
    SELECT COUNT(1) as cnt
    FROM reservations
    WHERE spot = ?
      AND start_at < ?
      AND ? < end_at
      ${ignoreId ? "AND id != ?" : ""}
  `);

  const row = ignoreId
    ? stmt.get(spot, endAt, startAt, ignoreId)
    : stmt.get(spot, endAt, startAt);

  return row.cnt > 0;
}

const CreateSchema = z.object({
  spot: z.number().int().min(1).max(TOTAL_SPOTS),
  name: z.string().min(1).max(120),
  plate: z.string().min(1).max(120),
  phone: z.string().min(1).max(20),
  startAt: z.string().min(10),
  endAt: z.string().min(10),
});

// 👇 Middleware para verificar token de admin
function authAdmin(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : null;

  if (!token) {
    return res.status(401).json({ error: "No autenticado." });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    // payload: { id, username }
    req.admin = payload;
    next();
  } catch (e) {
    return res.status(401).json({ error: "Token inválido o expirado." });
  }
}

app.get("/health", (_, res) => res.json({ ok: true }));

// 👇 Login de administrador
app.post("/login", (req, res) => {
  const { username, password } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({ error: "Faltan username o password." });
  }

  const admin = db
    .prepare("SELECT * FROM admins WHERE username = ?")
    .get(username);

  if (!admin) {
    return res.status(401).json({ error: "Usuario o clave inválidos." });
  }

  const ok = bcrypt.compareSync(password, admin.password_hash);
  if (!ok) {
    return res.status(401).json({ error: "Usuario o clave inválidos." });
  }

  const token = jwt.sign(
    { id: admin.id, username: admin.username },
    JWT_SECRET,
    { expiresIn: "8h" }
  );

  res.json({
    token,
    username: admin.username,
  });
});

// Listar reservas (🔓 PÚBLICO, SIN LOGIN)
app.get("/reservations", (req, res) => {
  const { from, to, spot } = req.query;

  let sql = "SELECT * FROM reservations";
  const params = [];
  const where = [];

  if (spot) {
    where.push("spot = ?");
    params.push(Number(spot));
  }
  if (from) {
    // reservas que terminan después de "from"
    where.push("end_at > ?");
    params.push(String(from));
  }
  if (to) {
    // reservas que empiezan antes de "to"
    where.push("start_at < ?");
    params.push(String(to));
  }

  if (where.length) sql += " WHERE " + where.join(" AND ");
  sql += " ORDER BY start_at ASC, spot ASC";

  const rows = db.prepare(sql).all(...params);
  res.json(rows);
});

// Ver disponibilidad (solo para admin, porque es parte del flujo de reserva)
app.get("/availability", authAdmin, (req, res) => {
  const { startAt, endAt } = req.query;
  try {
    if (!startAt || !endAt) throw new Error("Faltan startAt y endAt.");
    assertInterval(String(startAt), String(endAt));

    const available = [];
    for (let spot = 1; spot <= TOTAL_SPOTS; spot++) {
      if (!hasOverlap(spot, String(startAt), String(endAt))) available.push(spot);
    }
    res.json({ total: TOTAL_SPOTS, available });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Crear reserva (🔐 SOLO ADMIN)
app.post("/reservations", authAdmin, (req, res) => {
  try {
    const parsed = CreateSchema.parse(req.body);
    const { spot, name, plate, phone, startAt, endAt } = parsed;

    assertSpot(spot);
    assertInterval(startAt, endAt);

    if (hasOverlap(spot, startAt, endAt)) {
      return res.status(409).json({ error: "Choque de horario: spot no disponible en ese rango." });
    }

    const stmt = db.prepare(`
      INSERT INTO reservations (spot, name, plate, phone, start_at, end_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const info = stmt.run(spot, name.trim(), plate.trim(), phone.trim(), startAt, endAt);

    const created = db.prepare("SELECT * FROM reservations WHERE id = ?").get(info.lastInsertRowid);
    res.status(201).json(created);
  } catch (e) {
    if (e?.name === "ZodError") {
      return res.status(400).json({ error: "Datos inválidos", details: e.errors });
    }
    res.status(400).json({ error: e.message });
  }
});

// Cancelar reserva (🔐 SOLO ADMIN)
app.delete("/reservations/:id", authAdmin, (req, res) => {
  const id = Number(req.params.id);
  const info = db.prepare("DELETE FROM reservations WHERE id = ?").run(id);
  if (info.changes === 0) return res.status(404).json({ error: "No existe esa reserva." });
  res.json({ ok: true });
});

const PORT = process.env.PORT || 4000;

app.get("/", (_, res) => {
  res.send("API Estacionamientos OK ✅ Usa /health, /login, /reservations, /availability");
});
app.listen(PORT, () => console.log(`API en http://localhost:${PORT}`));