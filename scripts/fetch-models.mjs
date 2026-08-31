// Fetches the on-device vision models and copies the MediaPipe WASM runtime into
// public/, so a session needs no network once the page has loaded. Both are large
// binaries kept out of git. Failure here is not fatal: the app falls back to the
// CDN at runtime, and to a working timer with monitoring off if that fails too.
import { mkdir, writeFile, access, cp } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const MODELS = [
  {
    file: 'public/models/face_landmarker.task',
    url: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
  },
  {
    file: 'public/models/pose_landmarker_lite.task',
    url: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
  },
]

const exists = async (p) => access(p).then(() => true, () => false)

for (const { file, url } of MODELS) {
  const dest = resolve(root, file)
  if (await exists(dest)) continue
  try {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    await mkdir(dirname(dest), { recursive: true })
    await writeFile(dest, Buffer.from(await res.arrayBuffer()))
    console.log(`fetched ${file}`)
  } catch (err) {
    console.warn(`could not fetch ${file} (${err.message}) — will fall back to the CDN at runtime`)
  }
}

try {
  await cp(
    resolve(root, 'node_modules/@mediapipe/tasks-vision/wasm'),
    resolve(root, 'public/mediapipe-wasm'),
    { recursive: true },
  )
} catch (err) {
  console.warn(`could not copy the MediaPipe wasm runtime (${err.message})`)
}
