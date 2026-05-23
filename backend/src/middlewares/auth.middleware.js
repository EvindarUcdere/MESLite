import { prisma } from "../config/db.js";
import { ApiError } from "../utils/ApiError.js";
import { verifyToken } from "../utils/jwt.js";

export async function requireAuth(req, _res, next) {
  try {
    const header = req.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice(7) : null;

    if (!token) {
      throw new ApiError(401, "Authentication token is required");
    }

    const decoded = verifyToken(token);
    const user = await prisma.user.findUnique({ where: { id: decoded.sub } });

    if (!user || !user.isActive) {
      throw new ApiError(401, "User is not authorized");
    }

    req.user = user;
    next();
  } catch (error) {
    next(error.statusCode ? error : new ApiError(401, "Invalid or expired token"));
  }
}
