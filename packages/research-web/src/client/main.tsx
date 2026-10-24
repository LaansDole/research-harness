import { createRoot } from "react-dom/client";
import "@oh-my-pi/collab-web/src/lib/theme";
import "@oh-my-pi/collab-web/src/styles/tokens.css";
import "@oh-my-pi/collab-web/src/styles/base.css";
import { App } from "./App";
import "./app.css";

const root = document.getElementById("root");
if (!root) throw new Error("missing #root element");
createRoot(root).render(<App />);
