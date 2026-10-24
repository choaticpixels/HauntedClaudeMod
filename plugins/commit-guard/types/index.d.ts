export type Finding = { kind: 'secret' | 'file' | 'size'; severity: 'block' | 'warn'; where: string; detail: string }

export type Report = {
  at: number
  verdict: 'clean' | 'blocked' | 'allowed'
  action: string
  checked: number
  findings: Finding[]
}

declare module 'claude-code' {
  interface PluginState {
    'commit-guard': { last: Report | null; allowOnce: boolean }
  }
}
