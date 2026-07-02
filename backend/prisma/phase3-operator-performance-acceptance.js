import { getOverviewReport } from "../src/modules/reports/report.service.js";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function closeEnough(first, second, tolerance = 0.02) {
  return Math.abs(first - second) <= tolerance;
}

function rate(numerator, denominator) {
  return denominator > 0 ? Number(((numerator / denominator) * 100).toFixed(2)) : 0;
}

async function main() {
  const report = await getOverviewReport({ includeTestData: true });

  assert(report.operatorPerformance.length > 0, "Operator performance signals are missing");
  assert(
    report.operatorPerformance.every((item) => item.performanceScore >= 0 && item.performanceScore <= 100),
    "Operator performance score must stay between 0 and 100"
  );
  assert(
    report.operatorPerformance.every((item) => item.qualityRate >= 0 && item.qualityRate <= 100),
    "Operator quality rate must stay between 0 and 100"
  );
  assert(
    report.operatorPerformance.every((item) => item.timeEfficiency === null || (item.timeEfficiency >= 0 && item.timeEfficiency <= 100)),
    "Operator time efficiency must be null or stay between 0 and 100"
  );
  assert(
    report.operatorPerformance.every((item, index, items) => index === 0 || items[index - 1].performanceScore <= item.performanceScore),
    "Operator support priority must be sorted by score ascending"
  );

  for (const operator of report.operatorPerformance) {
    const operations = report.operationTimePerformance.filter((operation) => operation.operatorId === operator.operatorId);
    const producedQuantity = operations.reduce((sum, operation) => sum + operation.producedQuantity, 0);
    const totalProcessedQuantity = operations.reduce((sum, operation) => sum + operation.totalProcessedQuantity, 0);
    const plannedMinutes = operations.reduce((sum, operation) => sum + operation.plannedMinutes, 0);
    const idealRunMinutes = operations.reduce((sum, operation) => sum + operation.idealRunMinutes, 0);
    const completedOperations = operations.filter((operation) => operation.completedAt);
    const completedPlannedMinutes = completedOperations.reduce((sum, operation) => sum + operation.plannedMinutes, 0);
    const completedNetMinutes = completedOperations.reduce((sum, operation) => sum + operation.netMinutes, 0);
    const expectedTarget = rate(Math.min(idealRunMinutes, plannedMinutes), plannedMinutes);
    const expectedTime = completedNetMinutes > 0 ? rate(Math.min(completedPlannedMinutes, completedNetMinutes), completedNetMinutes) : null;
    const expectedQuality = rate(producedQuantity, totalProcessedQuantity);
    const expectedCompletion = rate(completedOperations.length, operations.length);
    const components = [
      { value: expectedTarget, weight: 35 },
      ...(expectedTime === null ? [] : [{ value: expectedTime, weight: 25 }]),
      { value: expectedQuality, weight: 30 },
      { value: expectedCompletion, weight: 10 }
    ];
    const totalWeight = components.reduce((sum, component) => sum + component.weight, 0);
    const expectedScore = Number((components.reduce((sum, component) => sum + component.value * component.weight, 0) / totalWeight).toFixed(2));
    const expectedConfidence = operations.length >= 5 ? "HIGH" : operations.length >= 2 ? "MEDIUM" : "LOW";

    assert(operator.operationCount === operations.length, `${operator.operatorName} operation count is inconsistent`);
    assert(closeEnough(operator.targetAchievement, expectedTarget), `${operator.operatorName} target achievement is inconsistent`);
    assert(operator.timeEfficiency === expectedTime, `${operator.operatorName} time efficiency is inconsistent`);
    assert(closeEnough(operator.qualityRate, expectedQuality), `${operator.operatorName} quality rate is inconsistent`);
    assert(closeEnough(operator.completionRate, expectedCompletion), `${operator.operatorName} completion rate is inconsistent`);
    assert(closeEnough(operator.performanceScore, expectedScore), `${operator.operatorName} performance score is inconsistent`);
    assert(operator.dataConfidence === expectedConfidence, `${operator.operatorName} data confidence is inconsistent`);
  }

  console.log({
    acceptance: "ok",
    checkedRules: [
      "operator operation totals",
      "operator target achievement",
      "completed-operation time efficiency",
      "operator quality rate",
      "operator completion rate",
      "support priority ranking",
      "data confidence level"
    ]
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
