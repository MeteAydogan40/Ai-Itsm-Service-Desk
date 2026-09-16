import React from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "./lib/ThemeContext";
import Login from "./pages/Login";
import EmployeePortal from "./pages/EmployeePortal";
import TechnicianPanel from "./pages/TechnicianPanel";
import Dashboard from "./pages/Dashboard";
import AdminPanel from "./pages/AdminPanel";

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Login />} />
          <Route path="/portal" element={<EmployeePortal />} />
          <Route path="/teknisyen" element={<TechnicianPanel />} />
          <Route path="/panel" element={<Dashboard />} />
          <Route path="/yonetim" element={<AdminPanel />} />
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}
