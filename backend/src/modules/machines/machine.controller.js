import * as machineService from "./machine.service.js";

export async function list(_req, res) {
  const machines = await machineService.findMachines();
  res.json({ data: machines });
}

export async function detail(req, res) {
  const machine = await machineService.findMachineById(req.params.id);
  res.json({ data: machine });
}

export async function create(req, res) {
  const machine = await machineService.createMachine(req.validated.body);
  res.status(201).json({ data: machine });
}

export async function update(req, res) {
  const machine = await machineService.updateMachine(req.params.id, req.validated.body);
  res.json({ data: machine });
}

export async function updateStatus(req, res) {
  const result = await machineService.updateMachineStatus(req.params.id, req.user.id, req.validated.body);
  res.json({ data: result });
}
