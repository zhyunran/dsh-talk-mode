# dsh-talk-mode

One extra **agent preset** for [DeepSeek Harness](https://github.com/deepseek-ai): **Talk**.

Pick it on the New Session screen and you get a conversation that sends **no tools at all** — no shell, no filesystem, no web search, no subagents, no skills, no `AGENTS.md`, no runtime-context block. Work sessions are untouched.

[中文说明](README.zh.md)

---

## Why

A DSH profile is a stack of bundles, and every bundle's tool schema is sent with every request. Measured on a real desktop profile with 20 bundles and the shipped `cordis` preset:

| | |
|---|---|
| tools callable by the agent | **86** |
| tool-schema payload per request | **~116 KB** (≈30k tokens) |
| conversation tokens | 0, before the first message |

On a limited plan that tax is paid on every single turn. It eats the context window and it eats the output budget, so replies get truncated, you regenerate, and the "please try again later" wall arrives sooner than it should.

A Talk session pays none of it.

## What a Talk request contains

- one short system prompt (the `prefix` in `cordis.patch.yml`, editable)
- **no** tool schemas
- **no** `AGENTS.md` / workspace instructions
- **no** skill catalog
- **no** runtime-context block (cwd, platform, env vars)

## Install

The package is a DSH bundle (`dsh.bundle.patch`), so it installs like any other plugin.

```bash
# from this folder (or an extracted tarball)
dsh plugin --profile desktop add C:/path/to/dsh-talk-mode
```

`dsh plugin add` installs it into the profile; add `dsh-talk-mode` to `dsh.profile.bundles` in that profile's `package.json` if your profile manager does not do it for you. The GUI's **Settings → Plugins** page and the `plugin_manager` tool do both steps.

Then restart DSH.

## Use

**New Session** → the preset control on the hero screen → **Talk**.

Switch back to your normal preset for engineering work; nothing about Work changes.

## How it works

Two halves, no client-side code:

1. **`cordis.patch.yml`** inserts one `@deepseek-ai/dsh-agent-preset` entry with `id: talk`. The preset registry feeds the shipped New Session preset control (`conversation.hero.agentPreset`), so the option appears automatically.
2. **`lib/index.js`** mounts *inside* that preset's scope and calls

   ```js
   ctx.tools.restrict({ deny: <every globally visible tool name> })
   ```

   `tools.restrict()` is scope-local: it intersects with other restrictions and never modifies the global view, so every other preset keeps its full tool set.

   That safety is enforced by the harness, not promised by this plugin: `restrict()` refuses to run on a context-global scope (`"a context-global restriction would mask every agent"`). A misconfiguration can therefore only fail to shrink Talk — it cannot narrow a Work session.

`order: 0` puts Talk first in the picker.

## Caveats

- Tools registered **after** a Talk session mounts (an MCP server that connects later, for example) are not covered. Start a new Talk session after such a change.
- System-prompt sections contributed by root-level plugins are not removed by this plugin — only the tool catalog, instructions, skills and runtime block are.
- The harness always has *some* system prompt. "No system context" here means no tool schemas, no `AGENTS.md`, no skills, no runtime block.

## Customise

Edit `cordis.patch.yml` after installing (the copy inside the profile's `node_modules/dsh-talk-mode/`):

```yaml
config:
  name: Talk            # label in the picker
  description: ...      # subtext in the picker
  order: 0              # position
  plugins:
    - id: persona
      config:
        prefix: |-      # ← your chat persona
          ...
```

Restart DSH to reload the bundle.

## Uninstall

Remove `dsh-talk-mode` from `dsh.profile.bundles`, then restart. Nothing else is written.

## License

MIT
