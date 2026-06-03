import { findQualityChecks } from "../src/modules/quality-checks/qualityCheck.service.js";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  const checks = await findQualityChecks();
  const qualityCheck = checks.find((check) => check.workOrder.orderNo === "E2E-DEMO-QUALITY");

  assert(qualityCheck, "E2E-DEMO-QUALITY quality check is missing");
  assert(qualityCheck.workOrderOperation?.operationName === "Kalite Kontrol", "Quality check must stay linked to the checked operation");
  assert(qualityCheck.traceability, "Quality check traceability payload is missing");
  assert(qualityCheck.traceability.routeOperations.length === 3, "Traceability must include the full operation route");

  const assemblyOperation = qualityCheck.traceability.routeOperations.find((operation) => operation.operationName === "Montaj");
  const qualityOperation = qualityCheck.traceability.routeOperations.find((operation) => operation.operationName === "Kalite Kontrol");

  assert(assemblyOperation, "Traceability must include Montaj operation");
  assert(assemblyOperation.scrapQuantity === 1, "Montaj scrap quantity must be visible in traceability");
  assert(assemblyOperation.signals.some((signal) => signal.type === "SCRAP"), "Montaj scrap signal must be detected");
  assert(assemblyOperation.impactLevel === "HIGH", `Montaj must be high impact for partial quality check, found ${assemblyOperation.impactLevel}`);
  assert(qualityOperation, "Traceability must include Kalite Kontrol operation");
  assert(qualityOperation.relationToQuality === "CHECKED_OPERATION", "Checked operation relation must be marked");
  assert(qualityCheck.traceability.suspectOperations.some((operation) => operation.operationName === "Montaj"), "Suspect operations must include Montaj");
  assert(qualityCheck.traceability.totals.totalDowntimeMinutes >= 15, "Traceability must include quality downtime minutes");

  console.log({
    acceptance: "ok",
    checkedRules: [
      "quality check operation link",
      "full operation route traceability",
      "scrap signal detection",
      "quality checkpoint relation",
      "downtime metrics in quality traceability"
    ]
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
