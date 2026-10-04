import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Fx, Ghost, Whisper } from '../types'

type $ = EngineInterface

const PANE = 'haunted-graveyard'
const MAX_GHOSTS = 13

const ghosts = atom({ plugin: 'haunted-repo', key: 'ghosts' } as const, [] as Ghost[])
const frame = atom({ plugin: 'haunted-repo', key: 'frame' } as const, 0)
const whisper = atom({ plugin: 'haunted-repo', key: 'whisper' } as const, null as Whisper | null)
const ghostMode = atom({ plugin: 'haunted-repo', key: 'ghostMode' } as const, false)
const cat = atom({ plugin: 'haunted-repo', key: 'cat' } as const, -1)
const NO_FX: Fx = { poltergeistUntil: 0, bustedUntil: 0, trickUntil: 0, mirrorUntil: 0, danceUntil: 0, candlesUntil: 0 }
const fx = atom({ plugin: 'haunted-repo', key: 'fx' } as const, NO_FX)

// ───────────────────────── little helpers ─────────────────────────

const pick = <T,>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)]
const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7)
const norm = (p: string) => p.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '').toLowerCase()
const baseName = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '').split('/').pop() || p
const field = (e: unknown, key: string): string | undefined => {
  const v = (e as Record<string, unknown>)[key]
  return typeof v === 'string' ? v : undefined
}

const EPITAPHS = [
  'It compiled once.',
  'Gone, but not .gitignored.',
  'Worked on my machine.',
  'Deprecated too soon.',
  'Refactored into oblivion.',
  'So many TODOs left undone.',
  'Never got its unit tests.',
  'Killed by rm. Mourned by none.',
  'It was only 2 weeks from v1.0.',
  'Died as it lived: untyped.',
  'Its last words: "temporary fix".',
  'Here lies tech debt. Paid in full.',
  'Merged with the void.',
]

const MOANS = ['ooOOooo…', 'whoooo…', 'hhhhhhh…', '…why…', 'mmmmMMMmm…', '…remember me…']

const TREATS = [
  '🍬 A semicolon. Every dev needs one.',
  '🍫 A green CI badge (expires in 5 minutes).',
  '🍭 A null check you forgot to write. Free of charge.',
  '🍪 A cookie. GDPR-compliant.',
  '🎃 One (1) mass-assigned "LGTM".',
  '🍬 git stash pop, but it actually works this time.',
]

const NAMES_OF_THE_HORDE = ['LEGION', 'THE NAMELESS HORDE', 'THE MANY', 'THE SWARM']

// Zalgo: the voice of the poltergeist.
const ZALGO = ['̀', '́', '̴', '̵', '̶', '̷', '̸', '͆', '͊', '͒', '͗', '͛']
const zalgo = (s: string, n = 2) => [...s].map(c => (c === ' ' ? c : c + Array.from({ length: n }, () => pick(ZALGO)).join(''))).join('')

// Upside-down text for the "trick".
const FLIP: Record<string, string> = {
  a: 'ɐ', b: 'q', c: 'ɔ', d: 'p', e: 'ǝ', f: 'ɟ', g: 'ƃ', h: 'ɥ', i: 'ᴉ', j: 'ɾ', k: 'ʞ', l: 'ʃ', m: 'ɯ', n: 'u', o: 'o',
  p: 'd', q: 'b', r: 'ɹ', s: 's', t: 'ʇ', u: 'n', v: 'ʌ', w: 'ʍ', x: 'x', y: 'ʎ', z: 'z', '.': '˙', ',': "'", '?': '¿',
  '!': '¡', '"': ',,', "'": ',', '(': ')', ')': '(', '[': ']', ']': '[', '{': '}', '}': '{', '<': '>', '>': '<', _: '‾',
}
const flip = (s: string) => [...s.toLowerCase()].map(c => FLIP[c] ?? c).reverse().join('')

// A ghost fades as it whispers; its words fade with it.
const strength = (g: Ghost) => (g.isBound ? 1 : Math.max(0, 1 - g.whispers / 40))
const fade = (s: string, st: number) => [...s].map(c => (c !== ' ' && Math.random() > st + 0.15 ? '·' : c)).join('')

const timeOf = async ($: $) => {
  const now = await $.clock.now()
  const d = new Date(now)
  return {
    now,
    isWitching: d.getHours() === 3,
    isMidnight: d.getHours() === 0 && d.getMinutes() === 0,
    isHalloween: d.getMonth() === 9 && d.getDate() === 31,
    isFriday13: d.getDay() === 5 && d.getDate() === 13,
    day: d.toDateString(),
  }
}

// ───────────────────────── the graveyard ─────────────────────────

const setGhosts = async ($: $, fn: (list: Ghost[]) => Ghost[]) => {
  const list = await update($, ghosts, fn)
  await $.store.set('graveyard', await read($, ghosts))
  return list
}

const setFx = ($: $, patch: Partial<Fx>) => update($, fx, f => ({ ...NO_FX, ...f, ...patch }))

const fragmentsOf = (text: string) =>
  text
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l.length > 3 && l.length < 90 && !/^[{}()[\];,]+$/.test(l))
    .slice(0, 60)

const summon = async ($: $, ghost: Omit<Ghost, 'id' | 'diedAt' | 'whispers' | 'isBound'>) => {
  const { now } = await timeOf($)
  const full: Ghost = { ...ghost, id: `${now}-${Math.floor(Math.random() * 1e6)}`, diedAt: now, whispers: 0, isBound: false }
  const before = (await read($, ghosts)).length
  await setGhosts($, list => [...list.filter(g => norm(g.path) !== norm(ghost.path)), full].slice(-MAX_GHOSTS))

  if (/ghost|haunt|spook/i.test(ghost.name)) {
    $.ui.toast(`👻 You cannot kill what is already dead. ${ghost.name} laughs at you.`, { timeoutMs: 6000 })
  } else if (ghost.kind === 'legion') {
    $.ui.toast(`👻👻👻 "My name is ${ghost.name}, for we are many." A horde rises from ${ghost.path}`, { timeoutMs: 7000 })
  } else if (ghost.lines.some(l => /TODO|FIXME|HACK/.test(l))) {
    $.ui.toast(`👻 ${ghost.name} died with unfinished business (TODOs). It will not rest easy.`, { timeoutMs: 6000 })
  } else {
    $.ui.toast(`👻 The ghost of ${ghost.name} rises… ${pick(MOANS)}`, { timeoutMs: 5000 })
  }

  if (before + 1 === MAX_GHOSTS) {
    $.ui.toast('🕯️ THIRTEEN GHOSTS. The circle is complete. Something old is watching.', { timeoutMs: 9000 })
  }
}

const layToRest = async ($: $, g: Ghost, how: string) => {
  await setGhosts($, list => list.filter(x => x.id !== g.id))
  const rested = Number((await $.store.get('laidToRest')) ?? 0) + 1
  await $.store.set('laidToRest', rested)
  $.ui.toast(`✨ ${g.name} ${how}. It is at peace. (${rested} souls freed)`, { timeoutMs: 6000 })
}

const whisperNow = async ($: $, ghostId?: string, override?: string) => {
  const list = await read($, ghosts)
  if (list.length === 0) return
  const { now } = await timeOf($)
  const g = (ghostId && list.find(x => x.id === ghostId)) || pick(list)
  const todo = g.lines.filter(l => /TODO|FIXME|HACK/.test(l))
  const line = override ?? (todo.length && Math.random() < 0.5 ? `${pick(todo)}  …from beyond` : g.lines.length ? pick(g.lines) : pick(MOANS))
  await update($, whisper, () => ({ ghostId: g.id, name: g.name, text: line, at: now }))
  if (!override) {
    const faded = (await setGhosts($, all => all.map(x => (x.id === g.id ? { ...x, whispers: x.whispers + 1 } : x)))).find(x => x.id === g.id)
    if (faded && strength(faded) === 0) {
      await setGhosts($, all => all.filter(x => x.id !== g.id))
      $.ui.toast(`🌫️ The ghost of ${g.name} has whispered its last, and fades into the ether…`, { timeoutMs: 6000 })
    }
  }
}

// ───────────────────────── reading shell commands ─────────────────────────

const tokens = (seg: string) => (seg.match(/"[^"]*"|'[^']*'|\S+/g) ?? []).map(t => t.replace(/^["']|["']$/g, ''))

/** The paths a command deletes: rm, git rm, del, rmdir, Remove-Item, unlink. */
const victimsOf = (command: string) => {
  const out: string[] = []
  for (const seg of command.split(/&&|\|\||;|\|/)) {
    const t = tokens(seg.trim())
    let args: string[] | undefined
    const head = (t[0] ?? '').toLowerCase()
    if (['rm', 'del', 'erase', 'rmdir', 'rd', 'unlink', 'remove-item', 'ri'].includes(head)) args = t.slice(1)
    else if (head === 'git' && t[1] === 'rm') args = t.slice(2)
    if (!args) continue
    for (const a of args) if (!a.startsWith('-') && a !== '--') out.push(a)
  }
  return out
}

// ───────────────────────── the hooks ─────────────────────────

export const register: Register = on => {
  let toolCount = 0

  on('session.start', async ($, e, next) => {
    for (const [name, description] of [
      ['graveyard', 'Visit the graveyard of files you have deleted'],
      ['seance', 'Hold a seance and speak with a ghost: /seance [ghost] [question]'],
      ['exorcise', 'Banish a ghost (or "all"). Some refuse to go.'],
      ['haunt-demo', 'Summon three demo ghosts to see the haunting (no files are touched)'],
    ] as const) {
      await $.command.register({ name, description })
    }

    // Ghosts follow you between sessions.
    const saved = ((await $.store.get('graveyard')) ?? []) as Ghost[]
    if ((await read($, ghosts)).length === 0 && saved.length > 0) {
      await update($, ghosts, () => saved)
      $.ui.toast(`👻 ${saved.length} ghost${saved.length === 1 ? '' : 's'} followed you here from another session…`, { timeoutMs: 6000 })
    }

    const t = await timeOf($)
    if (t.isHalloween) $.ui.toast('🎃 Happy Halloween. The veil is thin tonight: ghosts whisper three times as often.', { timeoutMs: 8000 })
    if (t.isFriday13) $.ui.toast('🐈‍⬛ Friday the 13th. Mind the black cats.', { timeoutMs: 6000 })

    // The heartbeat of the haunting: animate, whisper, toll.
    let ticks = 0
    $.clock.every(450, () => {
      void (async () => {
        ticks++
        const list = await read($, ghosts)
        const f = await read($, fx)
        const time = await timeOf($)
        const isActive = list.length > 0 || Object.values(f).some(until => until > time.now) || time.isHalloween
        if (isActive) await update($, frame, n => n + 1)

        const every = time.isWitching ? 11 : time.isHalloween ? 15 : 40 // ticks between whispers
        if (list.length > 0 && f.bustedUntil < time.now && ticks % every === 0) await whisperNow($)

        if (time.isMidnight && (await $.store.get('tolled')) !== time.day) {
          await $.store.set('tolled', time.day)
          $.ui.toast('🔔 DONG… DONG… DONG… The clock strikes twelve. The dead grow restless.', { timeoutMs: 9000 })
        }
      })()
    })

    return next(e)
  })

  // ── Easter eggs hidden in what you type ──
  on('prompt.submit', async ($, e, next) => {
    const text = e.text.trim().toLowerCase()
    const { now } = await timeOf($)
    const list = await read($, ghosts)

    if (text === 'boo' || text === 'boo!') {
      $.ui.toast(list.length ? `👻 AAAAAH! …oh. It's just you. ${list.length} ghost${list.length > 1 ? 's' : ''} hide behind the README.` : '👻 Nobody here to scare. Yet.')
    } else if (/who (ya|you) gonna call/.test(text)) {
      await setFx($, { bustedUntil: now + 60_000 })
      $.ui.toast('🚫👻 GHOSTBUSTERS! The ghosts flee for 60 seconds. They will be back.', { timeoutMs: 6000 })
    } else if (/bloody mary/.test(text)) {
      const n = Number((await $.store.get('bloodyMary')) ?? 0) + 1
      await $.store.set('bloodyMary', n % 3)
      if (n % 3 === 0) {
        await setFx($, { mirrorUntil: now + 20_000 })
        $.ui.toast('🪞 …', { timeoutMs: 3000 })
      } else {
        $.ui.toast(n % 3 === 1 ? '🪞 The mirror fogs over.' : '🪞 Something moves in the mirror. Once more and…', { timeoutMs: 4000 })
      }
    } else if (/trick or treat/.test(text)) {
      if (Math.random() < 0.5) $.ui.toast(`TREAT! ${pick(TREATS)}`, { timeoutMs: 6000 })
      else {
        await setFx($, { trickUntil: now + 30_000 })
        $.ui.toast(flip('TRICK! Your band is haunted for 30 seconds.'), { timeoutMs: 6000 })
      }
    } else if (/2spooky|spooky scary skeleton|spooky/.test(text)) {
      await setFx($, { danceUntil: now + 12_000 })
    } else if (text === 'f') {
      await setFx($, { candlesUntil: now + 15_000 })
      $.ui.toast(`🕯️ You pay your respects. A candle is lit for ${list.length || 'every'} lost file${list.length === 1 ? '' : 's'}.`)
    } else if (text === 'up up down down left right left right b a') {
      const isOn = await update($, ghostMode, v => !v)
      void isOn
      $.ui.toast((await read($, ghostMode)) ? '👻 GHOST MODE: the dead now narrate every tool call.' : '👻 Ghost mode off. The dead fall silent.', { timeoutMs: 6000 })
    }

    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    toolCount++
    const command = field(e, 'command')
    const victims = command ? victimsOf(command) : []
    const filePath = field(e, 'file_path')

    // Ghost mode: the dead comment on the living.
    if (await read($, ghostMode)) {
      const list = await read($, ghosts)
      if (list.length) {
        const g = pick(list)
        const what = filePath ? baseName(filePath) : command ? command.slice(0, 40) : e.tool
        await whisperNow($, g.id, pick([`${e.tool}ing ${what}… I remember when I was ${e.tool}ed…`, `${what}? ${pick(MOANS)} it won't save you…`, `I too was once ${what}…`, `careful with ${what}… that's how I died…`]))
      }
    }

    // Look at what is about to die, while it still lives.
    const doomed: { path: string; kind: Ghost['kind']; lines: string[]; lineCount: number }[] = []
    for (const p of victims) {
      if (p.includes('*')) {
        doomed.push({ path: p, kind: 'legion', lines: [`we were ${p}`, 'we were many', 'we are many still'], lineCount: 0 })
        continue
      }
      const stat = await $.fs.stat(p).catch(() => undefined)
      if (!stat) continue
      if (stat.kind === 'dir') {
        const entries = await $.fs.list(p).catch(() => [])
        doomed.push({ path: p, kind: 'legion', lines: entries.slice(0, 40).map(x => `I was ${x.name}`), lineCount: entries.length })
      } else if (stat.kind === 'file') {
        const text = stat.size < 1_000_000 ? await $.fs.read(p).catch(() => '') : ''
        doomed.push({ path: p, kind: 'file', lines: fragmentsOf(text), lineCount: text.split(/\n/).length })
      }
    }

    // A Write that empties a file kills it as surely as rm.
    if (e.tool === 'Write' && filePath && (field(e, 'content') ?? '').trim() === '') {
      const text = await $.fs.read(filePath).catch(() => '')
      if (text.trim()) doomed.push({ path: filePath, kind: 'file', lines: fragmentsOf(text), lineCount: text.split(/\n/).length })
    }

    const ran = await next(e)
    if (ran.deny || ran.isError) return ran

    for (const d of doomed) {
      const isGone = d.path.includes('*') || !(await $.fs.exists(d.path).catch(() => true)) || e.tool === 'Write'
      if (!isGone) continue
      const name = d.kind === 'legion' ? (/node_modules/.test(d.path) ? 'LEGION' : pick(NAMES_OF_THE_HORDE)) : baseName(d.path)
      await summon($, { path: d.path, name, kind: d.kind, lines: d.lines, lineCount: d.lineCount })
    }

    // An Edit that cuts away a lot of code leaves a wisp behind.
    if (e.tool === 'Edit' && filePath) {
      const oldS = field(e, 'old_string') ?? ''
      const newS = field(e, 'new_string') ?? ''
      const lost = oldS.split(/\n/).length - newS.split(/\n/).length
      if (lost >= 10) {
        await summon($, { path: `${filePath}#wisp`, name: `wisp of ${baseName(filePath)}`, kind: 'wisp', lines: fragmentsOf(oldS), lineCount: lost })
      }
    }

    if (command) {
      const { now } = await timeOf($)
      if (/git\s+push\b.*(--force\b|\s-f\b|--force-with-lease)/.test(command)) {
        await setFx($, { poltergeistUntil: now + 30_000 })
        $.ui.toast(zalgo('⚡ YOU HAVE AWAKENED THE POLTERGEIST', 1), { timeoutMs: 8000 })
      } else if (/git\s+commit\b.*-m\s*["'][^"']*\bfix/i.test(command)) {
        await whisperNow($, undefined, 'the bug… will… return…')
      } else if (/git\s+reset\s+--hard/.test(command)) {
        $.ui.toast('👻 git reset --hard… so many commits, lost to the dark. You hear distant screaming.', { timeoutMs: 6000 })
      }
    }

    // Every 13th tool call, a black cat crosses your status line.
    if (toolCount % 13 === 0) {
      const steps = 24
      for (let i = 0; i <= steps; i++) {
        $.clock.after(i * 180, () => {
          void update($, cat, () => (i === steps ? -1 : i / steps))
          $.ui.status(i === steps ? undefined : `${' '.repeat(Math.round((steps - i) * 1.5))}🐈‍⬛${i % 2 ? ' ' : '·'}`)
        })
      }
    }

    return ran
  })

  // A ghost whose file returns is at peace.
  on('turn.complete', async ($, e, next) => {
    for (const g of await read($, ghosts)) {
      if (g.kind === 'file' && (await $.fs.exists(g.path).catch(() => false))) await layToRest($, g, 'has been restored to the living')
    }
    return next(e)
  })

  // ── Commands ──
  on('command.run', { command: 'graveyard' }, async $ => {
    await $.ui.open({ id: PANE, title: '⚰️ Graveyard' })
    const n = (await read($, ghosts)).length
    return { text: n ? `You enter the graveyard. ${n} restless soul${n > 1 ? 's' : ''} stir.` : 'The graveyard is quiet. Suspiciously quiet.' }
  })

  // A haunting on demand: three ghosts of files that never existed, so no real file is touched.
  on('command.run', { command: 'haunt-demo' }, async $ => {
    await summon($, {
      path: '.haunted-demo/legacy_auth.js',
      name: 'legacy_auth.js',
      kind: 'file',
      lineCount: 666,
      lines: [
        '// TODO: replace md5 with something real (2014)',
        'const ADMIN_PASSWORD = "hunter2" // FIXME',
        'if (user.name === "admin") return true',
        'function checkPassword(pw) { return pw.length > 3 }',
        '// HACK: do not touch. nobody knows why this works',
        'catch (e) { /* the void accepts all */ }',
      ],
    })
    await summon($, {
      path: '.haunted-demo/node_modules',
      name: 'LEGION',
      kind: 'legion',
      lineCount: 48213,
      lines: ['I was left-pad', 'I was is-odd', 'I was is-even, who depended on is-odd', 'we were 48,213', 'we are many still'],
    })
    await summon($, {
      path: '.haunted-demo/utils.ts#wisp',
      name: 'wisp of utils.ts',
      kind: 'wisp',
      lineCount: 42,
      lines: ['export const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))', 'any as unknown as any', '// temporary fix, remove before launch'],
    })
    await whisperNow($)
    await $.ui.open({ id: PANE, title: '⚰️ Graveyard' })
    return {
      text:
        '👻 Three demo ghosts rise from files that never existed. Watch the band above your prompt; they whisper every ~18s.\n' +
        'Try: /seance legacy_auth.js what is your darkest secret?  ·  boo  ·  who you gonna call  ·  /exorcise all',
    }
  })

  on('command.run', { command: 'exorcise' }, async ($, e) => {
    const list = await read($, ghosts)
    const arg = e.args.trim().toLowerCase()
    const targets = arg === 'all' ? list : list.filter(g => !arg || g.name.toLowerCase().includes(arg)).slice(-1)
    if (targets.length === 0) return { text: list.length ? `No ghost answers to "${arg}".` : 'There is nothing here to exorcise… for now.' }

    const out: string[] = []
    for (const g of targets) {
      if (g.isBound) out.push(`⛓️ ${g.name} is bound to this repo. Only restoring its file will free it.`)
      else if (Math.random() < 1 / 6) {
        await setGhosts($, all => all.map(x => (x.id === g.id ? { ...x, isBound: true, whispers: 0 } : x)))
        out.push(`😈 ${g.name} REFUSES TO LEAVE. It binds itself to your repo, stronger than before.`)
      } else {
        await setGhosts($, all => all.filter(x => x.id !== g.id))
        out.push(`✝️ ${g.name} is cast out. ${pick(['It shrieks and is gone.', 'The temperature returns to normal.', 'The lights stop flickering.', 'A cold wind, then nothing.'])}`)
      }
    }
    return { text: out.join('\n') }
  })

  on('command.run', { command: 'seance' }, async ($, e) => {
    const list = await read($, ghosts)
    if (list.length === 0) return { text: '🕯️ You light the candles and join hands… but no spirits answer. Delete something first.' }

    const words = e.args.trim()
    const g = list.find(x => words.toLowerCase().startsWith(x.name.toLowerCase())) ?? list.find(x => words.toLowerCase().includes(x.name.toLowerCase())) ?? list[list.length - 1]
    const question = words.slice(words.toLowerCase().startsWith(g.name.toLowerCase()) ? g.name.length : 0).trim() || 'Who are you, and how did you die?'
    const { now } = await timeOf($)
    const days = Math.max(0, Math.round((now - g.diedAt) / 86_400_000))

    const r = await $.model.complete({
      model: 'haiku',
      maxTokens: 300,
      timeoutMs: 20_000,
      system:
        'You are the ghost of a deleted source file, speaking at a seance. Speak in a spooky, theatrical, darkly funny voice, ' +
        'but stay grounded in your actual code: reference real identifiers, comments and TODOs from the fragments you are given. ' +
        `You were ${g.kind === 'legion' ? 'a whole directory, a horde of files speaking as one' : g.kind === 'wisp' ? 'a block of code cut out during an edit' : 'a whole file'}. ` +
        'Answer the living in 2 to 4 short sentences. Use ellipses. Never break character. No markdown headings.',
      prompt: `You were: ${g.path} (${g.lineCount} lines), deleted ${days === 0 ? 'today' : `${days} days ago`}.${g.isBound ? ' You are bound to this repo and furious about it.' : ''}\n` +
        `Fragments of your code:\n${g.lines.slice(0, 30).join('\n') || '(nothing remains but silence)'}\n\nThe living ask: ${question}`,
    })

    await whisperNow($, g.id, '…the veil parts…')
    return { text: r.isAnswered ? `🕯️ The candles flicker. The ghost of ${g.name} speaks:\n\n${r.text.trim()}` : `🕯️ The candles gutter out. The spirit of ${g.name} could not reach you (${r.reason}).` }
  })

  // ── The band above the prompt: the haunting itself ──
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const list = await read($, ghosts)
    const f = await read($, fx)
    const w = await read($, whisper)
    const t = await read($, frame)
    const time = await timeOf($)
    const now = time.now

    const isPolter = f.poltergeistUntil > now
    const isBusted = f.bustedUntil > now
    const isTrick = f.trickUntil > now
    const isMirror = f.mirrorUntil > now
    const isDance = f.danceUntil > now
    const isCandles = f.candlesUntil > now
    if (list.length === 0 && !isPolter && !isMirror && !isDance && !isCandles && !time.isHalloween) return next(e)

    const { Box, Text } = $.ui.resolve(e)
    const width = Math.max(30, (e.props.bodyColumns ?? 80) - 2)
    const out = (s: string) => (isTrick ? flip(s) : isPolter ? zalgo(s, 1) : s)

    if (isMirror) {
      return (
        <Box flexDirection="column">
          <Text color="red" bold>{'  🪞  ' + '░'.repeat(Math.min(40, width - 8))}</Text>
          <Text color="red">{t % 4 < 2 ? '      she is behind you.' : '      d o n ’ t   t u r n   a r o u n d'}</Text>
        </Box>
      )
    }

    if (isDance) {
      const moves = ['┌(・。・)┘♪', '└(・。・)┐♪', '┌(・o・)┘♫', '└(・o・)┐♫']
      return (
        <Box>
          <Text color="white" bold>{`💀 ${moves[t % 4]}  spooky scary skeletons send shivers down your spine  ${moves[(t + 2) % 4]} 💀`}</Text>
        </Box>
      )
    }

    if (isCandles) {
      const flame = t % 2 ? '🕯️' : '🕯'
      return (
        <Box>
          <Text color="yellow">{`  ${Array.from({ length: Math.max(1, Math.min(list.length || 3, 13)) }, () => flame).join(' ')}   rest in peace`}</Text>
        </Box>
      )
    }

    // The drifting procession: each ghost floats along its own sine wave.
    const track = Math.max(10, Math.min(width - 24, 70))
    const row = Array.from({ length: track }, () => ' ')
    if (!isBusted) {
      list.slice(-6).forEach((g, i) => {
        const phase = (hash(g.id) % 100) / 15
        const x = Math.round(((Math.sin(t / (9 + i * 2) + phase) + 1) / 2) * (track - 2))
        row[Math.min(track - 1, x)] = g.isBound ? '⛓' : g.kind === 'legion' ? '👥' : g.kind === 'wisp' ? '∿' : '👻'
      })
    }
    const pumpkins = time.isHalloween ? (t % 6 < 3 ? '🎃 ' : '🎃 ') : ''
    const header = isBusted
      ? '🚫👻  the ghosts are hiding…'
      : isPolter
        ? `⚡ ${row.join('').replace(/ /g, () => pick([' ', ' ', ' ', '░', '▒']))} ⚡`
        : `${pumpkins}${row.join('')}`
    const count = list.length
    const tag = count === 0 ? (time.isHalloween ? '🎃 happy halloween' : '') : `⚰ ${count}${count >= MAX_GHOSTS ? ' 🕯️ THE CIRCLE IS COMPLETE' : ''}${time.isWitching ? ' · witching hour' : ''}`

    const g = w ? list.find(x => x.id === w.ghostId) : undefined
    const isFresh = w !== null && now - w.at < 9_000 && !isBusted
    const st = g ? strength(g) : 1
    const whisperText = isFresh && w ? `“${fade(w.text, st).slice(0, Math.max(10, width - w.name.length - 12))}” — ${w.name}` : ''

    return (
      <Box flexDirection="column">
        <Box>
          <Text color={isPolter ? 'red' : time.isWitching ? 'magenta' : 'gray'}>{out(header)}</Text>
          <Text dimColor>{'  ' + out(tag)}</Text>
        </Box>
        {whisperText !== '' && (
          <Text italic dimColor={st < 0.5} color={st < 0.25 ? 'gray' : 'cyan'}>
            {'  ' + out(whisperText)}
          </Text>
        )}
      </Box>
    )
  })

  // ── The graveyard pane ──
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const list = await read($, ghosts)
    const rested = Number((await $.store.get('laidToRest')) ?? 0)
    const cols = Math.max(1, Math.floor(((e.props.bodyColumns as number | undefined) ?? 40) / 20))

    const stone = (g: Ghost) => {
      const center = (s: string) => {
        const cut = s.length > 15 ? s.slice(0, 14) + '…' : s
        const pad = 15 - cut.length
        return '│' + ' '.repeat(Math.floor(pad / 2)) + cut + ' '.repeat(Math.ceil(pad / 2)) + '│'
      }
      const d = new Date(g.diedAt)
      const epitaph = EPITAPHS[hash(g.id) % EPITAPHS.length]
      return [
        '  ╭─────────────╮ ',
        center(g.isBound ? '⛓ R.I.P. ⛓' : 'R . I . P .'),
        center(g.name),
        center(g.kind === 'legion' ? `${g.lineCount} souls` : `${g.lineCount} lines`),
        center(`${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`),
        center(epitaph.slice(0, 15)),
        '▁▁│▁▁▁▁▁▁▁▁▁▁▁▁▁│▁▁',
      ]
    }

    const rows: Ghost[][] = []
    for (let i = 0; i < list.length; i += cols) rows.push(list.slice(i, i + cols))

    return (
      <Box flexDirection="column">
        <Text color="magenta" bold>⚰️  {list.length} restless · ✨ {rested} at peace</Text>
        <Text dimColor>Restore a file to free its ghost · /seance to speak · /exorcise to banish</Text>
        <Text> </Text>
        {list.length === 0 && <Text dimColor>Only fog, and the soft sound of a cursor blinking.</Text>}
        {rows.map((r, ri) => (
          <Box key={`row-${ri}`} flexDirection="row">
            {r.map(g => (
              <Box key={g.id} flexDirection="column" marginRight={1}>
                {stone(g).map((line, li) => (
                  <Text key={`${g.id}-${li}`} color={li === 0 || li === 6 ? 'gray' : g.isBound ? 'red' : 'white'}>{line}</Text>
                ))}
              </Box>
            ))}
          </Box>
        ))}
      </Box>
    )
  })
}
