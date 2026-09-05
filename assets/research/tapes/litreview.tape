# Replay of a real /litreview run (radiology multi-agent review, 2026-09-05).
# The review file, paper-graph DB, and stats below are unedited outputs of that run;
# the multi-minute agent pipeline itself is not re-executed here.
# Render from the repo root: vhs assets/research/tapes/litreview.tape
Output assets/research/litreview.gif

Set FontSize 15
Set Width 1200
Set Height 680
Set Theme "Catppuccin Mocha"
Set TypingSpeed 25ms
Set Shell "bash"

Type `# omp -p "/litreview LLM agents for radiology report generation --criteria: include only multi-LLM-agent systems evaluated on radiology tasks; max 8 candidates"`
Enter
Sleep 1.5s

Type "# scholar searched arXiv+OpenAlex, screener kept 5/8, synthesizer wrote the review:"
Enter
Type "head -n 24 /tmp/rh-demo/review-llm-agents-radiology-report-generation.md"
Enter
Sleep 4s
Type "ls /tmp/rh-demo/papers/"
Enter
Sleep 1.5s

Type "# every included paper landed in the second-brain graph:"
Enter
Type "PAPER_GRAPH_DB=/tmp/rh-demo/pg-e2e.db python3 research/skills/paper-graph/scripts/paper_graph.py stats"
Enter
Sleep 2s

Type "PAPER_GRAPH_DB=/tmp/rh-demo/pg-e2e.db python3 research/skills/paper-graph/scripts/paper_graph.py neighbors zeng2024radcouncil --depth 1"
Enter
Sleep 3.5s
