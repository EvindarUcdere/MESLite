import { Route, Routes } from "react-router-dom";
import { AppShell } from "../components/layout/AppShell.jsx";
import Dashboard from "../pages/Dashboard.jsx";
import Login from "../pages/Login.jsx";
import WorkOrders from "../pages/WorkOrders.jsx";
import { ProtectedRoute } from "./ProtectedRoute.jsx";

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<AppShell />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/work-orders" element={<WorkOrders />} />
          <Route path="*" element={<Dashboard />} />
        </Route>
      </Route>
    </Routes>
  );
}
