import { AlertTriangle, ArrowDownCircle, ArrowUpCircle, Boxes, ChevronUp, Eye, Filter, RefreshCw, Save, Search, SlidersHorizontal, Warehouse } from "lucide-react";
import { Fragment, useEffect, useMemo, useState } from "react";
import { createStockMovement, getScrapLots, getStockItems, getStockMovements, updateStockItem } from "../api/inventory.api.js";

const scrapStatusLabels = {
  QUARANTINED: "Karantinada",
  REWORK_PLANNED: "Yeniden işlem bekliyor",
  REPRODUCTION_PLANNED: "Telafi üretimi açıldı",
  SCRAPPED: "Hurdaya ayrıldı",
  CONDITIONALLY_ACCEPTED: "Şartlı kabul"
};

const scrapReasonLabels = {
  MACHINE_FAILURE: "Makine Arızası",
  MATERIAL_DEFECT: "Malzeme Hatası",
  OPERATOR_ERROR: "Operatör Hatası",
  PROCESS_DEVIATION: "Proses Sapması",
  QUALITY_REJECT: "Kalite Reddi",
  OTHER: "Diğer"
};

const scrapDispositionLabels = {
  PENDING_REVIEW: "İnceleme Bekliyor",
  REWORK: "Yeniden İşlem",
  REPRODUCE: "Telafi Üretimi",
  SCRAP: "Hurda",
  CONDITIONAL_ACCEPT: "Şartlı Kabul"
};

const workOrderStatusLabels = {
  PLANNED: "Planlandı",
  IN_PROGRESS: "Üretimde",
  PAUSED: "Duraklatıldı",
  COMPLETED: "Tamamlandı",
  CANCELLED: "İptal Edildi"
};

const movementTypeLabels = {
  PURCHASE_IN: "Satın Alma Girişi",
  PRODUCTION_IN: "Üretim Girişi",
  CONSUMPTION_OUT: "Üretim Tüketimi",
  SCRAP_OUT: "Fire Çıkışı",
  ADJUSTMENT_IN: "Sayım Fazlası",
  ADJUSTMENT_OUT: "Sayım Eksiği"
};

const inboundTypes = new Set(["PURCHASE_IN", "PRODUCTION_IN", "ADJUSTMENT_IN"]);

export default function Inventory() {
  const [stockItems, setStockItems] = useState([]);
  const [movements, setMovements] = useState([]);
  const [scrapLots, setScrapLots] = useState([]);
  const [selectedProductId, setSelectedProductId] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [scrapSearch, setScrapSearch] = useState("");
  const [scrapStatusFilter, setScrapStatusFilter] = useState("ALL");
  const [expandedScrapLotId, setExpandedScrapLotId] = useState(null);
  const [inventoryTableView, setInventoryTableView] = useState("STOCK");
  const [movementForm, setMovementForm] = useState({
    productId: "",
    type: "PURCHASE_IN",
    quantity: "",
    note: ""
  });
  const [settingsForm, setSettingsForm] = useState({
    minimumQuantity: "",
    reservedQuantity: "",
    location: ""
  });

  const selectedStockItem = useMemo(
    () => stockItems.find((item) => item.productId === selectedProductId),
    [stockItems, selectedProductId]
  );

  const summary = useMemo(() => {
    const totalQuantity = stockItems.reduce((sum, item) => sum + Number(item.quantityOnHand || 0), 0);
    const belowMinimum = stockItems.filter((item) => item.isBelowMinimum).length;
    const reserved = stockItems.reduce((sum, item) => sum + Number(item.reservedQuantity || 0), 0);

    return {
      totalItems: stockItems.length,
      totalQuantity,
      belowMinimum,
      reserved
    };
  }, [stockItems]);

  const filteredScrapLots = useMemo(() => {
    const query = scrapSearch.trim().toLocaleLowerCase("tr-TR");

    return scrapLots.filter((lot) => {
      const matchesStatus = scrapStatusFilter === "ALL" || lot.status === scrapStatusFilter;
      const searchable = [lot.workOrder?.orderNo, lot.workOrderOperation?.operationName, lot.product?.code, lot.product?.name, lot.location, lot.reason]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("tr-TR");

      return matchesStatus && (!query || searchable.includes(query));
    });
  }, [scrapLots, scrapSearch, scrapStatusFilter]);

  async function loadInventory(productId = selectedProductId) {
    setError("");
    const [stockData, movementData, scrapData] = await Promise.all([
      getStockItems(),
      getStockMovements(productId ? { productId } : {}),
      getScrapLots()
    ]);

    setStockItems(stockData);
    setMovements(movementData);
    setScrapLots(scrapData);

    const nextSelectedProductId = productId || stockData[0]?.productId || "";
    setSelectedProductId(nextSelectedProductId);
    setMovementForm((current) => ({ ...current, productId: current.productId || nextSelectedProductId }));
  }

  useEffect(() => {
    let isMounted = true;

    async function loadInitialData() {
      try {
        const [stockData, movementData, scrapData] = await Promise.all([getStockItems(), getStockMovements(), getScrapLots()]);

        if (isMounted) {
          setStockItems(stockData);
          setMovements(movementData);
          setScrapLots(scrapData);
          const firstProductId = stockData[0]?.productId || "";
          setSelectedProductId(firstProductId);
          setMovementForm((current) => ({ ...current, productId: firstProductId }));
        }
      } catch (_error) {
        if (isMounted) {
          setError("Stok verileri yüklenemedi.");
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

  useEffect(() => {
    if (!selectedStockItem) {
      return;
    }

    setSettingsForm({
      minimumQuantity: String(selectedStockItem.minimumQuantity ?? 0),
      reservedQuantity: String(selectedStockItem.reservedQuantity ?? 0),
      location: selectedStockItem.location ?? ""
    });
  }, [selectedStockItem]);

  function updateMovementForm(field, value) {
    setMessage("");
    setMovementForm((current) => ({ ...current, [field]: value }));
  }

  function updateSettingsForm(field, value) {
    setMessage("");
    setSettingsForm((current) => ({ ...current, [field]: value }));
  }

  async function handleProductFilterChange(productId) {
    setSelectedProductId(productId);
    setMovementForm((current) => ({ ...current, productId }));
    await loadInventory(productId);
  }

  async function handleMovementSubmit(event) {
    event.preventDefault();
    setError("");
    setMessage("");
    setIsSubmitting(true);

    try {
      await createStockMovement({
        productId: movementForm.productId,
        type: movementForm.type,
        quantity: Number(movementForm.quantity),
        note: movementForm.note.trim() || undefined
      });
      setMovementForm((current) => ({ ...current, quantity: "", note: "" }));
      setMessage("Stok hareketi kaydedildi.");
      await loadInventory(movementForm.productId);
    } catch (submitError) {
      setError(submitError?.response?.data?.message || "Stok hareketi kaydedilemedi.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSettingsSubmit(event) {
    event.preventDefault();

    if (!selectedProductId) {
      return;
    }

    setError("");
    setMessage("");
    setIsSubmitting(true);

    try {
      await updateStockItem(selectedProductId, {
        minimumQuantity: Number(settingsForm.minimumQuantity || 0),
        reservedQuantity: Number(settingsForm.reservedQuantity || 0),
        location: settingsForm.location.trim() || null
      });
      setMessage("Stok kartı ayarları güncellendi.");
      await loadInventory(selectedProductId);
    } catch (submitError) {
      setError(submitError?.response?.data?.message || "Stok kartı güncellenemedi.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="page-stack inventory-page">
      <header className="page-header">
        <div>
          <h1>Stok Yönetimi</h1>
          <p>Ürün ve yarı mamul stoklarını, minimum seviyeleri ve depo hareketlerini takip edin.</p>
        </div>
      </header>

      {error ? <p className="form-error">{error}</p> : null}
      {message ? <p className="form-success">{message}</p> : null}

      <section className="master-summary-grid">
        <article className="master-summary-card">
          <span className="master-summary-icon">
            <Warehouse size={22} />
          </span>
          <div>
            <small>Stok Kartı</small>
            <strong>{isLoading ? "..." : summary.totalItems}</strong>
            <em>Ürün bazında takip edilen kart</em>
          </div>
        </article>
        <article className="master-summary-card">
          <span className="master-summary-icon master-summary-icon-green">
            <Boxes size={22} />
          </span>
          <div>
            <small>Toplam Bakiye</small>
            <strong>{isLoading ? "..." : summary.totalQuantity.toLocaleString("tr-TR")}</strong>
            <em>Tüm ürünlerde eldeki miktar</em>
          </div>
        </article>
        <article className="master-summary-card">
          <span className="master-summary-icon master-summary-icon-amber">
            <AlertTriangle size={22} />
          </span>
          <div>
            <small>Minimum Altı</small>
            <strong>{isLoading ? "..." : summary.belowMinimum}</strong>
            <em>Planlamada risk oluşturabilecek stok</em>
          </div>
        </article>
      </section>

      <section className="inventory-grid">
        <article className="panel inventory-action-card">
          <div className="chart-card-header">
            <div>
              <h2>Stok Hareketi</h2>
              <p>Satın alma girişi, üretim tüketimi veya sayım düzeltmesi kaydedin.</p>
            </div>
          </div>
          <form className="inventory-form" onSubmit={handleMovementSubmit}>
            <label>
              Ürün
              <select value={movementForm.productId} onChange={(event) => updateMovementForm("productId", event.target.value)} required>
                <option value="">Ürün seçin</option>
                {stockItems.map((item) => (
                  <option key={item.productId} value={item.productId}>
                    {item.product.code} - {item.product.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Hareket Tipi
              <select value={movementForm.type} onChange={(event) => updateMovementForm("type", event.target.value)}>
                {Object.entries(movementTypeLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Miktar
              <input type="number" min="0.001" step="0.001" value={movementForm.quantity} onChange={(event) => updateMovementForm("quantity", event.target.value)} required />
            </label>
            <label>
              Not
              <input value={movementForm.note} onChange={(event) => updateMovementForm("note", event.target.value)} placeholder="İrsaliye, sayım veya üretim açıklaması" />
            </label>
            <button className="primary-button" type="submit" disabled={isSubmitting}>
              <Save size={18} />
              Hareket Kaydet
            </button>
          </form>
        </article>

        <article className="panel inventory-action-card">
          <div className="chart-card-header">
            <div>
              <h2>Stok Kartı Ayarı</h2>
              <p>Minimum stok, rezerve miktar ve depo lokasyonu tanımlayın.</p>
            </div>
          </div>
          <form className="inventory-form" onSubmit={handleSettingsSubmit}>
            <label>
              Ürün
              <select value={selectedProductId} onChange={(event) => handleProductFilterChange(event.target.value)}>
                {stockItems.map((item) => (
                  <option key={item.productId} value={item.productId}>
                    {item.product.code} - {item.product.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Minimum Stok
              <input type="number" min="0" step="0.001" value={settingsForm.minimumQuantity} onChange={(event) => updateSettingsForm("minimumQuantity", event.target.value)} />
            </label>
            <label>
              Rezerve
              <input type="number" min="0" step="0.001" value={settingsForm.reservedQuantity} onChange={(event) => updateSettingsForm("reservedQuantity", event.target.value)} />
            </label>
            <label>
              Lokasyon
              <input value={settingsForm.location} onChange={(event) => updateSettingsForm("location", event.target.value)} placeholder="Hammadde Deposu / Raf A-03" />
            </label>
            <button className="secondary-button" type="submit" disabled={isSubmitting || !selectedProductId}>
              <SlidersHorizontal size={18} />
              Ayarları Kaydet
            </button>
          </form>
        </article>
      </section>

      <nav className="inventory-view-tabs" aria-label="Stok kayıt görünümü">
        {[
          { value: "STOCK", label: "Stok Kartları", count: stockItems.length },
          { value: "SCRAP", label: "Fire ve Hurda", count: scrapLots.length },
          { value: "MOVEMENTS", label: "Son Hareketler", count: movements.length }
        ].map((view) => (
          <button key={view.value} className={inventoryTableView === view.value ? "is-active" : ""} type="button" onClick={() => setInventoryTableView(view.value)}>
            <span>{view.label}</span>
            <strong>{view.count}</strong>
          </button>
        ))}
      </nav>

      {inventoryTableView === "SCRAP" ? <section className="panel production-log-panel scrap-tracking-panel">
        <div className="chart-card-header inventory-section-header">
          <div>
            <h2>Fire Karantina ve Hurda Takibi</h2>
            <p>Fire lotlarını iyi stoktan bağımsız olarak, kalite kararı ve telafi iş emriyle birlikte izleyin.</p>
          </div>
          <div className="scrap-table-actions">
            <span className="record-count">{filteredScrapLots.length} lot</span>
            <label className="inventory-search">
              <Search size={16} />
              <input value={scrapSearch} onChange={(event) => setScrapSearch(event.target.value)} placeholder="İş emri, ürün veya operasyon ara" />
            </label>
            <label className="inventory-filter">
              <Filter size={16} />
              <select value={scrapStatusFilter} onChange={(event) => setScrapStatusFilter(event.target.value)} aria-label="Fire durumu filtresi">
                <option value="ALL">Tüm durumlar</option>
                {Object.entries(scrapStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <button className="icon-button inventory-refresh" type="button" title="Verileri yenile" aria-label="Verileri yenile" onClick={() => loadInventory()}>
              <RefreshCw size={17} />
            </button>
          </div>
        </div>
        <div className="table-wrap dashboard-table-wrap">
          <table className="dashboard-data-table modern-record-table">
            <thead>
              <tr>
                <th>Tarih</th>
                <th>Kaynak</th>
                <th>Ürün</th>
                <th>Miktar</th>
                <th>Konum</th>
                <th>Durum</th>
                <th>Telafi / Rework</th>
                <th className="inventory-actions-column">İşlemler</th>
              </tr>
            </thead>
            <tbody>
              {filteredScrapLots.map((lot) => (
                <Fragment key={lot.id}>
                <tr key={lot.id}>
                  <td>{new Date(lot.createdAt).toLocaleString("tr-TR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</td>
                  <td>
                    <strong className="table-primary">{lot.workOrder.orderNo}</strong>
                    <span className="table-subtext">{lot.workOrderOperation?.operationName ?? "Operasyon yok"}</span>
                  </td>
                  <td>
                    <strong className="table-primary">{lot.product.code}</strong>
                    <span className="table-subtext">{lot.product.name}</span>
                  </td>
                  <td><strong>{Number(lot.quantity).toLocaleString("tr-TR")} {lot.product.unit}</strong><span className="scrap-quantity-label">Fire</span></td>
                  <td><strong className="table-primary">{lot.location}</strong><span className="table-subtext">{lot.status === "SCRAPPED" ? "Hurda alanı" : "Kalite kontrolü"}</span></td>
                  <td><span className={`status-pill ${lot.status === "SCRAPPED" ? "status-paused" : lot.status === "QUARANTINED" ? "status-planned" : "quality-passed"}`}>{scrapStatusLabels[lot.status] ?? lot.status}</span></td>
                  <td><strong className="table-primary">{lot.actionWorkOrder?.orderNo ?? "-"}</strong><span className="table-subtext">{lot.actionWorkOrder ? workOrderStatusLabels[lot.actionWorkOrder.status] ?? lot.actionWorkOrder.status : "İş emri yok"}</span></td>
                  <td className="inventory-row-actions">
                    <button className="icon-button" type="button" title="Lot detayını göster" aria-label="Lot detayını göster" onClick={() => setExpandedScrapLotId((current) => current === lot.id ? null : lot.id)}>
                      {expandedScrapLotId === lot.id ? <ChevronUp size={17} /> : <Eye size={17} />}
                    </button>
                  </td>
                </tr>
                {expandedScrapLotId === lot.id ? (
                  <tr className="scrap-detail-row">
                    <td colSpan="8">
                      <div className="scrap-detail-grid">
                        <span><small>Fire nedeni</small><strong>{scrapReasonLabels[lot.reason] ?? lot.reason ?? "Belirtilmedi"}</strong></span>
                        <span><small>Kalite kararı</small><strong>{scrapDispositionLabels[lot.disposition] ?? lot.disposition ?? scrapStatusLabels[lot.status] ?? "Bekliyor"}</strong></span>
                        <span><small>Açıklama</small><strong>{lot.note || "Açıklama yok"}</strong></span>
                      </div>
                    </td>
                  </tr>
                ) : null}
                </Fragment>
              ))}
              {!isLoading && filteredScrapLots.length === 0 ? <tr><td colSpan="8">Filtreye uygun fire lotu bulunmuyor.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section> : null}

      {inventoryTableView === "STOCK" ? <section className="panel production-log-panel">
        <div className="chart-card-header">
          <div>
            <h2>Stok Kartları</h2>
            <p>Eldeki, rezerve ve kullanılabilir miktarları ürün bazında izleyin.</p>
          </div>
          <span className="record-count">{stockItems.length} kart</span>
        </div>
        <div className="table-wrap dashboard-table-wrap">
          <table className="dashboard-data-table modern-record-table">
            <thead>
              <tr>
                <th>Ürün</th>
                <th>Stok</th>
                <th>Rezerve</th>
                <th>Kullanılabilir</th>
                <th>Minimum</th>
                <th>Lokasyon</th>
                <th>Durum</th>
              </tr>
            </thead>
            <tbody>
              {stockItems.map((item) => (
                <tr key={item.productId}>
                  <td>
                    <strong className="table-primary">{item.product.code}</strong>
                    <span className="table-subtext">{item.product.name}</span>
                  </td>
                  <td>
                    <span className="quantity-chip quantity-produced">{item.quantityOnHand.toLocaleString("tr-TR")} {item.product.unit}</span>
                  </td>
                  <td>{item.reservedQuantity.toLocaleString("tr-TR")}</td>
                  <td>{item.availableQuantity.toLocaleString("tr-TR")}</td>
                  <td>{item.minimumQuantity.toLocaleString("tr-TR")}</td>
                  <td>{item.location || "-"}</td>
                  <td>
                    <span className={`status-pill ${item.isBelowMinimum ? "status-paused" : "quality-passed"}`}>
                      {item.isBelowMinimum ? "Minimum altı" : "Yeterli"}
                    </span>
                  </td>
                </tr>
              ))}
              {!isLoading && stockItems.length === 0 ? (
                <tr>
                  <td colSpan="7">Stok kartı oluşturulacak ürün bulunamadı.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section> : null}

      {inventoryTableView === "MOVEMENTS" ? <section className="panel production-log-panel">
        <div className="chart-card-header">
          <div>
            <h2>Son Stok Hareketleri</h2>
            <p>Depo bakiyesinin nasıl oluştuğunu hareket geçmişinden takip edin.</p>
          </div>
          <span className="record-count">{movements.length} hareket</span>
        </div>
        <div className="table-wrap dashboard-table-wrap">
          <table className="dashboard-data-table modern-record-table">
            <thead>
              <tr>
                <th>Tarih</th>
                <th>Ürün</th>
                <th>Tip</th>
                <th>Miktar</th>
                <th>Son Bakiye</th>
                <th>Kaydeden</th>
                <th>Not</th>
              </tr>
            </thead>
            <tbody>
              {movements.map((movement) => {
                const isInbound = inboundTypes.has(movement.type);
                const Icon = isInbound ? ArrowUpCircle : ArrowDownCircle;

                return (
                  <tr key={movement.id}>
                    <td>{new Date(movement.createdAt).toLocaleString("tr-TR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</td>
                    <td>
                      <strong className="table-primary">{movement.product.code}</strong>
                      <span className="table-subtext">{movement.product.name}</span>
                    </td>
                    <td>
                      <span className={`stock-movement-badge ${isInbound ? "is-inbound" : "is-outbound"}`}>
                        <Icon size={14} />
                        {movementTypeLabels[movement.type] ?? movement.type}
                      </span>
                    </td>
                    <td>{Number(movement.quantity).toLocaleString("tr-TR")} {movement.product.unit}</td>
                    <td>{Number(movement.balanceAfter).toLocaleString("tr-TR")} {movement.product.unit}</td>
                    <td>{movement.createdBy?.name ?? "-"}</td>
                    <td>
                      <span className="note-chip">{movement.note || "-"}</span>
                    </td>
                  </tr>
                );
              })}
              {!isLoading && movements.length === 0 ? (
                <tr>
                  <td colSpan="7">Henüz stok hareketi yok.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section> : null}
    </div>
  );
}
