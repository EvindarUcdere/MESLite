import { prisma } from "../../config/db.js";

export function createMobileDebugLog(userId, data) {
  return prisma.mobileDebugLog.create({
    data: {
      userId,
      category: data.category,
      step: data.step,
      platform: data.platform,
      payload: data.payload ?? {}
    }
  });
}

export function findMobileDebugLogs({ userId, limit = 100 }) {
  return prisma.mobileDebugLog.findMany({
    where: userId ? { userId } : undefined,
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true
        }
      }
    }
  });
}

