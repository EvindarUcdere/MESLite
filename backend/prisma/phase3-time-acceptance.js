import { getOverviewReport } from "../src/modules/reports/report.service.js";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  const report = await getOverviewReport();

  const runMontaj = report.operationTimePerformance.find((item) => item.orderNo === "E2E-DEMO-RUN" && item.operationName === "Montaj");
  const delayedMontaj = report.operationTimePerformance.find((item) => item.orderNo === "E2E-DEMO-QUALITY" && item.operationName === "Montaj");
  const qualityKontrol = report.operationTimePerformance.find((item) => item.orderNo === "E2E-DEMO-QUALITY" && item.operationName === "Kalite Kontrol");

  assert(runMontaj, "RUN Montaj time performance is missing");
  assert(runMontaj.plannedMinutes === 55, `RUN Montaj planned minutes must be 55, found ${runMontaj.plannedMinutes}`);
  assert(runMontaj.actualMinutes >= 60, `RUN Montaj actual minutes must be at least 60, found ${runMontaj.actualMinutes}`);
  assert(runMontaj.downtimeMinutes >= 25, `RUN Montaj downtime minutes must be at least 25, found ${runMontaj.downtimeMinutes}`);
  const expectedRunDelay = Math.max(runMontaj.actualMinutes - runMontaj.downtimeMinutes - runMontaj.plannedMinutes, 0);
  assert(
    Math.abs(runMontaj.delayMinutes - expectedRunDelay) < 0.01,
    `RUN Montaj net delay must exclude downtime, expected ${expectedRunDelay}, found ${runMontaj.delayMinutes}`
  );

  assert(delayedMontaj, "QUALITY Montaj time performance is missing");
  assert(delayedMontaj.plannedMinutes === 55, `QUALITY Montaj planned minutes must be 55, found ${delayedMontaj.plannedMinutes}`);
  assert(delayedMontaj.actualMinutes === 70, `QUALITY Montaj actual minutes must be 70, found ${delayedMontaj.actualMinutes}`);
  assert(delayedMontaj.delayMinutes === 15, `QUALITY Montaj delay minutes must be 15, found ${delayedMontaj.delayMinutes}`);

  assert(qualityKontrol, "QUALITY Kalite Kontrol time performance is missing");
  assert(qualityKontrol.plannedMinutes === 20, `Quality control planned minutes must be 20, found ${qualityKontrol.plannedMinutes}`);
  assert(qualityKontrol.downtimeMinutes === 15, `Quality control downtime minutes must be 15, found ${qualityKontrol.downtimeMinutes}`);

  assert(delayedMontaj.delayMinutes > 0, "QUALITY Montaj must be identified as delayed");
  assert(report.operationTimeByMachine.some((item) => item.machineCode === "E2E-MNT-01" && item.delayMinutes > 0), "Machine time report must include E2E-MNT-01 delay");
  assert(report.operationTimeByOperator.some((item) => item.operatorName === "Ali Kaya" && item.delayMinutes > 0), "Operator time report must include Ali Kaya delay");

  console.log({
    acceptance: "ok",
    checkedRules: [
      "operation planned minutes",
      "operation actual minutes",
      "operation downtime minutes",
      "operation delay minutes",
      "machine time grouping",
      "operator time grouping"
    ]
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
