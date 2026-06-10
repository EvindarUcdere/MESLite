import { prisma } from "../../config/db.js";
import { ApiError } from "../../utils/ApiError.js";

const skillInclude = {
  operator: {
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true
    }
  },
  machine: {
    include: {
      productionLine: true
    }
  }
};

export function findOperatorMachineSkills(query = {}) {
  return prisma.operatorMachineSkill.findMany({
    where: {
      ...(query.operatorId ? { operatorId: query.operatorId } : {}),
      ...(query.machineId ? { machineId: query.machineId } : {})
    },
    include: skillInclude,
    orderBy: [{ operator: { name: "asc" } }, { machine: { code: "asc" } }]
  });
}

async function assertSkillRefs(data) {
  const [operator, machine] = await Promise.all([
    prisma.user.findUnique({ where: { id: data.operatorId } }),
    prisma.machine.findUnique({ where: { id: data.machineId } })
  ]);

  if (!operator || operator.role !== "OPERATOR" || !operator.isActive) {
    throw new ApiError(400, "Active operator user is required for machine skill");
  }

  if (!machine || !machine.isActive) {
    throw new ApiError(400, "Active machine is required for machine skill");
  }
}

export async function upsertOperatorMachineSkill(data) {
  await assertSkillRefs(data);

  return prisma.operatorMachineSkill.upsert({
    where: {
      operatorId_machineId: {
        operatorId: data.operatorId,
        machineId: data.machineId
      }
    },
    update: {
      level: data.level,
      isActive: data.isActive,
      note: data.note
    },
    create: data,
    include: skillInclude
  });
}

export function updateOperatorMachineSkill(id, data) {
  return prisma.operatorMachineSkill.update({
    where: { id },
    data,
    include: skillInclude
  });
}

export function deleteOperatorMachineSkill(id) {
  return prisma.operatorMachineSkill.delete({ where: { id } });
}
