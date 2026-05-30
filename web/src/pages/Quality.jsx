import { ClipboardCheck, Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createQualityCheck, getQualityChecks } from "../api/qualityChecks.api.js";
import { getWorkOrders } from "../api/workOrders.api.js";

const QUALITY_LABELS = {
  PASSED: "Geçti",
  PARTIAL: "Kısmi",
  FAILED: "Kaldı"
};

const SCRAP_REASON_LABELS = {
  MATERIAL_DEFECT: "Malzeme Hatası",
  MACHINE_SETUP: "Makine Ayarı",
  OPERATOR_ERROR: "Operatör Hatası",
  PROCESS_DEVIATION: "Proses Sapması",
  QUALITY_REJECT: "Kalite Reddi",
  OTHER: "Diğer",
  UNKNOWN: "Belirtilmemiş"
};

const API_ORIGIN = (import.meta.env.VITE_API_URL ?? "http://localhost:4000/api").replace(/\/api\/?$/, "");

function getAttachmentUrl(attachment) {
  if (!attachment?.fileUrl) {
    return "";
  }

  return `${API_ORIGIN}${attachment.fileUrl}`;
}

function formatDate(value) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("tr-TR", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function getApiErrorMessage(error, fallback) {
  return error?.response?.data?.message ?? fallback;
}

export default function Quality() {
  const [workOrders, setWorkOrders] = useState([]);
  const [qualityChecks, setQualityChecks] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    workOrderId: "",
    status: "PASSED",
    defectQuantity: 0,
    defectReason: "",
    note: ""
  });

  const checkCandidates = useMemo(
    () => workOrders.filter((workOrder) => workOrder.producedQuantity > 0 && workOrder.status !== "CANCELLED"),
    [workOrders]
  );
  const selectedWorkOrder = checkCandidates.find((workOrder) => workOrder.id === form.workOrderId);
  const selectedProductionLogs = selectedWorkOrder?.productionLogs ?? [];

  async function loadData() {
    setError("");
    const [workOrderData, qualityData] = await Promise.all([getWorkOrders(), getQualityChecks()]);
    setWorkOrders(workOrderData);
    setQualityChecks(qualityData);
  }

  useEffect(() => {
    let isMounted = true;

    async function loadInitialData() {
      try {
        const [workOrderData, qualityData] = await Promise.all([getWorkOrders(), getQualityChecks()]);

        if (isMounted) {
          setWorkOrders(workOrderData);
          setQualityChecks(qualityData);
        }
      } catch (_error) {
        if (isMounted) {
          setError("Kalite verileri yüklenemedi.");
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
      const defectQuantity = Number(form.defectQuantity);

      if (!selectedWorkOrder) {
        setError("Kalite kontrol için üretimi yapılmış bir iş emri seçin.");
        return;
      }

      if (defectQuantity > selectedWorkOrder.producedQuantity) {
        setError(`Hatalı adet üretim miktarını aşamaz. Üretilen: ${selectedWorkOrder.producedQuantity} adet.`);
        return;
      }

      if (["FAILED", "PARTIAL"].includes(form.status) && !form.defectReason.trim()) {
        setError("Kaldı veya kısmi sonuç için hata nedeni girin.");
        return;
      }

      await createQualityCheck({
        workOrderId: form.workOrderId,
        status: form.status,
        defectQuantity,
        ...(form.defectReason ? { defectReason: form.defectReason } : {}),
        ...(form.note ? { note: form.note } : {})
      });

      setForm((current) => ({
        ...current,
        defectQuantity: 0,
        defectReason: "",
        note: ""
      }));
      await loadData();
    } catch (error) {
      setError(getApiErrorMessage(error, "Kalite kontrol kaydı oluşturulamadı."));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="page-stack">
      <header className="page-header">
        <div>
          <h1>Kalite</h1>
          <p>Üretimi yapılan iş emirleri için kalite sonuçlarını kaydedin.</p>
        </div>
      </header>

      {error ? <p className="form-error">{error}</p> : null}

      <section className="panel">
        <div className="section-title-row">
          <div>
            <h2>Kalite Girişi</h2>
            <p className="muted-text">Üretimi yapılmış iş emirleri için kalite sonucunu ve hata nedenini kaydedin.</p>
          </div>
        </div>
        <form className="work-order-form" onSubmit={handleSubmit}>
          <label>
            İş Emri
            <select value={form.workOrderId} onChange={(event) => updateForm("workOrderId", event.target.value)} required>
              <option value="">Üretimi yapılmış iş emri seçin</option>
              {checkCandidates.map((workOrder) => (
                <option key={workOrder.id} value={workOrder.id}>
                  {workOrder.orderNo} - {workOrder.product.name} ({workOrder.producedQuantity} adet)
                </option>
              ))}
            </select>
          </label>
          <div className="field-span-all">
            <span className="form-field-title">Hızlı İş Emri Seçimi</span>
            <div className="choice-list">
              {checkCandidates.map((workOrder) => (
                <button
                  key={workOrder.id}
                  className={`choice-button ${form.workOrderId === workOrder.id ? "choice-button-active" : ""}`}
                  type="button"
                  onClick={() => updateForm("workOrderId", workOrder.id)}
                >
                  <strong>{workOrder.orderNo}</strong>
                  <span>{workOrder.product.name}</span>
                  <small>
                    Üretim {workOrder.producedQuantity} / Fire {workOrder.scrapQuantity}
                  </small>
                </button>
              ))}
            </div>
          </div>
          <label>
            Sonuç
            <select value={form.status} onChange={(event) => updateForm("status", event.target.value)} required>
              <option value="PASSED">Geçti</option>
              <option value="PARTIAL">Kısmi</option>
              <option value="FAILED">Kaldı</option>
            </select>
          </label>
          <label>
            Hatalı Adet
            <input value={form.defectQuantity} onChange={(event) => updateForm("defectQuantity", event.target.value)} type="number" min="0" required />
          </label>
          <label>
            Hata Nedeni
            <input value={form.defectReason} onChange={(event) => updateForm("defectReason", event.target.value)} placeholder="Çizik, ölçü hatası, malzeme..." />
          </label>
          <label>
            Not
            <input value={form.note} onChange={(event) => updateForm("note", event.target.value)} placeholder="İsteğe bağlı not" />
          </label>
          <button className="primary-button" type="submit" disabled={isSubmitting || checkCandidates.length === 0}>
            <Plus size={18} />
            Kaydet
          </button>
        </form>
        {selectedWorkOrder ? (
          <>
          <div className="quality-context">
            <div>
              <span>İş Emri</span>
              <strong>{selectedWorkOrder.orderNo}</strong>
            </div>
            <div>
              <span>Üretim</span>
              <strong>{selectedWorkOrder.producedQuantity}</strong>
            </div>
            <div>
              <span>Fire</span>
              <strong>{selectedWorkOrder.scrapQuantity}</strong>
            </div>
            <div>
              <span>Ürün</span>
              <strong>{selectedWorkOrder.product.code}</strong>
            </div>
          </div>
          <div className="quality-history">
            <div className="section-title-row">
              <div>
                <h3>Üretim Geçmişi</h3>
                <p className="muted-text">Kalite kararı için son saha kayıtları, fire nedenleri, notlar ve görseller.</p>
              </div>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Zaman</th>
                    <th>Makine</th>
                    <th>Operatör</th>
                    <th>Üretim</th>
                    <th>Fire</th>
                    <th>Fire Nedeni</th>
                    <th>Görsel</th>
                    <th>Not</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedProductionLogs.map((log) => (
                    <tr key={log.id}>
                      <td>{formatDate(log.createdAt)}</td>
                      <td>{log.machine?.code ?? "-"}</td>
                      <td>{log.operator?.name ?? "-"}</td>
                      <td>{log.producedQuantity}</td>
                      <td>{log.scrapQuantity}</td>
                      <td>{log.scrapQuantity > 0 ? SCRAP_REASON_LABELS[log.scrapReason ?? "UNKNOWN"] ?? log.scrapReason : "-"}</td>
                      <td>
                        {log.attachments?.[0] ? (
                          <a href={getAttachmentUrl(log.attachments[0])} target="_blank" rel="noreferrer">
                            <img className="table-thumb" src={getAttachmentUrl(log.attachments[0])} alt="Üretim görseli" />
                          </a>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td>{log.note ? <span className="note-chip">{log.note}</span> : "-"}</td>
                    </tr>
                  ))}
                  {selectedProductionLogs.length === 0 ? (
                    <tr>
                      <td colSpan="8">Bu iş emri için üretim kaydı bulunamadı.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
          </>
        ) : null}
        {!isLoading && checkCandidates.length === 0 ? <p className="empty-state">Kalite girişi için önce üretim kaydı girin.</p> : null}
      </section>

      <section className="panel">
        <h2>Son Kalite Kontrolleri</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>İş Emri</th>
                <th>Ürün</th>
                <th>Sonuç</th>
                <th>Hatalı</th>
                <th>Neden</th>
                <th>Not</th>
                <th>Kontrol Eden</th>
                <th>Kontrol Zamanı</th>
              </tr>
            </thead>
            <tbody>
              {qualityChecks.map((check) => (
                <tr key={check.id}>
                  <td>{check.workOrder.orderNo}</td>
                  <td>{check.workOrder.product.name}</td>
                  <td>
                    <span className={`status-pill quality-${check.status.toLowerCase()}`}>{QUALITY_LABELS[check.status] ?? check.status}</span>
                  </td>
                  <td>{check.defectQuantity}</td>
                  <td>{check.defectReason ?? "-"}</td>
                  <td>{check.note ? <span className="note-chip">{check.note}</span> : "-"}</td>
                  <td>{check.checkedBy.name}</td>
                  <td>{formatDate(check.checkedAt)}</td>
                </tr>
              ))}
              {!isLoading && qualityChecks.length === 0 ? (
                <tr>
                  <td colSpan="8">Henüz kalite kontrol kaydı yok.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
