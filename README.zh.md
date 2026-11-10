# dsh-talk-mode

给 DeepSeek Harness 的**一个插件，两半互相独立**：

- **Talk** —— 一个**不带任何工具**的代理预设：没有命令行、没有文件系统、没有网页搜索、没有子代理、没有技能、不注入 `AGENTS.md`、不带运行时上下文块。新建会话时选它，就是纯聊天；工作会话完全不受影响。
- **Import** —— 引导式导入：把某个 DeepSeek 网页版账号的会话，导成工作区里的 Markdown。

两半是**故意隔开**的：导入器是工作会话才看得见的"安装步骤"，而 Talk 会屏蔽所有全局工具——包括这个导入器——所以聊天里永远不会带上它。

[English](README.md)

---

## 为什么需要它

DSH 的一个被 profile 由一堆 bundle 叠起来，而**每个 bundle 的工具 schema 都会随每次请求一起发出去**。在一台装了 20 个 bundle、使用内置 `cordis` 预设的真实桌面环境上实测：

| | |
|---|---|
| 当前会话可调用的工具 | **86 个** |
| 每次请求的工具 schema 体积 | **约 116 KB**（≈3 万 token） |
| 对话内容 | 还没开始说话，就已经是 0 |

在小额度套餐上，这笔开销每一轮都要付。它既占用上下文窗口，又挤占输出预算，于是回答被截断、你需要重新生成、更快撞上「请稍后再试」。

Talk 会话一分钱都不付。

## Talk 会话的请求里有什么

- 一小段系统提示（`cordis.patch.yml` 里的 `prefix`，可自己改）
- **没有**工具 schema
- **没有** `AGENTS.md` / 工作区指令
- **没有**技能目录
- **没有**运行时上下文块（cwd、平台、环境变量）

## 安装

这个包本身就是一个 DSH bundle（`dsh.bundle.patch`），和别的插件一样装：

```bash
# 在本目录（或解压出来的目录）
dsh plugin --profile desktop add C:/路径/dsh-talk-mode
```

`dsh plugin add` 会装进 profile；如果你的插件管理器不代劳，再把 `dsh-talk-mode` 加进该 profile 的 `package.json` 的 `dsh.profile.bundles`。图形界面的 **设置 → 插件** 页和 `plugin_manager` 工具会把这两步都做掉。

然后重启 DSH。

## 使用

**新建会话** → 首页上的预设选择控件 → **Talk**。

要干活就切回原来的预设，Work 侧没有任何变化。

## 导入 DeepSeek 会话

两步，DeepSeek 的登录令牌全程不离开浏览器。

1. 在已登录 DeepSeek 的浏览器里：打开 https://chat.deepseek.com → `F12` → **Console** → 粘贴 `deepseek_import` 在 `action: "guide"` 时给出的那段脚本 → 回车。它会打印进度，最后输出 `DONE`，并把 `deepseek-chat-export.json` 下载到下载目录。
2. 让 agent 执行导入，或直接调用工具的 `action: "run"`。它会找到最新的导出文件，按会话写成 Markdown，外加 `index.md` / `index.json`，落在 `exports/deepseek-chat/`。

为什么要绕两步：DSH 读不到别的 App 的私有存储，而 DeepSeek 网页版用的是只存在于页面内存里的 64 字符 Bearer token。在页面里跑脚本，是这个令牌既拿得到、又安全可控的唯一位置。

导完之后想以聊天形态回顾，就在 Talk 会话里聊——那正是它的用途。

## 原理

两半，不需要客户端 UI 代码：

1. **`cordis.patch.yml`** 插入一条 `@deepseek-ai/dsh-agent-preset` 条目，`id: talk`。预设注册表正好喂给内置的「新建会话」预设控件（`conversation.hero.agentPreset`），所以选项自己就出现了。
2. **`lib/index.js`** 挂在该预设的**作用域内**，调用

   ```js
   ctx.tools.restrict({ deny: <所有全局可见工具名> })
   ```

   `tools.restrict()` 是作用域局部的：它只做交集、不改全局视图，所以其它预设的工具一个不少。

   这层安全由 Harness 保证，不靠本插件的自觉：`restrict()` 在「上下文全局」的作用域上会直接抛错（`a context-global restriction would mask every agent`）。所以就算配置写错，最坏结果也只是 Talk 没变小 —— 它不可能反过来削弱 Work 会话。

`order: 0` 让 Talk 排在选择器第一位。

## 注意

- 在 Talk 会话挂载**之后**才注册的工具（例如稍后才连上的 MCP 服务器）不会被覆盖。加了这类东西之后新开一个 Talk 会话即可。
- 由根级插件贡献的系统提示段落不会被本插件移除 —— 本插件移除的是工具清单、指令、技能和运行时块。
- Harness 总归会有*一点*系统提示。这里说的「无系统上下文」指：无工具 schema、无 `AGENTS.md`、无技能、无运行时块。

## 自定义

装好后改 profile 里那份 `node_modules/dsh-talk-mode/cordis.patch.yml`：

```yaml
config:
  name: Talk            # 选择器里的名字
  description: ...      # 选择器里的说明
  order: 0              # 排序
  plugins:
    - id: persona
      config:
        prefix: |-      # ← 你的聊天人格
          ...
```

改完重启 DSH 生效。

## 卸载

把 `dsh-talk-mode` 从 `dsh.profile.bundles` 里删掉，重启即可。不写任何别的东西。

## 许可

MIT
