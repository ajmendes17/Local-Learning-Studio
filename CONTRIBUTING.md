# Contributing and peer testing

Local Learning Studio is designed for one learner's local workspace. Each
tester should run a separate checkout on their own computer; the app does not
provide shared accounts or synchronized learner records.

## Run and check locally

Follow the prerequisites and setup in [README.md](./README.md). Start the app
with `npm run dev` and open `http://localhost:4317`. Run `npm run check` before
proposing a change. For interface changes, also open the affected screen and
check the main action, loading/error states, and a narrow viewport.

Use test or course materials that you are allowed to store locally. Do not
commit `.env`, `data/`, `courses/`, learner exports, or private course files.
Keep bug reports useful and safe to share: include steps to reproduce, expected
and actual behavior, browser/Node versions when relevant, and redacted error
messages. Do not attach private course content or credentials.

## Branch and review workflow

1. Start from an up-to-date `main` branch: `git switch main` and
   `git pull --ff-only`.
2. Create a focused branch named `feature/<short-name>` or `fix/<short-name>`.
3. Keep a change focused, run the relevant checks, and update documentation
   when behavior or setup changes.
4. Add a concise entry under **Unreleased** in `CHANGELOG.md` for a major
   user-facing feature, workflow, or compatibility change. Small internal
   fixes do not need changelog entries.
5. Push the branch and open a pull request targeting `main`. Describe the
   user-visible change, test evidence, and any migration or data impact.
6. Merge after review, then update local `main` before starting the next task.

## Reporting feedback

Use a GitHub issue for reproducible bugs or focused feature requests. Include
the app version or commit, steps, expected result, actual result, and whether
the issue blocks studying. For a quick peer test, send the tester the branch
and the relevant changelog entry; do not ask them to share their local course
database or source files.
