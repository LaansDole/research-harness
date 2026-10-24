import * as os from "node:os";
import * as path from "node:path";

export interface ResearchConfig {
	/** Research state home, `~/.research-harness`; also the agent cwd. */
	home: string;
	projectsDir: string;
	papersDb: string;
	/** Repo root; locates python scripts. */
	harnessHome: string;
	corpusDir?: string;
	/** argv prefix for `RpcClient({ command })`. */
	ompCommand: string[];
	systemPrompt: string;
	/** 0 = random free port. */
	port: number;
	openBrowser: boolean;
}

export function loadConfig(env: Record<string, string | undefined>): ResearchConfig {
	const home = path.join(env.HOME || os.homedir(), ".research-harness");
	const harnessHome = env.RESEARCH_HARNESS_HOME || path.resolve(import.meta.dir, "../../..");
	const port = Number(env.RESEARCH_WEB_PORT || 0);
	if (!Number.isInteger(port) || port < 0 || port > 65535) {
		throw new Error(`RESEARCH_WEB_PORT must be an integer 0-65535, got ${env.RESEARCH_WEB_PORT}`);
	}
	return {
		home,
		projectsDir: path.join(home, "projects"),
		papersDb: env.PAPER_GRAPH_DB || path.join(home, "papers.db"),
		harnessHome,
		corpusDir: env.RESEARCH_CORPUS_DIR || undefined,
		ompCommand: [env.RESEARCH_WEB_OMP || "omp"],
		systemPrompt: env.RESEARCH_SYSTEM_PROMPT || path.join(harnessHome, "research/mode/system.md"),
		port,
		openBrowser: env.RESEARCH_WEB_NO_OPEN !== "1",
	};
}
