import { AlertTriangle, ArrowDownCircle, ArrowUpCircle, Boxes, Save, SlidersHorizontal, Warehouse } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createStockMovement, getScrapLots, getStockItems, getStockMovements, updateStockItem } from "../api/inventory.api.js";

const scrapStatusLabels = {
  QUARANTINED: "Karantinada",
  REWORK_PLANNED: "Yeniden işlem bekliyor",
  REPRODUCTION_PLANNED: "Telafi üretimi açıldı",
  SCRAPPED: "Hurdaya ayrıldı",
  CONDITIONALLY_ACCEPTED: "Şartlı kabul"
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
    <div className="page-stack">
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

      <section className="panel production-log-panel">
        <div className="chart-card-header">
          <div>
            <h2>Fire Karantina ve Hurda Takibi</h2>
            <p>Fire lotlarını iyi stoktan bağımsız olarak, kalite kararı ve telafi iş emriyle birlikte izleyin.</p>
          </div>
          <span className="record-count">{scrapLots.length} lot</span>
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
              </tr>
            </thead>
            <tbody>
              {scrapLots.map((lot) => (
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
                  <td>{lot.quantity} {lot.product.unit}</td>
                  <td>{lot.location}</td>
                  <td><span className={`status-pill ${lot.status === "SCRAPPED" ? "status-paused" : lot.status === "QUARANTINED" ? "status-planned" : "quality-passed"}`}>{scrapStatusLabels[lot.status] ?? lot.status}</span></td>
                  <td>{lot.actionWorkOrder?.orderNo ?? "-"}</td>
                </tr>
              ))}
              {!isLoading && scrapLots.length === 0 ? <tr><td colSpan="7">Fire lotu bulunmuyor.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel production-log-panel">
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
      </section>

      <section className="panel production-log-panel">
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
      </section>
    </div>
  );
}
