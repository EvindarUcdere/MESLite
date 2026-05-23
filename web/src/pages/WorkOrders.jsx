import { Play, Plus, Square, TimerReset } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { getMachines, getProducts, getUsers } from "../api/masterData.api.js";
import { completeWorkOrder, createWorkOrder, getWorkOrders, pauseWorkOrder, startWorkOrder } from "../api/workOrders.api.js";

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

export default function WorkOrders() {
  const [workOrders, setWorkOrders] = useState([]);
  const [products, setProducts] = useState([]);
  const [machines, setMachines] = useState([]);
  const [operators, setOperators] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    orderNo: "",
    productId: "",
    machineId: "",
    assignedOperatorId: "",
    plannedQuantity: 100
  });

  const activeMachines = useMemo(() => machines.filter((machine) => machine.isActive), [machines]);

  async function loadData() {
    setError("");
    const [workOrderData, productData, machineData, userData] = await Promise.all([getWorkOrders(), getProducts(), getMachines(), getUsers()]);
    setWorkOrders(workOrderData);
    setProducts(productData);
    setMachines(machineData);
    setOperators(userData.filter((user) => user.role === "OPERATOR" && user.isActive));
  }

  useEffect(() => {
    let isMounted = true;

    async function loadInitialData() {
      try {
        const [workOrderData, productData, machineData, userData] = await Promise.all([getWorkOrders(), getProducts(), getMachines(), getUsers()]);

        if (isMounted) {
          setWorkOrders(workOrderData);
          setProducts(productData);
          setMachines(machineData);
          setOperators(userData.filter((user) => user.role === "OPERATOR" && user.isActive));
        }
      } catch (_error) {
        if (isMounted) {
          setError("Work order data could not be loaded.");
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

  async function handleCreate(event) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const payload = {
        orderNo: form.orderNo,
        productId: form.productId,
        plannedQuantity: Number(form.plannedQuantity),
        ...(form.machineId ? { machineId: form.machineId } : {}),
        ...(form.assignedOperatorId ? { assignedOperatorId: form.assignedOperatorId } : {})
      };

      await createWorkOrder(payload);
      setForm((current) => ({
        ...current,
        orderNo: "",
        plannedQuantity: 100
      }));
      await loadData();
    } catch (_error) {
      setError("Work order could not be created.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function runAction(action) {
    setError("");

    try {
      await action();
      await loadData();
    } catch (_error) {
      setError("Action could not be completed.");
    }
  }

  return (
    <div className="page-stack">
      <header className="page-header">
        <div>
          <h1>Work Orders</h1>
          <p>Plan, assign, and control production orders.</p>
        </div>
      </header>

      {error ? <p className="form-error">{error}</p> : null}

      <section className="panel">
        <h2>Create Work Order</h2>
        <form className="work-order-form" onSubmit={handleCreate}>
          <label>
            Order No
            <input value={form.orderNo} onChange={(event) => updateForm("orderNo", event.target.value)} placeholder="WO-001" required />
          </label>
          <label>
            Product
            <select value={form.productId} onChange={(event) => updateForm("productId", event.target.value)} required>
              <option value="">Select product</option>
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.code} - {product.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Machine
            <select value={form.machineId} onChange={(event) => updateForm("machineId", event.target.value)}>
              <option value="">Assign later</option>
              {activeMachines.map((machine) => (
                <option key={machine.id} value={machine.id}>
                  {machine.code} - {machine.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Operator
            <select value={form.assignedOperatorId} onChange={(event) => updateForm("assignedOperatorId", event.target.value)}>
              <option value="">Assign later</option>
              {operators.map((operator) => (
                <option key={operator.id} value={operator.id}>
                  {operator.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Planned Qty
            <input value={form.plannedQuantity} onChange={(event) => updateForm("plannedQuantity", event.target.value)} type="number" min="1" required />
          </label>
          <button className="primary-button" type="submit" disabled={isSubmitting}>
            <Plus size={18} />
            {isSubmitting ? "Creating..." : "Create"}
          </button>
        </form>
      </section>

      <section className="panel">
        <h2>Order List</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Order</th>
                <th>Product</th>
                <th>Status</th>
                <th>Progress</th>
                <th>Machine</th>
                <th>Operator</th>
                <th>Updated</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {workOrders.map((workOrder) => {
                const progress = workOrder.plannedQuantity > 0 ? Math.round((workOrder.producedQuantity / workOrder.plannedQuantity) * 100) : 0;

                return (
                  <tr key={workOrder.id}>
                    <td>{workOrder.orderNo}</td>
                    <td>{workOrder.product.name}</td>
                    <td>
                      <span className={`status-pill status-${workOrder.status.toLowerCase().replace("_", "-")}`}>{workOrder.status}</span>
                    </td>
                    <td>
                      {workOrder.producedQuantity}/{workOrder.plannedQuantity} ({progress}%)
                    </td>
                    <td>{workOrder.machine?.code ?? "-"}</td>
                    <td>{workOrder.assignedOperator?.name ?? "-"}</td>
                    <td>{formatDate(workOrder.updatedAt)}</td>
                    <td>
                      <div className="action-row">
                        <button type="button" onClick={() => runAction(() => startWorkOrder(workOrder.id))} title="Start">
                          <Play size={16} />
                        </button>
                        <button type="button" onClick={() => runAction(() => pauseWorkOrder(workOrder.id))} title="Pause">
                          <TimerReset size={16} />
                        </button>
                        <button type="button" onClick={() => runAction(() => completeWorkOrder(workOrder.id))} title="Complete">
                          <Square size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!isLoading && workOrders.length === 0 ? (
                <tr>
                  <td colSpan="8">No work orders yet.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
