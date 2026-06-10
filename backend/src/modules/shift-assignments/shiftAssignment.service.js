import { prisma } from "../../config/db.js";
import { ApiError } from "../../utils/ApiError.js";

function parseDateOnly(value) {
  return new Date(`${value}T00:00:00.000Z`);
}

function getMonthRange(month) {
  const [year, monthIndex] = month.split("-").map(Number);
  const start = new Date(Date.UTC(year, monthIndex - 1, 1));
  const end = new Date(Date.UTC(year, monthIndex, 1));
  return { start, end };
}

function getAssignmentRange(query) {
  if (query.month) {
    return getMonthRange(query.month);
  }

  if (query.from && query.to) {
    const start = parseDateOnly(query.from);
    const end = new Date(parseDateOnly(query.to).getTime() + 24 * 60 * 60 * 1000);
    return { start, end };
  }

  return getMonthRange(new Date().toISOString().slice(0, 7));
}

const assignmentInclude = {
  operator: {
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true
    }
  },
  shift: true
};

export function findShiftAssignments(query = {}) {
  const { start, end } = getAssignmentRange(query);

  return prisma.shiftAssignment.findMany({
    where: {
      workDate: {
        gte: start,
        lt: end
      },
      ...(query.operatorId ? { operatorId: query.operatorId } : {})
    },
    include: assignmentInclude,
    orderBy: [{ workDate: "asc" }, { operator: { name: "asc" } }]
  });
}

async function assertAssignmentRefs(data) {
  const [operator, shift] = await Promise.all([
    prisma.user.findUnique({ where: { id: data.operatorId } }),
    prisma.shift.findUnique({ where: { id: data.shiftId } })
  ]);

  if (!operator || operator.role !== "OPERATOR" || !operator.isActive) {
    throw new ApiError(400, "Active operator user is required for shift assignment");
  }

  if (!shift || !shift.isActive) {
    throw new ApiError(400, "Active shift is required");
  }
}

export async function upsertShiftAssignment(data) {
  await assertAssignmentRefs(data);
  const workDate = parseDateOnly(data.workDate);

  return prisma.shiftAssignment.upsert({
    where: {
      operatorId_workDate: {
        operatorId: data.operatorId,
        workDate
      }
    },
    update: {
      shiftId: data.shiftId,
      startTime: data.startTime,
      endTime: data.endTime,
      status: data.status,
      note: data.note
    },
    create: {
      operatorId: data.operatorId,
      shiftId: data.shiftId,
      workDate,
      startTime: data.startTime,
      endTime: data.endTime,
      status: data.status,
      note: data.note
    },
    include: assignmentInclude
  });
}

export async function bulkUpsertShiftAssignments(data) {
  const operatorIds = [...new Set(data.assignments.map((assignment) => assignment.operatorId))];

  const operatorCount = await prisma.user.count({
    where: {
      id: { in: operatorIds },
      role: "OPERATOR",
      isActive: true
    }
  });

  if (operatorCount !== operatorIds.length) {
    throw new ApiError(400, "All assignments must belong to active operators");
  }

  if (data.status !== "EMPTY") {
    if (!data.shiftId) {
      throw new ApiError(400, "Shift is required for planned assignments");
    }

    const shift = await prisma.shift.findUnique({ where: { id: data.shiftId } });
    if (!shift || !shift.isActive) {
      throw new ApiError(400, "Active shift is required");
    }
  }

  return prisma.$transaction(async (tx) => {
    let deleted = 0;
    let upserted = 0;

    for (const assignment of data.assignments) {
      const workDate = parseDateOnly(assignment.workDate);

      if (data.status === "EMPTY") {
        const result = await tx.shiftAssignment.deleteMany({
          where: {
            operatorId: assignment.operatorId,
            workDate
          }
        });
        deleted += result.count;
      } else {
        await tx.shiftAssignment.upsert({
          where: {
            operatorId_workDate: {
              operatorId: assignment.operatorId,
              workDate
            }
          },
          update: {
            shiftId: data.shiftId,
            status: data.status,
            note: data.note
          },
          create: {
            operatorId: assignment.operatorId,
            workDate,
            shiftId: data.shiftId,
            status: data.status,
            note: data.note
          }
        });
        upserted += 1;
      }
    }

    return {
      requested: data.assignments.length,
      upserted,
      deleted
    };
  });
}

export async function updateShiftAssignment(id, data) {
  if (data.shiftId) {
    const shift = await prisma.shift.findUnique({ where: { id: data.shiftId } });

    if (!shift || !shift.isActive) {
      throw new ApiError(400, "Active shift is required");
    }
  }

  return prisma.shiftAssignment.update({
    where: { id },
    data,
    include: assignmentInclude
  });
}

export function deleteShiftAssignment(id) {
  return prisma.shiftAssignment.delete({ where: { id } });
}
