Commit staged changes (or all modified tracked files) without GPG signing and without a Co-Authored-By trailer.

Steps:
1. Run `git status` and `git diff` (staged + unstaged) to understand what will be committed.
2. Run `git log --oneline -5` to match the repository's commit message style (conventional commits: `type: description`).
3. Stage relevant files with `git add <specific files>` — never use `git add -A` or `git add .`.
4. Create the commit using `git -c commit.gpgsign=false commit -m "<message>"` — do NOT include a `Co-Authored-By` trailer.
5. Run `git status` to confirm the commit succeeded.
6. Push the branch using `git push "https://pastorenue:$PERSONAL_GH_TOKEN@github.com/pastorenue/beaker.git" <branch>` (add `-u` and the branch name if no upstream is set yet).

Important constraints:
- Never skip pre-commit hooks (`--no-verify`).
- Never amend an existing commit unless explicitly asked.
- Never add `Co-Authored-By` lines.
- Never enable GPG signing.
