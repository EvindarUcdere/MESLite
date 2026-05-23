import bcrypt from "bcryptjs";
import { prisma } from "../../config/db.js";
import { ApiError } from "../../utils/ApiError.js";
import { signToken } from "../../utils/jwt.js";

function sanitizeUser(user) {
  const { passwordHash, ...safeUser } = user;
  return safeUser;
}

export async function login({ email, password }) {
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user || !user.isActive) {
    throw new ApiError(401, "Invalid email or password");
  }

  const isValidPassword = await bcrypt.compare(password, user.passwordHash);

  if (!isValidPassword) {
    throw new ApiError(401, "Invalid email or password");
  }

  return {
    token: signToken({ sub: user.id, role: user.role }),
    user: sanitizeUser(user)
  };
}

export function getCurrentUser(user) {
  return sanitizeUser(user);
}
