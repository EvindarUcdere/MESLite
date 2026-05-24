import { Navigate, Outlet } from "react-router-dom";
import { useAuthStore } from "../store/authStore.js";
import { hasRole } from "../utils/roles.js";

export function RoleRoute({ allowedRoles }) {
  const user = useAuthStore((state) => state.user);

  if (!hasRole(user, allowedRoles)) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
