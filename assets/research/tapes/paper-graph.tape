# Live demo of the paper-graph CLI. Render from the repo root: vhs assets/research/tapes/paper-graph.tape
Output assets/research/paper-graph.gif

Set FontSize 15
Set Width 1200
Set Height 640
Set Theme "Catppuccin Mocha"
Set TypingSpeed 30ms
Set Shell "bash"

Hide
Type `export PAPER_GRAPH_DB=/tmp/pg-demo.db && rm -f /tmp/pg-demo.db && alias pg='python3 research/skills/paper-graph/scripts/paper_graph.py' && clear`
Enter
Show

Type "# grow a second brain of papers: add, link, query"
Enter
Sleep 800ms

Type `pg add --id medagents --title "MedAgents: LLMs as Collaborators for Zero-shot Medical Reasoning" --year 2023 --doi 10.48550/arXiv.2311.10537`
Enter
Sleep 1.2s

Type `pg add --id mdagents --title "MDAgents: An Adaptive Collaboration of LLMs for Medical Decision-Making" --year 2024 --doi 10.48550/arXiv.2404.15155`
Enter
Sleep 1.2s

Type "pg link mdagents medagents --type same-topic"
Enter
Sleep 1s

Type "pg neighbors mdagents --depth 2"
Enter
Sleep 1.5s

Type "# citation edges straight from OpenAlex"
Enter
Type `pg add --id bert --title "BERT: Pre-training of Deep Bidirectional Transformers" --doi 10.18653/v1/N19-1423`
Enter
Sleep 1s
Type `pg add --id skipthought --title "Skip-Thought Vectors" --doi 10.48550/arXiv.1506.06726`
Enter
Sleep 1s
Type "pg auto-edges bert"
Enter
Sleep 2.5s

Type "pg stats"
Enter
Sleep 1.5s

Type "pg export --format html --out /tmp/pg-demo.html"
Enter
Sleep 2s
