# A real, live /litreview run over a local PDF corpus, recorded inside the omp TUI.
# Nothing is replayed: the slash command expands the pipeline prompt and the
# scholar/screener/synthesizer agents execute on camera at real-time pacing (the
# Hide block only sets up a scratch dir, env, and an advisor-off config overlay).
#
# Setup (once): the README quickstart — plugin installed and
#   cp research/prompts/litreview.md ~/.omp/agent/prompts/
# Render from the repo root: vhs assets/research/tapes/litreview.tape
# The run length varies; the fixed sleep below is sized generously, so the raw
# capture ends with idle tail. Trim the idle air afterwards (keep 1x pacing):
#   ffmpeg -i assets/research/litreview.mp4 -ss <start> -to <end> \
#     -c:v libx264 -crf 26 -pix_fmt yuv420p trimmed.mp4
# (vhs Wait+Screen cannot see this TUI's screen once a turn is streaming, so the
# run cannot be gated on output text — hence the fixed sleep.)
Output assets/research/litreview.mp4

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
Type "rm -rf /tmp/rh-demo-tui && mkdir -p /tmp/rh-demo-tui && printf 'advisor:\n  enabled: false\n' > /tmp/rh-demo-tui/overlay.yml"
Enter
Type "export RESEARCH_CORPUS_DIR=$HOME/Research/Papers PAPER_GRAPH_DB=/tmp/rh-demo-tui/papers.db"
Enter
Type "omp --model sonnet --hide-thinking --auto-approve --config /tmp/rh-demo-tui/overlay.yml --session-dir /tmp/rh-demo-tui/.sessions --cwd /tmp/rh-demo-tui"
Enter
Wait+Screen@90s /Recent sessions|Tip:/
Sleep 5s
Type "/clear"
Enter
Sleep 2s
Show

Sleep 1s
Type "/litreview multi-agent LLM feedback and critique on clinical tasks --criteria: include only papers where two or more LLM agents interact via feedback, critique, or debate on a clinical task; corpus-only (offline, skip auto-edges); max 4 candidates; proceed with the include verdicts automatically and do not ask me any questions; keep the review under 400 words; end your final report with the line: GRAPH -> <N> papers / <E> edges (with the real stats numbers)"
Sleep 4s
Enter

# Real pipeline runtime (scholar scan, screener verdicts, synthesizer review,
# graph adds) — recorded live at real-time pacing.
Sleep 420s
