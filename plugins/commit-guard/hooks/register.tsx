import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Finding, Report } from '../types'

type $ = EngineInterface

const last = atom({ plugin: 'commit-guard', key: 'last' } as const, null as Report | null)
const allowOnce = atom({ plugin: 'commit-guard', key: 'allowOnce' } as const, false)

const BAND_MS = 25_000
const WARN_BYTES = 5 * 1024 * 1024
const BLOCK_BYTES = 95 * 1024 * 1024 // GitHub refuses pushes over 100 MB
const MAX_UNTRACKED_READ = 1024 * 1024

// `strict` rules are never waved through as placeholders: a real-looking key is a real key.
const SECRET_RULES: { name: string; re: RegExp; strict?: boolean }[] = [
  { name: 'AWS access key', re: /\bAKIA[0-9A-Z]{16}\b/, strict: true },
  { name: 'GitHub token', re: /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{50,})\b/, strict: true },
  { name: 'Anthropic API key', re: /\bsk-ant-[A-Za-z0-9_-]{20,}/, strict: true },
  { name: 'OpenAI-style API key', re: /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}/, strict: true },
  { name: 'Stripe live key', re: /\b[sr]k_live_[A-Za-z0-9]{16,}/, strict: true },
  { name: 'Slack token', re: /\bxox[abprs]-[A-Za-z0-9-]{10,}/, strict: true },
  { name: 'Google API key', re: /\bAIza[0-9A-Za-z_-]{35}\b/, strict: true },
  { name: 'Private key block', re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY(?: BLOCK)?-----/, strict: true },
  { name: 'JSON Web Token', re: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/ },
  { name: 'Crypto private key (hex)', re: /(?:private[_-]?key|priv[_-]?key|secret[_-]?key|wallet[_-]?key|signer[_-]?key)\w*\s*[:=]\s*['"]?(?:0x)?[0-9a-fA-F]{64}\b/i, strict: true },
  { name: 'Crypto private key (base58)', re: /(?:private[_-]?key|secret[_-]?key|keypair|wallet[_-]?key)\w*\s*[:=]\s*['"][1-9A-HJ-NP-Za-km-z]{80,90}['"]/i, strict: true },
  { name: 'Seed phrase', re: /(?:mnemonic|seed[_-]?phrase|recovery[_-]?phrase)\w*\s*[:=]\s*['"](?:[a-z]+\s){11,23}[a-z]+['"]/i, strict: true },
  { name: 'Database URL with password', re: /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|amqps?):\/\/[^\s:@/'"]+:[^\s@/'"]{3,}@/i },
  { name: 'Hardcoded credential', re: /(?:api[_-]?key|secret|token|passw(?:or)?d|auth)\w*\s*[:=]\s*['"][A-Za-z0-9/+_\-=.]{16,}['"]/i },
]

const PLACEHOLDER = /example|placeholder|your[_-]|<[a-z_ -]+>|x{6,}|\*{4,}|dummy|changeme|fake|sample|test[_-]?(?:key|token|secret)|\$\{|process\.env|os\.environ|getenv|env\(/i

const FILE_RULES: { re: RegExp; detail: string; severity: 'block' | 'warn' }[] = [
  { re: /(^|\/)\.env(\.(?!example$|sample$|template$|dist$)[\w.-]+)?$/i, detail: 'environment file (usually holds secrets)', severity: 'block' },
  { re: /\.(pem|key|p12|pfx|jks|keystore|ppk)$/i, detail: 'key or certificate file', severity: 'block' },
  { re: /(^|\/)id_(rsa|dsa|ecdsa|ed25519)$/, detail: 'SSH private key', severity: 'block' },
  { re: /(^|\/)(wallet|keystore|keypair|phantom)[\w.-]*\.json$/i, detail: 'crypto wallet / keypair file', severity: 'block' },
  { re: /(^|\/)(credentials|secrets?)\.(json|ya?ml|toml|ini)$/i, detail: 'credentials file', severity: 'block' },
  { re: /(^|\/)\.(npmrc|pypirc|netrc|git-credentials|pgpass)$/, detail: 'tool credentials file', severity: 'block' },
  { re: /(^|\/)node_modules\//, detail: 'node_modules should never be committed', severity: 'block' },
  { re: /(^|\/)(\.venv|venv|__pycache__)\//, detail: 'python environment / cache', severity: 'block' },
  { re: /\.(sqlite3?|db|sql\.gz|dump)$/i, detail: 'database file (may hold real data)', severity: 'warn' },
]

const mask = (s: string) => (s.length <= 8 ? '•'.repeat(s.length) : `${s.slice(0, 4)}…(${s.length} chars)`)

// ───────────────────────── reading the command ─────────────────────────

const tokens = (seg: string) => (seg.match(/"[^"]*"|'[^']*'|\S+/g) ?? []).map(t => t.replace(/^["']|["']$/g, ''))

type Plan = { allTracked: boolean; cwd?: string; push: boolean; hasAdd: boolean; commit: boolean }

const plan = (command: string): Plan | null => {
  const p: Plan = { allTracked: false, push: false, hasAdd: false, commit: false }
  let cwd: string | undefined
  for (const seg of command.split(/&&|\|\||;|\n/)) {
    const t = tokens(seg.trim())
    while (t.length && /^\w+=/.test(t[0])) t.shift()
    if (t[0] === 'cd' && t[1] && t[1] !== '-') cwd = t[1]
    if (t[0] !== 'git') continue
    let i = 1
    let gitDir: string | undefined
    while (i < t.length && t[i].startsWith('-')) {
      if (t[i] === '-C' && t[i + 1]) gitDir = t[i + 1]
      i += t[i] === '-C' || t[i] === '-c' ? 2 : 1
    }
    const verb = t[i]
    const rest = t.slice(i + 1)
    if (gitDir) cwd = gitDir
    if (verb === 'add') p.hasAdd = true
    if (verb === 'commit') {
      p.commit = true
      if (rest.some(a => a === '--all' || /^-[a-zA-Z]*a[a-zA-Z]*$/.test(a))) p.allTracked = true
    }
    if (verb === 'push' && !rest.includes('--dry-run')) p.push = true
  }
  p.cwd = cwd
  return p.commit || p.push ? p : null
}

// ───────────────────────── scanning ─────────────────────────

const git = async ($: $, cwd: string | undefined, args: string[]) => {
  const r = await $.process.run(['git', ...args], { cwd, timeoutMs: 20_000 }).catch(() => undefined)
  return r && r.exitCode === 0 ? r.stdout : ''
}

const isIgnored = (path: string, ignores: string[]) => ignores.some(i => path.includes(i))

const scanLine = (file: string, line: number, text: string, ignores: string[], out: Finding[]) => {
  if (!file || file === '/dev/null' || isIgnored(file, ignores) || text.length > 4000 || /commit-guard:ignore/.test(text)) return
  for (const rule of SECRET_RULES) {
    const m = rule.re.exec(text)
    if (!m) continue
    if (!rule.strict && PLACEHOLDER.test(text)) continue
    out.push({ kind: 'secret', severity: 'block', where: `${file}:${line}`, detail: `${rule.name} ${mask(m[0].replace(/^.*?[:=]\s*['"]?/, ''))}` })
    return
  }
}

const scanDiff = (diff: string, ignores: string[], out: Finding[]) => {
  let file = ''
  let line = 0
  for (const raw of diff.split('\n')) {
    if (raw.startsWith('+++ ')) {
      file = raw.slice(4).replace(/^b\//, '')
      continue
    }
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)/.exec(raw)
    if (hunk) {
      line = Number(hunk[1])
      continue
    }
    if (!raw.startsWith('+')) continue
    scanLine(file, line, raw.slice(1), ignores, out)
    line++
  }
}

const scanPaths = async ($: $, cwd: string | undefined, paths: string[], ignores: string[], out: Finding[]) => {
  const base = cwd ? `${cwd.replace(/[\\/]+$/, '')}/` : ''
  for (const path of paths) {
    if (isIgnored(path, ignores)) continue
    const rule = FILE_RULES.find(r => r.re.test(path))
    if (rule) out.push({ kind: 'file', severity: rule.severity, where: path, detail: rule.detail })
    const stat = await $.fs.stat(base + path).catch(() => undefined)
    if (stat && stat.kind === 'file' && stat.size >= WARN_BYTES) {
      const mb = (stat.size / 1048576).toFixed(1)
      out.push({ kind: 'size', severity: stat.size >= BLOCK_BYTES ? 'block' : 'warn', where: path, detail: `${mb} MB${stat.size >= BLOCK_BYTES ? ' (GitHub rejects files over 100 MB)' : ''}` })
    }
  }
}

const scan = async ($: $, p: Plan): Promise<{ findings: Finding[]; checked: number }> => {
  const cwd = p.cwd
  const prefix = cwd ? `${cwd}/` : ''
  const findings: Finding[] = []
  const ignoreText = await $.fs.read(`${prefix}.commitguardignore`).catch(() => '')
  const ignores = ignoreText.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'))
  const paths = new Set<string>()

  if (p.commit) {
    if (p.hasAdd) {
      // `git add … && git commit`: the add has not run yet, so look at the whole working tree.
      const status = await git($, cwd, ['status', '--porcelain', '-uall'])
      const untracked: string[] = []
      for (const l of status.split('\n').filter(Boolean)) {
        const path = l.slice(3).replace(/^"|"$/g, '').replace(/.* -> /, '')
        paths.add(path)
        if (l.startsWith('??')) untracked.push(path)
      }
      scanDiff(await git($, cwd, ['diff', 'HEAD', '-U0', '--no-color']), ignores, findings)
      for (const path of untracked) {
        const stat = await $.fs.stat(`${prefix}${path}`).catch(() => undefined)
        if (!stat || stat.kind !== 'file' || stat.size > MAX_UNTRACKED_READ) continue
        const text = await $.fs.read(`${prefix}${path}`).catch(() => '')
        text.split('\n').forEach((t, i) => scanLine(path, i + 1, t, ignores, findings))
      }
    } else {
      const ref = p.allTracked ? ['HEAD'] : ['--cached']
      for (const f of (await git($, cwd, ['diff', ...ref, '--name-only', '--diff-filter=ACMR'])).split('\n').filter(Boolean)) paths.add(f)
      scanDiff(await git($, cwd, ['diff', ...ref, '-U0', '--no-color']), ignores, findings)
    }
  }

  if (p.push) {
    // Everything committed locally that no remote has seen yet.
    const names = await git($, cwd, ['log', 'HEAD', '--not', '--remotes', '--name-only', '--format=', '--diff-filter=ACMR'])
    for (const f of names.split('\n').filter(Boolean)) paths.add(f)
    scanDiff(await git($, cwd, ['log', 'HEAD', '--not', '--remotes', '-p', '-U0', '--no-color', '--format=']), ignores, findings)
  }

  await scanPaths($, cwd, [...paths], ignores, findings)
  const seen = new Set<string>()
  const unique = findings.filter(f => {
    const key = `${f.kind}|${f.where}|${f.detail}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
  return { findings: unique, checked: paths.size }
}

const describe = (f: Finding) => `${f.severity === 'block' ? '•' : '◦'} ${f.kind}: ${f.detail} at ${f.where}`

// ───────────────────────── the hooks ─────────────────────────

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'commit-guard', description: 'Commit Guard: status | scan | allow-once | on | off' })
    return next(e)
  })

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const raw = (e as { command?: unknown }).command
    const command = typeof raw === 'string' ? raw : ''
    if (!/\bgit\b/.test(command) || ((await $.store.get('enabled')) ?? true) === false) return next(e)

    const p = plan(command)
    if (!p) return next(e)

    const now = await $.clock.now()
    const action = [p.commit && 'commit', p.push && 'push'].filter(Boolean).join(' + ')
    const { findings, checked } = await scan($, p)
    const blockers = findings.filter(f => f.severity === 'block')
    const warns = findings.filter(f => f.severity === 'warn')

    if (blockers.length > 0) {
      if (await read($, allowOnce)) {
        await update($, allowOnce, () => false)
        await update($, last, () => ({ at: now, verdict: 'allowed', action, checked, findings }))
        $.ui.toast(`🛡️ Commit Guard: ${blockers.length} issue${blockers.length > 1 ? 's' : ''} overridden for this ${action}.`, { timeoutMs: 6000 })
        return next(e)
      }
      await update($, last, () => ({ at: now, verdict: 'blocked', action, checked, findings }))
      await $.store.set('blockedTotal', Number((await $.store.get('blockedTotal')) ?? 0) + 1)
      $.ui.toast(`🛡️ Commit Guard blocked a git ${action}: ${blockers.length} problem${blockers.length > 1 ? 's' : ''} found. /commit-guard for details.`, { timeoutMs: 9000 })
      return {
        deny:
          `Commit Guard blocked this git ${action}: ${blockers.length} problem${blockers.length > 1 ? 's' : ''} in the change.\n` +
          findings.slice(0, 12).map(describe).join('\n') +
          '\nFix: unstage or remove the file (git restore --staged <file>), add it to .gitignore, replace the secret with an environment variable, and rotate any key that was exposed. ' +
          'Do NOT retry the same command. If you believe this is a false positive, tell the user: they can run /commit-guard allow-once, add a path fragment to .commitguardignore, or mark a line with "commit-guard:ignore".',
      }
    }

    await update($, last, () => ({ at: now, verdict: 'clean', action, checked, findings }))
    if (warns.length > 0) $.ui.toast(`🛡️ Commit Guard (heads-up): ${warns.map(describe).join(' · ')}`, { timeoutMs: 8000 })
    else $.ui.toast(`🛡️ Commit Guard: ${checked} file${checked === 1 ? '' : 's'} checked, clean.`, { timeoutMs: 2500 })
    return next(e)
  }).catch(($, e, next) => {
    // Fail open, but never silently: a guard that quietly stops guarding is worse than none.
    $.ui.toast('🛡️ Commit Guard hit an error and skipped its check this time.', { timeoutMs: 6000 })
    return next(e)
  })

  on('command.run', { command: 'commit-guard' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg === 'on' || arg === 'off') {
      await $.store.set('enabled', arg === 'on')
      return { text: arg === 'on' ? '🛡️ Commit Guard is ON.' : '⚠️ Commit Guard is OFF. Commits and pushes will not be checked.' }
    }
    if (arg === 'allow-once') {
      await update($, allowOnce, () => true)
      return { text: '🛡️ The next blocked commit or push will be let through, once. Tell Claude to retry.' }
    }
    if (arg === 'scan') {
      const { findings, checked } = await scan($, { allTracked: true, push: true, hasAdd: true, commit: true })
      if (findings.length === 0) return { text: `🛡️ Scanned ${checked} changed files plus unpushed commits: all clean.` }
      return { text: `🛡️ ${findings.length} finding${findings.length > 1 ? 's' : ''}:\n${findings.map(describe).join('\n')}` }
    }
    const l = await read($, last)
    const total = Number((await $.store.get('blockedTotal')) ?? 0)
    const isOn = ((await $.store.get('enabled')) ?? true) !== false
    return {
      text:
        `🛡️ Commit Guard is ${isOn ? 'ON' : 'OFF'} · ${total} commit${total === 1 ? '' : 's'} blocked all time\n` +
        (l ? `Last check: ${l.verdict} (${l.action}, ${l.checked} files)${l.findings.length ? `\n${l.findings.map(describe).join('\n')}` : ''}` : 'No commits checked yet this session.') +
        '\n\n/commit-guard scan · allow-once · on · off',
    }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const l = await read($, last)
    const now = await $.clock.now()
    if (!l || l.verdict === 'clean' || now - l.at > BAND_MS) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    const blockers = l.findings.filter(f => f.severity === 'block')
    return (
      <Box flexDirection="column">
        <Text color={l.verdict === 'blocked' ? 'red' : 'yellow'} bold>
          {l.verdict === 'blocked' ? `🛡️ Commit Guard blocked git ${l.action}: ${blockers.length} problem${blockers.length > 1 ? 's' : ''}` : `🛡️ Commit Guard override used for git ${l.action}`}
        </Text>
        {l.findings.slice(0, 3).map(f => (
          <Text key={`${f.kind}|${f.where}|${f.detail}`} dimColor>{'  ' + describe(f)}</Text>
        ))}
      </Box>
    )
  })
}
