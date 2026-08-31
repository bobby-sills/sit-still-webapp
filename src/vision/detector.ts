import {
  FaceLandmarker,
  FilesetResolver,
  PoseLandmarker,
  type NormalizedLandmark,
} from '@mediapipe/tasks-vision'
import type { FaceBox, Observation } from '../types'

/**
 * Wraps the two on-device landmark models and reduces each frame to the three
 * numbers the app actually needs. The frame itself never leaves this function:
 * it is read straight from the <video> element and nothing is copied, drawn or
 * retained.
 */

// BASE_URL always ends in a slash, and is '/' unless the site is served from a
// subpath (GitHub Pages serves at /<repo>/).
const BASE = import.meta.env.BASE_URL

const LOCAL = {
  wasm: `${BASE}mediapipe-wasm`,
  face: `${BASE}models/face_landmarker.task`,
  pose: `${BASE}models/pose_landmarker_lite.task`,
}

// Used only if the self-hosted copies are missing (see scripts/fetch-models.mjs).
const CDN = {
  wasm: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm',
  face: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
  pose: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
}

const LEFT_SHOULDER = 11
const RIGHT_SHOULDER = 12
const NOSE_TIP = 1

export class Detector {
  private constructor(
    private readonly face: FaceLandmarker,
    private readonly pose: PoseLandmarker,
  ) {}

  private lastTimestamp = -1
  /** Pose runs at half the face rate; the shoulder line moves slowly enough. */
  private poseParity = 0
  private lastShoulderY: number | null = null

  static async create(): Promise<Detector> {
    const build = async (source: typeof LOCAL, delegate: 'GPU' | 'CPU') => {
      const fileset = await FilesetResolver.forVisionTasks(source.wasm)
      const [face, pose] = await Promise.all([
        FaceLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: source.face, delegate },
          runningMode: 'VIDEO',
          numFaces: 1,
          outputFaceBlendshapes: true,
        }),
        PoseLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: source.pose, delegate },
          runningMode: 'VIDEO',
          numPoses: 1,
        }),
      ])
      return new Detector(face, pose)
    }

    // GPU first, then CPU, and only then the CDN — older mobile Safari fails the
    // GPU delegate, and a self-hosted install may have skipped the model fetch.
    const attempts: Array<[typeof LOCAL, 'GPU' | 'CPU']> = [
      [LOCAL, 'GPU'],
      [LOCAL, 'CPU'],
      [CDN, 'GPU'],
      [CDN, 'CPU'],
    ]
    let lastError: unknown
    for (const [source, delegate] of attempts) {
      try {
        return await build(source, delegate)
      } catch (err) {
        lastError = err
      }
    }
    throw lastError instanceof Error ? lastError : new Error('could not load the vision models')
  }

  /** Reads one frame. Returns null if the video has no new frame to give. */
  detect(video: HTMLVideoElement, timestampMs: number): Observation | null {
    if (video.readyState < 2 || video.videoWidth === 0) return null
    // MediaPipe requires strictly increasing timestamps in VIDEO mode.
    const ts = timestampMs <= this.lastTimestamp ? this.lastTimestamp + 1 : timestampMs
    this.lastTimestamp = ts

    const faceResult = this.face.detectForVideo(video, ts)
    const landmarks = faceResult.faceLandmarks[0]
    const faceFound = landmarks !== undefined && landmarks.length > 0

    let eyeAperture: number | null = null
    let headY: number | null = null
    let faceBox: FaceBox | null = null
    if (faceFound && landmarks) {
      const blendshapes = faceResult.faceBlendshapes[0]?.categories
      eyeAperture = blendshapes ? apertureFromBlendshapes(blendshapes) : apertureFromLandmarks(landmarks)
      headY = landmarks[NOSE_TIP]?.y ?? null
      faceBox = boxOf(landmarks)
    }

    this.poseParity = (this.poseParity + 1) % 2
    if (this.poseParity === 0) {
      const poseResult = this.pose.detectForVideo(video, ts)
      const body = poseResult.landmarks[0]
      const left = body?.[LEFT_SHOULDER]
      const right = body?.[RIGHT_SHOULDER]
      // Ignore shoulders the model is only guessing at — an occluded keypoint
      // reported with low confidence would read as a slouch.
      this.lastShoulderY =
        left && right && visible(left) && visible(right) ? (left.y + right.y) / 2 : null
    }

    return { faceFound, eyeAperture, shoulderY: this.lastShoulderY, headY, faceBox }
  }

  close(): void {
    this.face.close()
    this.pose.close()
  }
}

/** Face extents, so the framing oval can sit on the real face rather than a guess. */
function boxOf(landmarks: NormalizedLandmark[]): FaceBox | null {
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (const p of landmarks) {
    if (p.x < minX) minX = p.x
    if (p.x > maxX) maxX = p.x
    if (p.y < minY) minY = p.y
    if (p.y > maxY) maxY = p.y
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY)) return null
  return { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, w: maxX - minX, h: maxY - minY }
}

function visible(landmark: NormalizedLandmark): boolean {
  // `visibility` is optional in the type but populated by the pose model.
  return (landmark.visibility ?? 1) > 0.5
}

function apertureFromBlendshapes(categories: Array<{ categoryName: string; score: number }>): number {
  let left: number | null = null
  let right: number | null = null
  for (const c of categories) {
    if (c.categoryName === 'eyeBlinkLeft') left = c.score
    else if (c.categoryName === 'eyeBlinkRight') right = c.score
  }
  if (left === null && right === null) return 1
  const blink = left !== null && right !== null ? (left + right) / 2 : (left ?? right) as number
  return clamp01(1 - blink)
}

/**
 * Fallback for a model built without blendshapes: eye aspect ratio, the eye's
 * height over its width, normalised into roughly the same 0..1 range.
 */
function apertureFromLandmarks(landmarks: NormalizedLandmark[]): number {
  const ear = (upper: number, lower: number, inner: number, outer: number): number | null => {
    const u = landmarks[upper]
    const l = landmarks[lower]
    const i = landmarks[inner]
    const o = landmarks[outer]
    if (!u || !l || !i || !o) return null
    const width = Math.hypot(o.x - i.x, o.y - i.y)
    if (width === 0) return null
    return Math.hypot(u.x - l.x, u.y - l.y) / width
  }
  const left = ear(159, 145, 33, 133)
  const right = ear(386, 374, 362, 263)
  const values = [left, right].filter((v): v is number => v !== null)
  if (values.length === 0) return 1
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  // A wide-open eye sits near a ratio of 0.35; shut is near 0.06.
  return clamp01((mean - 0.06) / 0.29)
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n))
}
