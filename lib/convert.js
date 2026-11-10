/**
 * DeepSeek web export → Markdown archive.
 *
 * Pure transformation: takes the JSON produced by the in-page exporter and
 * writes one Markdown file per conversation plus `index.json` / `index.md`.
 * No network, no DSH services — so it can be unit-tested on its own.
 *
 * @module dsh-talk-mode/convert
 */

import fs from 'node:fs'
import path from 'node:path'

/** Fragment kinds that carry the visible answer rather than reasoning or tool chatter. */
const BODY_TYPES = new Set(['REQUEST', 'RESPONSE', 'ANSWER'])
const THINKING_TYPES = /THINK|REASON/

/** Windows forbids these in file names; control characters break shells. */
const UNSAFE = /[\\/:*?"<>|\u0000-\u001f]/g

export function sanitizeTitle (name, fallback) {
  let text = String(name ?? '').trim().replace(UNSAFE, ' ')
  text = text.replace(/\s+/g, ' ').trim().replace(/^\.+/, '').trim()
  if (text.length === 0) text = fallback
  if (text.length > 60) text = text.slice(0, 60).trim()
  return text
}

export function formatTimestamp (seconds) {
  if (typeof seconds !== 'number') return ''
  const date = new Date(seconds * 1000)
  if (Number.isNaN(date.getTime())) return ''
  return `${date.toISOString().replace('T', ' ').slice(0, 19)} UTC`
}

function fragmentsOf (message) {
  const fragments = Array.isArray(message.fragments) ? message.fragments : []
  return fragments
    .map(fragment => ({
      type: String(fragment.type ?? 'UNKNOWN'),
      content: typeof fragment.content === 'string' ? fragment.content : '',
    }))
    .filter(fragment => fragment.content.trim().length > 0)
}

function renderMessage (message) {
  const role = String(message.role ?? '').toUpperCase()
  const fragments = fragmentsOf(message)
  if (fragments.length === 0) return ''

  const thinking = fragments.filter(fragment => THINKING_TYPES.test(fragment.type))
  const body = fragments.filter(fragment => !THINKING_TYPES.test(fragment.type))

  const parts = [role === 'USER' ? '## 用户' : role === 'ASSISTANT' ? '## 助手' : `## ${role || '未知'}`, '']

  if (thinking.length > 0) {
    parts.push('<details><summary>思考过程</summary>', '')
    for (const fragment of thinking) parts.push(fragment.content.trim(), '')
    parts.push('</details>', '')
  }

  for (const fragment of body) {
    // Search / tool fragments stay, but marked, so nothing silently disappears.
    if (!BODY_TYPES.has(fragment.type)) parts.push(`<!-- fragment:${fragment.type} -->`)
    parts.push(fragment.content.trim(), '')
  }
  return parts.join('\n')
}

/**
 * Convert one export payload into Markdown files on disk.
 *
 * @param {object} data - parsed `deepseek-chat-export.json`
 * @param {string} outDir - destination directory (created if missing)
 * @returns {{ sessions: number, files: number, chars: number, messages: number, index: object[] }}
 */
export function convertExport (data, outDir) {
  if (data === null || typeof data !== 'object') throw new Error('export payload is not an object')
  const sessions = Array.isArray(data.sessions) ? data.sessions : []
  fs.mkdirSync(outDir, { recursive: true })

  const used = new Set()
  const index = []
  let chars = 0
  let messages = 0

  for (const entry of sessions) {
    const session = entry?.session ?? {}
    const title = String(session.title ?? '').trim() || '(无标题)'
    const id = String(session.id ?? '')
    const chatMessages = entry?.messages?.data?.biz_data?.chat_messages
    const list = Array.isArray(chatMessages) ? chatMessages : []
    messages += list.length

    const body = list.map(renderMessage).filter(Boolean).join('\n---\n\n')
    const meta = [
      `- id: \`${id}\``,
      `- model: \`${session.model_type ?? 'default'}\``,
      `- updated: ${formatTimestamp(session.updated_at)}`,
      `- messages: ${list.length}`,
      `- exported: ${data.exportedAt ?? ''}`,
    ].join('\n')

    const markdown = `# ${title}\n\n${meta}\n\n---\n\n${body || '_（无消息内容）_'}\n`

    let base = sanitizeTitle(title, 'session')
    let fileName = `${base}.md`
    let n = 2
    while (used.has(fileName.toLowerCase())) fileName = `${base} (${n++}).md`
    used.add(fileName.toLowerCase())

    fs.writeFileSync(path.join(outDir, fileName), markdown, 'utf8')
    chars += markdown.length
    index.push({
      title,
      id,
      model: session.model_type ?? 'default',
      updated_at: session.updated_at ?? null,
      messages: list.length,
      file: fileName,
    })
  }

  index.sort((a, b) => (b.updated_at ?? 0) - (a.updated_at ?? 0))
  fs.writeFileSync(path.join(outDir, 'index.json'), JSON.stringify(index, null, 2), 'utf8')

  const header = [
    '# DeepSeek 网页版会话导出',
    '',
    `- 导出时间：${data.exportedAt ?? ''}`,
    `- 会话数：${index.length}`,
    `- 目录：\`${outDir}\``,
    '',
    '| 标题 | 消息数 | 更新时间 | 文件 |',
    '| --- | --- | --- | --- |',
    ...index.map(row => `| ${row.title.replace(/\|/g, '\\|')} | ${row.messages} | ${formatTimestamp(row.updated_at)} | [${row.file}](${encodeURI(row.file)}) |`),
  ].join('\n')
  fs.writeFileSync(path.join(outDir, 'index.md'), `${header}\n`, 'utf8')

  return { sessions: index.length, files: index.length + 2, chars, messages, index }
}
