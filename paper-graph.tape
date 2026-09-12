# The librarian agent growing the second-brain paper graph, live in the omp TUI.
# Nothing is replayed: corpus scan, add/link, auto-edges, connection query, and
# HTML export all execute on camera at real-time pacing (the Hide block only
# sets up a scratch dir, env, and an advisor-off config overlay).
#
# Render from the repo root: vhs assets/research/tapes/paper-graph.tape
# The fixed sleep is sized generously, so the raw capture ends with idle tail.
# Trim the idle air afterwards (keep 1x pacing):
#   ffmpeg -i assets/research/paper-graph.mp4 -ss <start> -to <end> \
#     -c:v libx264 -crf 26 -pix_fmt yuv420p trimmed.mp4
# (vhs Wait+Screen cannot see this TUI's screen once a turn is streaming, so the
# run cannot be gated on output text — hence the fixed sleep.)
Output assets/research/paper-graph.mp4

Require omp
Set FontSize 18
Set Width 1600
Set Height 1000
Set Theme "Catppuccin Mocha"
Set TypingSpeed 25ms
Set Shell "bash"
Set Framerate 12
Set PlaybackSpeed 1.0
Set WaitTimeout 2m

Hide
Type "rm -rf /tmp/rh-demo-graph && mkdir -p /tmp/rh-demo-graph && printf 'advisor:\n  enabled: false\n' > /tmp/rh-demo-graph/overlay.yml"
Enter
Type "export RESEARCH_CORPUS_DIR=$HOME/Research/Papers PAPER_GRAPH_DB=/tmp/rh-demo-graph/papers.db"
Enter
Type "omp --model sonnet --hide-thinking --auto-approve --config /tmp/rh-demo-graph/overlay.yml --session-dir /tmp/rh-demo-graph/.sessions --cwd /tmp/rh-demo-graph"
Enter
Wait+Screen@90s /Recent sessions|Tip:/
Sleep 5s
Type "/clear"
Enter
Sleep 2s
Show

Sleep 1s
Type "Grow my paper graph from the local corpus at $RESEARCH_CORPUS_DIR — use only PDFs inside that exact directory: pick three papers about multi-agent medical consultation, have the librarian agent add them with full metadata, link them as same-topic, and pull citation edges from OpenAlex with auto-edges. Then ask the librarian what connects the first two papers, and export the interactive HTML viz. Do not ask me any questions. Finish by showing the graph stats."
Sleep 4s
Enter

# Real librarian runtime (corpus scan, graph writes, OpenAlex lookups, export)
# — recorded live at real-time pacing.
Sleep 360s
