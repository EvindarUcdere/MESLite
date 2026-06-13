import { KeyRound, Pencil, Plus, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createUser, getUsers, updateUser, updateUserStatus } from "../api/masterData.api.js";
import { ROLE_LABELS } from "../utils/roles.js";

const emptyUserForm = {
  name: "",
  email: "",
  password: "User123!",
  employeeCode: "",
  phone: "",
  department: "",
  position: "",
  hireDate: "",
  terminationDate: "",
  emergencyContactName: "",
  emergencyContactPhone: "",
  role: "OPERATOR",
  isActive: true
};

function toDateInput(value) {
  return value ? new Date(value).toISOString().slice(0, 10) : "";
}

function buildEditForm(user) {
  return {
    name: user.name ?? "",
    email: user.email ?? "",
    password: "",
    employeeCode: user.employeeCode ?? "",
    phone: user.phone ?? "",
    department: user.department ?? "",
    position: user.position ?? "",
    hireDate: toDateInput(user.hireDate),
    terminationDate: toDateInput(user.terminationDate),
    emergencyContactName: user.emergencyContactName ?? "",
    emergencyContactPhone: user.emergencyContactPhone ?? "",
    role: user.role ?? "OPERATOR",
    isActive: Boolean(user.isActive)
  };
}

function normalizePayload(form) {
  return Object.fromEntries(Object.entries(form).map(([key, value]) => [key, typeof value === "string" ? value.trim() : value]));
}

function generateTemporaryPassword() {
  const number = Math.floor(1000 + Math.random() * 9000);
  return `MesLite${number}!`;
}

export default function Users() {
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [selectedUser, setSelectedUser] = useState(null);
  const [form, setForm] = useState(emptyUserForm);
  const [editForm, setEditForm] = useState({ ...emptyUserForm, password: "" });
  const [search, setSearch] = useState("");
  const [credentialCard, setCredentialCard] = useState(null);

  const filteredUsers = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("tr-TR");

    if (!term) {
      return users;
    }

    return users.filter((user) =>
      [user.name, user.email, user.employeeCode, user.department, user.position, user.phone]
        .filter(Boolean)
        .some((value) => value.toLocaleLowerCase("tr-TR").includes(term))
    );
  }, [search, users]);

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
          setError("Çalışanlar yüklenemedi.");
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
    setEditForm(buildEditForm(user));
  }

  function clearSelection() {
    setSelectedUser(null);
    setEditForm({ ...emptyUserForm, password: "" });
  }

  async function copyCredentials(credentials) {
    const text = `MES Lite Mobil Giriş\nE-posta: ${credentials.email}\nŞifre: ${credentials.password}`;
    await navigator.clipboard?.writeText(text);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const payload = normalizePayload(form);
      const createdUser = await createUser(payload);

      setCredentialCard({
        title: "Mobil giriş bilgileri oluşturuldu",
        name: createdUser.name,
        email: createdUser.email,
        password: createdUser.temporaryPassword ?? payload.password
      });
      setForm({ ...emptyUserForm, password: generateTemporaryPassword() });
      await loadUsers();
    } catch (_error) {
      setError("Çalışan oluşturulamadı. E-posta veya sicil no daha önce kullanılmış olabilir.");
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
      setError("Çalışan durumu güncellenemedi.");
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
      const payload = normalizePayload({
        ...editForm,
        ...(editForm.password ? { password: editForm.password } : {})
      });

      if (!editForm.password) {
        delete payload.password;
      }

      const updatedUser = await updateUser(selectedUser.id, payload);

      if (payload.password) {
        setCredentialCard({
          title: "Mobil şifre sıfırlandı",
          name: updatedUser.name,
          email: updatedUser.email,
          password: updatedUser.temporaryPassword ?? payload.password
        });
      }

      await loadUsers();
      clearSelection();
    } catch (_error) {
      setError("Çalışan güncellenemedi. Sicil no veya e-posta çakışıyor olabilir.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function renderProfileFields(state, updater, includePassword = true) {
    return (
      <>
        <label>
          Ad Soyad
          <input value={state.name} onChange={(event) => updater("name", event.target.value)} placeholder="Ahmet Yılmaz" required />
        </label>
        <label>
          Mobil / Web E-posta
          <input value={state.email} onChange={(event) => updater("email", event.target.value)} type="email" placeholder="operator@meslite.local" required />
        </label>
        <label>
          {includePassword ? "Geçici Şifre" : "Şifre Sıfırla"}
          <div className="password-inline">
            <input
              value={state.password}
              onChange={(event) => updater("password", event.target.value)}
              type="text"
              minLength="8"
              placeholder={includePassword ? "MesLite123!" : "Boş bırakılırsa değişmez"}
              required={includePassword}
            />
            <button type="button" onClick={() => updater("password", generateTemporaryPassword())} title="Geçici şifre üret">
              <KeyRound size={16} />
            </button>
          </div>
        </label>
        <label>
          Sicil No
          <input value={state.employeeCode} onChange={(event) => updater("employeeCode", event.target.value)} placeholder="EMP-0042" />
        </label>
        <label>
          Telefon
          <input value={state.phone} onChange={(event) => updater("phone", event.target.value)} placeholder="+90 555 100 00 00" />
        </label>
        <label>
          Departman
          <input value={state.department} onChange={(event) => updater("department", event.target.value)} placeholder="Montaj" />
        </label>
        <label>
          Pozisyon
          <input value={state.position} onChange={(event) => updater("position", event.target.value)} placeholder="Montaj Operatörü" />
        </label>
        <label>
          İşe Giriş
          <input value={state.hireDate} onChange={(event) => updater("hireDate", event.target.value)} type="date" />
        </label>
        <label>
          İşten Çıkış
          <input value={state.terminationDate} onChange={(event) => updater("terminationDate", event.target.value)} type="date" />
        </label>
        <label>
          Acil Kişi
          <input value={state.emergencyContactName} onChange={(event) => updater("emergencyContactName", event.target.value)} placeholder="Yakın adı" />
        </label>
        <label>
          Acil Telefon
          <input value={state.emergencyContactPhone} onChange={(event) => updater("emergencyContactPhone", event.target.value)} placeholder="+90 555 200 00 00" />
        </label>
        <label>
          Rol
          <select value={state.role} onChange={(event) => updater("role", event.target.value)} required>
            <option value="OPERATOR">Operatör</option>
            <option value="PRODUCTION_MANAGER">Üretim Yöneticisi</option>
            <option value="QUALITY_STAFF">Kalite Personeli</option>
            <option value="VIEWER">İzleyici</option>
            <option value="ADMIN">Admin</option>
          </select>
        </label>
      </>
    );
  }

  return (
    <div className="page-stack">
      <header className="page-header">
        <div>
          <h1>Çalışanlar</h1>
          <p>Çalışan kartlarını, web hesaplarını ve mobil operatör giriş bilgilerini yönetin.</p>
        </div>
      </header>

      {error ? <p className="form-error">{error}</p> : null}

      {credentialCard ? (
        <section className="credential-card">
          <div>
            <strong>{credentialCard.title}</strong>
            <span>{credentialCard.name}</span>
            <code>E-posta: {credentialCard.email}</code>
            <code>Geçici şifre: {credentialCard.password}</code>
            <small>Bu şifre veritabanında düz metin saklanmaz; sadece bu işlemden sonra gösterilir.</small>
          </div>
          <button type="button" onClick={() => copyCredentials(credentialCard)}>
            Kopyala
          </button>
          <button type="button" onClick={() => setCredentialCard(null)} aria-label="Bilgileri kapat">
            <X size={16} />
          </button>
        </section>
      ) : null}

      <section className="panel">
        <h2>Çalışan Oluştur</h2>
        <form className="work-order-form" onSubmit={handleSubmit}>
          {renderProfileFields(form, updateForm)}
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
              <h2>Çalışan Kartı Düzenle</h2>
              <p className="muted-text">Şifre alanını doldurursanız mobil/web giriş şifresi sıfırlanır. Boş bırakılırsa mevcut şifre korunur.</p>
            </div>
            <button className="icon-button" type="button" onClick={clearSelection} aria-label="Düzenlemeyi kapat" title="Düzenlemeyi kapat">
              <X size={18} />
            </button>
          </div>
          <form className="work-order-form" onSubmit={handleUpdate}>
            {renderProfileFields(editForm, updateEditForm, false)}
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
        <div className="section-title-row">
          <div>
            <h2>Çalışan Listesi</h2>
            <p className="muted-text">E-posta mobil giriş kullanıcı adıdır. Şifre güvenlik nedeniyle listede gösterilmez; düzenle ile sıfırlanır.</p>
          </div>
          <input className="table-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="İsim, sicil, departman veya telefon ara" />
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Sicil</th>
                <th>Ad Soyad</th>
                <th>Mobil Giriş</th>
                <th>Departman</th>
                <th>Pozisyon</th>
                <th>Telefon</th>
                <th>Rol</th>
                <th>Durum</th>
                <th>İşlem</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((user) => (
                <tr key={user.id} className={selectedUser?.id === user.id ? "selected-row" : ""}>
                  <td>{user.employeeCode ?? "-"}</td>
                  <td>
                    <strong>{user.name}</strong>
                    <div className="muted-text">{user.email}</div>
                  </td>
                  <td>
                    <strong>{user.email}</strong>
                    <div className="muted-text">Şifre: oluştururken verilir veya sıfırlanır</div>
                  </td>
                  <td>{user.department ?? "-"}</td>
                  <td>{user.position ?? "-"}</td>
                  <td>{user.phone ?? "-"}</td>
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
              {!isLoading && filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan="9">Çalışan bulunamadı.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
