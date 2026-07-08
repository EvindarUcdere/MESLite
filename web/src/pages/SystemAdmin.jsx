import { Activity, AlertTriangle, Bell, CheckCircle2, DatabaseZap, ExternalLink, History, KeyRound, RefreshCw, Server, ShieldCheck, Smartphone, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { apiClient } from "../api/client.js";
import { getAuditLogs } from "../api/auditLogs.api.js";
import { getDomainEventLogs } from "../api/domainEventLogs.api.js";
import { getUsers } from "../api/masterData.api.js";
import { getOfflineOperationLogs } from "../api/offlineOperationLogs.api.js";
import { ROLE_LABELS } from "../utils/roles.js";

const ADMIN_ACTIONS = [
  {
    title: "Kullanıcı ve rol yönetimi",
    description: "Yeni çalışan aç, rol değiştir, hesapları aktif veya pasif yap.",
    to: "/users",
    icon: Users
  },
  {
    title: "İşlem geçmişi",
    description: "Üretim, kalite, fire ve yetki aksiyonlarını kim yaptı izle.",
    to: "/audit-logs",
    icon: History
  },
  {
    title: "Sistem olayları",
    description: "Bildirim, domain event ve entegrasyon akışlarını kontrol et.",
    to: "/event-logs",
    icon: Activity
  },
  {
    title: "Bildirim merkezi",
    description: "Admin hesabına düşen sistem ve saha bildirimlerini takip et.",
    to: "/notifications",
    icon: Bell
  }
];

function getApiOrigin() {
  return (apiClient.defaults.baseURL ?? "http://localhost:4000/api").replace(/\/api\/?$/, "");
}

function formatDateTime(value) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function getHealthLabel(status) {
  if (status === "online") {
    return "Çalışıyor";
  }

  if (status === "checking") {
    return "Kontrol ediliyor";
  }

  return "Erişilemiyor";
}

function StatCard({ icon: Icon, label, value, hint, tone = "system" }) {
  return (
    <article className={`system-stat-card system-stat-${tone}`}>
      <span className="system-stat-icon">
        <Icon size={20} />
      </span>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{hint}</small>
    </article>
  );
}

function RoleDistribution({ users }) {
  const roleCounts = useMemo(() => {
    const counts = new Map();

    users.forEach((user) => {
      counts.set(user.role, (counts.get(user.role) ?? 0) + 1);
    });

    return [...counts.entries()].sort(([roleA], [roleB]) => roleA.localeCompare(roleB));
  }, [users]);

  return (
    <div className="system-role-list">
      {roleCounts.map(([role, count]) => (
        <div key={role}>
          <span>{ROLE_LABELS[role] ?? role}</span>
          <strong>{count}</strong>
        </div>
      ))}
      {roleCounts.length === 0 ? <p className="muted-text">Kullanıcı verisi bulunamadı.</p> : null}
    </div>
  );
}

export default function SystemAdmin() {
  const [users, setUsers] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [offlineLogs, setOfflineLogs] = useState([]);
  const [eventLogs, setEventLogs] = useState([]);
  const [backendHealth, setBackendHealth] = useState({ status: "checking", mode: "-", checkedAt: null });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadSystemAdmin() {
    setIsLoading(true);
    setError("");
    setBackendHealth((current) => ({ ...current, status: "checking" }));

    try {
      const healthRequest = fetch(`${getApiOrigin()}/health`).then(async (response) => {
        if (!response.ok) {
          throw new Error("health-failed");
        }

        return response.json();
      });

      const [userData, auditData, offlineData, eventData, healthData] = await Promise.all([
        getUsers(),
        getAuditLogs({ limit: 40 }),
        getOfflineOperationLogs({ limit: 80 }),
        getDomainEventLogs({ limit: 40 }),
        healthRequest
      ]);

      setUsers(userData);
      setAuditLogs(auditData);
      setOfflineLogs(offlineData);
      setEventLogs(eventData);
      setBackendHealth({
        status: "online",
        mode: healthData.mode ?? "-",
        checkedAt: new Date().toISOString()
      });
    } catch (_loadError) {
      setError("Sistem admin verileri yüklenemedi. Backend bağlantısını ve admin yetkisini kontrol edin.");
      setBackendHealth((current) => ({
        ...current,
        status: "offline",
        checkedAt: new Date().toISOString()
      }));
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadSystemAdmin();
  }, []);

  const activeUsers = users.filter((user) => user.isActive).length;
  const passiveUsers = Math.max(users.length - activeUsers, 0);
  const adminUsers = users.filter((user) => user.role === "ADMIN" && user.isActive).length;
  const failedSyncCount = offlineLogs.filter((log) => log.status === "FAILED").length;
  const pendingSyncCount = offlineLogs.filter((log) => log.status === "PENDING" || log.status === "PROCESSING").length;
  const latestAuditLog = auditLogs[0];
  const latestEventLog = eventLogs[0];

  return (
    <div className="page-stack system-admin-page">
      <header className="page-header dashboard-header system-admin-hero">
        <div>
          <span className="dashboard-eyebrow">Sistem Yönetimi</span>
          <h1>Sistem Admin</h1>
          <p>Kullanıcı erişimi, izlenebilirlik, offline senkronizasyon ve canlı servis durumunu tek merkezden takip edin.</p>
        </div>
        <div className="dashboard-header-actions">
          <span className={`system-health-chip is-${backendHealth.status}`}>
            <span />
            {getHealthLabel(backendHealth.status)}
          </span>
          <button className="secondary-action" type="button" onClick={loadSystemAdmin} disabled={isLoading}>
            <RefreshCw size={16} />
            Yenile
          </button>
        </div>
      </header>

      {error ? <p className="form-error">{error}</p> : null}

      <section className="system-stat-grid">
        <StatCard icon={Users} label="Aktif Kullanıcı" value={isLoading ? "..." : activeUsers} hint={`${passiveUsers} pasif hesap`} tone="green" />
        <StatCard icon={KeyRound} label="Admin Hesabı" value={isLoading ? "..." : adminUsers} hint="Sistem yetkisine sahip aktif kullanıcı" tone="red" />
        <StatCard icon={DatabaseZap} label="Offline Hata" value={isLoading ? "..." : failedSyncCount} hint={`${pendingSyncCount} bekleyen/işlenen kayıt`} tone={failedSyncCount > 0 ? "amber" : "green"} />
        <StatCard icon={Server} label="Backend Modu" value={isLoading ? "..." : backendHealth.mode} hint={`Son kontrol: ${formatDateTime(backendHealth.checkedAt)}`} tone={backendHealth.status === "online" ? "blue" : "red"} />
      </section>

      <section className="system-admin-grid">
        <article className="panel system-admin-panel">
          <div className="section-title-row">
            <div>
              <h2>Admin Aksiyonları</h2>
              <p className="muted-text">Sistemi yönetmek için en sık kullanılan ekranlar.</p>
            </div>
          </div>
          <div className="system-action-list">
            {ADMIN_ACTIONS.map((action) => {
              const Icon = action.icon;

              return (
                <Link key={action.to} to={action.to}>
                  <span>
                    <Icon size={18} />
                  </span>
                  <strong>{action.title}</strong>
                  <small>{action.description}</small>
                  <ExternalLink size={16} />
                </Link>
              );
            })}
          </div>
        </article>

        <article className="panel system-admin-panel">
          <div className="section-title-row">
            <div>
              <h2>Rol Dağılımı</h2>
              <p className="muted-text">Web ve mobil erişimlerin rol bazlı görünümü.</p>
            </div>
          </div>
          <RoleDistribution users={users} />
        </article>
      </section>

      <section className="system-admin-grid">
        <article className="panel system-admin-panel">
          <div className="section-title-row">
            <div>
              <h2>Güvenlik ve İzlenebilirlik</h2>
              <p className="muted-text">Son audit kaydı ve yetki riskleri.</p>
            </div>
          </div>
          <div className="system-signal-stack">
            <div className="system-signal-card">
              <ShieldCheck size={18} />
              <span>
                <strong>{latestAuditLog?.summary ?? "Audit kaydı bulunamadı"}</strong>
                <small>{latestAuditLog ? `${latestAuditLog.actor?.name ?? "Sistem"} · ${formatDateTime(latestAuditLog.createdAt)}` : "İşlem geçmişi boş."}</small>
              </span>
            </div>
            <div className={`system-signal-card ${adminUsers > 1 ? "is-warning" : "is-ok"}`}>
              {adminUsers > 1 ? <AlertTriangle size={18} /> : <CheckCircle2 size={18} />}
              <span>
                <strong>{adminUsers > 1 ? "Birden fazla aktif admin var" : "Admin yetkisi kontrollü"}</strong>
                <small>{adminUsers} aktif admin hesabı görünüyor.</small>
              </span>
            </div>
          </div>
        </article>

        <article className="panel system-admin-panel">
          <div className="section-title-row">
            <div>
              <h2>Mobil ve Offline Güvenilirlik</h2>
              <p className="muted-text">Offline-first akışın backend tarafındaki son durumu.</p>
            </div>
          </div>
          <div className="system-signal-stack">
            <div className={`system-signal-card ${failedSyncCount > 0 ? "is-warning" : "is-ok"}`}>
              {failedSyncCount > 0 ? <AlertTriangle size={18} /> : <Smartphone size={18} />}
              <span>
                <strong>{failedSyncCount > 0 ? "Başarısız offline işlem var" : "Offline hata görünmüyor"}</strong>
                <small>{offlineLogs.length} son senkron kaydı incelendi.</small>
              </span>
            </div>
            <div className="system-signal-card">
              <Activity size={18} />
              <span>
                <strong>{latestEventLog?.summary ?? "Sistem olayı bulunamadı"}</strong>
                <small>{latestEventLog ? `${latestEventLog.type} · ${formatDateTime(latestEventLog.occurredAt)}` : "Domain event kaydı boş."}</small>
              </span>
            </div>
          </div>
        </article>
      </section>
    </div>
  );
}
