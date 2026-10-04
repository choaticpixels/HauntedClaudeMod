export type Ghost = {
  id: string
  path: string
  name: string
  kind: 'file' | 'legion' | 'wisp'
  lines: string[]
  lineCount: number
  diedAt: number
  whispers: number
  isBound: boolean
}

export type Whisper = { ghostId: string; name: string; text: string; at: number }

export type Fx = {
  poltergeistUntil: number
  bustedUntil: number
  trickUntil: number
  mirrorUntil: number
  danceUntil: number
  candlesUntil: number
}

declare module 'claude-code' {
  interface PluginState {
    'haunted-repo': {
      ghosts: Ghost[]
      frame: number
      whisper: Whisper | null
      fx: Fx
      ghostMode: boolean
      cat: number
    }
  }
}
