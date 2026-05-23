import * as authService from "./auth.service.js";

export async function login(req, res) {
  const result = await authService.login(req.validated.body);
  res.json(result);
}

export function me(req, res) {
  res.json({ user: authService.getCurrentUser(req.user) });
}
