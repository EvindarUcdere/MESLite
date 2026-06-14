import { useEffect, useMemo, useState } from "react";
import { Camera, Filter, FileText, Image, ImageOff, Package, Search, StickyNote, UserRound, Wrench } from "lucide-react";
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

      <section className="field-note-summary-grid">
        <article className="field-note-summary-card">
          <span className="field-note-summary-icon">
            <StickyNote size={22} />
          </span>
          <div>
            <span>Toplam Not</span>
            <strong>{isLoading ? "..." : logs.length}</strong>
            <small>Sahadan gelen tüm notlar</small>
          </div>
        </article>
        <article className="field-note-summary-card">
          <span className="field-note-summary-icon field-note-summary-icon-blue">
            <Camera size={22} />
          </span>
          <div>
            <span>Görselli Not</span>
            <strong>{isLoading ? "..." : notesWithImages}</strong>
            <small>Kanıt görseli eklenen kayıt</small>
          </div>
        </article>
        <article className="field-note-summary-card">
          <span className="field-note-summary-icon field-note-summary-icon-green">
            <Filter size={22} />
          </span>
          <div>
            <span>Filtrelenen</span>
            <strong>{isLoading ? "..." : filteredNotes.length}</strong>
            <small>Mevcut filtre sonucunda görünen</small>
          </div>
        </article>
      </section>

      <section className="panel field-note-filter-panel">
        <div className="chart-card-header">
          <div>
            <h2>Notları Filtrele</h2>
            <p>İş emri, ürün, makine, operatör veya görsel durumuna göre saha notlarını daraltın.</p>
          </div>
        </div>
        <div className="note-filter-grid">
          <label>
            Arama
            <span className="input-with-icon">
              <Search size={16} />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Not, iş emri, ürün, makine veya operatör ara" />
            </span>
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
          <article key={log.id} className={`field-note-card ${log.scrapQuantity > 0 ? "has-scrap" : ""}`}>
            <div className="field-note-main">
              <div className="operator-note-header">
                <div>
                  <span className="field-note-type">
                    <FileText size={14} />
                    Saha Notu
                  </span>
                  <strong>{log.workOrder.orderNo}</strong>
                </div>
                <span>{formatDateTime(log.createdAt)}</span>
              </div>
              <div className="field-note-message">
                <p>{log.note}</p>
              </div>
              <div className="field-note-meta-grid">
                <div>
                  <span>
                    <Package size={14} />
                    Ürün
                  </span>
                  <strong>{log.workOrder.product.name}</strong>
                </div>
                <div>
                  <span>
                    <Wrench size={14} />
                    Makine
                  </span>
                  <strong>
                    {log.machine.code} - {log.machine.name}
                  </strong>
                </div>
                <div>
                  <span>
                    <UserRound size={14} />
                    Operatör
                  </span>
                  <strong>{log.operator.name}</strong>
                </div>
                <div className="field-note-quantity-box">
                  <span>Üretim / Fire</span>
                  <strong>
                    <em>{log.producedQuantity}</em>
                    <i>{log.scrapQuantity}</i>
                  </strong>
                </div>
              </div>
            </div>
            {log.attachments?.[0] ? (
              <a className="field-note-image-link" href={getAttachmentUrl(log.attachments[0])} target="_blank" rel="noreferrer">
                <img src={getAttachmentUrl(log.attachments[0])} alt="Saha notu görseli" />
                <span>
                  <Image size={15} />
                  Görseli aç
                </span>
              </a>
            ) : (
              <div className="field-note-image-empty">
                <ImageOff size={28} />
                <span>Görsel yok</span>
              </div>
            )}
          </article>
        ))}
        {!isLoading && filteredNotes.length === 0 ? <p className="empty-state">Filtreye uygun saha notu yok.</p> : null}
      </section>
    </div>
  );
}
