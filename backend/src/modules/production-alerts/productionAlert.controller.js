import * as productionAlertService from "./productionAlert.service.js";

export async function list(req, res) {
  const alerts = await productionAlertService.findProductionAlerts(req.validated.query);
  res.json({ data: alerts });
}

export async function update(req, res) {
  const alert = await productionAlertService.updateProductionAlert(req.user, req.params.id, req.validated.body);
  res.json({ data: alert });
}

export async function decideQualityAction(req, res) {
  const alert = await productionAlertService.decideQualityAction(req.user, req.params.id, req.validated.body);
  res.json({ data: alert });
}
