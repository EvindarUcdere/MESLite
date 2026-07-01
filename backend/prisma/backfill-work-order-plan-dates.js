import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const shouldApply = process.argv.includes("--apply");

function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60_000);
}

async function main() {
  const workOrders = await prisma.workOrder.findMany({
    where: {
      OR: [{ plannedStartDate: null }, { plannedEndDate: null }]
    },
    include: {
      route: {
        include: {
          operations: {
            orderBy: { sequenceNo: "asc" }
          }
        }
      },
      operations: {
        orderBy: { sequenceNo: "asc" }
      }
    },
    orderBy: { createdAt: "asc" }
  });

  const proposals = workOrders.map((workOrder) => {
    const routeMinutes = (workOrder.route?.operations ?? []).reduce(
      (sum, operation) => sum + Math.max(Number(operation.estimatedMinutes ?? 0), 0),
      0
    );
    const durationMinutes = routeMinutes || 8 * 60;
    const firstOperationStart = workOrder.operations.find((operation) => operation.startedAt)?.startedAt;
    const derivedStart = workOrder.actualStartDate ?? firstOperationStart ?? workOrder.createdAt;
    const plannedStartDate = workOrder.plannedStartDate ??
      (workOrder.plannedEndDate ? addMinutes(workOrder.plannedEndDate, -durationMinutes) : derivedStart);
    const plannedEndDate = workOrder.plannedEndDate ?? addMinutes(plannedStartDate, durationMinutes);

    return {
      id: workOrder.id,
      orderNo: workOrder.orderNo,
      status: workOrder.status,
      plannedStartDate,
      plannedEndDate,
      durationMinutes,
      confidence: routeMinutes > 0 ? "HIGH" : "LOW",
      missingStartDate: !workOrder.plannedStartDate,
      missingEndDate: !workOrder.plannedEndDate
    };
  });

  if (shouldApply) {
    await prisma.$transaction(
      proposals.map((proposal) =>
        prisma.workOrder.update({
          where: { id: proposal.id },
          data: {
            ...(proposal.missingStartDate ? { plannedStartDate: proposal.plannedStartDate } : {}),
            ...(proposal.missingEndDate ? { plannedEndDate: proposal.plannedEndDate } : {})
          }
        })
      )
    );
  }

  console.table(
    proposals.map(({ orderNo, status, plannedStartDate, plannedEndDate, durationMinutes, confidence }) => ({
      orderNo,
      status,
      plannedStartDate: plannedStartDate.toISOString(),
      plannedEndDate: plannedEndDate.toISOString(),
      durationMinutes,
      confidence
    }))
  );
  console.log(JSON.stringify({ mode: shouldApply ? "APPLY" : "PREVIEW", total: proposals.length }));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
