import { PrismaClient } from "@prisma/client";
import { getOverviewReport } from "../src/modules/reports/report.service.js";

const prisma = new PrismaClient();

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  const downtimes = await prisma.operationDowntime.findMany({
    where: {
      workOrder: {
        orderNo: {
          startsWith: "E2E-DEMO-"
        }
      }
    },
    include: {
      workOrder: true,
      workOrderOperation: true,
      machine: true,
      shift: true
    }
  });

  assert(downtimes.length >= 4, `Expected at least 4 demo downtimes, found ${downtimes.length}`);
  assert(downtimes.some((downtime) => downtime.reason === "MACHINE_FAILURE"), "Machine failure downtime reason is missing");
  assert(downtimes.some((downtime) => downtime.reason === "QUALITY_WAITING"), "Quality waiting downtime reason is missing");
  assert(downtimes.some((downtime) => downtime.reason === "MATERIAL_WAITING"), "Material waiting downtime reason is missing");
  assert(downtimes.every((downtime) => downtime.workOrderOperationId && downtime.workOrderId), "Downtime must be linked to work order and operation");
  assert(downtimes.some((downtime) => downtime.shift?.name === "E2E Gece Vardiyasi"), "Night shift downtime is missing");

  const report = await getOverviewReport();

  assert(report.operationDowntimeReasonCounts.MACHINE_FAILURE >= 1, "Report must count machine failure downtimes");
  assert(report.operationDowntimeReasonCounts.QUALITY_WAITING >= 1, "Report must count quality waiting downtimes");
  assert(report.operationDowntimeByShift.some((item) => item.shiftName === "E2E Gece Vardiyasi"), "Report must group downtimes by shift");
  assert(report.operationDowntimeByMachine.some((item) => item.machineCode === "E2E-MNT-01"), "Report must group downtimes by machine");
  assert(report.operationDowntimeByOperation.some((item) => item.operationName === "Montaj"), "Report must group downtimes by operation");

  console.log({
    acceptance: "ok",
    checkedRules: [
      "operation downtime records",
      "downtime reason categories",
      "downtime shift relation",
      "downtime report reason counts",
      "downtime report grouping"
    ]
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
