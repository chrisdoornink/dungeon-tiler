Review all staged and unstaged changes in the working directory, write a concise and descriptive commit message summarizing what changed and why, commit everything to the current branch, then push to origin. Only do this when on the main branch.

Steps:
1. Run `git status` and `git diff` to understand all changes
2. Run `git log -5 --oneline` to match the commit message style of this repo
3. Stage all changed tracked files with `git add -u`, plus any relevant untracked files (excluding node_modules, .env files, and build artifacts)
4. Write a commit message that is specific to the actual changes — not generic
5. Commit with that message (include Co-Authored-By trailer)
6. Push to origin main
