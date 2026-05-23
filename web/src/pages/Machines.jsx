import { Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { createMachine, createProductionLine, getMachines, getProductionLines, updateMachineStatus } from "../api/masterData.api.js";

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
          setError("Machine data could not be loaded.");
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
      setError("Production line could not be created.");
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
      setError("Machine could not be created.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleStatusChange(machineId, status) {
    setError("");

    try {
      await updateMachineStatus(machineId, { status, reason: "Updated from web dashboard" });
      await loadData();
    } catch (_error) {
      setError("Machine status could not be updated.");
    }
  }

  return (
    <div className="page-stack">
      <header className="page-header">
        <div>
          <h1>Machines</h1>
          <p>Manage production lines, machines, and current machine status.</p>
        </div>
      </header>

      {error ? <p className="form-error">{error}</p> : null}

      <section className="operations-grid">
        <article className="panel">
          <h2>Create Production Line</h2>
          <form className="stack-form" onSubmit={handleCreateLine}>
            <label>
              Name
              <input value={lineForm.name} onChange={(event) => updateLineForm("name", event.target.value)} placeholder="Line B" required />
            </label>
            <label>
              Description
              <input value={lineForm.description} onChange={(event) => updateLineForm("description", event.target.value)} placeholder="Optional description" />
            </label>
            <button className="primary-button" type="submit" disabled={isSubmitting}>
              <Plus size={18} />
              Create Line
            </button>
          </form>
        </article>

        <article className="panel">
          <h2>Create Machine</h2>
          <form className="stack-form" onSubmit={handleCreateMachine}>
            <label>
              Code
              <input value={machineForm.code} onChange={(event) => updateMachineForm("code", event.target.value)} placeholder="MCH-002" required />
            </label>
            <label>
              Name
              <input value={machineForm.name} onChange={(event) => updateMachineForm("name", event.target.value)} placeholder="Press Machine" required />
            </label>
            <label>
              Production Line
              <select value={machineForm.productionLineId} onChange={(event) => updateMachineForm("productionLineId", event.target.value)} required>
                <option value="">Select line</option>
                {productionLines.map((line) => (
                  <option key={line.id} value={line.id}>
                    {line.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Status
              <select value={machineForm.status} onChange={(event) => updateMachineForm("status", event.target.value)} required>
                <option value="IDLE">IDLE</option>
                <option value="RUNNING">RUNNING</option>
                <option value="STOPPED">STOPPED</option>
                <option value="MAINTENANCE">MAINTENANCE</option>
              </select>
            </label>
            <button className="primary-button" type="submit" disabled={isSubmitting || productionLines.length === 0}>
              <Plus size={18} />
              Create Machine
            </button>
          </form>
        </article>
      </section>

      <section className="panel">
        <h2>Machine List</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>Line</th>
                <th>Status</th>
                <th>Set Status</th>
              </tr>
            </thead>
            <tbody>
              {machines.map((machine) => (
                <tr key={machine.id}>
                  <td>{machine.code}</td>
                  <td>{machine.name}</td>
                  <td>{machine.productionLine?.name ?? "-"}</td>
                  <td>
                    <span className={`status-pill status-${machine.status.toLowerCase()}`}>{machine.status}</span>
                  </td>
                  <td>
                    <select className="compact-select" value={machine.status} onChange={(event) => handleStatusChange(machine.id, event.target.value)}>
                      <option value="IDLE">IDLE</option>
                      <option value="RUNNING">RUNNING</option>
                      <option value="STOPPED">STOPPED</option>
                      <option value="MAINTENANCE">MAINTENANCE</option>
                    </select>
                  </td>
                </tr>
              ))}
              {!isLoading && machines.length === 0 ? (
                <tr>
                  <td colSpan="5">No machines yet.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
