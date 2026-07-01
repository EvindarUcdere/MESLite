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
  const report = await getOverviewReport({ includeTestData: true });
  const morning = byShiftName(report.shiftPerformance, "E2E Sabah Vardiyasi");
  const evening = byShiftName(report.shiftPerformance, "E2E Aksam Vardiyasi");
  const night = byShiftName(report.shiftPerformance, "E2E Gece Vardiyasi");

  assert(morning, "Morning shift performance is missing");
  assert(evening, "Evening shift performance is missing");
  assert(night, "Night shift performance is missing");

  assert(morning.producedQuantity >= 350, `Morning shift produced quantity must include at least 350 demo units, found ${morning.producedQuantity}`);
  assert(morning.scrapQuantity >= 1, `Morning shift scrap quantity must include at least 1 demo scrap, found ${morning.scrapQuantity}`);
  assert(evening.producedQuantity >= 357, `Evening shift produced quantity must include at least 357 demo units, found ${evening.producedQuantity}`);
  assert(evening.scrapQuantity >= 5, `Evening shift scrap quantity must include at least 5 demo scrap, found ${evening.scrapQuantity}`);
  assert(night.producedQuantity >= 73, `Night shift produced quantity must include at least 73 demo units, found ${night.producedQuantity}`);
  assert(night.scrapQuantity >= 5, `Night shift scrap quantity must include at least 5 demo scrap, found ${night.scrapQuantity}`);

  assert(
    report.operatorShiftPerformance.some(
      (item) => item.shiftName === "E2E Aksam Vardiyasi" && item.operatorName === "Ali Kaya" && item.producedQuantity > 0
    ),
    "Evening shift must include Ali Kaya operator performance"
  );
  assert(
    report.machineShiftPerformance.some(
      (item) => item.shiftName === "E2E Sabah Vardiyasi" && item.machineCode === "E2E-KSM-01" && item.producedQuantity >= 350
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
