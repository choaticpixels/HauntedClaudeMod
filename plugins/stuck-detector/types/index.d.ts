export type Alert = { level: 1 | 2 | 3; text: string; at: number }

declare module 'claude-code' {
  interface PluginState {
    'stuck-detector': { alert: Alert | null }
  }
}
