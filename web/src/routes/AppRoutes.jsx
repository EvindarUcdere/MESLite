import { Route, Routes } from "react-router-dom";
import { AppShell } from "../components/layout/AppShell.jsx";
import Alerts from "../pages/Alerts.jsx";
import Dashboard from "../pages/Dashboard.jsx";
import FieldNotes from "../pages/FieldNotes.jsx";
import Login from "../pages/Login.jsx";
import Machines from "../pages/Machines.jsx";
import Products from "../pages/Products.jsx";
import Quality from "../pages/Quality.jsx";
import Reports from "../pages/Reports.jsx";
import RouteManagement from "../pages/Routes.jsx";
import Users from "../pages/Users.jsx";
import WorkOrders from "../pages/WorkOrders.jsx";
import { ProtectedRoute } from "./ProtectedRoute.jsx";
import { RoleRoute } from "./RoleRoute.jsx";
import { ROLE_GROUPS } from "../utils/roles.js";

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<AppShell />}>
          <Route path="/" element={<Dashboard />} />
          <Route element={<RoleRoute allowedRoles={ROLE_GROUPS.managementPlusQuality} />}>
            <Route path="/alerts" element={<Alerts />} />
            <Route path="/field-notes" element={<FieldNotes />} />
          </Route>
          <Route element={<RoleRoute allowedRoles={ROLE_GROUPS.planning} />}>
            <Route path="/work-orders" element={<WorkOrders />} />
            <Route path="/routes" element={<RouteManagement />} />
          </Route>
          <Route element={<RoleRoute allowedRoles={ROLE_GROUPS.planning} />}>
            <Route path="/products" element={<Products />} />
            <Route path="/machines" element={<Machines />} />
          </Route>
          <Route element={<RoleRoute allowedRoles={ROLE_GROUPS.quality} />}>
            <Route path="/quality" element={<Quality />} />
          </Route>
          <Route element={<RoleRoute allowedRoles={ROLE_GROUPS.management} />}>
            <Route path="/reports" element={<Reports />} />
          </Route>
          <Route element={<RoleRoute allowedRoles={ROLE_GROUPS.adminOnly} />}>
            <Route path="/users" element={<Users />} />
          </Route>
          <Route path="*" element={<Dashboard />} />
        </Route>
      </Route>
    </Routes>
  );
}
