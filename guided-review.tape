# A researcher starting a scoping review, recorded live in the omp TUI.
# Nothing is replayed: the mode creates the project and writes scope.md, pulls the
# database plan from the skill's references/DATABASES.md, builds the per-database search
# strings, and the scholar agent runs the searches it can run - all on camera at
# real-time pacing. The Hide block only sets up a scratch dir, env, and an advisor-off
# config overlay.
#
# The typed lines are deliberately researcher-grade: plain sentences, no flags, no
# command recall. The harness carries the method and proposes each next step; the
# researcher answers and follows it (the Covidence bar).
#
# Prereqs (once, from the repo root): ./setup.sh   (plugin + agents + prompts installed)
# Render from the repo root:  vhs assets/research/tapes/guided-review.tape
# The run length varies; the sleeps below are sized generously, so the raw capture ends
# with idle tail. Post-process afterwards: drop duplicate frames (mpdecimate), then trim
# to the last on-screen change + 5 s, keeping 1x pacing.
# (vhs Wait+Screen cannot see this TUI's screen once a turn is streaming, so the run
# cannot be gated on output text - hence the fixed sleeps.)
Output assets/research/guided-review.mp4

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
Type "rm -rf /tmp/rh-demo-review && mkdir -p /tmp/rh-demo-review && printf 'advisor:\n  enabled: false\n' > /tmp/rh-demo-review/overlay.yml"
Enter
Type "export RESEARCH_HARNESS_HOME=$PWD RESEARCH_CORPUS_DIR=$HOME/Research/Papers PAPER_GRAPH_DB=/tmp/rh-demo-review/papers.db"
Enter
Type "omp --model sonnet --hide-thinking --auto-approve --append-system-prompt $RESEARCH_HARNESS_HOME/research/mode/system.md --config /tmp/rh-demo-review/overlay.yml --session-dir /tmp/rh-demo-review/.sessions --cwd /tmp/rh-demo-review"
Enter
Wait+Screen@90s /Recent sessions|Tip:/
Sleep 5s
Type "/clear"
Enter
Sleep 2s
Show

Sleep 1s
Type "I'm starting a scoping review on how LLM agents help with triage in the emergency department. Where do I start?"
Sleep 3s
Enter
Sleep 150s

Type "/databases"
Sleep 3s
Enter
Sleep 150s

Type "can you write the search strings for those?"
Sleep 3s
Enter
Sleep 180s

Type "now find everything you can run yourself"
Sleep 3s
Enter
Sleep 240s
