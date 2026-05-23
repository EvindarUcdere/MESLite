import { Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { createUser, getUsers, updateUserStatus } from "../api/masterData.api.js";

const ROLE_LABELS = {
  ADMIN: "Admin",
  PRODUCTION_MANAGER: "Üretim Yöneticisi",
  OPERATOR: "Operatör",
  QUALITY_STAFF: "Kalite Personeli",
  VIEWER: "İzleyici"
};

export default function Users() {
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "User123!",
    role: "OPERATOR",
    isActive: true
  });

  async function loadUsers() {
    setError("");
    const data = await getUsers();
    setUsers(data);
  }

  useEffect(() => {
    let isMounted = true;

    async function loadInitialData() {
      try {
        const data = await getUsers();

        if (isMounted) {
          setUsers(data);
        }
      } catch (_error) {
        if (isMounted) {
          setError("Kullanıcılar yüklenemedi.");
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    loadInitialData();

    return () => {
      isMounted = false;
    };
  }, []);

  function updateForm(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      await createUser(form);
      setForm({
        name: "",
        email: "",
        password: "User123!",
        role: "OPERATOR",
        isActive: true
      });
      await loadUsers();
    } catch (_error) {
      setError("Kullanıcı oluşturulamadı.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleStatusChange(userId, isActive) {
    setError("");

    try {
      await updateUserStatus(userId, isActive);
      await loadUsers();
    } catch (_error) {
      setError("Kullanıcı durumu güncellenemedi.");
    }
  }

  return (
    <div className="page-stack">
      <header className="page-header">
        <div>
          <h1>Kullanıcılar</h1>
          <p>Operatör, üretim yöneticisi ve kalite personeli hesaplarını yönetin.</p>
        </div>
      </header>

      {error ? <p className="form-error">{error}</p> : null}

      <section className="panel">
        <h2>Kullanıcı Oluştur</h2>
        <form className="work-order-form" onSubmit={handleSubmit}>
          <label>
            Ad Soyad
            <input value={form.name} onChange={(event) => updateForm("name", event.target.value)} placeholder="Ahmet Yılmaz" required />
          </label>
          <label>
            E-posta
            <input value={form.email} onChange={(event) => updateForm("email", event.target.value)} type="email" placeholder="operator@factory.local" required />
          </label>
          <label>
            Geçici Şifre
            <input value={form.password} onChange={(event) => updateForm("password", event.target.value)} type="text" minLength="8" required />
          </label>
          <label>
            Rol
            <select value={form.role} onChange={(event) => updateForm("role", event.target.value)} required>
              <option value="OPERATOR">Operatör</option>
              <option value="PRODUCTION_MANAGER">Üretim Yöneticisi</option>
              <option value="QUALITY_STAFF">Kalite Personeli</option>
              <option value="VIEWER">İzleyici</option>
              <option value="ADMIN">Admin</option>
            </select>
          </label>
          <button className="primary-button" type="submit" disabled={isSubmitting}>
            <Plus size={18} />
            {isSubmitting ? "Oluşturuluyor..." : "Oluştur"}
          </button>
        </form>
      </section>

      <section className="panel">
        <h2>Kullanıcı Listesi</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Ad Soyad</th>
                <th>E-posta</th>
                <th>Rol</th>
                <th>Durum</th>
                <th>Durum Güncelle</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td>{user.name}</td>
                  <td>{user.email}</td>
                  <td>{ROLE_LABELS[user.role] ?? user.role}</td>
                  <td>
                    <span className={`status-pill ${user.isActive ? "quality-passed" : "status-cancelled"}`}>{user.isActive ? "Aktif" : "Pasif"}</span>
                  </td>
                  <td>
                    <select className="compact-select" value={user.isActive ? "active" : "passive"} onChange={(event) => handleStatusChange(user.id, event.target.value === "active")}>
                      <option value="active">Aktif</option>
                      <option value="passive">Pasif</option>
                    </select>
                  </td>
                </tr>
              ))}
              {!isLoading && users.length === 0 ? (
                <tr>
                  <td colSpan="5">Henüz kullanıcı yok.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
