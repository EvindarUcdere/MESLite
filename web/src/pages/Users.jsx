import { Pencil, Plus, X } from "lucide-react";
import { useEffect, useState } from "react";
import { createUser, getUsers, updateUser, updateUserStatus } from "../api/masterData.api.js";
import { ROLE_LABELS } from "../utils/roles.js";

export default function Users() {
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [selectedUser, setSelectedUser] = useState(null);
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "User123!",
    role: "OPERATOR",
    isActive: true
  });
  const [editForm, setEditForm] = useState({
    name: "",
    email: "",
    password: "",
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

  function updateEditForm(field, value) {
    setEditForm((current) => ({ ...current, [field]: value }));
  }

  function selectUser(user) {
    setSelectedUser(user);
    setEditForm({
      name: user.name,
      email: user.email,
      password: "",
      role: user.role,
      isActive: user.isActive
    });
  }

  function clearSelection() {
    setSelectedUser(null);
    setEditForm({
      name: "",
      email: "",
      password: "",
      role: "OPERATOR",
      isActive: true
    });
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

  async function handleUpdate(event) {
    event.preventDefault();

    if (!selectedUser) {
      return;
    }

    setError("");
    setIsSubmitting(true);

    try {
      await updateUser(selectedUser.id, {
        name: editForm.name,
        email: editForm.email,
        role: editForm.role,
        isActive: editForm.isActive,
        ...(editForm.password ? { password: editForm.password } : {})
      });
      await loadUsers();
      clearSelection();
    } catch (_error) {
      setError("Kullanıcı güncellenemedi.");
    } finally {
      setIsSubmitting(false);
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

      {selectedUser ? (
        <section className="panel">
          <div className="section-title-row">
            <div>
              <h2>Kullanıcı Düzenle</h2>
              <p className="muted-text">Geçmiş kayıtları korumak için kullanıcılar silinmez, pasife alınır.</p>
            </div>
            <button className="icon-button" type="button" onClick={clearSelection} aria-label="Düzenlemeyi kapat" title="Düzenlemeyi kapat">
              <X size={18} />
            </button>
          </div>
          <form className="work-order-form" onSubmit={handleUpdate}>
            <label>
              Ad Soyad
              <input value={editForm.name} onChange={(event) => updateEditForm("name", event.target.value)} required />
            </label>
            <label>
              E-posta
              <input value={editForm.email} onChange={(event) => updateEditForm("email", event.target.value)} type="email" required />
            </label>
            <label>
              Şifre Sıfırla
              <input value={editForm.password} onChange={(event) => updateEditForm("password", event.target.value)} type="text" minLength="8" placeholder="Boş bırakılırsa değişmez" />
            </label>
            <label>
              Rol
              <select value={editForm.role} onChange={(event) => updateEditForm("role", event.target.value)} required>
                <option value="OPERATOR">Operatör</option>
                <option value="PRODUCTION_MANAGER">Üretim Yöneticisi</option>
                <option value="QUALITY_STAFF">Kalite Personeli</option>
                <option value="VIEWER">İzleyici</option>
                <option value="ADMIN">Admin</option>
              </select>
            </label>
            <label>
              Durum
              <select value={editForm.isActive ? "active" : "passive"} onChange={(event) => updateEditForm("isActive", event.target.value === "active")}>
                <option value="active">Aktif</option>
                <option value="passive">Pasif</option>
              </select>
            </label>
            <button className="primary-button" type="submit" disabled={isSubmitting}>
              <Pencil size={18} />
              {isSubmitting ? "Güncelleniyor..." : "Güncelle"}
            </button>
          </form>
        </section>
      ) : null}

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
                <th>İşlem</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className={selectedUser?.id === user.id ? "selected-row" : ""}>
                  <td>{user.name}</td>
                  <td>{user.email}</td>
                  <td>{ROLE_LABELS[user.role] ?? user.role}</td>
                  <td>
                    <span className={`status-pill ${user.isActive ? "quality-passed" : "status-cancelled"}`}>{user.isActive ? "Aktif" : "Pasif"}</span>
                  </td>
                  <td>
                    <div className="action-row">
                      <button type="button" onClick={() => selectUser(user)} title="Düzenle">
                        <Pencil size={16} />
                      </button>
                      <button type="button" onClick={() => handleStatusChange(user.id, !user.isActive)} title={user.isActive ? "Pasife al" : "Aktife al"}>
                        {user.isActive ? "Pasife Al" : "Aktife Al"}
                      </button>
                    </div>
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
