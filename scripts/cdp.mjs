// Dev-only helper: drives/inspects the running Electron renderer over the
// Chrome DevTools Protocol instead of OS-level mouse automation (which is
// fragile across multi-monitor setups and steals the user's real cursor).
// Usage:
//   node scripts/cdp.mjs eval "document.querySelector('.new-script-btn').click()"
//   node scripts/cdp.mjs screenshot out.png
'use strict'

const PORT = 9222

async function findTarget() {
  const res = await fetch(`http://127.0.0.1:${PORT}/json`)
  const list = await res.json()
  return list.find((t) => t.type === 'page' && t.url.startsWith('http://localhost:5173'))
}

function connect(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl)
    ws.addEventListener('open', () => resolve(ws))
    ws.addEventListener('error', reject)
  })
}

let msgId = 1
function send(ws, method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = msgId++
    function onMsg(ev) {
      const data = JSON.parse(ev.data)
      if (data.id === id) {
        ws.removeEventListener('message', onMsg)
        if (data.error) reject(new Error(JSON.stringify(data.error)))
        else resolve(data.result)
      }
    }
    ws.addEventListener('message', onMsg)
    ws.send(JSON.stringify({ id, method, params }))
  })
}

async function main() {
  const [, , cmd, arg] = process.argv
  const target = await findTarget()
  if (!target) {
    console.error('No renderer target found on port', PORT)
    process.exit(1)
  }
  const ws = await connect(target.webSocketDebuggerUrl)

  if (cmd === 'eval') {
    const result = await send(ws, 'Runtime.evaluate', { expression: arg, returnByValue: true, awaitPromise: true })
    console.log(JSON.stringify(result, null, 2))
  } else if (cmd === 'screenshot') {
    await send(ws, 'Page.enable')
    const shot = await send(ws, 'Page.captureScreenshot', { format: 'png' })
    const fs = await import('fs')
    fs.writeFileSync(arg || 'screenshot.png', Buffer.from(shot.data, 'base64'))
    console.log('saved to', arg || 'screenshot.png')
  } else {
    console.error('Unknown command. Use "eval <expr>" or "screenshot <path>".')
  }
  ws.close()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
