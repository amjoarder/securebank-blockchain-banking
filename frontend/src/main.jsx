import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import "./index.css";
import { BankProvider } from "./context/BankContext";
import { ToastProvider } from "./context/ToastContext";
import Layout from "./components/Layout";
import Landing from "./pages/Landing";
import Dashboard from "./pages/Dashboard";
import Onboarding from "./pages/Onboarding";
import Deposit from "./pages/Deposit";
import Withdraw from "./pages/Withdraw";
import Transfer from "./pages/Transfer";
import History from "./pages/History";
import Receipt from "./pages/Receipt";
import Admin from "./pages/Admin";
import Performance from "./pages/Performance";
import NotFound from "./pages/NotFound";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <BankProvider>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route element={<Layout />}>
              <Route path="/app" element={<Dashboard />} />
              <Route path="/onboarding" element={<Onboarding />} />
              <Route path="/deposit" element={<Deposit />} />
              <Route path="/withdraw" element={<Withdraw />} />
              <Route path="/transfer" element={<Transfer />} />
              <Route path="/history" element={<History />} />
              <Route path="/receipt/:txId" element={<Receipt />} />
              <Route path="/admin" element={<Admin />} />
              <Route path="/performance" element={<Performance />} />
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </BankProvider>
      </ToastProvider>
    </BrowserRouter>
  </StrictMode>
);
