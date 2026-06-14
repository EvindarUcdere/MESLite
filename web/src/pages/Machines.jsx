import { Activity, Factory, Plus, Settings, Wrench } from "lucide-react";
import { useEffect, useState } from "react";
import { createMachine, createProductionLine, getMachines, getProductionLines, updateMachineStatus } from "../api/masterData.api.js";

const STATUS_LABELS = {
  IDLE: "Boşta",
  RUNNING: "Çalışıyor",
  STOPPED: "Duruşta",
  MAINTENANCE: "Bakımda"
};

const DOWNTIME_REASONS = [
  "Arıza",
  "Planlı Bakım",
  "Kalıp/Ayar Değişimi",
  "Malzeme Bekleme",
  "Kalite Kontrol Bekleme",
  "Operatör Bekleme",
  "Diğer"
];

export default function Machines() {
  const [machines, setMachines] = useState([]);
  const [productionLines, setProductionLines] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [machineForm, setMachineForm] = useState({
    code: "",
    name: "",
    productionLineId: "",
    status: "IDLE"
  });
  const [lineForm, setLineForm] = useState({
    name: "",
    description: ""
  });
  const [statusReasons, setStatusReasons] = useState({});

  async function loadData() {
    setError("");
    const [machineData, lineData] = await Promise.all([getMachines(), getProductionLines()]);
    setMachines(machineData);
    setProductionLines(lineData);
  }

  useEffect(() => {
    let isMounted = true;

    async function loadInitialData() {
      try {
        const [machineData, lineData] = await Promise.all([getMachines(), getProductionLines()]);

        if (isMounted) {
          setMachines(machineData);
          setProductionLines(lineData);
        }
      } catch (_error) {
        if (isMounted) {
          setError("Makine verileri yüklenemedi.");
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

  function updateMachineForm(field, value) {
    setMachineForm((current) => ({ ...current, [field]: value }));
  }

  function updateLineForm(field, value) {
    setLineForm((current) => ({ ...current, [field]: value }));
  }

  async function handleCreateLine(event) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      await createProductionLine({
        name: lineForm.name,
        ...(lineForm.description ? { description: lineForm.description } : {})
      });
      setLineForm({ name: "", description: "" });
      await loadData();
    } catch (_error) {
      setError("Üretim hattı oluşturulamadı.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleCreateMachine(event) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      await createMachine(machineForm);
      setMachineForm((current) => ({ ...current, code: "", name: "" }));
      await loadData();
    } catch (_error) {
      setError("Makine oluşturulamadı.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function updateStatusReason(machineId, reason) {
    setStatusReasons((current) => ({ ...current, [machineId]: reason }));
  }

  async function handleStatusChange(machineId, status) {
    setError("");

    try {
      const reason = ["STOPPED", "MAINTENANCE"].includes(status) ? statusReasons[machineId] : "Web panelinden güncellendi";

      if (["STOPPED", "MAINTENANCE"].includes(status) && !reason) {
        setError("Duruşta veya bakımda durumuna geçmeden önce duruş nedeni seçin.");
        return;
      }

      await updateMachineStatus(machineId, { status, reason });
      await loadData();
    } catch (_error) {
      setError("Makine durumu güncellenemedi.");
    }
  }

  return (
    <div className="page-stack">
      <header className="page-header">
        <div>
          <h1>Makineler</h1>
          <p>Üretim hatlarını, makineleri ve güncel makine durumlarını yönetin.</p>
        </div>
      </header>

      {error ? <p className="form-error">{error}</p> : null}

      <section className="master-summary-grid">
        <article className="master-summary-card">
          <span className="master-summary-icon">
            <Factory size={22} />
          </span>
          <div>
            <small>Üretim Hattı</small>
            <strong>{isLoading ? "..." : productionLines.length}</strong>
            <em>Makine parkının bağlı olduğu hatlar</em>
          </div>
        </article>
        <article className="master-summary-card">
          <span className="master-summary-icon master-summary-icon-blue">
            <Settings size={22} />
          </span>
          <div>
            <small>Toplam Makine</small>
            <strong>{isLoading ? "..." : machines.length}</strong>
            <em>Sisteme tanımlı ekipman</em>
          </div>
        </article>
        <article className="master-summary-card">
          <span className="master-summary-icon master-summary-icon-green">
            <Activity size={22} />
          </span>
          <div>
            <small>Çalışan</small>
            <strong>{isLoading ? "..." : machines.filter((machine) => machine.status === "RUNNING").length}</strong>
            <em>Anlık üretimde görünen makineler</em>
          </div>
        </article>
        <article className="master-summary-card">
          <span className="master-summary-icon master-summary-icon-amber">
            <Wrench size={22} />
          </span>
          <div>
            <small>Duruş/Bakım</small>
            <strong>{isLoading ? "..." : machines.filter((machine) => ["STOPPED", "MAINTENANCE"].includes(machine.status)).length}</strong>
            <em>Takip gerektiren ekipman</em>
          </div>
        </article>
      </section>

      <section className="operations-grid master-form-grid">
        <article className="panel master-form-panel">
          <div className="chart-card-header">
            <div>
              <h2>Üretim Hattı Oluştur</h2>
              <p>Makineleri gruplayacağınız üretim alanını veya hattı tanımlayın.</p>
            </div>
          </div>
          <form className="stack-form" onSubmit={handleCreateLine}>
            <label>
              Ad
              <input value={lineForm.name} onChange={(event) => updateLineForm("name", event.target.value)} placeholder="Hat B" required />
            </label>
            <label>
              Açıklama
              <input value={lineForm.description} onChange={(event) => updateLineForm("description", event.target.value)} placeholder="İsteğe bağlı açıklama" />
            </label>
            <button className="primary-button" type="submit" disabled={isSubmitting}>
              <Plus size={18} />
              Hat Oluştur
            </button>
          </form>
        </article>

        <article className="panel master-form-panel">
          <div className="chart-card-header">
            <div>
              <h2>Makine Oluştur</h2>
              <p>Makine kodu, hattı ve başlangıç durumuyla yeni ekipman kartı açın.</p>
            </div>
          </div>
          <form className="stack-form" onSubmit={handleCreateMachine}>
            <label>
              Kod
              <input value={machineForm.code} onChange={(event) => updateMachineForm("code", event.target.value)} placeholder="MCH-002" required />
            </label>
            <label>
              Ad
              <input value={machineForm.name} onChange={(event) => updateMachineForm("name", event.target.value)} placeholder="Pres Makinesi" required />
            </label>
            <label>
              Üretim Hattı
              <select value={machineForm.productionLineId} onChange={(event) => updateMachineForm("productionLineId", event.target.value)} required>
                <option value="">Hat seçin</option>
                {productionLines.map((line) => (
                  <option key={line.id} value={line.id}>
                    {line.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Durum
              <select value={machineForm.status} onChange={(event) => updateMachineForm("status", event.target.value)} required>
                <option value="IDLE">Boşta</option>
                <option value="RUNNING">Çalışıyor</option>
                <option value="STOPPED">Duruşta</option>
                <option value="MAINTENANCE">Bakımda</option>
              </select>
            </label>
            <button className="primary-button" type="submit" disabled={isSubmitting || productionLines.length === 0}>
              <Plus size={18} />
              Makine Oluştur
            </button>
          </form>
        </article>
      </section>

      <section className="panel production-log-panel">
        <div className="chart-card-header">
          <div>
            <h2>Makine Listesi</h2>
            <p>Makine durumlarını güncelleyin; duruş/bakım için nedeni kayıt altına alın.</p>
          </div>
          <span className="record-count">{machines.length} makine</span>
        </div>
        <div className="table-wrap dashboard-table-wrap">
          <table className="dashboard-data-table master-data-table">
            <thead>
              <tr>
                <th>Kod</th>
                <th>Ad</th>
                <th>Hat</th>
                <th>Durum</th>
                <th>Duruş Nedeni</th>
                <th>Durum Güncelle</th>
              </tr>
            </thead>
            <tbody>
              {machines.map((machine) => (
                <tr key={machine.id}>
                  <td>
                    <strong className="table-primary">{machine.code}</strong>
                  </td>
                  <td>
                    <span className="table-secondary">{machine.name}</span>
                  </td>
                  <td>{machine.productionLine?.name ? <span className="machine-code-chip">{machine.productionLine.name}</span> : "-"}</td>
                  <td>
                    <span className={`status-pill status-${machine.status.toLowerCase()}`}>{STATUS_LABELS[machine.status] ?? machine.status}</span>
                  </td>
                  <td>
                    <select
                      className="compact-select"
                      value={statusReasons[machine.id] ?? ""}
                      onChange={(event) => updateStatusReason(machine.id, event.target.value)}
                    >
                      <option value="">Neden seçin</option>
                      {DOWNTIME_REASONS.map((reason) => (
                        <option key={reason} value={reason}>
                          {reason}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <select className="compact-select" value={machine.status} onChange={(event) => handleStatusChange(machine.id, event.target.value)}>
                      <option value="IDLE">Boşta</option>
                      <option value="RUNNING">Çalışıyor</option>
                      <option value="STOPPED">Duruşta</option>
                      <option value="MAINTENANCE">Bakımda</option>
                    </select>
                  </td>
                </tr>
              ))}
              {!isLoading && machines.length === 0 ? (
                <tr>
                  <td colSpan="6">Henüz makine yok.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
