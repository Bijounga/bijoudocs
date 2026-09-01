import { stripHtmlToText } from './html.js'

// Word-level LCS diff, used to compare two checkpoint snapshots.
export function diffWords(oldText, newText) {
  const a = oldText.split(/(\s+)/).filter((t) => t.length)
  const b = newText.split(/(\s+)/).filter((t) => t.length)
  const n = a.length
  const m = b.length
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }
  let i = 0
  let j = 0
  const out = []
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ type: 'same', text: a[i] })
      i++
      j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push({ type: 'del', text: a[i] })
      i++
    } else {
      out.push({ type: 'add', text: b[j] })
      j++
    }
  }
  while (i < n) {
    out.push({ type: 'del', text: a[i] })
    i++
  }
  while (j < m) {
    out.push({ type: 'add', text: b[j] })
    j++
  }
  return out
}

export function flattenText(sections) {
  return sections
    .map((s) => s.heading + '\n' + s.lines.map((l) => stripHtmlToText(l.text)).join('\n'))
    .join('\n\n')
}
