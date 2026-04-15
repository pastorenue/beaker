Commit staged changes (or all modified tracked files) without GPG signing and without a Co-Authored-By trailer.

Steps:
1. Run `git status`, `git diff --staged`, `git diff`, and `git log --oneline -5` in parallel to understand what will be committed and match the repository's commit message style (conventional commits: `type: description`).
2. Stage relevant files with `git add <specific files>` — never use `git add -A` or `git add .`. Do not stage `.env` files or anything that may contain secrets.
3. Create the commit using `git -c commit.gpgsign=false commit -m "<message>"` — do NOT include a `Co-Authored-By` trailer.
4. If the push fails with a 403 or "no upstream" error, push explicitly as pastorenue:
   - No upstream set: `git push -u "https://pastorenue:$PERSONAL_GH_TOKEN@github.com/pastorenue/beaker.git" <branch>`
   - Upstream already set: `git push "https://pastorenue:$PERSONAL_GH_TOKEN@github.com/pastorenue/beaker.git" <branch>`
   - After pushing with the token URL, reset the upstream to the clean origin URL:
     `git fetch origin && git branch --set-upstream-to=origin/<branch> <branch>`

Important constraints:
- Never skip pre-commit hooks (`--no-verify`).
- Never amend an existing commit unless explicitly asked.
- Never add `Co-Authored-By` lines.
- Never enable GPG signing.
- Always push as `pastorenue` — never rely on the system credential helper, as it may resolve to a different account.
