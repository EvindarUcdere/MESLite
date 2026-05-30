import { useEffect, useMemo, useState } from "react";
import { getProductionLogs } from "../api/productionLogs.api.js";
import { useSocket } from "../hooks/useSocket.js";

const API_ORIGIN = (import.meta.env.VITE_API_URL ?? "http://localhost:4000/api").replace(/\/api\/?$/, "");

function getAttachmentUrl(attachment) {
  if (!attachment?.fileUrl) {
    return "";
  }

  return `${API_ORIGIN}${attachment.fileUrl}`;
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

function normalize(value) {
  return value?.toLocaleLowerCase("tr-TR") ?? "";
}

export default function FieldNotes() {
  const [logs, setLogs] = useState([]);
  const [search, setSearch] = useState("");
  const [machineFilter, setMachineFilter] = useState("ALL");
  const [operatorFilter, setOperatorFilter] = useState("ALL");
  const [imageFilter, setImageFilter] = useState("ALL");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadNotes({ showLoading = false } = {}) {
    if (showLoading) {
      setIsLoading(true);
    }

    try {
      const data = await getProductionLogs();
      setLogs(data.filter((log) => log.note?.trim()));
      setError("");
    } catch (_error) {
      setError("Saha notları yüklenemedi.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadNotes({ showLoading: true });
  }, []);

  useSocket({
    "production:logged": () => loadNotes()
  });

  const machines = useMemo(() => {
    const unique = new Map();
    logs.forEach((log) => {
      unique.set(log.machine.id, `${log.machine.code} - ${log.machine.name}`);
    });
    return [...unique.entries()].map(([id, label]) => ({ id, label }));
  }, [logs]);

  const operators = useMemo(() => {
    const unique = new Map();
    logs.forEach((log) => {
      unique.set(log.operator.id, log.operator.name);
    });
    return [...unique.entries()].map(([id, label]) => ({ id, label }));
  }, [logs]);

  const filteredNotes = useMemo(() => {
    const searchText = normalize(search);

    return logs.filter((log) => {
      const matchesSearch =
        !searchText ||
        normalize(log.note).includes(searchText) ||
        normalize(log.workOrder.orderNo).includes(searchText) ||
        normalize(log.workOrder.product.name).includes(searchText) ||
        normalize(log.machine.code).includes(searchText) ||
        normalize(log.machine.name).includes(searchText) ||
        normalize(log.operator.name).includes(searchText);
      const matchesMachine = machineFilter === "ALL" || log.machine.id === machineFilter;
      const matchesOperator = operatorFilter === "ALL" || log.operator.id === operatorFilter;
      const hasImage = Boolean(log.attachments?.length);
      const matchesImage = imageFilter === "ALL" || (imageFilter === "WITH_IMAGE" ? hasImage : !hasImage);

      return matchesSearch && matchesMachine && matchesOperator && matchesImage;
    });
  }, [imageFilter, logs, machineFilter, operatorFilter, search]);

  const notesWithImages = logs.filter((log) => log.attachments?.length).length;

  return (
    <div className="page-stack">
      <header className="page-header">
        <div>
          <h1>Saha Notları</h1>
          <p>Operatörlerin mobil uygulamadan bıraktığı tüm üretim notlarını ve görselleri inceleyin.</p>
        </div>
      </header>

      {error ? <p className="form-error">{error}</p> : null}

      <section className="summary-grid">
        <article>
          <span>Toplam Not</span>
          <strong>{isLoading ? "..." : logs.length}</strong>
        </article>
        <article>
          <span>Görselli Not</span>
          <strong>{isLoading ? "..." : notesWithImages}</strong>
        </article>
        <article>
          <span>Filtrelenen</span>
          <strong>{isLoading ? "..." : filteredNotes.length}</strong>
        </article>
      </section>

      <section className="panel">
        <div className="note-filter-grid">
          <label>
            Arama
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Not, iş emri, ürün, makine veya operatör ara"
            />
          </label>
          <label>
            Makine
            <select value={machineFilter} onChange={(event) => setMachineFilter(event.target.value)}>
              <option value="ALL">Tüm makineler</option>
              {machines.map((machine) => (
                <option key={machine.id} value={machine.id}>
                  {machine.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Operatör
            <select value={operatorFilter} onChange={(event) => setOperatorFilter(event.target.value)}>
              <option value="ALL">Tüm operatörler</option>
              {operators.map((operator) => (
                <option key={operator.id} value={operator.id}>
                  {operator.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Görsel
            <select value={imageFilter} onChange={(event) => setImageFilter(event.target.value)}>
              <option value="ALL">Tümü</option>
              <option value="WITH_IMAGE">Görselli</option>
              <option value="WITHOUT_IMAGE">Görselsiz</option>
            </select>
          </label>
        </div>
      </section>

      <section className="field-note-list">
        {filteredNotes.map((log) => (
          <article key={log.id} className="field-note-card">
            <div className="field-note-main">
              <div className="operator-note-header">
                <strong>{log.workOrder.orderNo}</strong>
                <span>{formatDateTime(log.createdAt)}</span>
              </div>
              <p>{log.note}</p>
              <div className="alert-context-grid">
                <div>
                  <span>Ürün</span>
                  <strong>{log.workOrder.product.name}</strong>
                </div>
                <div>
                  <span>Makine</span>
                  <strong>
                    {log.machine.code} - {log.machine.name}
                  </strong>
                </div>
                <div>
                  <span>Operatör</span>
                  <strong>{log.operator.name}</strong>
                </div>
                <div>
                  <span>Üretim / Fire</span>
                  <strong>
                    {log.producedQuantity} / {log.scrapQuantity}
                  </strong>
                </div>
              </div>
            </div>
            {log.attachments?.[0] ? (
              <a className="field-note-image-link" href={getAttachmentUrl(log.attachments[0])} target="_blank" rel="noreferrer">
                <img src={getAttachmentUrl(log.attachments[0])} alt="Saha notu görseli" />
              </a>
            ) : null}
          </article>
        ))}
        {!isLoading && filteredNotes.length === 0 ? <p className="empty-state">Filtreye uygun saha notu yok.</p> : null}
      </section>
    </div>
  );
}
