import { createRoot } from "react-dom/client";
import { setThemePreference } from "@oh-my-pi/collab-web/src/lib/theme";
import "@oh-my-pi/collab-web/src/styles/tokens.css";
import "@oh-my-pi/collab-web/src/styles/base.css";
import { App } from "./App";
import "./app.css";

// Light unless the researcher picked dark in the header; the server remembers it across launches.
// Set light before the fetch so an OS in dark mode never paints a dark first frame.
setThemePreference("light");
const saved = await fetch("/api/theme")
	.then(res => res.json() as Promise<{ theme?: string }>)
	.catch(() => null);
if (saved?.theme === "dark") setThemePreference("dark");

const root = document.getElementById("root");
if (!root) throw new Error("missing #root element");
createRoot(root).render(<App />);
