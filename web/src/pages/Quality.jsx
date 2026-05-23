import { ClipboardCheck, Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createQualityCheck, getQualityChecks } from "../api/qualityChecks.api.js";
import { getWorkOrders } from "../api/workOrders.api.js";

function formatDate(value) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
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
          setError("Quality data could not be loaded.");
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
      await createQualityCheck({
        workOrderId: form.workOrderId,
        status: form.status,
        defectQuantity: Number(form.defectQuantity),
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
    } catch (_error) {
      setError("Quality check could not be saved.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="page-stack">
      <header className="page-header">
        <div>
          <h1>Quality</h1>
          <p>Record inspection outcomes for produced work orders.</p>
        </div>
      </header>

      {error ? <p className="form-error">{error}</p> : null}

      <section className="panel">
        <h2>Quality Entry</h2>
        <form className="work-order-form" onSubmit={handleSubmit}>
          <label>
            Work Order
            <select value={form.workOrderId} onChange={(event) => updateForm("workOrderId", event.target.value)} required>
              <option value="">Select produced order</option>
              {checkCandidates.map((workOrder) => (
                <option key={workOrder.id} value={workOrder.id}>
                  {workOrder.orderNo} - {workOrder.product.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Result
            <select value={form.status} onChange={(event) => updateForm("status", event.target.value)} required>
              <option value="PASSED">PASSED</option>
              <option value="PARTIAL">PARTIAL</option>
              <option value="FAILED">FAILED</option>
            </select>
          </label>
          <label>
            Defect Qty
            <input value={form.defectQuantity} onChange={(event) => updateForm("defectQuantity", event.target.value)} type="number" min="0" required />
          </label>
          <label>
            Defect Reason
            <input value={form.defectReason} onChange={(event) => updateForm("defectReason", event.target.value)} placeholder="Scratch, dimension, material..." />
          </label>
          <label>
            Note
            <input value={form.note} onChange={(event) => updateForm("note", event.target.value)} placeholder="Optional note" />
          </label>
          <button className="primary-button" type="submit" disabled={isSubmitting || checkCandidates.length === 0}>
            <Plus size={18} />
            Save Check
          </button>
        </form>
        {!isLoading && checkCandidates.length === 0 ? <p className="empty-state">Log production before recording a quality check.</p> : null}
      </section>

      <section className="panel">
        <h2>Recent Checks</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Work Order</th>
                <th>Product</th>
                <th>Result</th>
                <th>Defects</th>
                <th>Reason</th>
                <th>Checked By</th>
                <th>Checked At</th>
              </tr>
            </thead>
            <tbody>
              {qualityChecks.map((check) => (
                <tr key={check.id}>
                  <td>{check.workOrder.orderNo}</td>
                  <td>{check.workOrder.product.name}</td>
                  <td>
                    <span className={`status-pill quality-${check.status.toLowerCase()}`}>{check.status}</span>
                  </td>
                  <td>{check.defectQuantity}</td>
                  <td>{check.defectReason ?? "-"}</td>
                  <td>{check.checkedBy.name}</td>
                  <td>{formatDate(check.checkedAt)}</td>
                </tr>
              ))}
              {!isLoading && qualityChecks.length === 0 ? (
                <tr>
                  <td colSpan="7">No quality checks yet.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
