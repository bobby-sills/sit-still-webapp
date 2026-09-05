import { audioContextCtor } from './sounds'
import { VOICE_FILES } from './nudges'

/**
 * The spoken half of the cues. A chime tells you *that* something drifted; the
 * voice tells you *what*, which with the eyes shut is the only way to know a
 * slouch from a body that has left the frame.
 *
 * Recordings are decoded once, on the first real gesture, and held as buffers —
 * a nudge has to speak the instant it fires, not start a download.
 */

/** As quiet as the chimes. A voice that carries over the room has failed. */
const VOICE_GAIN = 0.8

/** A nudge chime rings first; the line follows once the tone has landed. */
export const AFTER_NUDGE_CHIME = 0.45
/** The closing bell is longer, and is allowed to finish before anything is said. */
export const AFTER_END_CHIME = 1.2

export class Voice {
  private context: AudioContext | null = null
  private buffers = new Map<string, AudioBuffer>()
  private loading: Promise<void> | null = null
  private enabled = true

  /**
   * Must be called from a real user gesture, like the chimes: browsers refuse
   * to start audio otherwise. Doubles as the moment the recordings load.
   */
  unlock(): void {
    const Ctor = audioContextCtor()
    if (!Ctor) return
    this.context ??= new Ctor()
    if (this.context.state === 'suspended') void this.context.resume()
    this.loading ??= this.preload()
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled
  }

  /** `delaySeconds` leaves room for a chime to ring first. */
  play(file: string, delaySeconds = 0): void {
    if (!this.enabled) return
    const context = this.context
    const buffer = this.buffers.get(file)
    // A line that never loaded is simply not spoken; its text still shows.
    if (!context || context.state === 'closed' || !buffer) return
    if (context.state === 'suspended') void context.resume()

    const source = context.createBufferSource()
    const gain = context.createGain()
    source.buffer = buffer
    gain.gain.value = VOICE_GAIN
    source.connect(gain).connect(context.destination)
    source.start(context.currentTime + delaySeconds)
  }

  close(): void {
    void this.context?.close()
    this.context = null
    this.buffers.clear()
    this.loading = null
  }

  private async preload(): Promise<void> {
    const context = this.context
    if (!context) return
    // BASE_URL keeps this working from a subpath, the way the models do.
    const base = `${import.meta.env.BASE_URL}voice/`
    await Promise.all(
      VOICE_FILES.map(async (file) => {
        try {
          const response = await fetch(`${base}${file}.mp3`)
          if (!response.ok) return
          this.buffers.set(file, await context.decodeAudioData(await response.arrayBuffer()))
        } catch {
          // Missing or undecodable: the app stays quiet on that line rather
          // than failing the sit over a recording.
        }
      }),
    )
  }
}
