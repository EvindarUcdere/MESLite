import * as dashboardService from "./dashboard.service.js";

export async function summary(_req, res) {
  const summary = await dashboardService.getSummary();
  res.json({ data: summary });
}

export async function live(_req, res) {
  const liveOverview = await dashboardService.getLiveOverview();
  res.json({ data: liveOverview });
}
