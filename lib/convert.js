/**
 * DeepSeek web export → Markdown archive.
 *
 * Pure transformation: takes the JSON produced by the in-page exporter and
 * writes one Markdown file per conversation, an attachment inventory, plus
 * `index.json` / `index.md`. No network, no DSH services — so it can be
 * unit-tested on its own.
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

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.heic'])

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

export function humanBytes (bytes) {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes)) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

export function fileKind (name) {
  const ext = path.extname(String(name ?? '')).toLowerCase()
  if (IMAGE_EXTENSIONS.has(ext)) return '图片'
  if (ext === '.pdf') return 'PDF'
  if (ext === '.doc' || ext === '.docx') return 'Word'
  if (ext === '.xls' || ext === '.xlsx') return '表格'
  if (ext === '.ppt' || ext === '.pptx') return '幻灯片'
  if (ext === '.txt' || ext === '.md' || ext === '.csv') return '文本'
  return ext ? ext.replace('.', '').toUpperCase() : '未知'
}

function fragmentsOf (message) {
  const fragments = Array.isArray(message.fragments) ? message.fragments : []
  return fragments.map(fragment => ({
    type: String(fragment.type ?? 'UNKNOWN'),
    content: typeof fragment.content === 'string' ? fragment.content : '',
    files: Array.isArray(fragment.files) ? fragment.files : [],
  })).filter(fragment => fragment.content.trim().length > 0 || fragment.files.length > 0)
}

/** The user text of a message, used to label attachments with their request. */
function requestSnippet (message, limit = 70) {
  for (const fragment of message.fragments ?? []) {
    if (fragment.type !== 'REQUEST' || typeof fragment.content !== 'string') continue
    const text = fragment.content.replace(/\s+/g, ' ').trim()
    if (text.length > 0) return text.length > limit ? `${text.slice(0, limit)}…` : text
  }
  return ''
}

function renderMessage (message, collect) {
  const role = String(message.role ?? '').toUpperCase()
  const fragments = fragmentsOf(message)
  if (fragments.length === 0) return ''

  const thinking = fragments.filter(fragment => THINKING_TYPES.test(fragment.type))
  const attachments = fragments.filter(fragment => fragment.files.length > 0)
  const body = fragments.filter(fragment => !THINKING_TYPES.test(fragment.type) && fragment.files.length === 0)

  const parts = [role === 'USER' ? '## 用户' : role === 'ASSISTANT' ? '## 助手' : `## ${role || '未知'}`, '']

  for (const fragment of attachments) {
    for (const file of fragment.files) {
      const name = file.file_name ?? '(未命名)'
      const kind = fileKind(name)
      const size = humanBytes(file.file_size)
      parts.push(`> 📎 附件：\`${name}\` · ${kind}${size ? ` · ${size}` : ''}${file.status ? ` · ${file.status}` : ''}`, '')
      collect?.push({
        name,
        kind,
        bytes: typeof file.file_size === 'number' ? file.file_size : null,
        status: file.status ?? '',
        fileId: file.id ?? '',
        signedPath: typeof file.signed_path === 'string' ? file.signed_path : '',
        said: requestSnippet(message),
      })
    }
  }

  if (thinking.length > 0) {
    parts.push('<details><summary>思考过程</summary>', '')
    for (const fragment of thinking) parts.push(fragment.content.trim(), '')
    parts.push('</details>', '')
  }

  for (const fragment of body) {
    if (!BODY_TYPES.has(fragment.type)) parts.push(`<!-- fragment:${fragment.type} -->`)
    parts.push(fragment.content.trim(), '')
  }
  return parts.join('\n')
}

function writeAttachmentInventory (outDir, groups, totalBytes) {
  const byKind = new Map()
  for (const group of groups) {
    for (const row of group.rows) byKind.set(row.kind, (byKind.get(row.kind) ?? 0) + 1)
  }

  const lines = []
  lines.push('# DeepSeek 网页版附件清单', '')
  lines.push(`- 附件引用：**${groups.reduce((n, g) => n + g.rows.length, 0)}** 次，分布在 **${groups.length}** 个会话`)
  lines.push(`- 合计大小：**${humanBytes(totalBytes)}**`)
  lines.push('', '> 这里只有元数据，原文件**尚未下载**。', '> 原始 JSON 保留了每个附件的 `signed_path`，下载需要额外一步，且签名可能已过期。', '')
  lines.push('## 按类型统计', '', '| 类型 | 数量 |', '| --- | --- |')
  for (const [kind, count] of [...byKind.entries()].sort((a, b) => b[1] - a[1])) lines.push(`| ${kind} | ${count} |`)
  lines.push('', '## 明细', '')

  for (const group of groups) {
    lines.push(`### ${group.title}`, '')
    lines.push(`<sub>会话 \`${group.id}\` · 更新 ${group.updated} · ${group.rows.length} 个附件</sub>`, '')
    lines.push('| # | 文件名 | 大小 | 类型 | 状态 | 当时问的是 |')
    lines.push('| --- | --- | --- | --- | --- | --- |')
    group.rows.forEach((row, index) => {
      const said = row.said ? row.said.replace(/\|/g, '\\|') : '—'
      lines.push(`| ${index + 1} | ${row.name.replace(/\|/g, '\\|')} | ${humanBytes(row.bytes)} | ${row.kind} | ${row.status} | ${said} |`)
    })
    lines.push('')
  }

  fs.writeFileSync(path.join(outDir, '附件清单.md'), `${lines.join('\n')}\n`, 'utf8')
}

/**
 * Convert one export payload into Markdown files on disk.
 *
 * @param {object} data - parsed `deepseek-chat-export.json`
 * @param {string} outDir - destination directory (created if missing)
 * @returns {{ sessions: number, files: number, chars: number, messages: number, attachments: number, index: object[] }}
 */
export function convertExport (data, outDir) {
  if (data === null || typeof data !== 'object') throw new Error('export payload is not an object')
  const sessions = Array.isArray(data.sessions) ? data.sessions : []
  fs.mkdirSync(outDir, { recursive: true })

  const used = new Set()
  const index = []
  const attachmentGroups = []
  let chars = 0
  let messages = 0
  let attachmentCount = 0
  let attachmentBytes = 0

  for (const entry of sessions) {
    const session = entry?.session ?? {}
    const title = String(session.title ?? '').trim() || '(无标题)'
    const id = String(session.id ?? '')
    const chatMessages = entry?.messages?.data?.biz_data?.chat_messages
    const list = Array.isArray(chatMessages) ? chatMessages : []
    messages += list.length

    const collected = []
    const body = list.map(message => renderMessage(message, collected)).filter(Boolean).join('\n---\n\n')
    if (collected.length > 0) {
      attachmentGroups.push({ title, id, updated: formatTimestamp(session.updated_at), rows: collected })
      attachmentCount += collected.length
      for (const row of collected) if (typeof row.bytes === 'number') attachmentBytes += row.bytes
    }

    const meta = [
      `- id: \`${id}\``,
      `- model: \`${session.model_type ?? 'default'}\``,
      `- updated: ${formatTimestamp(session.updated_at)}`,
      `- messages: ${list.length}`,
      ...(collected.length > 0 ? [`- attachments: ${collected.length}`] : []),
      `- exported: ${data.exportedAt ?? ''}`,
    ].join('\n')

    const markdown = `# ${title}\n\n${meta}\n\n---\n\n${body || '_（无消息内容）_'}\n`

    const base = sanitizeTitle(title, 'session')
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
      attachments: collected.length,
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
    `- 附件：${attachmentCount} 个引用，见 [附件清单.md](%E9%99%84%E4%BB%B6%E6%B8%85%E5%8D%95.md)`,
    `- 目录：\`${outDir}\``,
    '',
    '| 标题 | 消息数 | 附件 | 更新时间 | 文件 |',
    '| --- | --- | --- | --- | --- |',
    ...index.map(row => `| ${row.title.replace(/\|/g, '\\|')} | ${row.messages} | ${row.attachments} | ${formatTimestamp(row.updated_at)} | [${row.file}](${encodeURI(row.file)}) |`),
  ].join('\n')
  fs.writeFileSync(path.join(outDir, 'index.md'), `${header}\n`, 'utf8')

  if (attachmentGroups.length > 0) writeAttachmentInventory(outDir, attachmentGroups, attachmentBytes)

  return {
    sessions: index.length,
    files: index.length + 2 + (attachmentGroups.length > 0 ? 1 : 0),
    chars,
    messages,
    attachments: attachmentCount,
    index,
  }
}
