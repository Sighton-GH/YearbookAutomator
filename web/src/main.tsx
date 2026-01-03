import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import SiteShell from "./SiteShell";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <BrowserRouter
      basename={(import.meta.env.BASE_URL || "/") === "/" ? undefined : (import.meta.env.BASE_URL || "/").replace(/\/$/, "")}
    >
      <SiteShell />
    </BrowserRouter>
  </React.StrictMode>
);
