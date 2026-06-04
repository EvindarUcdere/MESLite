import { getOverviewReport } from "../src/modules/reports/report.service.js";
import { prisma } from "../src/config/db.js";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  const report = await getOverviewReport();

  assert(report.summary.qualityDecisionCount >= 3, "Report must include demo quality decisions");
  assert(report.qualityDecisionCounts.REWORK_OPERATION >= 1, "Report must count rework decisions");
  assert(report.qualityDecisionCounts.SCRAP >= 1, "Report must count scrap decisions");
  assert(report.qualityDecisionCounts.CONDITIONAL_ACCEPT >= 1, "Report must count conditional acceptance decisions");
  assert(report.qualityDecisionByOperation.some((item) => item.operationName === "Montaj" && item.reworkCount >= 1), "Operation report must include Montaj rework");
  assert(report.qualityDecisionByMachine.some((item) => item.machineCode === "E2E-MNT-01" && item.reworkCount >= 1), "Machine report must include assembly rework");
  assert(report.recentQualityDecisions.length >= 3, "Recent quality decisions must be listed");

  console.log({
    acceptance: "ok",
    checkedRules: [
      "quality decision counts are reported",
      "operation based quality decision report",
      "machine based quality decision report",
      "recent quality decisions list"
    ]
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
