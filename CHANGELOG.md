# Changelog

## 0.2.1

Attachments are no longer dropped.

- `convert.js` renders each `FILE` fragment as `📎 附件：<name> · <kind> · <size> · <status>`
  inside the conversation, so an imported chat shows what was sent, not just the
  answer that referred to it.
- A new `附件清单.md` is generated alongside the archive: every attachment with
  file name, size, kind, status and the user message it arrived with — an
  inventory you can check without opening 53 conversations.
- `index.md` / `index.json` gained an `attachments` column, and the import tool
  reports the attachment count.
- `TEST-PLAN.md`: the post-restart acceptance checklist, with expected numbers
  measured on a real account (53 conversations / 544 messages / 23 attachment
  references) and a pass/fail criterion per step.

Still open: attachment **bytes** are not downloaded. `raw-export.json` keeps each
file's `signed_path`, but fetching originals is a separate step and the signature
may have expired.

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
