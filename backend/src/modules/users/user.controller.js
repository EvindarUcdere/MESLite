import * as userService from "./user.service.js";

export async function list(_req, res) {
  const users = await userService.findUsers();
  res.json({ data: users });
}

export async function detail(req, res) {
  const user = await userService.findUserById(req.params.id);
  res.json({ data: user });
}

export async function create(req, res) {
  const user = await userService.createUser(req.validated.body);
  res.status(201).json({ data: user });
}

export async function update(req, res) {
  const user = await userService.updateUser(req.params.id, req.validated.body);
  res.json({ data: user });
}

export async function updateStatus(req, res) {
  const user = await userService.updateUserStatus(req.params.id, req.validated.body.isActive);
  res.json({ data: user });
}
