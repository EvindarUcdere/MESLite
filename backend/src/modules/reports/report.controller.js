import * as reportService from "./report.service.js";

export async function overview(req, res) {
  const report = await reportService.getOverviewReport(req.query);
  res.json({ data: report });
}
