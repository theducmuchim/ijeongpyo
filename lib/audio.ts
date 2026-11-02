"use client";

// 소리를 내고 받는 공통 부분. 아이폰·아이패드(사파리, 크롬 모두 같은 엔진)는 사용자가 화면을 한 번 눌러야
// 소리를 낼 수 있어서, 첫 터치 때 오디오를 깨워 두고 그 뒤로는 GPS나 타이머에서도 소리를 낼 수 있게 한다.

let ctx: AudioContext | null = null;

export function audioCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const C = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!C) return null;
    ctx = new C();
  }
  return ctx;
}

/** 화면을 누를 때마다 부른다: 잠든 오디오를 깨운다 (아무 소리도 나지 않는다) */
export function unlockAudio() {
  const c = audioCtx();
  if (!c) return;
  if (c.state !== "running") c.resume().catch(() => {});
  try {
    const b = c.createBuffer(1, 1, 22050);
    const s = c.createBufferSource();
    s.buffer = b;
    s.connect(c.destination);
    s.start(0);
  } catch {}
}

if (typeof window !== "undefined") {
  window.addEventListener("pointerdown", unlockAudio, { passive: true });
  window.addEventListener("keydown", unlockAudio);
}

/* ───────────── 녹음 (말 알아듣기를 브라우저가 못 할 때) ───────────── */

export type RecordOpts = {
  maxMs?: number; // 최대 길이
  silenceMs?: number; // 말이 끝나고 이만큼 조용하면 멈춘다
  waitMs?: number; // 이 안에 말이 시작되지 않으면 멈춘다
  onLevel?: (level: number) => void; // 0~1, 소리 크기 막대용
  signal?: AbortSignal;
};

let stopCurrent: (() => void) | null = null;
export const stopRecording = () => stopCurrent?.();

/** 마이크로 한마디를 녹음해 16kHz WAV(base64)로 돌려준다. 말이 없으면 "no-speech" 오류. */
export async function recordUtterance(opts: RecordOpts = {}): Promise<string> {
  const { maxMs = 7000, silenceMs = 900, waitMs = 5000, onLevel } = opts;
  const c = audioCtx();
  if (!c || !navigator.mediaDevices?.getUserMedia) throw Object.assign(new Error("audio-capture"), { code: "audio-capture" });
  await c.resume().catch(() => {});
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } });
  } catch {
    throw Object.assign(new Error("not-allowed"), { code: "not-allowed" });
  }
  stopCurrent?.();
  const src = c.createMediaStreamSource(stream);
  const proc = c.createScriptProcessor(4096, 1, 1);
  const mute = c.createGain();
  mute.gain.value = 0;
  src.connect(proc);
  proc.connect(mute);
  mute.connect(c.destination);

  const rate = c.sampleRate;
  const chunks: Float32Array[] = [];
  const started = performance.now();
  let floor = 0.004; // 주변 소음 크기 (처음 0.3초로 잡는다)
  let speechAt = 0;
  let lastLoud = 0;

  return new Promise<string>((resolve, reject) => {
    let finished = false;
    const finish = (err?: string) => {
      if (finished) return;
      finished = true;
      stopCurrent = null;
      proc.disconnect();
      src.disconnect();
      mute.disconnect();
      stream.getTracks().forEach((t) => t.stop());
      onLevel?.(0);
      if (err) return reject(Object.assign(new Error(err), { code: err }));
      resolve(toWav16k(chunks, rate));
    };
    stopCurrent = () => finish(speechAt ? undefined : "no-speech");
    opts.signal?.addEventListener("abort", () => finish("aborted"));

    // 소리가 하나도 안 들어오면(오디오가 잠든 경우) 깨워 보고, 그래도 안 되면 알린다
    let frames = 0;
    setTimeout(() => {
      if (!frames && !finished) c.resume().catch(() => {});
    }, 800);
    setTimeout(() => {
      if (!frames && !finished) finish("audio-capture");
    }, 3000);

    proc.onaudioprocess = (e) => {
      frames++;
      const data = new Float32Array(e.inputBuffer.getChannelData(0));
      const now = performance.now() - started;
      let sum = 0;
      for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
      const rms = Math.sqrt(sum / data.length);
      if (now < 300 && !speechAt) floor = Math.max(0.002, (floor + rms) / 2);
      const loud = rms > Math.max(0.012, floor * 3);
      onLevel?.(Math.min(1, rms * 12));
      chunks.push(data);
      // 말이 시작되기 전에는 0.5초만 남겨 둔다 (말 앞부분이 잘리지 않게)
      if (!speechAt) {
        const keep = Math.ceil((rate * 0.5) / data.length);
        while (chunks.length > keep) chunks.shift();
      }
      if (loud) {
        if (!speechAt) speechAt = now;
        lastLoud = now;
      }
      if (speechAt && now - lastLoud > silenceMs) finish();
      else if (now > maxMs) finish(speechAt ? undefined : "no-speech");
      else if (!speechAt && now > waitMs) finish("no-speech");
    };
  });
}

// 녹음한 소리를 16kHz 한 채널 16비트 WAV로 (AI에 보내기 좋게 작게)
function toWav16k(chunks: Float32Array[], rate: number): string {
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const all = new Float32Array(total);
  let o = 0;
  for (const c of chunks) {
    all.set(c, o);
    o += c.length;
  }
  const outRate = 16000;
  const ratio = rate / outRate;
  const n = Math.floor(all.length / ratio);
  const pcm = new Int16Array(n);
  for (let i = 0; i < n; i++) {
    // 구간 평균으로 줄인다 (간단한 저역 통과)
    const a = Math.floor(i * ratio);
    const b = Math.min(all.length, Math.floor((i + 1) * ratio));
    let s = 0;
    for (let k = a; k < b; k++) s += all[k];
    const v = Math.max(-1, Math.min(1, s / Math.max(1, b - a)));
    pcm[i] = v < 0 ? v * 0x8000 : v * 0x7fff;
  }
  const buf = new ArrayBuffer(44 + pcm.byteLength);
  const dv = new DataView(buf);
  const w = (p: number, s: string) => [...s].forEach((ch, i) => dv.setUint8(p + i, ch.charCodeAt(0)));
  w(0, "RIFF");
  dv.setUint32(4, 36 + pcm.byteLength, true);
  w(8, "WAVE");
  w(12, "fmt ");
  dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true);
  dv.setUint16(22, 1, true);
  dv.setUint32(24, outRate, true);
  dv.setUint32(28, outRate * 2, true);
  dv.setUint16(32, 2, true);
  dv.setUint16(34, 16, true);
  w(36, "data");
  dv.setUint32(40, pcm.byteLength, true);
  new Int16Array(buf, 44).set(pcm);
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
