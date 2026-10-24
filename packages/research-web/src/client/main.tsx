import { createRoot } from "react-dom/client";
import { setThemePreference } from "@oh-my-pi/collab-web/src/lib/theme";
import "@oh-my-pi/collab-web/src/styles/tokens.css";
import "@oh-my-pi/collab-web/src/styles/base.css";
import { App } from "./App";
import "./app.css";

// Light unless the researcher picked dark in the header; the server remembers it across launches.
const saved = await fetch("/api/theme")
	.then(res => res.json() as Promise<{ theme?: string }>)
	.catch(() => null);
setThemePreference(saved?.theme === "dark" ? "dark" : "light");

const root = document.getElementById("root");
if (!root) throw new Error("missing #root element");
createRoot(root).render(<App />);
