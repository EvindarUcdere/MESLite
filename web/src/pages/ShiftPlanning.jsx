import { CalendarDays, Settings, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { getMachines, getUsers } from "../api/masterData.api.js";
import {
  bulkUpsertShiftAssignments,
  createOperatorGroup,
  createShiftTemplate,
  deleteOperatorMachineSkill,
  deleteShiftAssignment,
  generateMonthlyShiftPlan,
  getOperatorGroups,
  getOperatorMachineSkills,
  getShiftAssignments,
  getShifts,
  getShiftTemplates,
  upsertOperatorMachineSkill
} from "../api/shiftPlanning.api.js";

const STATUS_LABELS = {
  EMPTY: "Boş",
  PLANNED: "Planlandı",
  CONFIRMED: "Onaylandı",
  ABSENT: "Gelmedi",
  LEAVE: "İzinli"
};

const SKILL_LABELS = {
  BASIC: "Temel",
  ADVANCED: "İleri",
  CERTIFIED: "Sertifikalı"
};

const TEMPLATE_PATTERN_LABELS = {
  WEEKDAYS: "Hafta içi",
  SIX_DAYS: "6 gün çalışma",
  EVERY_DAY: "Her gün",
  FOUR_ON_TWO_OFF: "4 gün çalış / 2 gün izin"
};

function getCurrentMonth() {
  return new Date().toISOString().slice(0, 7);
}

function getMonthDays(month) {
  const [year, monthIndex] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, monthIndex - 1, 1));
  const days = [];

  while (date.getUTCMonth() === monthIndex - 1) {
    days.push(date.toISOString().slice(0, 10));
    date.setUTCDate(date.getUTCDate() + 1);
  }

  return days;
}

function formatDayName(value) {
  return new Intl.DateTimeFormat("tr-TR", { weekday: "short" }).format(new Date(`${value}T00:00:00`));
}

function formatLongDate(value) {
  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "long",
    weekday: "long"
  }).format(new Date(`${value}T00:00:00`));
}

function getShiftCode(shift) {
  const name = shift?.name?.toLocaleLowerCase("tr-TR") ?? "";

  if (name.includes("sabah") || name.includes("morning")) return "S";
  if (name.includes("aksam") || name.includes("akşam") || name.includes("evening")) return "A";
  if (name.includes("gece") || name.includes("night")) return "G";

  return shift?.name?.slice(0, 1).toUpperCase() ?? "?";
}

function isWeekend(value) {
  const day = new Date(`${value}T00:00:00`).getDay();
  return day === 0 || day === 6;
}

function getApiErrorMessage(error, fallback) {
  return error?.response?.data?.message ?? fallback;
}

export default function ShiftPlanning() {
  const [month, setMonth] = useState(getCurrentMonth());
  const [selectedGroupId, setSelectedGroupId] = useState("all");
  const [operators, setOperators] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [machines, setMachines] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [skills, setSkills] = useState([]);
  const [groups, setGroups] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [bulkPlanForm, setBulkPlanForm] = useState({
    groupId: "",
    templateId: "",
    overwrite: false,
    note: ""
  });
  const [groupForm, setGroupForm] = useState({
    name: "",
    description: "",
    operatorIds: []
  });
  const [templateForm, setTemplateForm] = useState({
    name: "",
    description: "",
    pattern: "SIX_DAYS",
    shiftId: "",
    groupId: "",
    startOffset: 0
  });
  const [skillForm, setSkillForm] = useState({
    operatorId: "",
    machineId: "",
    level: "BASIC",
    note: ""
  });
  const [selectedCell, setSelectedCell] = useState(null);
  const [selectedCells, setSelectedCells] = useState([]);
  const [cellForm, setCellForm] = useState({
    shiftId: "",
    status: "PLANNED",
    note: ""
  });
  const [bulkResult, setBulkResult] = useState(null);
  const [cellResult, setCellResult] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  const monthDays = useMemo(() => getMonthDays(month), [month]);

  const assignmentMap = useMemo(() => {
    const map = new Map();
    assignments.forEach((assignment) => {
      map.set(`${assignment.operatorId}:${assignment.workDate.slice(0, 10)}`, assignment);
    });
    return map;
  }, [assignments]);

  const groupByOperator = useMemo(() => {
    const map = new Map();
    groups.forEach((group) => {
      group.members.forEach((member) => {
        if (!map.has(member.operatorId)) {
          map.set(member.operatorId, []);
        }
        map.get(member.operatorId).push(group);
      });
    });
    return map;
  }, [groups]);

  const operatorSkillMap = useMemo(() => {
    const map = new Map();
    skills.forEach((skill) => {
      if (!map.has(skill.operatorId)) {
        map.set(skill.operatorId, []);
      }
      map.get(skill.operatorId).push(skill);
    });
    return map;
  }, [skills]);

  const filteredOperators = useMemo(() => {
    if (selectedGroupId === "all") {
      return operators;
    }

    const group = groups.find((item) => item.id === selectedGroupId);
    const operatorIds = new Set(group?.members.map((member) => member.operatorId) ?? []);
    return operators.filter((operator) => operatorIds.has(operator.id));
  }, [groups, operators, selectedGroupId]);

  const selectedAssignment = selectedCell
    ? assignmentMap.get(`${selectedCell.operatorId}:${selectedCell.workDate}`)
    : null;
  const selectedOperator = selectedCell
    ? operators.find((operator) => operator.id === selectedCell.operatorId)
    : null;
  const selectedCellKeys = useMemo(
    () => new Set(selectedCells.map((cell) => `${cell.operatorId}:${cell.workDate}`)),
    [selectedCells]
  );

  async function loadData() {
    setError("");
    const [userData, shiftData, machineData, assignmentData, skillData, groupData, templateData] = await Promise.all([
      getUsers(),
      getShifts(),
      getMachines(),
      getShiftAssignments({ month }),
      getOperatorMachineSkills(),
      getOperatorGroups(),
      getShiftTemplates()
    ]);

    const activeOperators = userData.filter((user) => user.role === "OPERATOR" && user.isActive);
    const activeShifts = shiftData.filter((shift) => shift.isActive);
    const activeMachines = machineData.filter((machine) => machine.isActive);

    setOperators(activeOperators);
    setShifts(activeShifts);
    setMachines(activeMachines);
    setAssignments(assignmentData);
    setSkills(skillData);
    setGroups(groupData);
    setTemplates(templateData);

    setBulkPlanForm((current) => ({
      ...current,
      groupId: current.groupId || groupData.find((group) => group.isActive)?.id || "",
      templateId: current.templateId || templateData.find((template) => template.isActive)?.id || ""
    }));
    setTemplateForm((current) => ({
      ...current,
      shiftId: current.shiftId || activeShifts[0]?.id || "",
      groupId: current.groupId || groupData.find((group) => group.isActive)?.id || ""
    }));
    setSkillForm((current) => ({
      ...current,
      operatorId: current.operatorId || activeOperators[0]?.id || "",
      machineId: current.machineId || activeMachines[0]?.id || ""
    }));
  }

  useEffect(() => {
    let isMounted = true;

    async function loadInitialData() {
      try {
        await loadData();
      } catch (_error) {
        if (isMounted) {
          setError("Vardiya planı yüklenemedi.");
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
  }, [month]);

  function updateBulkPlanForm(field, value) {
    setBulkPlanForm((current) => ({ ...current, [field]: value }));
  }

  function updateGroupForm(field, value) {
    setGroupForm((current) => ({ ...current, [field]: value }));
  }

  function updateTemplateForm(field, value) {
    setTemplateForm((current) => ({ ...current, [field]: value }));
  }

  function updateSkillForm(field, value) {
    setSkillForm((current) => ({ ...current, [field]: value }));
  }

  function toggleGroupOperator(operatorId) {
    setGroupForm((current) => ({
      ...current,
      operatorIds: current.operatorIds.includes(operatorId)
        ? current.operatorIds.filter((id) => id !== operatorId)
        : [...current.operatorIds, operatorId]
    }));
  }

  function openCell(operator, workDate) {
    const assignment = assignmentMap.get(`${operator.id}:${workDate}`);
    setSelectedCell({ operatorId: operator.id, workDate });
    setCellResult(null);
    setSelectedCells((current) => {
      const cell = { operatorId: operator.id, workDate };
      const key = `${cell.operatorId}:${cell.workDate}`;

      if (current.some((item) => `${item.operatorId}:${item.workDate}` === key)) {
        return current.filter((item) => `${item.operatorId}:${item.workDate}` !== key);
      }

      return [...current, cell];
    });
    setCellForm({
      shiftId: assignment?.shiftId || shifts[0]?.id || "",
      status: assignment?.status || "PLANNED",
      note: assignment?.note || ""
    });
  }

  function selectOperatorMonth(operator) {
    const cells = monthDays.map((workDate) => ({ operatorId: operator.id, workDate }));
    setSelectedCell(cells[0] ?? null);
    setSelectedCells(cells);
    setCellResult(null);
    setCellForm((current) => ({
      ...current,
      shiftId: current.shiftId || shifts[0]?.id || "",
      status: current.status === "EMPTY" ? "PLANNED" : current.status
    }));
  }

  function selectDayForVisibleOperators(workDate) {
    const cells = filteredOperators.map((operator) => ({ operatorId: operator.id, workDate }));
    setSelectedCell(cells[0] ?? null);
    setSelectedCells(cells);
    setCellResult(null);
    setCellForm((current) => ({
      ...current,
      shiftId: current.shiftId || shifts[0]?.id || "",
      status: current.status === "EMPTY" ? "PLANNED" : current.status
    }));
  }

  function selectVisibleOperatorsMonth() {
    const cells = filteredOperators.flatMap((operator) => monthDays.map((workDate) => ({ operatorId: operator.id, workDate })));
    setSelectedCell(cells[0] ?? null);
    setSelectedCells(cells);
    setCellResult(null);
    setCellForm((current) => ({
      ...current,
      shiftId: current.shiftId || shifts[0]?.id || "",
      status: current.status === "EMPTY" ? "PLANNED" : current.status
    }));
  }

  function clearSelection() {
    setSelectedCell(null);
    setSelectedCells([]);
    setCellResult(null);
  }

  async function handleCellSubmit(event) {
    event.preventDefault();
    const cellsToSave = selectedCells.length ? selectedCells : selectedCell ? [selectedCell] : [];

    if (!cellsToSave.length) return;

    setIsSubmitting(true);
    setError("");
    setCellResult(null);

    try {
      const result = await bulkUpsertShiftAssignments({
        assignments: cellsToSave.map((cell) => ({
          operatorId: cell.operatorId,
          workDate: cell.workDate
        })),
        shiftId: cellForm.status === "EMPTY" ? undefined : cellForm.shiftId,
        status: cellForm.status,
        note: cellForm.note.trim() || undefined
      });

      if (cellForm.status === "EMPTY") {
        const removedKeys = new Set(cellsToSave.map((cell) => `${cell.operatorId}:${cell.workDate}`));
        setSelectedCells((current) => current.filter((cell) => !removedKeys.has(`${cell.operatorId}:${cell.workDate}`)));

        if (selectedCell && removedKeys.has(`${selectedCell.operatorId}:${selectedCell.workDate}`)) {
          setSelectedCell(null);
        }
      }

      await loadData();
      setCellResult(result);
    } catch (submitError) {
      setError(getApiErrorMessage(submitError, "Vardiya hücresi kaydedilemedi."));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleClearSelectedCells() {
    const cellsToClear = selectedCells.length ? selectedCells : selectedCell ? [selectedCell] : [];

    if (!cellsToClear.length) return;

    setIsSubmitting(true);
    setError("");
    setCellResult(null);

    try {
      await bulkUpsertShiftAssignments({
        assignments: cellsToClear.map((cell) => ({
          operatorId: cell.operatorId,
          workDate: cell.workDate
        })),
        status: "EMPTY"
      });

      await loadData();
      setSelectedCell(null);
      setSelectedCells([]);
      setCellForm((current) => ({ ...current, status: "PLANNED" }));
    } catch (submitError) {
      setError(getApiErrorMessage(submitError, "Seçili vardiyalar boşaltılamadı."));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleBulkPlanSubmit(event) {
    event.preventDefault();
    setIsSubmitting(true);
    setError("");
    setBulkResult(null);

    try {
      const result = await generateMonthlyShiftPlan({
        ...bulkPlanForm,
        month,
        note: bulkPlanForm.note.trim() || undefined
      });
      setBulkResult(result);
      await loadData();
    } catch (submitError) {
      setError(getApiErrorMessage(submitError, "Aylık vardiya planı oluşturulamadı."));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleGroupSubmit(event) {
    event.preventDefault();
    setIsSubmitting(true);
    setError("");

    try {
      await createOperatorGroup({
        name: groupForm.name.trim(),
        description: groupForm.description.trim() || undefined,
        operatorIds: groupForm.operatorIds
      });
      setGroupForm({ name: "", description: "", operatorIds: [] });
      await loadData();
    } catch (submitError) {
      setError(getApiErrorMessage(submitError, "Operatör ekibi kaydedilemedi."));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleTemplateSubmit(event) {
    event.preventDefault();
    setIsSubmitting(true);
    setError("");

    try {
      await createShiftTemplate({
        ...templateForm,
        name: templateForm.name.trim(),
        description: templateForm.description.trim() || undefined,
        groupId: templateForm.groupId || undefined,
        startOffset: Number(templateForm.startOffset) || 0
      });
      setTemplateForm((current) => ({ ...current, name: "", description: "" }));
      await loadData();
    } catch (submitError) {
      setError(getApiErrorMessage(submitError, "Vardiya şablonu kaydedilemedi."));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSkillSubmit(event) {
    event.preventDefault();
    setIsSubmitting(true);
    setError("");

    try {
      await upsertOperatorMachineSkill({
        ...skillForm,
        isActive: true,
        note: skillForm.note.trim() || undefined
      });
      await loadData();
    } catch (submitError) {
      setError(getApiErrorMessage(submitError, "Makine yetkinliği kaydedilemedi."));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function removeSkill(skillId) {
    setIsSubmitting(true);
    setError("");

    try {
      await deleteOperatorMachineSkill(skillId);
      await loadData();
    } catch (deleteError) {
      setError(getApiErrorMessage(deleteError, "Makine yetkinliği silinemedi."));
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) {
    return <p>Vardiya planı yükleniyor...</p>;
  }

  return (
    <div className="page-stack shift-planning-page roster-page">
      <div className="page-header shift-planning-header">
        <div>
          <h1>Vardiya Planı</h1>
          <p>Çalışanları satır satır takip edin; her günü sabah, akşam, gece veya izin olarak doğrudan düzenleyin.</p>
        </div>
        <div className="roster-toolbar">
          <label>
            Ay
            <input type="month" value={month} onChange={(event) => setMonth(event.target.value)} />
          </label>
          <label>
            Ekip
            <select value={selectedGroupId} onChange={(event) => setSelectedGroupId(event.target.value)}>
              <option value="all">Tüm ekipler</option>
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {error ? <p className="form-error">{error}</p> : null}

      <section className="summary-grid shift-planning-summary">
        <article>
          <span>Görünen Çalışan</span>
          <strong>{filteredOperators.length}</strong>
        </article>
        <article>
          <span>Planlı Gun</span>
          <strong>{assignments.length}</strong>
        </article>
        <article>
          <span>Vardiya Tipi</span>
          <strong>{shifts.length}</strong>
        </article>
        <article>
          <span>Ekip / Sablon</span>
          <strong>{groups.length}/{templates.length}</strong>
        </article>
      </section>

      <section className="panel roster-generator">
        <form className="bulk-plan-form" onSubmit={handleBulkPlanSubmit}>
          <label>
            Ekip
            <select value={bulkPlanForm.groupId} onChange={(event) => updateBulkPlanForm("groupId", event.target.value)} required>
              {!groups.length ? <option value="">Önce ekip oluşturun</option> : null}
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name} ({group.members.length})
                </option>
              ))}
            </select>
          </label>
          <label>
            Sablon
            <select value={bulkPlanForm.templateId} onChange={(event) => updateBulkPlanForm("templateId", event.target.value)} required>
              {!templates.length ? <option value="">Önce şablon oluşturun</option> : null}
              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name} - {TEMPLATE_PATTERN_LABELS[template.pattern]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Not
            <input value={bulkPlanForm.note} onChange={(event) => updateBulkPlanForm("note", event.target.value)} placeholder="Örn: Haziran ana plan" />
          </label>
          <label className="inline-check">
            <input type="checkbox" checked={bulkPlanForm.overwrite} onChange={(event) => updateBulkPlanForm("overwrite", event.target.checked)} />
            Bu ay için ekibin eski planını yenile
          </label>
          <button className="primary-button" type="submit" disabled={isSubmitting || !groups.length || !templates.length}>
            Şablondan Üret
          </button>
        </form>
        {bulkResult ? (
          <p className="success-note">
            {bulkResult.createdAssignments} yeni vardiya oluştu, {bulkResult.skippedAssignments} kayıt zaten vardı.
          </p>
        ) : null}
      </section>

      <div className="roster-legend">
        {shifts.map((shift) => (
          <span className={`roster-legend-chip shift-${getShiftCode(shift).toLowerCase()}`} key={shift.id}>
            {getShiftCode(shift)} = {shift.name}
          </span>
        ))}
        <span className="roster-legend-chip status-leave">İ = İzin</span>
        <span className="roster-legend-chip status-absent">Gd = Gelmedi</span>
      </div>

      <section className="roster-layout">
        <div className="panel roster-table-card">
          <div className="section-title-row">
            <div>
              <h2>Aylık Vardiya Roster</h2>
              <p className="muted-text">Hücreye tıklayarak bu ay üzerinde direkt değişiklik yapın.</p>
            </div>
            <button className="ghost-button compact-action" type="button" onClick={selectVisibleOperatorsMonth}>
              Görünenlerin Ayını Seç
            </button>
          </div>
          <div className="roster-table-wrap">
            <table className="roster-table">
              <thead>
                <tr>
                  <th className="roster-employee-cell">Çalışan</th>
                  {monthDays.map((day) => (
                    <th className={isWeekend(day) ? "is-weekend" : ""} key={day}>
                      <button className="day-select-button" type="button" onClick={() => selectDayForVisibleOperators(day)}>
                        {day.slice(8, 10)}
                      </button>
                      <small>{formatDayName(day)}</small>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredOperators.map((operator) => {
                  const operatorGroups = groupByOperator.get(operator.id) ?? [];
                  const operatorSkills = operatorSkillMap.get(operator.id) ?? [];

                  return (
                    <tr key={operator.id}>
                      <td className="roster-employee-cell">
                        <strong>{operator.name}</strong>
                        <span>{operatorGroups.map((group) => group.name).join(", ") || "Ekip yok"}</span>
                        <small>{operatorSkills.length} makine yetkinliği</small>
                        <button className="mini-link-button" type="button" onClick={() => selectOperatorMonth(operator)}>
                          Ayı seç
                        </button>
                      </td>
                      {monthDays.map((day) => {
                        const assignment = assignmentMap.get(`${operator.id}:${day}`);
                        const shiftCode = assignment ? getShiftCode(assignment.shift) : "";
                        const cellLabel = assignment?.status === "LEAVE" ? "I" : assignment?.status === "ABSENT" ? "Gd" : shiftCode;
                        const isSelected = selectedCellKeys.has(`${operator.id}:${day}`);
                        return (
                          <td className={isWeekend(day) ? "is-weekend" : ""} key={day}>
                            <button
                              className={`roster-cell-button ${assignment ? `shift-${shiftCode.toLowerCase()} status-${assignment.status.toLowerCase()}` : "is-empty"} ${isSelected ? "is-selected" : ""}`}
                              type="button"
                              onClick={() => openCell(operator, day)}
                            >
                              {cellLabel || "+"}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <aside className="panel roster-editor">
          <div className="section-title-row">
            <div>
              <h2>Hücre Düzenle</h2>
              <p className="muted-text">Seçili çalışan ve gün için vardiya/izin değişikliği.</p>
            </div>
            <Settings size={20} />
          </div>
          {selectedCell && selectedOperator ? (
            <form className="compact-form" onSubmit={handleCellSubmit}>
              <div className="selected-cell-summary">
                <strong>{selectedOperator.name}</strong>
                <span>
                  {selectedCells.length > 1
                    ? `${selectedCells.length} gün seçildi`
                    : formatLongDate(selectedCell.workDate)}
                </span>
                <small>
                  {selectedCells.length > 1
                    ? "Seçili günlerin tamamına aynı vardiya uygulanacak"
                    : selectedAssignment ? "Mevcut plan düzenleniyor" : "Yeni vardiya atanacak"}
                </small>
              </div>
              {selectedCells.length > 1 ? (
                <div className="selected-cell-list">
                  {selectedCells.map((cell) => (
                    <span key={`${cell.operatorId}:${cell.workDate}`}>{cell.workDate.slice(8, 10)}</span>
                  ))}
                </div>
              ) : null}
              <label>
                Durum
                <select value={cellForm.status} onChange={(event) => setCellForm((current) => ({ ...current, status: event.target.value }))}>
                  {Object.entries(STATUS_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Vardiya
                <select
                  value={cellForm.shiftId}
                  onChange={(event) => setCellForm((current) => ({ ...current, shiftId: event.target.value }))}
                  disabled={cellForm.status === "EMPTY"}
                  required={cellForm.status !== "EMPTY"}
                >
                  {shifts.map((shift) => (
                    <option key={shift.id} value={shift.id}>
                      {getShiftCode(shift)} - {shift.name} ({shift.startTime}-{shift.endTime})
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Not
                <input value={cellForm.note} onChange={(event) => setCellForm((current) => ({ ...current, note: event.target.value }))} placeholder="İzin, değişim veya açıklama" />
              </label>
              <button className="primary-button" type="submit" disabled={isSubmitting}>
                {selectedCells.length > 1 ? `${selectedCells.length} Güne Uygula` : "Değişikliği Kaydet"}
              </button>
              {selectedCells.length || selectedAssignment ? (
                <button className="ghost-button" type="button" disabled={isSubmitting} onClick={handleClearSelectedCells}>
                  {selectedCells.length > 1 ? "Seçili günleri boşalt" : "Bu günü boşalt"}
                </button>
              ) : null}
              {selectedCells.length ? (
                <button className="ghost-button" type="button" disabled={isSubmitting} onClick={clearSelection}>
                  Seçimi Temizle
                </button>
              ) : null}
              {cellResult ? (
                <p className="success-note">
                  {cellResult.upserted ? `${cellResult.upserted} hücre güncellendi.` : ""}
                  {cellResult.deleted ? ` ${cellResult.deleted} hücre boşaltıldı.` : ""}
                </p>
              ) : null}
            </form>
          ) : (
            <div className="empty-editor-state">
              <CalendarDays size={28} />
              <p>Düzenlemek için roster tablosunda bir hücre seçin.</p>
            </div>
          )}
        </aside>
      </section>

      <details className="panel roster-admin-panel">
        <summary>Plan Ayarları: ekip, şablon ve makine yetkinliği</summary>
        <div className="shift-planning-forms">
          <form className="compact-form" onSubmit={handleGroupSubmit}>
            <h2>Operatör Ekibi</h2>
            <div className="form-grid-two">
              <label>
                Ekip Adi
                <input value={groupForm.name} onChange={(event) => updateGroupForm("name", event.target.value)} placeholder="Örn: Kesim Ekibi" required />
              </label>
              <label>
                Aciklama
                <input value={groupForm.description} onChange={(event) => updateGroupForm("description", event.target.value)} placeholder="Opsiyonel" />
              </label>
            </div>
            <div className="operator-picker">
              {operators.map((operator) => (
                <label className="inline-check" key={operator.id}>
                  <input type="checkbox" checked={groupForm.operatorIds.includes(operator.id)} onChange={() => toggleGroupOperator(operator.id)} />
                  {operator.name}
                </label>
              ))}
            </div>
            <button className="primary-button" type="submit" disabled={isSubmitting || !groupForm.operatorIds.length}>
              Ekibi Kaydet
            </button>
          </form>

          <form className="compact-form" onSubmit={handleTemplateSubmit}>
            <h2>Vardiya Sablonu</h2>
            <div className="form-grid-two">
              <label>
                Sablon Adi
                <input value={templateForm.name} onChange={(event) => updateTemplateForm("name", event.target.value)} placeholder="Örn: 6 gün sabah" required />
              </label>
              <label>
                Ekip
                <select value={templateForm.groupId} onChange={(event) => updateTemplateForm("groupId", event.target.value)}>
                  <option value="">Genel şablon</option>
                  {groups.map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Vardiya
                <select value={templateForm.shiftId} onChange={(event) => updateTemplateForm("shiftId", event.target.value)} required>
                  {shifts.map((shift) => (
                    <option key={shift.id} value={shift.id}>
                      {shift.name} ({shift.startTime}-{shift.endTime})
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Calisma Duzeni
                <select value={templateForm.pattern} onChange={(event) => updateTemplateForm("pattern", event.target.value)}>
                  {Object.entries(TEMPLATE_PATTERN_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label>
              Aciklama
              <input value={templateForm.description} onChange={(event) => updateTemplateForm("description", event.target.value)} placeholder="Opsiyonel" />
            </label>
            <button className="primary-button" type="submit" disabled={isSubmitting}>
              Sablonu Kaydet
            </button>
          </form>

          <form className="compact-form" onSubmit={handleSkillSubmit}>
            <h2>Makine Yetkinligi</h2>
            <div className="form-grid-two">
              <label>
                Operatör
                <select value={skillForm.operatorId} onChange={(event) => updateSkillForm("operatorId", event.target.value)} required>
                  {operators.map((operator) => (
                    <option key={operator.id} value={operator.id}>
                      {operator.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Makine
                <select value={skillForm.machineId} onChange={(event) => updateSkillForm("machineId", event.target.value)} required>
                  {machines.map((machine) => (
                    <option key={machine.id} value={machine.id}>
                      {machine.code} - {machine.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Seviye
                <select value={skillForm.level} onChange={(event) => updateSkillForm("level", event.target.value)}>
                  {Object.entries(SKILL_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <button className="primary-button" type="submit" disabled={isSubmitting}>
              Yetkinlik Kaydet
            </button>
          </form>
        </div>

        <div className="operator-schedule-grid">
          {operators.map((operator) => {
            const operatorSkills = operatorSkillMap.get(operator.id) ?? [];
            return (
              <article className="operator-schedule-card" key={operator.id}>
                <div className="operator-schedule-header">
                  <div>
                    <strong>{operator.name}</strong>
                    <span>{operator.email}</span>
                  </div>
                  <em>{operatorSkills.length} makine</em>
                </div>
                {operatorSkills.length ? (
                  <div className="skill-chip-list">
                    {operatorSkills.map((skill) => (
                      <button key={skill.id} className="skill-chip" type="button" onClick={() => removeSkill(skill.id)} disabled={isSubmitting}>
                        {skill.machine.code} - {SKILL_LABELS[skill.level]}
                        <Trash2 size={14} />
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="muted-text">Makine yetkinliği yok.</p>
                )}
              </article>
            );
          })}
        </div>
      </details>
    </div>
  );
}



