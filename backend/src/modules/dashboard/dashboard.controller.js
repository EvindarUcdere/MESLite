import * as dashboardService from "./dashboard.service.js";

export async function summary(_req, res) {
  const summary = await dashboardService.getSummary();
  res.json({ data: summary });
}
