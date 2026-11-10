/**
 * `deepseek_import` — the guided half of dsh-talk-mode.
 *
 * DSH cannot read another app's private storage, and DeepSeek's web client only
 * exposes its conversations behind an `Authorization: Bearer <64-char token>`
 * header that lives in the page's own memory. The one place that token safe and
 * available is the page itself, so the import is split in two:
 *
 *   1. the user pastes one snippet into the DeepSeek tab's DevTools console; it
 *      calls the site's own API with the page's own token and downloads a JSON
 *      file — the token never leaves the browser;
 *   2. this tool finds that file and turns it into a Markdown archive.
 *
 * `action: 'guide'` returns the snippet and the steps, `action: 'run'` performs
 * step 2. That pair is the whole on-boarding flow.
 *
 * @module dsh-talk-mode/import
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { convertExport } from './convert.js'

export const name = 'talk-mode-import'

export const inject = ['tools']

/** The exact console snippet that produced a working export. */
const SNIPPET = `(async()=>{
  const raw=localStorage.getItem('userToken');
  let t=raw; try{const j=JSON.parse(raw); t=j.value??j.token??j}catch{}
  const H={Authorization:'Bearer '+t};
  const get=async u=>{const r=await fetch(u,{headers:H}); return r.json()};
  let all=[],cursor='',guard=0;
  while(guard++<200){
    const d=await get('/api/v0/chat_session/fetch_page?count=100&lte_cursor='+encodeURIComponent(cursor));
    if(d.code!==0){console.error('SESSIONS FAILED',d.code,d.msg);return}
    const b=d.data.biz_data; all.push(...b.chat_sessions);
    console.log('sessions',all.length,'has_more',b.has_more);
    if(!b.has_more||!b.chat_sessions.length)break;
    cursor=b.chat_sessions[b.chat_sessions.length-1].id;
  }
  const out={exportedAt:new Date().toISOString(),sessions:[]};
  for(let i=0;i<all.length;i++){
    const s=all[i]; let m={};
    try{ m=await get('/api/v0/chat/history_messages?chat_session_id='+encodeURIComponent(s.id)) }catch(e){ m={error:String(e)} }
    out.sessions.push({session:s,messages:m});
    if((i+1)%10===0) console.log('fetched',i+1,'/',all.length);
    await new Promise(r=>setTimeout(r,120));
  }
  const blob=new Blob([JSON.stringify(out)],{type:'application/json'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob); a.download='deepseek-chat-export.json';
  document.body.appendChild(a); a.click(); a.remove();
  console.log('DONE sessions',all.length,'bytes',blob.size);
})()`

/** Where a browser download of that snippet usually lands. */
function candidateDirs (sessionCwd) {
  const home = os.homedir()
  return [
    path.join(home, 'Downloads'),
    path.join(home, 'Desktop'),
    path.join(home, 'Documents'),
    sessionCwd,
  ].filter(Boolean)
}

/** Newest `deepseek-chat-export*.json` across the usual download locations. */
function findExports (sessionCwd) {
  const found = []
  for (const dir of candidateDirs(sessionCwd)) {
    let entries
    try {
      entries = fs.readdirSync(dir)
    } catch {
      continue
    }
    for (const entry of entries) {
      if (!/^deepseek-chat-export.*\.json$/i.test(entry)) continue
      const full = path.join(dir, entry)
      try {
        const stat = fs.statSync(full)
        if (stat.isFile()) found.push({ path: full, bytes: stat.size, modified: stat.mtimeMs })
      } catch {
        /* vanished between readdir and stat */
      }
    }
  }
  return found.sort((a, b) => b.modified - a.modified)
}

function guideText () {
  return [
    'DeepSeek 网页版 → DSH 聊天归档',
    '',
    'DSH 读不到别的 App 的私有数据，DeepSeek 网页版的会话又锁在一个 64 字符的 token 后面，',
    '而那个 token 只存在于页面自己的内存里。所以分两步，token 全程不离开浏览器。',
    '',
    '第 1 步：在你的浏览器里打开 https://chat.deepseek.com 并确认已登录，',
    '        按 F12 → Console（首次可能需要输入 allow pasting 解锁粘贴），',
    '        粘贴下面这段脚本并回车。',
    '',
    '        ```js',
    SNIPPET,
    '        ```',
    '',
    '        它会打印进度，结束时输出 DONE 并把 deepseek-chat-export.json 下载到下载目录。',
    '',
    '第 2 步：回来对我说「导入」，或再次调用本工具并传 action="run"。',
    '        我会找到那个 JSON，转成每个会话一份 Markdown，写进工作区的 exports/deepseek-chat/。',
    '',
    '之后想以轻松的聊天形态跟它对话，新建会话时选 Talk 预设即可。',
  ].join('\n')
}

export function apply (ctx) {
  ctx.tools.register({
    name: 'deepseek_import',
    description:
      'Import a DeepSeek web account\'s conversations into the workspace as Markdown. ' +
      'Use action="guide" to show the user the exact browser console snippet and steps (the DeepSeek token lives only in their page, so this half must run in the browser), ' +
      'then action="run" to locate the downloaded deepseek-chat-export.json and convert it into one Markdown file per conversation plus index.md. ' +
      'This is the on-boarding flow for dsh-talk-mode: guide first, run after the user confirms the download finished.',
    parameters: {
      action: {
        type: 'string',
        required: true,
        enum: ['guide', 'run'],
        description: 'guide = print the console snippet and the two steps; run = find the downloaded JSON and convert it.',
      },
      source: {
        type: 'string',
        description: 'Optional explicit path to a deepseek-chat-export.json. Defaults to the newest one found in Downloads/Desktop/Documents.',
      },
      outputDir: {
        type: 'string',
        description: 'Optional destination directory. Defaults to <session workspace>/exports/deepseek-chat.',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          ok: { type: 'boolean', required: true },
          action: { type: 'string', required: true },
          message: { type: 'string', required: true },
          source: { type: 'string' },
          outDir: { type: 'string' },
          sessions: { type: 'number' },
          files: { type: 'number' },
          messages: { type: 'number' },
          candidates: { type: 'number' },
        },
      },
      render: (args, value) => [{ type: 'text', text: value.message }],
    },
    async execute (args, exec) {
      const action = args.action === 'run' ? 'run' : 'guide'
      if (action === 'guide') {
        return { ok: true, action, message: guideText(), candidates: 0 }
      }

      const sessionCwd = exec?.agent?.session?.header?.cwd
      let source = typeof args.source === 'string' && args.source.trim().length > 0 ? args.source.trim() : ''
      let candidates = 0

      if (source.length === 0) {
        const found = findExports(sessionCwd)
        candidates = found.length
        if (found.length === 0) {
          return {
            ok: false,
            action,
            candidates: 0,
            message:
              '没有找到 deepseek-chat-export*.json。\n' +
              '先运行 action="guide" 走完浏览器那一步，确认控制台打印了 DONE 并且文件已下载，然后再导入。\n' +
              '也可以传 source 直接指定文件路径。',
          }
        }
        source = found[0].path
      }

      if (!fs.existsSync(source)) {
        return { ok: false, action, source, candidates, message: `文件不存在：${source}` }
      }

      let data
      try {
        data = JSON.parse(fs.readFileSync(source, 'utf8'))
      } catch (error) {
        return { ok: false, action, source, candidates, message: `解析失败（不是有效的导出 JSON）：${error.message}` }
      }

      const base = sessionCwd ?? os.homedir()
      const outDir = typeof args.outputDir === 'string' && args.outputDir.trim().length > 0
        ? args.outputDir.trim()
        : path.join(base, 'exports', 'deepseek-chat')

      let result
      try {
        result = convertExport(data, outDir)
      } catch (error) {
        return { ok: false, action, source, candidates, message: `转换失败：${error.message}` }
      }

      const message = [
        `导入完成：${result.sessions} 个会话 / ${result.messages} 条消息。`,
        `源文件：${source}`,
        `输出目录：${outDir}`,
        `共写出 ${result.files} 个文件（每个会话一份 Markdown，外加 index.md 与 index.json）。`,
        '',
        '打开 index.md 就是会话清单；想以聊天形态继续，新建会话时选 Talk 预设。',
      ].join('\n')

      return {
        ok: true,
        action,
        source,
        outDir,
        sessions: result.sessions,
        files: result.files,
        messages: result.messages,
        candidates,
        message,
      }
    },
  })
}
