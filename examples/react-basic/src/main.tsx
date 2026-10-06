import { createRoot } from "react-dom/client";

import { App } from "./App.tsx";

const root = createRoot(document.getElementById("root") as HTMLElement);
if (new URLSearchParams(location.search).has("workflows")) {
  void import("./WorkflowDemo.tsx").then(({ WorkflowDemo }) => root.render(<WorkflowDemo />));
} else root.render(<App />);
