import * as pushTokenService from "./pushToken.service.js";

export async function register(req, res) {
  const token = await pushTokenService.registerPushToken(req.user.id, req.validated.body);
  res.status(201).json({ data: token });
}

export async function deactivate(req, res) {
  await pushTokenService.deactivatePushToken(req.user.id, req.body.token);
  res.json({ data: { active: false } });
}
