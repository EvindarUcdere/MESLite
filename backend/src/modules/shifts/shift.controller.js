import * as shiftService from "./shift.service.js";

export async function list(_req, res) {
  const shifts = await shiftService.findShifts();
  res.json({ data: shifts });
}

export async function detail(req, res) {
  const shift = await shiftService.findShiftById(req.params.id);
  res.json({ data: shift });
}

export async function create(req, res) {
  const shift = await shiftService.createShift(req.validated.body);
  res.status(201).json({ data: shift });
}

export async function update(req, res) {
  const shift = await shiftService.updateShift(req.params.id, req.validated.body);
  res.json({ data: shift });
}
