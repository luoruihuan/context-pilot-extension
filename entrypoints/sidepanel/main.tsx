import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "../../src/app/App";
import "../../src/shared/tokens/tokens.css";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Context Pilot root element is missing");
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
