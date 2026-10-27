# Contributing to OpenChalk

Thanks for helping. Bug fixes, better pictures, and teaching-prompt improvements are all welcome.

## Setup

Follow the Quick start in the [README](README.md). You need your own Gemini API key to run a live lesson. You don't need one for the tests.

The README's "How it works" table shows which file does what.

## Commands

| Command             | What it does                                                            |
| ------------------- | ----------------------------------------------------------------------- |
| `npm run dev`       | Starts the app at http://localhost:3000                                 |
| `npm test`          | Runs the unit tests (Vitest)                                            |
| `npm run typecheck` | Type-checks everything                                                  |
| `npm run format`    | Formats the code with Prettier                                          |
| `npm run check`     | Type check, format check, and tests: run this before every pull request |
| `npm run build`     | Production build                                                        |

## Before you open a pull request

1. Run `npm run check` and `npm run build`. Both must pass.
2. Run a short live lesson and check that the board still draws, talks, and handles an interruption.
3. If you changed `src/engine/prompts.ts`, `board/tools.ts`, or `board/coach.ts`, describe a lesson before and after your change. These files are instructions to the model, so small wording changes alter how it teaches.

## Guidelines

- Keep pull requests small and focused on one change.
- Match the style of the code around your change. Write comments only to explain why, not what.
- New logic that can run without a browser (parsing, layout maths, coaching rules) gets a test next to it, in `name.test.ts`.
- Do not add a dependency for something a few lines of code can do.
- Never commit `.env` or any API key.
- Any new icon set or image source must use a license that allows reuse, and its credit goes in the README.

## Reporting bugs

Open an issue and include the topic you asked about, what the board did, what you expected, and any message in the chat panel.
