import { getOverviewReport } from "../src/modules/reports/report.service.js";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function closeEnough(first, second, tolerance = 0.02) {
  return Math.abs(first - second) <= tolerance;
}

function expectedRate(numerator, denominator) {
  return denominator > 0 ? Number(((numerator / denominator) * 100).toFixed(2)) : 0;
}

async function main() {
  const report = await getOverviewReport();
  const machineTotals = new Map();

  for (const operation of report.operationTimePerformance) {
    const key = operation.machineId ?? "UNASSIGNED";
    const current = machineTotals.get(key) ?? {
      operationCount: 0,
      plannedMinutes: 0,
      actualMinutes: 0,
      downtimeMinutes: 0,
      netMinutes: 0,
      delayMinutes: 0,
      idealRunMinutes: 0,
      producedQuantity: 0,
      scrapQuantity: 0,
      totalProcessedQuantity: 0
    };

    current.operationCount += 1;
    current.plannedMinutes += operation.plannedMinutes;
    current.actualMinutes += operation.actualMinutes;
    current.downtimeMinutes += operation.downtimeMinutes;
    current.netMinutes += operation.netMinutes;
    current.delayMinutes += operation.delayMinutes;
    current.idealRunMinutes += operation.idealRunMinutes;
    current.producedQuantity += operation.producedQuantity;
    current.scrapQuantity += operation.scrapQuantity;
    current.totalProcessedQuantity += operation.totalProcessedQuantity;
    machineTotals.set(key, current);
  }

  for (const machine of report.operationTimeByMachine) {
    const expected = machineTotals.get(machine.machineId);
    assert(expected, `Machine detail is missing for ${machine.machineCode}`);
    assert(closeEnough(machine.delayMinutes, expected.delayMinutes), `${machine.machineCode} delay total is inconsistent`);
    assert(closeEnough(machine.downtimeMinutes, expected.downtimeMinutes), `${machine.machineCode} downtime total is inconsistent`);
    assert(closeEnough(machine.netMinutes, expected.netMinutes), `${machine.machineCode} net time total is inconsistent`);
  }

  for (const machine of report.oeeByMachine) {
    const expected = machineTotals.get(machine.machineId);
    assert(expected, `OEE detail is missing for ${machine.machineCode}`);
    const availability = expectedRate(Math.min(expected.netMinutes, expected.plannedMinutes), expected.plannedMinutes);
    const performance = expectedRate(Math.min(expected.idealRunMinutes, expected.netMinutes), expected.netMinutes);
    const quality = expectedRate(expected.producedQuantity, expected.totalProcessedQuantity);
    const oee = Number(((availability / 100) * (performance / 100) * (quality / 100) * 100).toFixed(2));

    assert(closeEnough(machine.availability, availability), `${machine.machineCode} availability is inconsistent`);
    assert(closeEnough(machine.performance, performance), `${machine.machineCode} performance is inconsistent`);
    assert(closeEnough(machine.quality, quality), `${machine.machineCode} quality is inconsistent`);
    assert(closeEnough(machine.oee, oee), `${machine.machineCode} OEE is inconsistent`);
  }

  assert(
    report.delayedOperations.every((operation, index, items) => index === 0 || items[index - 1].delayMinutes >= operation.delayMinutes),
    "Bottleneck operations must be sorted by delay descending"
  );
  const expectedBottleneckIds = [...report.operationTimePerformance]
    .filter((operation) => operation.delayMinutes > 0)
    .sort((first, second) => second.delayMinutes - first.delayMinutes)
    .slice(0, 10)
    .map((operation) => operation.operationId);
  assert(
    report.delayedOperations.map((operation) => operation.operationId).join(",") === expectedBottleneckIds.join(","),
    "Bottleneck list must contain the ten most delayed operations"
  );
  assert(
    report.operationTimeByMachine.every((machine, index, items) => index === 0 || items[index - 1].delayMinutes >= machine.delayMinutes),
    "Bottleneck machines must be sorted by delay descending"
  );

  const processTotal = report.summary.processProducedQuantity + report.summary.scrapQuantity;
  assert(
    report.summary.scrapRate === expectedRate(report.summary.scrapQuantity, processTotal),
    "Scrap rate must use total processed quantity as denominator"
  );

  console.log({
    acceptance: "ok",
    checkedRules: [
      "machine time totals",
      "machine downtime totals",
      "machine OEE components",
      "operation bottleneck ranking",
      "machine bottleneck ranking",
      "scrap rate denominator"
    ]
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
