import * as productionAlertService from "./productionAlert.service.js";
import { runIdempotentOperation } from "../offline-operations/offlineOperation.service.js";

export async function list(req, res) {
  const alerts = await productionAlertService.findProductionAlerts(req.validated.query);
  res.json({ data: alerts });
}

export async function update(req, res) {
  const alert = await productionAlertService.updateProductionAlert(req.user, req.params.id, req.validated.body);
  res.json({ data: alert });
}

export async function decideQualityAction(req, res) {
  const { operationId, ...payload } = req.validated.body;
  const result = await runIdempotentOperation({
    operationId,
    type: "QUALITY_ACTION_DECISION",
    user: req.user,
    payload: { alertId: req.params.id, ...payload },
    handler: () => productionAlertService.decideQualityAction(req.user, req.params.id, payload)
  });

  res.json({ data: result.data, idempotent: result.idempotent });
}
