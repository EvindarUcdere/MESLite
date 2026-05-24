import * as reportService from "./report.service.js";

export async function overview(_req, res) {
  const report = await reportService.getOverviewReport();
  res.json({ data: report });
}
