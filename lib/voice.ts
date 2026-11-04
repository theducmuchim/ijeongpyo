"use client";

// 소리로 들려주기와 말 알아듣기.
// - 들려주기: 기본은 자연스러운 AI 목소리(Gemini, 무료). 같은 문장은 서버(CDN)와 휴대폰에 저장해 두고 다시 쓴다.
//   AI 목소리를 못 받으면(인터넷 없음, 무료 한도) 휴대폰 기본 목소리로 바로 바꾼다.
// - 알아듣기: 브라우저 음성 인식이 되면 그걸 쓰고(빠름), 안 되면(아이폰·아이패드의 크롬 등) 녹음해서 AI가 글로 옮긴다.
import { audioCtx, recordUtterance, stopRecording, unlockAudio } from "./audio";
import { deviceId, loadSettings } from "./settings";

/* ───────────── 들려주기 ───────────── */

let koVoice: SpeechSynthesisVoice | null | undefined;
let quietUntil = 0; // 방금 말한 소리를 음성 인식이 다시 듣지 않게, 말이 끝난 뒤 잠깐 듣지 않는다
let lastSpoken = "";
let gen = 0; // 말을 끊을 때마다 늘린다. 늦게 도착한 소리가 끼어들지 않게.
let chain: Promise<void> = Promise.resolve();
let playing: AudioBufferSourceNode | null = null;
let aiOffUntil = 0; // AI 목소리가 실패하면 잠깐 휴대폰 목소리로만 말한다

export const canSpeak = () => typeof window !== "undefined" && ("speechSynthesis" in window || !!audioCtx());

function pickVoice(): SpeechSynthesisVoice | null {
  if (koVoice !== undefined) return koVoice;
  const all = window.speechSynthesis.getVoices();
  if (all.length === 0) return null; // 아직 목록이 안 왔으면 다음에 다시 고른다
  const ko = all.filter((v) => v.lang.replace("_", "-").toLowerCase().startsWith("ko"));
  // 기기마다 이름이 달라서, 더 자연스러운 쪽(Google·Yuna·향상됨)을 먼저 고른다
  koVoice = ko.find((v) => /google|yuna|enhanced|premium|향상/i.test(v.name)) ?? ko.find((v) => v.localService) ?? ko[0] ?? null;
  return koVoice;
}

type SpeakOpts = {
  queue?: boolean; // 하던 말을 끊지 않고 뒤에 잇는다
  force?: boolean; // '음성 안내'를 꺼 둬도 들려준다 (사용자가 직접 '다시 말해 줘'를 했을 때)
};

export function speak(text: string, opts: SpeakOpts = {}) {
  if (!text || typeof window === "undefined") return;
  if (!opts.force && !loadSettings().voice) return;
  if (!opts.queue) stopSpeaking();
  const my = gen;
  lastSpoken = text;
  quietUntil = Number.POSITIVE_INFINITY;
  // AI 목소리는 받는 데 1~3초 걸리니, 말할 차례가 오기 전에 미리 받기 시작한다
  const audio = aiVoiceOn() ? getAudio(text).catch(() => null) : Promise.resolve(null);
  chain = chain
    .then(async () => {
      if (my !== gen) return;
      // 방금 마이크를 썼으면 휴대폰이 소리 내기로 돌아올 때까지 잠깐 기다린다
      const wait = 500 - (Date.now() - listenEndedAt);
      if (wait > 0) await sleep(wait);
      const buf = await audio;
      if (my !== gen) return;
      if (!(buf && (await playBuffer(buf)))) await deviceSpeak(text);
    })
    .catch(() => {})
    .finally(() => {
      if (my === gen) quietUntil = Date.now() + 700;
    });
}

export function stopSpeaking() {
  gen++;
  chain = Promise.resolve();
  try {
    playing?.stop();
  } catch {}
  playing = null;
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  quietUntil = Date.now() + 300;
}

export const repeatLast = () => lastSpoken && speak(lastSpoken, { force: true });
const busySpeaking = () => Date.now() < quietUntil;

const aiVoiceOn = () => loadSettings().voiceEngine !== "device" && Date.now() > aiOffUntil && navigator.onLine !== false;

// 휴대폰 기본 목소리. 일부 안드로이드는 끝 신호(onend)를 안 주므로 글 길이만큼 기다리고 넘어간다.
function deviceSpeak(text: string): Promise<void> {
  return new Promise((resolve) => {
    if (!("speechSynthesis" in window)) return resolve();
    const s = window.speechSynthesis;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "ko-KR";
    const v = pickVoice();
    if (v) u.voice = v;
    u.rate = 1;
    const done = () => {
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(done, 1500 + text.length * 160);
    u.onend = u.onerror = done;
    // 크롬은 cancel 바로 뒤의 speak를 버리는 일이 있어 잠깐 쉬고 말한다
    setTimeout(() => s.speak(u), 60);
  });
}

let listenEndedAt = 0;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// 아이폰·아이패드는 마이크를 쓴 직후나 화면을 누르기 전에는 오디오가 멈춰 있어 소리가 안 난다.
// 깨워 보고 그래도 안 되면 false를 돌려 휴대폰 목소리로 말하게 한다.
async function audioReady(): Promise<boolean> {
  const c = audioCtx();
  if (!c) return false;
  if (c.state === "running") return true;
  unlockAudio();
  await Promise.race([c.resume().catch(() => {}), sleep(400)]);
  return (c.state as string) === "running";
}

async function playBuffer(buf: AudioBuffer): Promise<boolean> {
  if (!(await audioReady())) return false;
  return new Promise((resolve) => {
    const c = audioCtx()!;
    const src = c.createBufferSource();
    src.buffer = buf;
    src.connect(c.destination);
    playing = src;
    const done = () => {
      clearTimeout(timer);
      if (playing === src) playing = null;
      resolve(true);
    };
    const timer = setTimeout(done, buf.duration * 1000 + 1500);
    src.onended = done;
    src.start();
  });
}

// 같은 문장은 한 번만 받는다: 이번 사용 동안은 메모리, 다음에도 쓰게 휴대폰 저장소(Cache Storage)
const decoded = new Map<string, AudioBuffer>();
const CACHE = "ijp-voice-1";
export const ttsUrl = (text: string) => `/api/tts?v=1&t=${encodeURIComponent(text)}`;

const inflight = new Map<string, Promise<AudioBuffer>>();
function getAudio(text: string): Promise<AudioBuffer> {
  const hit = decoded.get(text);
  if (hit) return Promise.resolve(hit);
  // 미리 받기와 말하기가 같은 문장을 동시에 부르면 한 번만 받는다
  let p = inflight.get(text);
  if (!p) {
    p = fetchAudio(text).finally(() => inflight.delete(text));
    inflight.set(text, p);
  }
  return p;
}

async function fetchAudio(text: string): Promise<AudioBuffer> {
  const c = audioCtx();
  if (!c) throw new Error("no audio");
  const url = ttsUrl(text);
  let bytes: ArrayBuffer | null = null;
  let store: Cache | null = null;
  try {
    store = await caches.open(CACHE);
    const m = await store.match(url);
    if (m) bytes = await m.arrayBuffer();
  } catch {}
  if (!bytes) {
    const res = await fetch(url, { headers: { "x-device-id": deviceId() } });
    if (!res.ok) {
      // 무료 한도(429)면 30분, 다른 문제면 3분 동안 휴대폰 목소리로만 말한다
      aiOffUntil = Date.now() + (res.status === 429 ? 30 : 3) * 60_000;
      throw new Error(`tts ${res.status}`);
    }
    try {
      await store?.put(url, res.clone());
    } catch {}
    bytes = await res.arrayBuffer();
  }
  const buf = await c.decodeAudioData(bytes.slice(0));
  if (decoded.size > 60) decoded.delete(decoded.keys().next().value!);
  decoded.set(text, buf);
  return buf;
}

/** 걷기 전에 카드 문장을 미리 받아 둔다 (말할 때 바로 나오게). 한 번 실패하면 멈춘다. */
export async function prefetchSpeech(texts: string[]) {
  if (typeof window === "undefined" || !loadSettings().voice) return;
  for (const t of [...new Set(texts.filter(Boolean))]) {
    if (!aiVoiceOn()) return;
    try {
      await getAudio(t);
    } catch {
      return;
    }
  }
}

// 거리를 귀로 듣기 좋게: 80미터, 150미터, 1.2킬로미터
export function spokenDistance(m: number): string {
  if (m >= 1000) return `${(Math.round(m / 100) / 10).toString()}킬로미터`;
  if (m >= 100) return `${Math.round(m / 50) * 50}미터`;
  return `${Math.max(10, Math.round(m / 10) * 10)}미터`;
}

/* ───────────── 알아듣기 ───────────── */

type Alt = { transcript: string };
type RecResult = ArrayLike<Alt> & { isFinal: boolean };
type RecEvent = { resultIndex: number; results: ArrayLike<RecResult> };
type Rec = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: RecEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

function makeRec(): Rec | null {
  if (typeof window === "undefined" || nativeBroken()) return null;
  const w = window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec };
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  if (!Ctor) return null;
  const r = new Ctor();
  r.lang = "ko-KR";
  r.maxAlternatives = 3;
  return r;
}

// 아이폰·아이패드의 크롬처럼 음성 인식이 있다고 하면서 켜자마자 꺼지는 브라우저가 있다.
// 한 번 그러면 이 휴대폰에서는 녹음 방식만 쓴다.
const BROKEN_KEY = "ijeongpyo.nativeStt";
function nativeBroken() {
  try {
    return localStorage.getItem(BROKEN_KEY) === "broken";
  } catch {
    return false;
  }
}
function markNativeBroken() {
  try {
    localStorage.setItem(BROKEN_KEY, "broken");
  } catch {}
}
const hasNative = () => {
  if (typeof window === "undefined" || nativeBroken()) return false;
  const w = window as unknown as Record<string, unknown>;
  return !!(w.SpeechRecognition ?? w.webkitSpeechRecognition);
};
const canRecord = () => typeof window !== "undefined" && !!navigator.mediaDevices?.getUserMedia && !!audioCtx();

/** 말 알아듣기를 쓸 수 있는지 (브라우저 음성 인식이나 녹음 둘 중 하나라도 되면) */
export const canListen = () => hasNative() || canRecord();
/** 버튼 없이 계속 듣기는 브라우저 음성 인식이 될 때만 (녹음 방식으로 계속 들으면 AI 한도를 금방 다 쓴다) */
export const canListenAlways = () => hasNative();

export function listenError(code: string): string {
  if (code === "not-allowed" || code === "service-not-allowed") return "마이크를 쓸 수 없어요. 휴대폰 설정에서 이 브라우저의 마이크를 허용해 주세요.";
  if (code === "no-speech") return "말소리가 들리지 않았어요. 버튼을 누르고 바로 말해 주세요.";
  if (code === "network") return "음성 인식에 연결하지 못했어요. 인터넷 연결을 확인해 주세요.";
  if (code === "audio-capture") return "마이크 소리가 들어오지 않아요. 화면을 한 번 누르고 다시 해 주세요.";
  if (code === "quota") return "지금은 말로 하기를 쓸 수 없어요. 잠시 뒤 다시 하거나 버튼을 눌러 주세요.";
  return "말을 알아듣지 못했어요. 다시 말해 주세요.";
}

const altsOf = (r: RecResult) => Array.from({ length: r.length }, (_, i) => r[i].transcript.trim()).filter(Boolean);

let current: Rec | null = null; // 한 번에 하나만 듣는다

export type ListenPhase = "listening" | "thinking";
type ListenOpts = {
  onInterim?: (text: string) => void;
  onPhase?: (p: ListenPhase) => void;
  onLevel?: (l: number) => void;
  hints?: string[];
  fresh?: boolean; // 방금 권한을 허용했다 (이번 실패만으로 음성 인식이 고장 났다고 보지 않는다)
};

/* 말로 하기 기록: 무엇을 들었고 무엇을 했는지 (설정 화면에서 문제를 찾을 때 본다). 이 휴대폰에만 20개까지. */
export type VoiceLogItem = { at: string; how: "인식" | "녹음" | "-"; heard?: string; did?: string; error?: string };
const LOG_KEY = "ijeongpyo.voiceLog";
let lastHow: VoiceLogItem["how"] = "-";
export function voiceLog(item: Omit<VoiceLogItem, "at" | "how">) {
  try {
    const list: VoiceLogItem[] = JSON.parse(localStorage.getItem(LOG_KEY) || "[]");
    list.unshift({ at: new Date().toISOString(), how: lastHow, ...item });
    localStorage.setItem(LOG_KEY, JSON.stringify(list.slice(0, 20)));
  } catch {}
}
export function readVoiceLog(): VoiceLogItem[] {
  try {
    return JSON.parse(localStorage.getItem(LOG_KEY) || "[]");
  } catch {
    return [];
  }
}

/** 한 번 듣고 끝낸다. 알아들은 말 후보(가장 그럴듯한 것부터)를 돌려준다. */
export async function listenOnce(opts: ListenOpts = {}): Promise<string[]> {
  try {
    return await listenOnceInner(opts);
  } finally {
    listenEndedAt = Date.now();
  }
}

async function listenOnceInner(opts: ListenOpts): Promise<string[]> {
  stopSpeaking();
  unlockAudio();
  if (hasNative()) {
    try {
      lastHow = "인식";
      return await listenNative(opts.onInterim);
    } catch (e) {
      const code = (e as { code?: string }).code ?? "";
      voiceLog({ error: `브라우저 음성 인식: ${code}` });
      // 말이 없었던 경우는 그대로 알린다. 그 밖에는 이 브라우저의 음성 인식이 안 되는 것으로 보고 녹음으로 넘어간다.
      // (아이폰·아이패드는 처음에 '음성 인식' 권한 창을 띄우면서 바로 끝나 버리므로, 방금 허용한 경우는 고장으로 치지 않는다)
      if (code === "no-speech") throw new Error(listenError(code));
      if (!opts.fresh) markNativeBroken();
    }
  }
  lastHow = "녹음";
  if (!canRecord()) throw new Error("이 브라우저에서는 말로 하기를 쓸 수 없어요. 버튼을 직접 눌러 주세요.");
  opts.onPhase?.("listening");
  let wav: string;
  try {
    wav = await recordUtterance({ onLevel: opts.onLevel });
  } catch (e) {
    throw new Error(listenError((e as { code?: string }).code ?? ""));
  }
  opts.onPhase?.("thinking");
  const res = await fetch("/api/transcribe", {
    method: "POST",
    headers: { "content-type": "application/json", "x-device-id": deviceId() },
    body: JSON.stringify({ wav, hints: opts.hints ?? [] }),
  });
  if (res.status === 429) throw new Error(listenError("quota"));
  if (!res.ok) throw new Error(listenError("network"));
  const { text } = (await res.json()) as { text?: string };
  voiceLog({ heard: text || "(빈 말)" });
  if (!text?.trim()) throw new Error(listenError("no-speech"));
  return [text.trim()];
}

/** 녹음 방식에서 '듣는 중'일 때 버튼을 다시 누르면 바로 멈추고 보낸다 */
export const finishListening = () => {
  stopRecording();
  current?.stop();
};

function listenNative(onInterim?: (text: string) => void): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const rec = makeRec()!;
    current?.abort();
    current = rec;
    rec.continuous = false;
    // 아이폰·아이패드는 '끝난 말'(isFinal)을 끝내 주지 않고 중간 결과만 주는 일이 많다. 그래서 중간 결과를 늘 받아 두고,
    // 끝날 때 끝난 말이 없으면 마지막 중간 결과를 쓴다. 말이 1.2초 멈추면 듣기를 끝낸다(안 끝나고 계속 듣는 브라우저가 있다).
    rec.interimResults = true;
    let done = false;
    let best: string[] = [];
    let interim = "";
    let heardAnything = false;
    const startedAt = Date.now();
    let quiet: ReturnType<typeof setTimeout> | null = null;
    const maxTimer = setTimeout(() => rec.stop(), 10000);
    const settle = () => {
      clearTimeout(maxTimer);
      if (quiet) clearTimeout(quiet);
    };
    const fail = (code: string) => {
      if (done) return;
      done = true;
      settle();
      reject(Object.assign(new Error(code), { code }));
    };
    const succeed = (alts: string[]) => {
      if (done) return;
      done = true;
      settle();
      try {
        rec.abort();
      } catch {}
      resolve(alts);
    };
    rec.onresult = (e) => {
      heardAnything = true;
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) best = altsOf(r);
        else {
          interim = r[0].transcript.trim();
          onInterim?.(interim);
        }
      }
      if (best.length) return succeed(best);
      if (quiet) clearTimeout(quiet);
      quiet = setTimeout(() => (interim ? succeed([interim]) : rec.stop()), 1200);
    };
    rec.onerror = (e) => {
      if (interim) return succeed([interim]);
      fail(e.error === "no-speech" && Date.now() - startedAt < 1200 ? "broken" : e.error || "broken");
    };
    rec.onend = () => {
      if (current === rec) current = null;
      if (done) return;
      if (best.length) return succeed(best);
      if (interim) return succeed([interim]);
      // 1.5초도 안 돼서 아무것도 못 듣고 끝나면 듣기 자체가 안 되는 브라우저다
      fail(!heardAnything && Date.now() - startedAt < 1500 ? "broken" : "no-speech");
    };
    try {
      rec.start();
    } catch {
      fail("broken");
    }
  });
}

/** 걷는 동안 계속 듣는다. 끊기면 다시 켜고, 앱이 말하는 동안 들은 소리는 버린다. */
export function listenAlways(onText: (alts: string[]) => void, onState: (s: "on" | "off" | "denied") => void): () => void {
  let stopped = false;
  let fails = 0;
  let rec: Rec | null = null;
  const begin = () => {
    if (stopped) return;
    rec = makeRec();
    if (!rec) return onState("off");
    current?.abort();
    current = rec;
    rec.continuous = true;
    // 끝난 말(isFinal)을 잘 안 주는 브라우저를 위해 중간 결과가 1.2초 그대로면 그걸 한마디로 본다
    rec.interimResults = true;
    let pending = "";
    let sent = "";
    let timer: ReturnType<typeof setTimeout> | null = null;
    const emit = (alts: string[]) => {
      if (timer) clearTimeout(timer);
      pending = "";
      if (!alts.length || alts[0] === sent || busySpeaking()) return;
      sent = alts[0];
      lastHow = "인식";
      onText(alts);
    };
    rec.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) {
          const alts = altsOf(r);
          // 중간 결과로 이미 처리한 말이면 다시 하지 않는다
          if (alts[0] && alts[0] !== sent) emit(alts);
          else if (timer) clearTimeout(timer);
          sent = "";
        } else {
          pending = r[0].transcript.trim();
          if (timer) clearTimeout(timer);
          timer = setTimeout(() => pending && emit([pending]), 1200);
        }
      }
      fails = 0;
    };
    rec.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        stopped = true;
        onState("denied");
      } else if (e.error !== "no-speech" && e.error !== "aborted") fails++;
    };
    rec.onend = () => {
      if (current === rec) current = null;
      if (stopped) return onState("off");
      // 브라우저가 몇 초~1분마다 듣기를 끝내므로 다시 켠다. 계속 실패하면 조금씩 늦춘다.
      setTimeout(begin, Math.min(8000, 300 + fails * 1500));
    };
    try {
      rec.start();
      onState("on");
    } catch {
      setTimeout(begin, 1500);
    }
  };
  begin();
  return () => {
    stopped = true;
    rec?.abort();
    onState("off");
  };
}

/* ───────────── 명령 맞추기 ───────────── */

export type Command = {
  id: string;
  label?: string; // 알아들은 뒤 화면에 보여 줄 한 일 (예: "다음 카드")
  say: string[]; // 이 말이 들어 있으면 이 명령으로 본다
  when?: boolean; // false면 지금 화면에서는 안 되는 명령
};

const norm = (s: string) => s.replace(/[\s.,!?~'"]/g, "").toLowerCase();

/** 알아들은 말 후보 중에서 가장 길게 맞는 명령을 고른다 ("안 보여"가 "보여"보다 먼저). */
export function matchCommand(alts: string[], commands: Command[]): Command | null {
  let best: { c: Command; len: number; rank: number } | null = null;
  alts.forEach((alt, rank) => {
    const t = norm(alt);
    for (const c of commands) {
      if (c.when === false) continue;
      for (const p of c.say) {
        const k = norm(p);
        if (!k || !t.includes(k)) continue;
        if (!best || k.length > best.len || (k.length === best.len && rank < best.rank)) best = { c, len: k.length, rank };
      }
    }
  });
  return best ? (best as { c: Command }).c : null;
}

/** 설정: 걷는 동안 계속 듣기를 켰는지 */
export const alwaysListening = () => loadSettings().listenMode === "always";

/* ───────────── 홈에서 말로 길 고르기 ───────────── */

// 홈에서 말로 "○○ 가는 길"이라고 하면 처음 가는 길 화면이 이 검색어로 바로 찾는다
export const PLAN_QUERY_KEY = "ijeongpyo.planQuery";

export const squash = (s: string) => s.replace(/[\s.,!?~]/g, "");

// "서대전역 가는 길", "서대전역까지 가고 싶어" → "서대전역"
export function destFrom(text: string): string {
  return text
    .trim()
    .replace(/[.!?~]+$/, "")
    .replace(/\s*(가는\s*길|가고\s*싶어요?|갈래요?|가자|가\s*줘|가\s*주세요|어떻게\s*가요?|길\s*알려\s*줘|안내해\s*줘|찾아\s*줘)\s*$/, "")
    .replace(/\s*(으로|로|에|까지)$/, "")
    .trim();
}
