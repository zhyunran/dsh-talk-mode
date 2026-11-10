# Changelog

## 0.1.0

- First release.
- `Talk` agent preset: persona-only, `complete: true`, no runtime context.
- `talk-mode-scope` host half denies every globally visible tool for the preset
  scope via `ctx.tools.restrict()`, so a Talk turn sends an empty tool catalog.
- Inserted through the shipped agent-preset registry, so New Session lists it
  without any client UI code.
