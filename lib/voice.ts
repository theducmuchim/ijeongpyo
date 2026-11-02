"use client";

// 소리로 들려주기(휴대폰 기본 목소리)와 말 알아듣기(브라우저 음성 인식).
// 둘 다 휴대폰·브라우저가 지원할 때만 동작하고, 안 되면 조용히 넘어간다.
import { loadSettings } from "./settings";

/* ───────────── 들려주기 ───────────── */

let koVoice: SpeechSynthesisVoice | null | undefined;
let quietUntil = 0; // 방금 말한 소리를 음성 인식이 다시 듣지 않게, 말이 끝난 뒤 잠깐 듣지 않는다
let lastSpoken = "";

export const canSpeak = () => typeof window !== "undefined" && "speechSynthesis" in window;

function pickVoice(): SpeechSynthesisVoice | null {
  if (koVoice !== undefined) return koVoice;
  const all = window.speechSynthesis.getVoices();
  if (all.length === 0) return null; // 아직 목록이 안 왔으면 다음에 다시 고른다
  const ko = all.filter((v) => v.lang.replace("_", "-").toLowerCase().startsWith("ko"));
  koVoice = ko.find((v) => v.localService) ?? ko[0] ?? null;
  return koVoice;
}

type SpeakOpts = {
  queue?: boolean; // 하던 말을 끊지 않고 뒤에 잇는다
  force?: boolean; // '음성 안내'를 꺼 둬도 들려준다 (사용자가 직접 '다시 말해 줘'를 했을 때)
};

export function speak(text: string, opts: SpeakOpts = {}) {
  if (!text || !canSpeak()) return;
  if (!opts.force && !loadSettings().voice) return;
  const s = window.speechSynthesis;
  if (!opts.queue) s.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "ko-KR";
  const v = pickVoice();
  if (v) u.voice = v;
  u.onstart = () => (quietUntil = Number.POSITIVE_INFINITY);
  u.onend = u.onerror = () => {
    if (!s.speaking) quietUntil = Date.now() + 700;
  };
  quietUntil = Number.POSITIVE_INFINITY;
  s.speak(u);
  lastSpoken = text;
}

export function stopSpeaking() {
  if (!canSpeak()) return;
  window.speechSynthesis.cancel();
  quietUntil = Date.now() + 300;
}

export const repeatLast = () => lastSpoken && speak(lastSpoken, { force: true });
const busySpeaking = () => (canSpeak() && window.speechSynthesis.speaking) || Date.now() < quietUntil;

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
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec };
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  if (!Ctor) return null;
  const r = new Ctor();
  r.lang = "ko-KR";
  r.maxAlternatives = 3;
  return r;
}

export const canListen = () => {
  if (typeof window === "undefined") return false;
  const w = window as unknown as Record<string, unknown>;
  return !!(w.SpeechRecognition ?? w.webkitSpeechRecognition);
};

export function listenError(code: string): string {
  if (code === "not-allowed" || code === "service-not-allowed") return "마이크를 쓸 수 없어요. 휴대폰 설정에서 마이크를 허용해 주세요.";
  if (code === "no-speech") return "말소리가 들리지 않았어요. 다시 말해 주세요.";
  if (code === "network") return "음성 인식에 연결하지 못했어요. 인터넷 연결을 확인해 주세요.";
  if (code === "audio-capture") return "마이크를 찾지 못했어요.";
  return "말을 알아듣지 못했어요. 다시 말해 주세요.";
}

const altsOf = (r: RecResult) => Array.from({ length: r.length }, (_, i) => r[i].transcript.trim()).filter(Boolean);

let current: Rec | null = null; // 한 번에 하나만 듣는다

/** 한 번 듣고 끝낸다. 알아들은 말 후보(가장 그럴듯한 것부터)를 돌려준다. */
export function listenOnce(onInterim?: (text: string) => void): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const rec = makeRec();
    if (!rec) return reject(new Error("이 브라우저에서는 음성 인식이 안 돼요. 직접 적어 주세요."));
    current?.abort();
    current = rec;
    stopSpeaking();
    rec.continuous = false;
    rec.interimResults = !!onInterim;
    let done = false;
    let best: string[] = [];
    rec.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) best = altsOf(r);
        else onInterim?.(r[0].transcript);
      }
    };
    rec.onerror = (e) => {
      if (done) return;
      done = true;
      reject(new Error(listenError(e.error)));
    };
    rec.onend = () => {
      if (current === rec) current = null;
      if (done) return;
      done = true;
      if (best.length) resolve(best);
      else reject(new Error(listenError("no-speech")));
    };
    try {
      rec.start();
    } catch {
      done = true;
      reject(new Error(listenError("")));
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
    rec.interimResults = false;
    rec.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal && !busySpeaking()) onText(altsOf(r));
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
