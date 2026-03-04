import { useEffect, useMemo, useState } from "react";

const API = import.meta.env.VITE_API_URL || "http://localhost:4000";

console.log("API URL =>", API);

function toISOWithTZ(localDateTime) {
  const d = new Date(localDateTime);
  return d.toISOString();
}
function formatDateTime(isoString) {
  if (!isoString) return "";

  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return isoString; 

  const pad = (n) => n.toString().padStart(2, "0");

  const day = pad(d.getDate());
  const month = pad(d.getMonth() + 1); // meses 0-11
  const year = d.getFullYear();
  const hours = pad(d.getHours());
  const minutes = pad(d.getMinutes());

  // formato chileno clásico: DD-MM-YYYY HH:mm
  return `${day}-${month}-${year} ${hours}:${minutes}`;
}

export default function App() {
  
  const [token, setToken] = useState(() => localStorage.getItem("token") || "");
  const [adminUser, setAdminUser] = useState(() => localStorage.getItem("adminUser") || "");

  const [loginUser, setLoginUser] = useState("");
  const [loginPass, setLoginPass] = useState("");

  const isAdmin = !!token;

 
  const [name, setName] = useState("");
  const [spot, setSpot] = useState(1);
  const [plate, setPlate] = useState("");
  const [phone, setPhone] = useState("");
  const [startLocal, setStartLocal] = useState("");
  const [endLocal, setEndLocal] = useState("");

  const [availability, setAvailability] = useState([]);
  const [reservations, setReservations] = useState([]);
  const [msg, setMsg] = useState("");

  const canCheck = useMemo(() => startLocal && endLocal, [startLocal, endLocal]);

  const authHeaders = token ? { Authorization: `Bearer ${token}` } : {};


  async function loadReservations() {
    const res = await fetch(`${API}/reservations`);
    const data = await res.json();
    setReservations(Array.isArray(data) ? data : []);
  }

  useEffect(() => {
    loadReservations();
  }, []);

 
  async function checkAvailability() {
    setMsg("");
    if (!canCheck) return;
    if (!isAdmin) {
      setMsg("Solo un administrador puede consultar disponibilidad para crear reservas.");
      return;
    }

    const startAt = toISOWithTZ(startLocal);
    const endAt = toISOWithTZ(endLocal);

    const res = await fetch(
      `${API}/availability?startAt=${encodeURIComponent(startAt)}&endAt=${encodeURIComponent(endAt)}`,
      {
        headers: {
          ...authHeaders,
        },
      }
    );
    const data = await res.json();
    if (!res.ok) return setMsg(data?.error || "Error al consultar disponibilidad");
    setAvailability(data.available || []);
  }

  async function createReservation() {
    setMsg("");
    try {
      if (!isAdmin) {
        return setMsg("Solo un administrador puede crear reservas.");
      }
      if (!name.trim()) return setMsg("Escribe un nombre.");
      if (!plate.trim()) return setMsg("Escribe una patente.");
      if (!phone.trim()) return setMsg("Escribe un teléfono.");
      if (!startLocal || !endLocal) return setMsg("Selecciona inicio y término.");

      const body = {
        name,
        plate,
        phone,
        spot: Number(spot),
        startAt: toISOWithTZ(startLocal),
        endAt: toISOWithTZ(endLocal),
      };

      const res = await fetch(`${API}/reservations`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders,
        },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (res.status === 409) {
        setMsg("Choque de horario: ese estacionamiento ya está reservado en ese rango.");
        return;
      }
      if (!res.ok) {
        setMsg(data?.error || "Error al crear reserva");
        return;
      }

      setMsg(` Reserva creada (ID ${data.id})`);
      setName("");
      setPlate("");
      setPhone("");
      await loadReservations();
      await checkAvailability();
    } catch (e) {
      console.error(e);
      setMsg("Error inesperado.");
    }
  }

  async function cancelReservation(id) {
    setMsg("");
    if (!isAdmin) {
      return setMsg("Solo un administrador puede cancelar reservas.");
    }

    const res = await fetch(`${API}/reservations/${id}`, {
      method: "DELETE",
      headers: {
        ...authHeaders,
      },
    });
    const data = await res.json();
    if (!res.ok) return setMsg(data?.error || "No se pudo cancelar");
    setMsg(" Reserva cancelada");
    await loadReservations();
    await checkAvailability();
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
      setAdminUser(data.username || "");
      localStorage.setItem("token", data.token);
      localStorage.setItem("adminUser", data.username || "");

      setMsg(" Sesión de administrador iniciada");
      setLoginPass("");
      setLoginUser("");
    } catch (err) {
      console.error(err);
      setMsg("Error inesperado en login.");
    }
  }

  function handleLogout() {
    setToken("");
    setAdminUser("");
    localStorage.removeItem("token");
    localStorage.removeItem("adminUser");
    setAvailability([]);
    setMsg("Sesión de administrador cerrada.");
  }

  return (
    <div className="app-container">
      {/* Header con logo y login admin */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
        <img
          src="/logocft.png"
          alt="Logo"
          style={{ width: 220, marginBottom: 4, alignSelf: "center" }}
        />
        <h1 style={{ textAlign: "center", marginBottom: 8 }}>
          Reservas de Estacionamientos sede San Antonio
        </h1>

        <div
          style={{
            maxWidth: 150,
            margin: "0 auto",
            padding: 12,
            borderRadius: 12,
            border: "2px solid #FFCE00",
            background: "rgba(0,0,0,0.15)",
          }}
        >
          {isAdmin ? (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <strong>Administrador:</strong> {adminUser}
              </div>
              <button onClick={handleLogout}>Cerrar sesión</button>
            </div>
          ) : (
            <>
              <h3 style={{ marginTop: 0 }}>Login administrador</h3>
              <form onSubmit={handleLogin}>
                <label>Usuario</label>
                <input
                  value={loginUser}
                  onChange={(e) => setLoginUser(e.target.value)}
                  placeholder="admin"
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
              <p style={{ fontSize: 12, marginTop: 8, color: "#eee" }}>
                Para la prueba: <b>admin / 1234</b>.
              </p>
            </>
          )}
        </div>
      </div>

      {/* Mensajes generales */}
      {msg && <p style={{ marginTop: 4 }}>{msg}</p>}

      <div className="layout-grid">
        {/* SOLO ADMIN ve el panel de crear reserva */}
        {isAdmin && (
          <div style={{ border: "5px solid #FFCE00", borderRadius: 12, padding: 16 }}>
            <h2>Crear reserva (solo admin)</h2>

            <label>Nombre</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej: Felipe"
              style={{ width: "85%", padding: 10, margin: "6px 0 12px" }}
            />

            <label>Patente</label>
            <input
              value={plate}
              onChange={(e) => setPlate(e.target.value)}
              placeholder="Ej: ABC123"
              style={{ width: "85%", padding: 10, margin: "6px 0 12px" }}
            />

            <label>Teléfono</label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Ej: 912345678"
              style={{ width: "85%", padding: 10, margin: "6px 0 12px" }}
            />

            <label>Estacionamiento (1-18)</label>
            <select
              value={spot}
              onChange={(e) => setSpot(e.target.value)}
              style={{ width: "95%", padding: 10, margin: "6px 0 12px" }}
            >
              {Array.from({ length: 18 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>

            <label>Fecha Inicio</label>
            <input
              type="datetime-local"
              value={startLocal}
              onChange={(e) => setStartLocal(e.target.value)}
              style={{ width: "85%", padding: 10, margin: "6px 0 12px" }}
            />

            <label>Fecha Término</label>
            <input
              type="datetime-local"
              value={endLocal}
              onChange={(e) => setEndLocal(e.target.value)}
              style={{ width: "85%", padding: 10, margin: "6px 0 12px" }}
            />

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button onClick={checkAvailability} disabled={!canCheck} style={{ padding: "10px 12px" }}>
                Ver disponibilidad
              </button>
              <button onClick={createReservation} style={{ padding: "10px 12px" }}>
                Reservar
              </button>
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
                <p style={{ color: "#11f368" }}>Consulta un rango para ver disponibles.</p>
              )}
            </div>
          </div>
        )}

        {/* Columna reservas: siempre visible (vista libre) */}
        <div style={{  minWidth: 1000, border: "5px solid #1f1580", borderRadius: 12, padding: 16 }}>
          <h2>Reservas</h2>
          <button onClick={loadReservations} style={{ padding: "8px 10px", marginBottom: 12 }}>
            Recargar
          </button>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  
                  <th style={{ textAlign: "left", borderBottom: "1px solid #eee", padding: 8 }}>Spot</th>
                  <th style={{ textAlign: "left", borderBottom: "1px solid #eee", padding: 8 }}>Nombre</th>
                  <th style={{ textAlign: "left", borderBottom: "1px solid #eee", padding: 8 }}>Patente</th>
                  <th style={{ textAlign: "left", borderBottom: "1px solid #eee", padding: 8 }}>Teléfono</th>
                  <th style={{ textAlign: "left", borderBottom: "1px solid #eee", padding: 8 }}>Inicio</th>
                  <th style={{ textAlign: "left", borderBottom: "1px solid #eee", padding: 8 }}>Término</th>
                  {isAdmin && (
                    <th style={{ borderBottom: "1px solid #eee", padding: 8 }}></th>
                  )}
                </tr>
              </thead>
              <tbody>
                {reservations.map((r) => (
                  <tr key={r.id}>
                    
                    <td style={{ padding: 8, borderBottom: "1px solid #f3f3f3" }}>{r.spot}</td>
                    <td style={{ padding: 8, borderBottom: "1px solid #f3f3f3" }}>{r.name}</td>
                    <td style={{ padding: 8, borderBottom: "1px solid #f3f3f3" }}>{r.plate}</td>
                    <td style={{ padding: 8, borderBottom: "1px solid #f3f3f3" }}>{r.phone}</td>
                    <td style={{ padding: 8, borderBottom: "1px solid #f3f3f3" }}>
                      {formatDateTime(r.start_at)}
                    </td>
                    <td style={{ padding: 8, borderBottom: "1px solid #f3f3f3" }}>
                      {formatDateTime(r.end_at)}
                    </td>
                    {isAdmin && (
                      <td style={{ padding: 8, borderBottom: "1px solid #f3f3f3" }}>
                        <button onClick={() => cancelReservation(r.id)} style={{ padding: "6px 10px" }}>
                          Cancelar
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
                {!reservations.length && (
                  <tr>
                    <td colSpan={isAdmin ? 8 : 7} style={{ padding: 12, color: "#666" }}>
                      No hay reservas.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <p style={{ color: "#fffdfd", marginTop: 10 }}>
            Para agregar o cancelar una reserva, primero iniciar sesión como administrador.
          </p>
        </div>
      </div>
    </div>
  );
}