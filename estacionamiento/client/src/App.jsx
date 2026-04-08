import { useEffect, useMemo, useState } from "react";

const API = import.meta.env.VITE_API_URL || "http://localhost:4000";

const WEEKDAYS = [
  { value: 1, label: "Lunes" },
  { value: 2, label: "Martes" },
  { value: 3, label: "Miércoles" },
  { value: 4, label: "Jueves" },
  { value: 5, label: "Viernes" },
  { value: 6, label: "Sábado" },
  { value: 0, label: "Domingo" },
];

function timeToMinutes(timeStr) {
  const [h, m] = String(timeStr).split(":").map(Number);
  return h * 60 + m;
}

function sortWeeklyReservations(rows) {
  return [...rows].sort((a, b) => {
    if (Number(a.weekday) !== Number(b.weekday)) {
      return Number(a.weekday) - Number(b.weekday);
    }
    if (String(a.start_time) !== String(b.start_time)) {
      return String(a.start_time).localeCompare(String(b.start_time));
    }
    return Number(a.spot) - Number(b.spot);
  });
}

function groupReservationsByWeekday(rows) {
  const grouped = {
    1: [],
    2: [],
    3: [],
    4: [],
    5: [],
    6: [],
    0: [],
  };

  for (const row of rows) {
    const day = Number(row.weekday);
    if (!grouped[day]) grouped[day] = [];
    grouped[day].push(row);
  }

  for (const day of Object.keys(grouped)) {
    grouped[day].sort((a, b) => {
      const byTime = timeToMinutes(a.start_time) - timeToMinutes(b.start_time);
      if (byTime !== 0) return byTime;
      return Number(a.spot) - Number(b.spot);
    });
  }

  return grouped;
}

export default function App() {
  const [token, setToken] = useState("");
  const [currentUser, setCurrentUser] = useState("");
  const [currentRole, setCurrentRole] = useState("");
  const [currentUserId, setCurrentUserId] = useState("");

  const [loginUser, setLoginUser] = useState("");
  const [loginPass, setLoginPass] = useState("");

  const [assignedSpots, setAssignedSpots] = useState([]);

  const [name, setName] = useState("");
  const [spot, setSpot] = useState(1);
  const [plate, setPlate] = useState("");
  const [phone, setPhone] = useState("");
  const [weekday, setWeekday] = useState(1);
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");

  const [availability, setAvailability] = useState([]);
  const [reservations, setReservations] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [selectedTeacherId, setSelectedTeacherId] = useState("");
  const [heads, setHeads] = useState([]);
  const [msg, setMsg] = useState("");

  const [newTeacherName, setNewTeacherName] = useState("");
  const [newTeacherPlate, setNewTeacherPlate] = useState("");
  const [newTeacherPhone, setNewTeacherPhone] = useState("");

  const [newHeadUsername, setNewHeadUsername] = useState("");
  const [newHeadPassword, setNewHeadPassword] = useState("");
  const [newHeadSpot1, setNewHeadSpot1] = useState(1);
  const [newHeadSpot2, setNewHeadSpot2] = useState("");

  const isLogged = !!token;
  const isAdmin = currentRole === "admin";
  const isHead = currentRole === "user";

  const canCheck = useMemo(() => weekday !== "" && startTime && endTime, [weekday, startTime, endTime]);
  const reservationsByDay = useMemo(() => groupReservationsByWeekday(reservations), [reservations]);

  const authHeaders = token ? { Authorization: `Bearer ${token}` } : {};

  const availableSpotsForForm = useMemo(() => {
    if (isAdmin) {
      return Array.from({ length: 18 }, (_, i) => i + 1);
    }
    if (isHead) {
      return assignedSpots;
    }
    return Array.from({ length: 18 }, (_, i) => i + 1);
  }, [isAdmin, isHead, assignedSpots]);

  async function loadReservations() {
    try {
      const res = await fetch(`${API}/weekly-reservations`);
      const data = await res.json();

      if (!res.ok) {
        setMsg(data?.error || "No se pudieron cargar las reservas.");
        return;
      }

      setReservations(Array.isArray(data) ? sortWeeklyReservations(data) : []);
    } catch (e) {
      console.error(e);
      setMsg("No se pudieron cargar las reservas.");
    }
  }

  async function loadMe() {
    if (!token) {
      setAssignedSpots([]);
      return;
    }

    try {
      const res = await fetch(`${API}/me`, { headers: { ...authHeaders } });
      const data = await res.json();

      if (!res.ok) {
        setMsg(data?.error || "No se pudo cargar el usuario actual.");
        return;
      }

      setAssignedSpots(Array.isArray(data.assignedSpots) ? data.assignedSpots : []);
    } catch (e) {
      console.error(e);
      setMsg("No se pudo cargar la información del usuario.");
    }
  }

  async function loadTeachers() {
    if (!token) {
      setTeachers([]);
      return;
    }

    try {
      const res = await fetch(`${API}/teachers`, { headers: { ...authHeaders } });
      const data = await res.json();

      if (!res.ok) {
        setMsg(data?.error || "No se pudieron cargar los docentes.");
        return;
      }

      setTeachers(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
      setMsg("No se pudieron cargar los docentes.");
    }
  }

  async function loadHeads() {
    if (!token || !isAdmin) {
      setHeads([]);
      return;
    }

    try {
      const res = await fetch(`${API}/heads`, { headers: { ...authHeaders } });
      const data = await res.json();

      if (!res.ok) {
        setMsg(data?.error || "No se pudieron cargar los jefes.");
        return;
      }

      setHeads(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
      setMsg("No se pudieron cargar los jefes.");
    }
  }

  useEffect(() => {
    loadReservations();
  }, []);

  useEffect(() => {
    if (token) {
      loadMe();
      loadTeachers();
      if (currentRole === "admin") {
        loadHeads();
      }
    } else {
      setAssignedSpots([]);
      setTeachers([]);
      setHeads([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, currentRole]);

  useEffect(() => {
    if (isHead && assignedSpots.length > 0) {
      setSpot(assignedSpots[0]);
    }
  }, [isHead, assignedSpots]);

  function handleTeacherChange(teacherId) {
    setSelectedTeacherId(teacherId);

    if (!teacherId) {
      return;
    }

    const teacher = teachers.find((t) => Number(t.id) === Number(teacherId));
    if (!teacher) return;

    setName(teacher.name || "");
    setPlate(teacher.plate || "");
    setPhone(teacher.phone || "");
  }

  async function checkAvailability() {
    setMsg("");
    if (!canCheck) return;

    try {
      const res = await fetch(
        `${API}/weekly-availability?weekday=${encodeURIComponent(
          weekday
        )}&startTime=${encodeURIComponent(startTime)}&endTime=${encodeURIComponent(endTime)}`
      );

      const data = await res.json();

      if (!res.ok) {
        setMsg(data?.error || "Error al consultar disponibilidad");
        return;
      }

      setAvailability(data.available || []);
    } catch (e) {
      console.error(e);
      setMsg("Error inesperado al consultar disponibilidad.");
    }
  }

  async function createReservation() {
    setMsg("");

    try {
      if (!isLogged) {
        return setMsg("Debes iniciar sesión para crear reservas.");
      }

      if (isHead && assignedSpots.length === 0) {
        return setMsg("Tu jefatura no tiene estacionamientos asignados.");
      }

      if (weekday === "" || !startTime || !endTime) {
        return setMsg("Selecciona día, hora inicio y hora término.");
      }

      if (!selectedTeacherId) {
        if (!name.trim()) return setMsg("Escribe un nombre.");
        if (!plate.trim()) return setMsg("Escribe una patente.");
        if (!phone.trim()) return setMsg("Escribe un teléfono.");
      }

      const body = {
        name,
        plate,
        phone,
        spot: Number(spot),
        weekday: Number(weekday),
        startTime,
        endTime,
      };

      if (selectedTeacherId) {
        body.teacherId = Number(selectedTeacherId);
      }

      const res = await fetch(`${API}/weekly-reservations`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders,
        },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (res.status === 409) {
        setMsg("Choque de horario: ese estacionamiento ya está asignado en ese día y rango.");
        return;
      }

      if (!res.ok) {
        setMsg(data?.error || "Error al crear reserva");
        return;
      }

      setMsg(`Reserva creada (ID ${data.id})`);
      setName("");
      setPlate("");
      setPhone("");
      setSelectedTeacherId("");
      setStartTime("");
      setEndTime("");
      await loadReservations();

      if (weekday !== "" && startTime && endTime) {
        await checkAvailability();
      } else {
        setAvailability([]);
      }
    } catch (e) {
      console.error(e);
      setMsg("Error inesperado.");
    }
  }

  async function cancelReservation(id) {
    setMsg("");

    if (!isLogged) {
      return setMsg("Debes iniciar sesión para cancelar reservas.");
    }

    try {
      const res = await fetch(`${API}/weekly-reservations/${id}`, {
        method: "DELETE",
        headers: {
          ...authHeaders,
        },
      });

      const data = await res.json();

      if (!res.ok) {
        setMsg(data?.error || "No se pudo cancelar");
        return;
      }

      setMsg("Reserva cancelada");
      await loadReservations();

      if (weekday !== "" && startTime && endTime) {
        await checkAvailability();
      }
    } catch (e) {
      console.error(e);
      setMsg("Error inesperado al cancelar.");
    }
  }

  async function createTeacher() {
    setMsg("");

    if (!isHead) {
      return setMsg("Solo los jefes pueden crear docentes.");
    }

    if (!newTeacherName.trim()) return setMsg("Escribe el nombre del docente.");
    if (!newTeacherPlate.trim()) return setMsg("Escribe la patente del docente.");
    if (!newTeacherPhone.trim()) return setMsg("Escribe el teléfono del docente.");

    try {
      const res = await fetch(`${API}/teachers`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders,
        },
        body: JSON.stringify({
          name: newTeacherName,
          plate: newTeacherPlate,
          phone: newTeacherPhone,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMsg(data?.error || "No se pudo crear el docente.");
        return;
      }

      setMsg("Docente creado correctamente.");
      setNewTeacherName("");
      setNewTeacherPlate("");
      setNewTeacherPhone("");
      await loadTeachers();
    } catch (e) {
      console.error(e);
      setMsg("Error inesperado al crear docente.");
    }
  }

  async function deleteTeacher(id) {
    setMsg("");

    if (!isHead && !isAdmin) {
      return setMsg("No tienes permisos para borrar docentes.");
    }

    try {
      const res = await fetch(`${API}/teachers/${id}`, {
        method: "DELETE",
        headers: {
          ...authHeaders,
        },
      });

      const data = await res.json();

      if (!res.ok) {
        setMsg(data?.error || "No se pudo borrar el docente.");
        return;
      }

      if (Number(selectedTeacherId) === Number(id)) {
        setSelectedTeacherId("");
        setName("");
        setPlate("");
        setPhone("");
      }

      setMsg("Docente eliminado correctamente.");
      await loadTeachers();
    } catch (e) {
      console.error(e);
      setMsg("Error inesperado al borrar docente.");
    }
  }

  async function createHead() {
    setMsg("");

    if (!isAdmin) {
      return setMsg("Solo el admin puede crear jefes.");
    }

    if (!newHeadUsername.trim()) return setMsg("Escribe el username del jefe.");
    if (!newHeadPassword.trim()) return setMsg("Escribe la contraseña del jefe.");

    const spots = [newHeadSpot1, newHeadSpot2]
      .filter((s) => s !== "" && s !== null && s !== undefined)
      .map(Number);

    if (spots.length < 1 || spots.length > 2) {
      return setMsg("Debes asignar 1 o 2 estacionamientos.");
    }

    try {
      const res = await fetch(`${API}/heads`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders,
        },
        body: JSON.stringify({
          username: newHeadUsername,
          password: newHeadPassword,
          spots,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMsg(data?.error || "No se pudo crear el jefe.");
        return;
      }

      setMsg(`Jefe creado: ${data.username}`);
      setNewHeadUsername("");
      setNewHeadPassword("");
      setNewHeadSpot1(1);
      setNewHeadSpot2("");
      await loadHeads();
    } catch (e) {
      console.error(e);
      setMsg("Error inesperado al crear jefe.");
    }
  }

  async function handleLogin(e) {
    e.preventDefault();
    setMsg("");

    try {
      const res = await fetch(`${API}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: loginUser,
          password: loginPass,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMsg(data?.error || "Error al iniciar sesión");
        return;
      }

      setToken(data.token);
      setCurrentUser(data.username || "");
      setCurrentRole(data.role || "");
      setCurrentUserId(String(data.id || ""));

      localStorage.setItem("token", data.token);
      localStorage.setItem("currentUser", data.username || "");
      localStorage.setItem("currentRole", data.role || "");
      localStorage.setItem("currentUserId", String(data.id || ""));

      setMsg(`Sesión iniciada como ${data.username} (${data.role})`);
      setLoginPass("");
      setLoginUser("");
    } catch (err) {
      console.error(err);
      setMsg("Error inesperado en login.");
    }
  }

  function handleLogout() {
    setToken("");
    setCurrentUser("");
    setCurrentRole("");
    setCurrentUserId("");
    setAssignedSpots([]);
    setTeachers([]);
    setHeads([]);

    localStorage.removeItem("token");
    localStorage.removeItem("currentUser");
    localStorage.removeItem("currentRole");
    localStorage.removeItem("currentUserId");

    setMsg("Sesión cerrada.");
  }

  function canDeleteReservation(r) {
    if (!isLogged) return false;
    if (isAdmin) return true;
    return Number(r.created_by_user_id) === Number(currentUserId);
  }

  return (
    <div
      style={{
        width: "100%",
        maxWidth: "100%",
        margin: 0,
        padding: "16px 24px",
        boxSizing: "border-box",
        minHeight: "100vh",
        backgroundImage: 'url("/fondo4.png")',
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
        <img
          src="/logocft.png"
          alt="Logo"
          style={{ width: 280, marginBottom: 4, alignSelf: "center" }}
        />

        <h1 style={{ textAlign: "center", marginBottom: 8 }}>
          Horario semanal de estacionamientos sede San Antonio
        </h1>

        <div
          style={{
            maxWidth: 360,
            margin: "0 auto",
            padding: 12,
            borderRadius: 12,
            border: "2px solid #FFCE00",
            background: "rgba(0,0,0,0.15)",
          }}
        >
          {isLogged ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div>
                <strong>Usuario:</strong> {currentUser}
              </div>
              <div>
                <strong>Rol:</strong> {isAdmin ? "admin" : "jefe de carrera"}
              </div>
              {isHead && (
                <div>
                  <strong>Estacionamientos asignados:</strong>{" "}
                  {assignedSpots.length ? assignedSpots.join(", ") : "Sin asignar"}
                </div>
              )}
              <button onClick={handleLogout}>Cerrar sesión</button>
            </div>
          ) : (
            <>
              <h3 style={{ marginTop: 0 }}>Iniciar sesión</h3>
              <form onSubmit={handleLogin}>
                <label>Usuario</label>
                <input
                  value={loginUser}
                  onChange={(e) => setLoginUser(e.target.value)}
                  placeholder="usuario o admin"
                  style={{ width: "85%", padding: 8, margin: "4px 0 8px" }}
                />

                <label>Contraseña</label>
                <input
                  type="password"
                  value={loginPass}
                  onChange={(e) => setLoginPass(e.target.value)}
                  placeholder="••••"
                  style={{ width: "85%", padding: 8, margin: "4px 0 8px" }}
                />

                <button type="submit" style={{ width: "100%", padding: "8px 12px" }}>
                  Iniciar sesión
                </button>
              </form>
            </>
          )}
        </div>
      </div>

      {msg && <p style={{ marginTop: 4 }}>{msg}</p>}

      <div
        className="layout-grid"
        style={{
          display: "grid",
          gridTemplateColumns: "420px 1fr",
          gap: 16,
          alignItems: "start",
          width: "100%",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ border: "5px solid #FFCE00", borderRadius: 12, padding: 16 }}>
            <h2>{isLogged ? "Crear asignación semanal" : "Consulta de disponibilidad semanal"}</h2>

            {isHead && (
              <>
                <label>Docente guardado</label>
                <select
                  value={selectedTeacherId}
                  onChange={(e) => handleTeacherChange(e.target.value)}
                  style={{ width: "95%", padding: 10, margin: "6px 0 12px" }}
                >
                  <option value="">-- Cargar manual o elegir docente --</option>
                  {teachers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} | {t.plate}
                    </option>
                  ))}
                </select>
              </>
            )}

            <label>Nombre</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej: María Pérez"
              style={{ width: "85%", padding: 10, margin: "6px 0 12px" }}
              disabled={!isLogged}
            />

            <label>Patente</label>
            <input
              value={plate}
              onChange={(e) => setPlate(e.target.value)}
              placeholder="Ej: BBCC44"
              style={{ width: "85%", padding: 10, margin: "6px 0 12px" }}
              disabled={!isLogged}
            />

            <label>Teléfono</label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Ej: 912345678"
              style={{ width: "85%", padding: 10, margin: "6px 0 12px" }}
              disabled={!isLogged}
            />

            <label>Estacionamiento</label>
            <select
              value={spot}
              onChange={(e) => setSpot(Number(e.target.value))}
              style={{ width: "95%", padding: 10, margin: "6px 0 12px" }}
              disabled={!isLogged}
            >
              {availableSpotsForForm.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>

            <label>Día de la semana</label>
            <select
              value={weekday}
              onChange={(e) => setWeekday(Number(e.target.value))}
              style={{ width: "95%", padding: 10, margin: "6px 0 12px" }}
            >
              {WEEKDAYS.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>

            <label>Hora inicio</label>
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              style={{ width: "85%", padding: 10, margin: "6px 0 12px" }}
            />

            <label>Hora término</label>
            <input
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              style={{ width: "85%", padding: 10, margin: "6px 0 12px" }}
            />

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button onClick={checkAvailability} disabled={!canCheck} style={{ padding: "10px 12px" }}>
                Ver disponibilidad
              </button>

              {isLogged && (
                <button onClick={createReservation} style={{ padding: "10px 12px" }}>
                  Reservar
                </button>
              )}
            </div>

            <div style={{ marginTop: 16 }}>
              <h3>Disponibles en ese rango</h3>
              {availability.length ? (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {availability.map((s) => (
                    <span
                      key={s}
                      style={{ border: "1px solid #FFCE00", borderRadius: 999, padding: "4px 10px" }}
                    >
                      {s}
                    </span>
                  ))}
                </div>
              ) : (
                <p style={{ color: "#11f368" }}>Consulta un día y un rango horario para ver disponibles.</p>
              )}
            </div>
          </div>

          {isHead && (
            <div style={{ border: "5px solid #0082CA", borderRadius: 12, padding: 16 }}>
              <h2>Docentes</h2>

              <label>Nombre</label>
              <input
                value={newTeacherName}
                onChange={(e) => setNewTeacherName(e.target.value)}
                style={{ width: "85%", padding: 10, margin: "6px 0 12px" }}
              />

              <label>Patente</label>
              <input
                value={newTeacherPlate}
                onChange={(e) => setNewTeacherPlate(e.target.value)}
                style={{ width: "85%", padding: 10, margin: "6px 0 12px" }}
              />

              <label>Teléfono</label>
              <input
                value={newTeacherPhone}
                onChange={(e) => setNewTeacherPhone(e.target.value)}
                style={{ width: "85%", padding: 10, margin: "6px 0 12px" }}
              />

              <button onClick={createTeacher} style={{ padding: "10px 12px", marginBottom: 14 }}>
                Guardar docente
              </button>

              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {teachers.length === 0 ? (
                  <p>No hay docentes cargados.</p>
                ) : (
                  teachers.map((t) => (
                    <div
                      key={t.id}
                      style={{
                        border: "1px solid rgba(255,255,255,0.2)",
                        borderRadius: 10,
                        padding: 10,
                        background: "rgba(255,255,255,0.03)",
                      }}
                    >
                      <div>
                        <strong>{t.name}</strong>
                      </div>
                      <div>Patente: {t.plate}</div>
                      <div>Teléfono: {t.phone}</div>

                      <div style={{ marginTop: 10 }}>
                        <button onClick={() => deleteTeacher(t.id)} style={{ padding: "6px 10px" }}>
                          Borrar docente
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {isAdmin && (
            <div style={{ border: "5px solid #D0009E", borderRadius: 12, padding: 16 }}>
              <h2>Crear jefe de carrera</h2>

              <label>Username</label>
              <input
                value={newHeadUsername}
                onChange={(e) => setNewHeadUsername(e.target.value)}
                style={{ width: "85%", padding: 10, margin: "6px 0 12px" }}
              />

              <label>Contraseña</label>
              <input
                type="password"
                value={newHeadPassword}
                onChange={(e) => setNewHeadPassword(e.target.value)}
                style={{ width: "85%", padding: 10, margin: "6px 0 12px" }}
              />

              <label>Estacionamiento 1</label>
              <select
                value={newHeadSpot1}
                onChange={(e) => setNewHeadSpot1(Number(e.target.value))}
                style={{ width: "95%", padding: 10, margin: "6px 0 12px" }}
              >
                {Array.from({ length: 18 }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>

              <label>Estacionamiento 2 (opcional)</label>
              <select
                value={newHeadSpot2}
                onChange={(e) => setNewHeadSpot2(e.target.value === "" ? "" : Number(e.target.value))}
                style={{ width: "95%", padding: 10, margin: "6px 0 12px" }}
              >
                <option value="">-</option>
                {Array.from({ length: 18 }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>

              <button onClick={createHead} style={{ padding: "10px 12px", marginBottom: 16 }}>
                Crear jefe
              </button>

              <h3>Jefes actuales</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {heads.length === 0 ? (
                  <p>No hay jefes cargados.</p>
                ) : (
                  heads.map((h) => (
                    <div
                      key={h.id}
                      style={{
                        border: "1px solid rgba(255,255,255,0.2)",
                        borderRadius: 10,
                        padding: 10,
                        background: "rgba(255,255,255,0.03)",
                      }}
                    >
                      <div>
                        <strong>{h.username}</strong>
                      </div>
                      <div>Spots: {(h.assignedSpots || []).join(", ") || "Sin asignar"}</div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        <div
          style={{
            width: "100%",
            border: "5px solid #0082CA",
            borderRadius: 12,
            padding: 16,
            boxSizing: "border-box",
          }}
        >
          <h2>Horario semanal</h2>

          <button onClick={loadReservations} style={{ padding: "8px 10px", marginBottom: 12 }}>
            Recargar
          </button>

          <div style={{ width: "100%", overflowX: "auto" }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(7, minmax(180px, 1fr))",
                gap: 12,
                alignItems: "start",
                width: "100%",
                boxSizing: "border-box",
              }}
            >
              {WEEKDAYS.map((day) => {
                const items = reservationsByDay[day.value] || [];

                return (
                  <div
                    key={day.value}
                    style={{
                      background: "rgba(75, 69, 69, 0.03)",
                      border: "1px solid rgba(255,255,255,0.15)",
                      borderRadius: 12,
                      padding: 12,
                      minHeight: 500,
                    }}
                  >
                    <h3
                      style={{
                        marginTop: 0,
                        textAlign: "center",
                        borderBottom: "2px solid #FFCE00",
                        paddingBottom: 8,
                      }}
                    >
                      {day.label}
                    </h3>

                    {items.length === 0 ? (
                      <p style={{ color: "#bbb", fontStyle: "italic" }}>Sin asignaciones</p>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        {items.map((r) => (
                          <div
                            key={r.id}
                            style={{
                              border: "1px solid #FFCE00",
                              borderRadius: 10,
                              padding: 10,
                              background: "rgba(150, 130, 52, 0.48)",
                              boxShadow: "0 2px 6px rgba(0,0,0,0.15)",
                            }}
                          >
                            <div style={{ fontWeight: "bold", marginBottom: 6 }}>
                              {r.start_time} - {r.end_time}
                            </div>

                            <div>
                              <strong>Lugar:</strong> {r.spot}
                            </div>
                            <div>
                              <strong>Nombre:</strong> {r.name}
                            </div>
                            <div>
                              <strong>Patente:</strong> {r.plate}
                            </div>
                            <div>
                              <strong>Teléfono:</strong> {r.phone}
                            </div>
                            <div>
                              <strong>Creado por:</strong> {r.created_by_username || "-"}
                            </div>

                            {isLogged && canDeleteReservation(r) && (
                              <div style={{ marginTop: 10 }}>
                                <button
                                  onClick={() => cancelReservation(r.id)}
                                  style={{ padding: "6px 10px" }}
                                >
                                  Cancelar
                                </button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <p style={{ color: "#fffdfd", marginTop: 14 }}>
            Las asignaciones se muestran agrupadas por día y ordenadas por hora de inicio.
          </p>
        </div>
      </div>
    </div>
  );
}