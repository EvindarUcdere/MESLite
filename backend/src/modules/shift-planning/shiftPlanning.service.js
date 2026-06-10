import { prisma } from "../../config/db.js";
import { ApiError } from "../../utils/ApiError.js";

const groupInclude = {
  members: {
    include: {
      operator: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          isActive: true
        }
      }
    },
    orderBy: { operator: { name: "asc" } }
  }
};

const templateInclude = {
  shift: true,
  group: true
};

function parseDateOnly(value) {
  return new Date(`${value}T00:00:00.000Z`);
}

function getMonthDays(month) {
  const [year, monthIndex] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, monthIndex - 1, 1));
  const days = [];

  while (date.getUTCMonth() === monthIndex - 1) {
    days.push(new Date(date));
    date.setUTCDate(date.getUTCDate() + 1);
  }

  return days;
}

function shouldScheduleDay(date, pattern, startOffset = 0) {
  const dayOfWeek = date.getUTCDay();
  const dayIndex = date.getUTCDate() - 1 + startOffset;

  if (pattern === "EVERY_DAY") {
    return true;
  }

  if (pattern === "SIX_DAYS") {
    return dayOfWeek >= 1 && dayOfWeek <= 6;
  }

  if (pattern === "FOUR_ON_TWO_OFF") {
    return dayIndex % 6 < 4;
  }

  return dayOfWeek >= 1 && dayOfWeek <= 5;
}

async function assertOperators(operatorIds) {
  if (!operatorIds.length) {
    return;
  }

  const count = await prisma.user.count({
    where: {
      id: { in: operatorIds },
      role: "OPERATOR",
      isActive: true
    }
  });

  if (count !== operatorIds.length) {
    throw new ApiError(400, "All group members must be active operators");
  }
}

export function findOperatorGroups() {
  return prisma.operatorGroup.findMany({
    include: groupInclude,
    orderBy: [{ isActive: "desc" }, { name: "asc" }]
  });
}

export async function createOperatorGroup(data) {
  await assertOperators(data.operatorIds);

  return prisma.operatorGroup.create({
    data: {
      name: data.name,
      description: data.description,
      isActive: data.isActive ?? true,
      members: {
        create: data.operatorIds.map((operatorId) => ({ operatorId }))
      }
    },
    include: groupInclude
  });
}

export async function updateOperatorGroup(id, data) {
  if (data.operatorIds) {
    await assertOperators(data.operatorIds);
  }

  return prisma.$transaction(async (tx) => {
    const group = await tx.operatorGroup.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {})
      }
    });

    if (data.operatorIds) {
      await tx.operatorGroupMember.deleteMany({ where: { groupId: id } });
      await tx.operatorGroupMember.createMany({
        data: data.operatorIds.map((operatorId) => ({ groupId: id, operatorId })),
        skipDuplicates: true
      });
    }

    return tx.operatorGroup.findUnique({
      where: { id: group.id },
      include: groupInclude
    });
  });
}

export function deleteOperatorGroup(id) {
  return prisma.operatorGroup.delete({ where: { id } });
}

export function findShiftTemplates() {
  return prisma.shiftTemplate.findMany({
    include: templateInclude,
    orderBy: [{ isActive: "desc" }, { name: "asc" }]
  });
}

export async function createShiftTemplate(data) {
  const shift = await prisma.shift.findUnique({ where: { id: data.shiftId } });
  if (!shift || !shift.isActive) {
    throw new ApiError(400, "Active shift is required");
  }

  if (data.groupId) {
    const group = await prisma.operatorGroup.findUnique({ where: { id: data.groupId } });
    if (!group || !group.isActive) {
      throw new ApiError(400, "Active operator group is required");
    }
  }

  return prisma.shiftTemplate.create({
    data: {
      name: data.name,
      description: data.description,
      pattern: data.pattern,
      shiftId: data.shiftId,
      groupId: data.groupId,
      startOffset: data.startOffset,
      isActive: data.isActive ?? true
    },
    include: templateInclude
  });
}

export function updateShiftTemplate(id, data) {
  return prisma.shiftTemplate.update({
    where: { id },
    data,
    include: templateInclude
  });
}

export function deleteShiftTemplate(id) {
  return prisma.shiftTemplate.delete({ where: { id } });
}

export async function generateMonthlyPlan(data) {
  const [group, template] = await Promise.all([
    prisma.operatorGroup.findUnique({ where: { id: data.groupId }, include: groupInclude }),
    prisma.shiftTemplate.findUnique({ where: { id: data.templateId }, include: templateInclude })
  ]);

  if (!group || !group.isActive) {
    throw new ApiError(400, "Active operator group is required");
  }

  if (!template || !template.isActive) {
    throw new ApiError(400, "Active shift template is required");
  }

  const activeMembers = group.members.filter((member) => member.operator.isActive && member.operator.role === "OPERATOR");
  if (!activeMembers.length) {
    throw new ApiError(400, "Operator group has no active operators");
  }

  const days = getMonthDays(data.month).filter((day) => shouldScheduleDay(day, template.pattern, template.startOffset));
  const payload = activeMembers.flatMap((member) =>
    days.map((day) => ({
      operatorId: member.operatorId,
      shiftId: template.shiftId,
      workDate: parseDateOnly(day.toISOString().slice(0, 10)),
      status: "PLANNED",
      note: data.note ?? `Generated from ${template.name}`
    }))
  );

  return prisma.$transaction(async (tx) => {
    if (data.overwrite) {
      await tx.shiftAssignment.deleteMany({
        where: {
          operatorId: { in: activeMembers.map((member) => member.operatorId) },
          workDate: {
            gte: parseDateOnly(`${data.month}-01`),
            lt: new Date(Date.UTC(Number(data.month.slice(0, 4)), Number(data.month.slice(5, 7)), 1))
          }
        }
      });
    }

    const result = await tx.shiftAssignment.createMany({
      data: payload,
      skipDuplicates: true
    });

    return {
      group,
      template,
      month: data.month,
      scheduledDays: days.length,
      operatorCount: activeMembers.length,
      requestedAssignments: payload.length,
      createdAssignments: result.count,
      skippedAssignments: payload.length - result.count
    };
  });
}
