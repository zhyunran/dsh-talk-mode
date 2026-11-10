# Changelog

## 0.2.0

The plugin now does both halves of "a DeepSeek account's conversations, in a
non-work form, inside DSH".

- **`deepseek_import` tool** — guided import of a DeepSeek web account:
  - `action: "guide"` returns the exact browser-console snippet and the two
    steps. The DeepSeek bearer token lives only in the page's memory, so that
    half has to run in the browser; it never leaves it.
  - `action: "run"` finds the newest `deepseek-chat-export*.json` in
    Downloads / Desktop / Documents and converts it into one Markdown file per
    conversation plus `index.md` and `index.json`.
- **`lib/convert.js`** — the transformation, importable on its own
  (`dsh-talk-mode/convert`) and free of DSH dependencies.
- Registered at profile level, so **Talk sessions still carry no tools**: the
  preset's scope half denies every global tool, this one included.
- Verified against a real account: 53 conversations / 544 messages → 55 files.

## 0.1.0

- First release.
- `Talk` agent preset: persona-only, `complete: true`, no runtime context.
- `talk-mode-scope` host half denies every globally visible tool for the preset
  scope via `ctx.tools.restrict()`, so a Talk turn sends an empty tool catalog.
- Inserted through the shipped agent-preset registry, so New Session lists it
  without any client UI code.
