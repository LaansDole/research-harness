You are resolving git merge conflicts in a fork of can1357/oh-my-pi, unattended in CI. Nobody will answer questions. Work only with the files and commands described here.

## Situation

- The current branch has a merge commit that pulls upstream `can1357/oh-my-pi` `main` into this fork, `LaansDole/research-harness`.
- That merge was committed with the conflict markers still in the files.
- Find the merge commit:

  ```sh
  M=$(git log --merges -1 --format=%H origin/main..HEAD)
  ```

- The conflicted files are listed in the `Sync-Conflict` trailers of that commit, one per line as `<code> <path>`:

  ```sh
  git log -1 --format='%(trailers:key=Sync-Conflict,valueonly)' "$M"
  ```

- Only lines whose code is `UU` or `AA` are yours: those files contain conflict markers. Ignore every other code (`DU`, `UD`, `AU`, `UA`, `DD`). Those are file-level conflicts that a human decides.

## For each `UU`/`AA` file

1. Read all three versions:
   - fork (ours): `git show "$M^1:<path>"`
   - upstream (theirs): `git show "$M^2:<path>"`
   - common ancestor: `git show "$(git merge-base "$M^1" "$M^2"):<path>"`. It may not exist for `AA`.
2. Read the file in the working tree, which has the markers. Look at nearby code, and at other upstream changes (`git diff "$M^1" "$M^2" -- <related paths>`), when you need them to understand renamed symbols or moved code.
3. Edit the working-tree file so that it has **no** conflict marker lines (`<<<<<<< `, `=======`, `>>>>>>> `) and keeps both intents:
   - Upstream's change is the new baseline: keep its bug fixes, renames, new parameters and API changes.
   - Re-apply the fork's customization on top of that baseline. A fork change must never be silently dropped.
   - If the two sides really contradict each other and you can't keep both safely, don't guess. Leave that file's markers exactly as they are.
4. For every file you leave unresolved, append one line to the notes file:

   ```sh
   echo "- <path>: <one-sentence reason>" >> "$SYNC_REPORT_DIR/ai-notes.md"
   ```

## Hard rules

- Edit only the `UU`/`AA` files listed in the trailers. Changes to any other file are reverted automatically.
- Do not create files, except appending to `$SYNC_REPORT_DIR/ai-notes.md`.
- Do not run git commands that write: no `add`, `commit`, `checkout`, `reset`, `stash`, `merge`, `rebase`, `push`, `rm` or `restore`. Read-only commands (`show`, `diff`, `log`, `grep`, `blame`) are fine.
- Resolve each file completely or leave it untouched. A file that still has any marker line is reverted automatically.
- Do not print, write or echo environment variables or credentials.
- When you're done, reply with one line per file: `<path>: resolved` or `<path>: left for human`.
