import * as pushTokenService from "./pushToken.service.js";

export async function register(req, res) {
  const token = await pushTokenService.registerPushToken(req.user.id, req.validated.body);
  res.status(201).json({ data: token });
}

export async function listMine(req, res) {
  const tokens = await pushTokenService.findPushTokensForUser(req.user.id);
  res.json({ data: tokens });
}

export async function testMine(req, res) {
  const notification = await pushTokenService.createPushTestNotification(req.user);
  res.status(201).json({ data: notification });
}

export async function deactivate(req, res) {
  await pushTokenService.deactivatePushToken(req.user.id, req.body.token);
  res.json({ data: { active: false } });
}
