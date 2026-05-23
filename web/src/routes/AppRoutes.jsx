import { Route, Routes } from "react-router-dom";
import { AppShell } from "../components/layout/AppShell.jsx";
import Dashboard from "../pages/Dashboard.jsx";
import Login from "../pages/Login.jsx";
import Machines from "../pages/Machines.jsx";
import Products from "../pages/Products.jsx";
import Quality from "../pages/Quality.jsx";
import Users from "../pages/Users.jsx";
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
          <Route path="/products" element={<Products />} />
          <Route path="/machines" element={<Machines />} />
          <Route path="/quality" element={<Quality />} />
          <Route path="/users" element={<Users />} />
          <Route path="*" element={<Dashboard />} />
        </Route>
      </Route>
    </Routes>
  );
}
