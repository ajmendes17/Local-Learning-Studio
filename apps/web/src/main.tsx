import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles/base.css";
import "./styles/components.css";
import "./styles/home.css";
import "./styles/course.css";
import "./styles/info.css";
import "./styles/responsive.css";
import "./styles/knowledge.css";
import "./styles/study.css";
import "./styles/hand-tracking.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
