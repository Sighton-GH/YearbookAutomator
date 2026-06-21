import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { ToolAppPage } from "./pages/ToolAppPage";
import "./styles/index.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <BrowserRouter
      basename={(import.meta.env.BASE_URL || "/") === "/" ? undefined : (import.meta.env.BASE_URL || "/").replace(/\/$/, "")}
    >
      <ToolAppPage />
    </BrowserRouter>
  </React.StrictMode>
);
