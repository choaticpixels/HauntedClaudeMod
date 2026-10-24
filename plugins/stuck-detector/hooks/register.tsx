import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Alert } from '../types'

const alert = atom({ plugin: 'stuck-detector', key: 'alert' } as const, null as Alert | null)

// Failures of the exact same call inside the window before each reaction.
const WARN_AT = 3
const NUDGE_AT = 5
const BLOCK_AT = 8
const SPIN_AT = 6 // the same call repeated this often (even succeeding) looks like spinning
const CHURN_AT = 6 // edits to one file inside the window
const SAME_ERROR_AT = 4 // different calls, same error
const WINDOW = 14
const BAND_MS = 30_000

type Entry = { sig: string; label: string; file?: string; failed: boolean; errKey: string }

const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7).toString(36)
const squash = (s: string) => s.trim().replace(/\s+/g, ' ')
const short = (s: string, n = 60) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)
const field = (e: object, key: string): string => {
  const v = (e as Record<string, unknown>)[key]
  return typeof v === 'string' ? v : ''
}

const signature = (e: { tool: string }): { sig: string; label: string; file?: string } => {
  const file = field(e, 'file_path') || field(e, 'path')
  switch (e.tool) {
    case 'Bash': {
      const c = squash(field(e, 'command'))
      return { sig: `Bash:${c}`, label: short(c) }
    }
    case 'Edit':
    case 'MultiEdit':
      return { sig: `Edit:${file}:${hash(field(e, 'old_string') + field(e, 'new_string'))}`, label: `Edit ${short(file.split(/[\\/]/).pop() ?? file, 40)}`, file }
    case 'Write':
      return { sig: `Write:${file}:${hash(field(e, 'content'))}`, label: `Write ${short(file.split(/[\\/]/).pop() ?? file, 40)}`, file }
    case 'Read':
      return { sig: `Read:${file}:${field(e, 'offset')}`, label: `Read ${short(file.split(/[\\/]/).pop() ?? file, 40)}`, file }
    default: {
      const { tool, tool_use_id, agentId, ...args } = e as Record<string, unknown>
      void tool_use_id
      void agentId
      return { sig: `${e.tool}:${hash(JSON.stringify(args))}`, label: e.tool }
    }
  }
}

// The same error from two different commands should look the same: strip numbers, paths and quotes.
const errorKey = (text: string) =>
  squash(text)
    .slice(0, 300)
    .toLowerCase()
    .replace(/[a-z]:[\\/][^\s'"]+|\/[^\s'"]+/g, '<path>')
    .replace(/\d+/g, '#')
    .slice(0, 120)

async function setAlert($: EngineInterface, level: Alert['level'], text: string) {
  const at = await $.clock.now()
  await update($, alert, () => ({ level, text, at }))
}

export const register: Register = on => {
  // History per agent: a subagent's loops are its own.
  const history = new Map<string, Entry[]>()
  const reacted = new Set<string>()
  let isOff = false

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'stuck', description: 'Stuck Detector: status | reset | off | on' })
    isOff = ((await $.store.get('off')) ?? false) === true
    return next(e)
  })

  // A new instruction from you is a fresh start.
  on('prompt.submit', async ($, e, next) => {
    history.clear()
    reacted.clear()
    await update($, alert, () => null)
    $.ui.status(undefined)
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    if (isOff) return next(e)
    const agent = (e as { agentId?: string }).agentId ?? 'main'
    const list = history.get(agent) ?? []
    const { sig, label, file } = signature(e)
    const recent = list.slice(-WINDOW)

    // Level 3: the exact same call has already failed too many times. Do not run it again.
    const failures = recent.filter(x => x.sig === sig && x.failed).length
    if (failures >= BLOCK_AT) {
      const text = `Stopped: "${label}" has failed ${failures} times in a row`
      await setAlert($, 3, text)
      $.ui.toast(`🛑 Stuck Detector ${text.toLowerCase()}. Claude was told to change approach.`, { timeoutMs: 9000 })
      return {
        deny:
          `Stuck Detector refused to run this again: the identical call (${label}) has already failed ${failures} times. Retrying will not help. ` +
          'Stop. Re-read the error output, say in one sentence what you think is actually wrong, then try something materially different: a different command, a different file, a smaller reproduction, or ask the user for help.',
      }
    }

    const ran = await next(e)
    if (ran.deny) return ran

    const failed = ran.isError === true
    const entry: Entry = { sig, label, file, failed, errKey: failed ? errorKey(ran.text ?? '') : '' }
    list.push(entry)
    history.set(agent, list.slice(-40))
    const win = list.slice(-WINDOW)

    const sameFails = win.filter(x => x.sig === sig && x.failed).length
    const sameCalls = win.filter(x => x.sig === sig).length
    const sameError = entry.errKey ? win.filter(x => x.failed && x.errKey === entry.errKey).length : 0
    const fileEdits = file && /^(Edit|MultiEdit|Write)$/.test(e.tool) ? win.filter(x => x.file === file && x.sig.match(/^(Edit|Write):/)).length : 0

    let level: Alert['level'] | 0 = 0
    let text = ''
    let nudge = ''

    if (sameFails >= NUDGE_AT) {
      level = 2
      text = `${label} failed ${sameFails}×`
      nudge = `The same call (${label}) has now failed ${sameFails} times. Do not run it again unchanged. Look at the actual error, state what you think the root cause is, and try a different approach (or ask the user).`
    } else if (sameFails >= WARN_AT) {
      level = 1
      text = `${label} failed ${sameFails}×`
    } else if (sameError >= SAME_ERROR_AT && sameFails < WARN_AT) {
      level = 2
      text = `same error ${sameError}× across different commands`
      nudge = `You have hit the same error ${sameError} times with different commands: "${short(entry.errKey, 100)}". Different variations of the same idea are not working. Step back, diagnose the underlying cause, and consider a different strategy.`
    } else if (sameCalls >= SPIN_AT) {
      level = 1
      text = `${label} repeated ${sameCalls}× (spinning?)`
    } else if (fileEdits >= CHURN_AT) {
      level = 1
      text = `${fileEdits} edits to ${label.replace(/^\w+ /, '')} in a short span (churn?)`
      nudge = `You have edited the same file ${fileEdits} times in a short span. Pause, re-read the file as it is now, and confirm your plan before making more edits.`
    }

    if (level > 0) {
      const key = `${agent}|${level}|${sig}|${Math.floor(Math.max(sameFails, sameCalls, sameError, fileEdits) / 2)}`
      if (!reacted.has(key)) {
        reacted.add(key)
        await setAlert($, level, text)
        $.ui.toast(`🔁 Stuck? ${text}`, { timeoutMs: level === 2 ? 8000 : 5000 })
        $.ui.status(`🔁 stuck: ${short(text, 40)}`)
        if (nudge) {
          const r = await $.session.append({ message: { type: 'user', content: [{ type: 'text', text: `[Stuck Detector] ${nudge}` }] }, agentId: agent === 'main' ? undefined : agent }).catch(() => undefined)
          void r
          await $.store.set('nudges', Number((await $.store.get('nudges')) ?? 0) + 1)
        }
      }
    } else if (!failed && sameFails === 0) {
      // A call that works again clears the warning.
      const a = await read($, alert)
      if (a) {
        await update($, alert, () => null)
        $.ui.status(undefined)
      }
    }

    return ran
  })

  on('command.run', { command: 'stuck' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg === 'off' || arg === 'on') {
      isOff = arg === 'off'
      await $.store.set('off', isOff)
      return { text: isOff ? '🔁 Stuck Detector is OFF.' : '🔁 Stuck Detector is ON.' }
    }
    if (arg === 'reset') {
      history.clear()
      reacted.clear()
      await update($, alert, () => null)
      $.ui.status(undefined)
      return { text: '🔁 History cleared.' }
    }
    const total = Number((await $.store.get('nudges')) ?? 0)
    const main = (history.get('main') ?? []).slice(-6)
    return {
      text:
        `🔁 Stuck Detector is ${isOff ? 'OFF' : 'ON'} · ${total} nudge${total === 1 ? '' : 's'} sent all time\n` +
        `Thresholds: warn ${WARN_AT}× · nudge ${NUDGE_AT}× · block ${BLOCK_AT}× the identical failing call\n` +
        (main.length ? `Recent calls:\n${main.map(x => `  ${x.failed ? '✗' : '✓'} ${x.label}`).join('\n')}` : 'No calls yet since your last prompt.') +
        '\n\n/stuck reset · off · on',
    }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const a = await read($, alert)
    if (!a) return next(e)
    const now = await $.clock.now()
    if (now - a.at > BAND_MS && a.level < 3) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    const color = a.level === 3 ? 'red' : a.level === 2 ? 'yellow' : 'cyan'
    const icon = a.level === 3 ? '🛑' : '🔁'
    return (
      <Box>
        <Text color={color} bold>{`${icon} Stuck Detector: ${a.text}`}</Text>
        <Text dimColor>{a.level === 3 ? '  · send a new prompt to continue' : a.level === 2 ? '  · Claude was nudged to change approach' : '  · watching'}</Text>
      </Box>
    )
  })
}
