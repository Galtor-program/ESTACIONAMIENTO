import { useEffect, useMemo, useState } from "react";

const API = import.meta.env.VITE_API_URL || "http://localhost:4000";

console.log("API URL =>", API);

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
  const [token, setToken] = useState(() => localStorage.getItem("token") || "");
  const [currentUser, setCurrentUser] = useState(() => localStorage.getItem("currentUser") || "");
  const [currentRole, setCurrentRole] = useState(() => localStorage.getItem("currentRole") || "");
  const [currentUserId, setCurrentUserId] = useState(() => localStorage.getItem("currentUserId") || "");

  const [loginUser, setLoginUser] = useState("");
  const [loginPass, setLoginPass] = useState("");

  const isLogged = !!token;
  const isAdmin = currentRole === "admin";

  const [name, setName] = useState("");
  const [spot, setSpot] = useState(1);
  const [plate, setPlate] = useState("");
  const [phone, setPhone] = useState("");
  const [weekday, setWeekday] = useState(1);
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");

  const [availability, setAvailability] = useState([]);
  const [reservations, setReservations] = useState([]);
  const [msg, setMsg] = useState("");

  const canCheck = useMemo(() => weekday !== "" && startTime && endTime, [weekday, startTime, endTime]);
  const reservationsByDay = useMemo(() => groupReservationsByWeekday(reservations), [reservations]);

  const authHeaders = token ? { Authorization: `Bearer ${token}` } : {};

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

  useEffect(() => {
    loadReservations();
  }, []);

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

      if (!name.trim()) return setMsg("Escribe un nombre.");
      if (!plate.trim()) return setMsg("Escribe una patente.");
      if (!phone.trim()) return setMsg("Escribe un teléfono.");
      if (weekday === "" || !startTime || !endTime) {
        return setMsg("Selecciona día, hora inicio y hora término.");
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
      className="app-container"
      style={{
        width: "100%",
        maxWidth: "100%",
        margin: 0,
        padding: "16px 24px",
        boxSizing: "border-box",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
        <img
          src="/logocft.png"
          alt="Logo"
          style={{ width: 220, marginBottom: 4, alignSelf: "center" }}
        />

        <h1 style={{ textAlign: "center", marginBottom: 8 }}>
          Horario semanal de estacionamientos sede San Antonio
        </h1>

        <div
          style={{
            maxWidth: 320,
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
                <strong>Rol:</strong> {currentRole}
              </div>
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
          gridTemplateColumns: "380px 1fr",
          gap: 16,
          alignItems: "start",
          width: "100%",
        }}
      >
        <div style={{ border: "5px solid #FFCE00", borderRadius: 12, padding: 16 }}>
          <h2>{isLogged ? "Crear asignación semanal" : "Consulta de disponibilidad semanal"}</h2>

          <label>Nombre</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ej: Felipe"
            style={{ width: "85%", padding: 10, margin: "6px 0 12px" }}
            disabled={!isLogged}
          />

          <label>Patente</label>
          <input
            value={plate}
            onChange={(e) => setPlate(e.target.value)}
            placeholder="Ej: ABC123"
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

          <label>Estacionamiento (1-18)</label>
          <select
            value={spot}
            onChange={(e) => setSpot(e.target.value)}
            style={{ width: "95%", padding: 10, margin: "6px 0 12px" }}
            disabled={!isLogged}
          >
            {Array.from({ length: 18 }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>

          <label>Día de la semana</label>
          <select
            value={weekday}
            onChange={(e) => setWeekday(e.target.value)}
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

        <div
          style={{
            width: "100%",
            border: "5px solid #1f1580",
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
                      background: "rgba(255,255,255,0.04)",
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
                              background: "rgba(255, 206, 0, 0.08)",
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