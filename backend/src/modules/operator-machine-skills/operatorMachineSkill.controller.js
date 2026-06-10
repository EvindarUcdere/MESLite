import * as operatorMachineSkillService from "./operatorMachineSkill.service.js";

export async function list(req, res) {
  const skills = await operatorMachineSkillService.findOperatorMachineSkills(req.validated.query);
  res.json({ data: skills });
}

export async function upsert(req, res) {
  const skill = await operatorMachineSkillService.upsertOperatorMachineSkill(req.validated.body);
  res.status(201).json({ data: skill });
}

export async function update(req, res) {
  const skill = await operatorMachineSkillService.updateOperatorMachineSkill(req.params.id, req.validated.body);
  res.json({ data: skill });
}

export async function remove(req, res) {
  await operatorMachineSkillService.deleteOperatorMachineSkill(req.params.id);
  res.status(204).send();
}
