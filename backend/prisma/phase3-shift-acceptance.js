import { getOverviewReport } from "../src/modules/reports/report.service.js";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function byShiftName(items, name) {
  return items.find((item) => item.shiftName === name);
}

async function main() {
  const report = await getOverviewReport();
  const morning = byShiftName(report.shiftPerformance, "E2E Sabah Vardiyasi");
  const evening = byShiftName(report.shiftPerformance, "E2E Aksam Vardiyasi");
  const night = byShiftName(report.shiftPerformance, "E2E Gece Vardiyasi");

  assert(morning, "Morning shift performance is missing");
  assert(evening, "Evening shift performance is missing");
  assert(night, "Night shift performance is missing");

  assert(morning.producedQuantity === 250, `Morning shift produced quantity must be 250, found ${morning.producedQuantity}`);
  assert(morning.scrapQuantity === 1, `Morning shift scrap quantity must be 1, found ${morning.scrapQuantity}`);
  assert(evening.producedQuantity === 160, `Evening shift produced quantity must be 160, found ${evening.producedQuantity}`);
  assert(evening.scrapQuantity === 3, `Evening shift scrap quantity must be 3, found ${evening.scrapQuantity}`);
  assert(night.producedQuantity === 73, `Night shift produced quantity must be 73, found ${night.producedQuantity}`);
  assert(night.scrapQuantity === 5, `Night shift scrap quantity must be 5, found ${night.scrapQuantity}`);

  assert(
    report.operatorShiftPerformance.some(
      (item) => item.shiftName === "E2E Aksam Vardiyasi" && item.operatorName === "Ali Kaya" && item.producedQuantity === 110
    ),
    "Evening shift must include Ali Kaya operator performance"
  );
  assert(
    report.machineShiftPerformance.some(
      (item) => item.shiftName === "E2E Sabah Vardiyasi" && item.machineCode === "E2E-KSM-01" && item.producedQuantity === 250
    ),
    "Morning shift must include cutting machine performance"
  );

  console.log({
    acceptance: "ok",
    checkedRules: [
      "shift production totals",
      "shift scrap totals",
      "operator performance by shift",
      "machine performance by shift"
    ]
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
