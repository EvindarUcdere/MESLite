import { ApiError } from "../utils/ApiError.js";

export function allowRoles(...roles) {
  return (req, _res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return next(new ApiError(403, "You do not have permission for this action"));
    }

    next();
  };
}
