import { afterEach, beforeAll, describe, expect, it } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { WelcomeComponent } from "@oh-my-pi/pi-tui/prompt/welcome";
import { initTheme } from "@oh-my-pi/pi-tui/theme";

const ENV_KEYS = ["RESEARCHHARNESS_BRAND_NAME", "RESEARCHHARNESS_BRAND_LOGO", "RESEARCHHARNESS_BRAND_TIPS"] as const;
const saved = new Map<string, string | undefined>();

beforeAll(async () => {
	await initTheme(false);
});

afterEach(() => {
	for (const key of ENV_KEYS) {
		const value = saved.get(key);
		if (value === undefined) delete process.env[key];
		else process.env[key] = value;
	}
	saved.clear();
});

function setEnv(key: (typeof ENV_KEYS)[number], value: string | undefined): void {
	if (!saved.has(key)) saved.set(key, process.env[key]);
	if (value === undefined) delete process.env[key];
	else process.env[key] = value;
}

function tmpFile(name: string, content: string): string {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "welcome-brand-"));
	const file = path.join(dir, name);
	fs.writeFileSync(file, content);
	return file;
}

/** The border line of the welcome box carrying "<name> vX.Y.Z". */
function titleLine(component: WelcomeComponent): string {
	const lines = component.render(100);
	return lines.find(line => line.includes(" v1.2.3 ")) ?? "";
}

describe("WelcomeComponent branding", () => {
	it("keeps the stock omp title when brand env is unset", () => {
		setEnv("RESEARCHHARNESS_BRAND_NAME", undefined);
		const component = new WelcomeComponent("1.2.3", "model", "provider");
		expect(titleLine(component)).toContain("omp v1.2.3");
	});

	it("renders the brand name in the border title when set", () => {
		setEnv("RESEARCHHARNESS_BRAND_NAME", "Research Harness");
		const component = new WelcomeComponent("1.2.3", "model", "provider");
		expect(titleLine(component)).toContain("Research Harness v1.2.3");
		expect(titleLine(component)).not.toContain("omp v1.2.3");
	});

	it("renders the brand logo rows in place of the stock mark", () => {
		setEnv("RESEARCHHARNESS_BRAND_NAME", undefined);
		setEnv("RESEARCHHARNESS_BRAND_LOGO", tmpFile("logo.txt", "▓▓▓▓▓▓\n"));
		const component = new WelcomeComponent("1.2.3", "model", "provider");
		// Each glyph is wrapped in its own gradient SGR pair, so compare on plain text.
		const rendered = component
			.render(100)
			.join("\n")
			.replace(/\x1b\[[0-9;]*m/g, "");
		expect(rendered).toContain("▓▓▓▓▓▓");
		expect(rendered).not.toContain("████████████");
	});

	it("picks tips from the brand tips file when set", () => {
		setEnv("RESEARCHHARNESS_BRAND_TIPS", tmpFile("tips.txt", "only-brand-tip\n"));
		const component = new WelcomeComponent("1.2.3", "model", "provider");
		expect(component.tip).toBe("only-brand-tip");
	});

	it("falls back to stock tips when the brand tips file is missing", () => {
		setEnv("RESEARCHHARNESS_BRAND_TIPS", "/nonexistent/branding/tips.txt");
		const component = new WelcomeComponent("1.2.3", "model", "provider");
		expect(component.tip).toBeDefined();
	});
});
