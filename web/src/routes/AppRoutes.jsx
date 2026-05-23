import { Route, Routes } from "react-router-dom";
import Dashboard from "../pages/Dashboard.jsx";
import Login from "../pages/Login.jsx";

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="*" element={<Dashboard />} />
    </Routes>
  );
}
