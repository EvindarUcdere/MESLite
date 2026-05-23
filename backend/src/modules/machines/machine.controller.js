import * as machineService from "./machine.service.js";

export async function list(_req, res) {
  const machines = await machineService.findMachines();
  res.json({ data: machines });
}

export async function updateStatus(req, res) {
  const result = await machineService.updateMachineStatus(req.params.id, req.user.id, req.validated.body);
  res.json({ data: result });
}
