export const ROLES = {
  ADMIN: "ADMIN",
  PRODUCTION_MANAGER: "PRODUCTION_MANAGER",
  OPERATOR: "OPERATOR",
  QUALITY_STAFF: "QUALITY_STAFF",
  VIEWER: "VIEWER"
};

export const ROLE_LABELS = {
  ADMIN: "Admin",
  PRODUCTION_MANAGER: "Üretim Yöneticisi",
  OPERATOR: "Operatör",
  QUALITY_STAFF: "Kalite Personeli",
  VIEWER: "İzleyici"
};

export const ROLE_GROUPS = {
  management: [ROLES.ADMIN, ROLES.PRODUCTION_MANAGER, ROLES.VIEWER],
  managementPlusQuality: [ROLES.ADMIN, ROLES.PRODUCTION_MANAGER, ROLES.QUALITY_STAFF, ROLES.VIEWER],
  planning: [ROLES.ADMIN, ROLES.PRODUCTION_MANAGER],
  production: [ROLES.ADMIN, ROLES.PRODUCTION_MANAGER, ROLES.OPERATOR],
  quality: [ROLES.ADMIN, ROLES.PRODUCTION_MANAGER, ROLES.QUALITY_STAFF],
  adminOnly: [ROLES.ADMIN]
};

export function hasRole(user, allowedRoles) {
  return Boolean(user?.role && allowedRoles.includes(user.role));
}
