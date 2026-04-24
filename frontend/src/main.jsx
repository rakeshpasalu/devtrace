import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./styles.css";

// Apply saved theme before first paint
try {
  const settings = JSON.parse(localStorage.getItem("devtrace-settings") ?? "{}");
  document.documentElement.setAttribute("data-theme", settings.theme ?? "dark");
} catch {
  document.documentElement.setAttribute("data-theme", "dark");
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
