"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { AiWaiting, AppBar, CameraInput, Icon, IconLink, PhotoView } from "@/components/ui";
import { PlaceLine } from "@/components/Place";
import { VoiceControl } from "@/components/Voice";
import { requestCheck } from "@/lib/api";
import { db } from "@/lib/db";
import { applyCheck, isDraft, nextCandidate, replaceCard } from "@/lib/draftCard";
import {
  BAD_ACCURACY_M,
  NEXT_CARD_RADIUS_M,
  OFF_ROUTE_M,
  OFF_ROUTE_SECONDS,
  distanceM,
  distanceToTrackM,
} from "@/lib/geo";
import { blobToPayload, shrinkPhoto } from "@/lib/image";
import { fillPlaces } from "@/lib/fillPlaces";
import { josa } from "@/lib/josa";
import { placeSpeech } from "@/lib/place";
import { clearLost, setResume, takeResume, wasLost } from "@/lib/resume";
import { lastCardKey, loadSettings } from "@/lib/settings";
import { toast } from "@/lib/toast";
import { logEvent } from "@/lib/usageLog";
import { type Command, prefetchSpeech, speak, spokenDistance, stopSpeaking } from "@/lib/voice";
import type { Card, CheckResult, PracticeLevel, Route } from "@/types";

const RETURN_SUFFIX = " 돌아오는 길";
const APPROACH_M = 50; // 처음 가는 길: 갈림길 50m 전에 길잡이를 확인하라고 알린다
const CLEAN_TO_LEVEL_UP = 3; // 길을 잃지 않고 3번 도착하면 다음 연습 단계를 권한다

const LEVEL_TEXT: Record<PracticeLevel, string> = {
  1: "전부 보기",
  2: "문장만 보기",
  3: "꺾는 곳에서만 알림",
};

const NEAR_M = 70; // 내비처럼: 다음 갈림길 70m 안에 들면 "곧 갈림길이에요"를 한 번 알린다

// 다음 갈림길이 가까워졌을 때 미리 들려줄 말
function nearText(c: Card): string {
  if (c.action === "arrive") return `곧 도착해요. ${c.instruction}`;
  if (isDraft(c) && c.landmark.name) return `곧 갈림길이에요. ${josa(c.landmark.name, "이/가")} 보이나요? ${placeSpeech(c.place)}`.trim();
  return `곧 갈림길이에요. ${c.instruction}`;
}

const buzz = (p: number | number[]) => loadSettings().vibrate && "vibrate" in navigator && navigator.vibrate(p);

// 걷는 동안 화면이 꺼지지 않게 한다 (지원하는 휴대폰에서만)
function useWakeLock(on: boolean) {
  useEffect(() => {
    if (!on || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    const grab = () =>
      navigator.wakeLock
        .request("screen")
        .then((l) => (lock = l))
        .catch(() => {});
    grab();
    const again = () => document.visibilityState === "visible" && grab();
    document.addEventListener("visibilitychange", again);
    return () => {
      document.removeEventListener("visibilitychange", again);
      lock?.release().catch(() => {});
    };
  }, [on]);
}

// 도착 후 퀴즈 한 문제: "A 다음에 나온 길잡이는?" 걸은 횟수로 문제를 고른다(매번 같은 문제가 되지 않게).
function makeQuiz(route: Route) {
  const named = route.cards.filter((c) => c.landmark.name && !isDraft(c));
  if (named.length < 3) return null;
  const seed = (route.cleanArrivals ?? 0) + route.cards.length;
  const k = 1 + (seed % (named.length - 1));
  const answer = named.at(k)!.landmark.name;
  const before = named.at(k - 1)!.landmark.name;
  // 문제에 나온 길잡이(before)는 보기에서 뺀다
  const others = [...new Set(named.map((c) => c.landmark.name))].filter((n) => n !== answer && n !== before).slice(0, 2);
  if (others.length < 1 || answer === before) return null;
  const options = [answer, ...others];
  const shift = seed % options.length;
  return { before, answer, options: [...options.slice(shift), ...options.slice(0, shift)] };
}

function Quiz({ route }: { route: Route }) {
  const [q] = useState(() => makeQuiz(route));
  const [picked, setPicked] = useState<string | null>(null);
  if (!q) return null;
  return (
    <div className="surface-card" style={{ gap: 10, width: "100%", textAlign: "left" }}>
      <p className="label-large primary-text">길 기억하기</p>
      <p className="title-medium">{q.before} 다음에 나온 길잡이는?</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {q.options.map((o) => (
          <button
            key={o}
            className={`btn ${picked === null ? "btn-outlined" : o === q.answer ? "btn-filled" : picked === o ? "btn-tonal" : "btn-outlined"}`}
            onClick={() => setPicked(o)}
            disabled={picked !== null}
          >
            {picked !== null && o === q.answer && <Icon name="check" size={18} />} {o}
          </button>
        ))}
      </div>
      {picked !== null && (
        <p className="body-medium" aria-live="polite">
          {picked === q.answer ? "맞아요." : `정답은 ${josa(q.answer, "이에요/예요")}.`}
        </p>
      )}
    </div>
  );
}

function Arrived({ route, startedAt, offCount, clean }: { route: Route; startedAt: number; offCount: number; clean: boolean }) {
  const router = useRouter();
  const [minutes] = useState(() => Math.max(1, Math.round((Date.now() - startedAt) / 60000)));
  const [r, setR] = useState(route);
  const level = r.practiceLevel ?? 1;
  const canLevelUp = level < 3 && (r.cleanArrivals ?? 0) >= CLEAN_TO_LEVEL_UP;
  const canAddReturn = r.kind !== "planned" && !r.name.endsWith(RETURN_SUFFIX.trim());
  const drafts = r.cards.filter(isDraft).length;
  const colors = ["var(--primary)", "var(--tertiary-container)", "var(--primary-container)", "var(--secondary-container)"];

  async function levelUp() {
    const next = { ...r, practiceLevel: (level + 1) as PracticeLevel, cleanArrivals: 0 };
    await db.routes.put(next);
    logEvent(r.id, "practice_up", next.practiceLevel);
    setR(next);
    toast(`다음부터 '${LEVEL_TEXT[next.practiceLevel]}'로 걸어요`);
  }

  return (
    <main className="screen">
      <div className="confetti" aria-hidden="true">
        {Array.from({ length: 24 }, (_, i) => (
          <i
            key={i}
            style={{
              left: `${(i * 41) % 100}%`,
              background: colors[i % colors.length],
              animationDelay: `${(i % 8) * 90}ms`,
              transform: `rotate(${i * 30}deg)`,
            }}
          />
        ))}
      </div>
      <div className="arrive">
        <svg className="check-circle" width="120" height="120" viewBox="0 0 120 120" aria-hidden="true">
          <circle cx="60" cy="60" r="56" />
          <path d="M38 62 L54 77 L84 45" />
        </svg>
        <p className="display-small">도착했어요</p>
        <p className="body-large muted">{josa(r.name, "을/를")} 끝까지 걸었어요.</p>
        <div className="stat-row" style={{ marginTop: 12 }}>
          <div className="stat">
            <span className="label-medium muted">걸린 시간</span>
            <span className="title-large">{minutes}분</span>
          </div>
          <div className="stat">
            <span className="label-medium muted">카드</span>
            <span className="title-large">{r.cards.length}장</span>
          </div>
          <div className="stat">
            <span className="label-medium muted">길 벗어남</span>
            <span className="title-large">{offCount}번</span>
          </div>
        </div>
        {r.kind === "planned" && (
          <p className="body-medium muted">
            {drafts === 0 ? "모든 카드에 사진이 들어갔어요. 다음부터 익숙한 길로 걸어요." : `사진이 없는 카드가 ${drafts}장 남았어요. 다음에 걸을 때 채우면 돼요.`}
          </p>
        )}
        {clean && <Quiz route={r} />}
        {canLevelUp && (
          <div className="surface-card tonal-card" style={{ width: "100%", textAlign: "left" }}>
            <p className="title-medium">길을 잃지 않고 {CLEAN_TO_LEVEL_UP}번 도착했어요</p>
            <p className="body-medium">
              다음부터 &lsquo;{LEVEL_TEXT[(level + 1) as PracticeLevel]}&rsquo;로 걸을 수 있어요. 길이 헷갈리면 언제든 전부 보기로 돌아가요.
            </p>
            <button className="btn btn-filled" style={{ marginTop: 8 }} onClick={levelUp}>
              다음부터 {LEVEL_TEXT[(level + 1) as PracticeLevel]}
            </button>
          </div>
        )}
      </div>
      <div className="body" style={{ flex: "none" }}>
        {canAddReturn && (
          <button
            className="btn btn-tonal"
            onClick={() => {
              try {
                sessionStorage.setItem("ijeongpyo.prefillName", r.name + RETURN_SUFFIX);
              } catch {}
              router.push("/record");
            }}
          >
            <Icon name="swap" /> 돌아오는 길도 등록하기
          </button>
        )}
        <Link href="/" className="btn btn-filled btn-large">
          <Icon name="home" size={28} /> 홈으로
        </Link>
      </div>
    </main>
  );
}

// 처음 가는 길의 사진 없는 카드: 길잡이를 확인하고 사진으로 채운다
function DraftPanel({ route, index, onChange }: { route: Route; index: number; onChange: (r: Route) => void }) {
  const card = route.cards[index];
  const [busy, setBusy] = useState<string | null>(null);
  const [miss, setMiss] = useState<{ blob: Blob; result: CheckResult } | null>(null);
  const name = card.landmark.name;
  const cand = card.candidates?.[0];
  const inputId = `check-${card.id}`;
  const seenBtn = useRef<HTMLLabelElement>(null);

  async function onPhoto(file: File) {
    const small = await shrinkPhoto(file);
    setBusy(URL.createObjectURL(small));
    setMiss(null);
    try {
      const r = await requestCheck({
        photo: await blobToPayload(small),
        expected: name || null,
        candidates: (card.candidates ?? []).map((c) => c.name),
        action: card.action,
        instruction: card.instruction,
      });
      if (r.seen || !name) {
        onChange(await applyCheck(route, index, small, r));
        logEvent(route.id, "landmark_seen");
        toast(`${card.order}번 카드에 사진을 넣었어요`);
        speak(name ? `사진에 ${josa(name, "이/가")} 보여요. ${r.instruction}` : `${card.order}번 카드에 사진을 넣었어요. ${r.instruction}`);
      } else {
        setMiss({ blob: small, result: r });
        speak(`사진에서 ${josa(name, "을/를")} 찾지 못했어요. 대신 ${josa(r.landmark.name, "이/가")} 보여요. 이걸 길잡이로 쓰려면 '이걸로 바꾸기'를 눌러 주세요.`);
      }
    } catch (e) {
      toast((e as Error).message);
      speak((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function notSeen() {
    logEvent(route.id, "landmark_missing");
    const next = nextCandidate(card);
    onChange(await replaceCard(route, index, next));
    speak(next.instruction);
  }

  async function acceptMiss() {
    if (!miss) return;
    onChange(await applyCheck(route, index, miss.blob, miss.result));
    setMiss(null);
    toast(`${card.order}번 카드를 바꿨어요`);
    speak(miss.result.instruction);
  }

  // 걷기 화면에서 말로 "보여요", "안 보여요", "이걸로"라고 했을 때
  useEffect(() => {
    const on = (e: Event) => {
      const id = (e as CustomEvent<string>).detail;
      if (id === "missing" && name && !miss) notSeen();
      else if (id === "accept" && miss) acceptMiss();
      else if (id === "seen") {
        // 카메라는 손으로 눌러야 열리는 휴대폰이 많아서, 누를 버튼을 알려 준다
        speak("화면의 '보여요'를 눌러 사진을 한 장 찍어 주세요.", { force: true });
        seenBtn.current?.classList.add("attention");
        setTimeout(() => seenBtn.current?.classList.remove("attention"), 3000);
      }
    };
    window.addEventListener("ijp:draft", on);
    return () => window.removeEventListener("ijp:draft", on);
  });

  if (busy) {
    return <AiWaiting title="길잡이 확인하는 중" hint="5~15초 걸려요" photoUrl={busy} stepMs={1200} steps={["사진 보내는 중", "간판 찾는 중", "카드와 맞춰 보는 중"]} />;
  }

  return (
    <div className="draft-panel">
      <CameraInput id={inputId} onPick={onPhoto} />
      {miss ? (
        <>
          <p className="title-medium">사진에서 {josa(name, "을/를")} 찾지 못했어요</p>
          <p className="body-medium muted">
            대신 보이는 것: {miss.result.landmark.name}. 이걸 길잡이로 쓰면 &ldquo;{miss.result.instruction}&rdquo;가 돼요.
          </p>
          <button className="btn btn-filled" onClick={acceptMiss}>
            이걸로 바꾸기
          </button>
          <label htmlFor={inputId} className="btn btn-outlined">
            다시 찍기
          </label>
        </>
      ) : name ? (
        <>
          <p className="label-medium muted">사진이 아직 없는 카드예요</p>
          <p className="draft-name">{name}</p>
          <p className="body-medium muted">
            {[cand?.category, cand?.floor ? `${cand.floor}층` : null].filter(Boolean).join(" · ") || "지도 데이터에서 고른 길잡이"}
          </p>
          <PlaceLine place={card.place} />
          <p className="title-medium" style={{ marginTop: 8 }}>
            {josa(name, "이/가")} 보이나요?
          </p>
          <div className="row">
            <button className="btn btn-outlined" onClick={notSeen}>
              안 보여요
            </button>
            <label htmlFor={inputId} className="btn btn-filled" ref={seenBtn}>
              <Icon name="camera" size={18} /> 보여요
            </label>
          </div>
          <p className="label-medium muted">&lsquo;보여요&rsquo;를 누르면 사진을 한 장 찍어요. 다음에는 이 사진으로 안내해요.</p>
        </>
      ) : (
        <>
          <p className="label-medium muted">근처에 고를 만한 가게가 없어요</p>
          <p className="title-medium">주변을 찍으면 AI가 길잡이를 골라요</p>
          <label htmlFor={inputId} className="btn btn-filled">
            <Icon name="camera" size={18} /> 주변 찍기
          </label>
        </>
      )}
    </div>
  );
}

const SHORT: Record<string, string> = { left: "왼쪽", right: "오른쪽", straight: "곧장", arrive: "도착" };

// 시안의 날짜 줄(일~토, 고른 날은 주황 칸)을 카드 순서로 바꾼 것. 지금 카드는 크게, 줄에서는 주황 칸.
function StepStrip({ route, index }: { route: Route; index: number }) {
  const total = route.cards.length;
  const card = route.cards[index];
  const strip = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // 화면 전체가 같이 내려가지 않게, 줄 안에서만 옆으로 민다
    const box = strip.current;
    const on = box?.querySelector<HTMLElement>(".step.on");
    if (box && on) box.scrollTo({ left: on.offsetLeft - box.clientWidth / 2 + on.clientWidth / 2, behavior: "smooth" });
  }, [index]);
  return (
    <div className="walk-head">
      <div className="walk-date" aria-label={`${total}장 중 ${index + 1}번째 카드`}>
        <span className="walk-num">{index + 1}</span>
        <span className="walk-of">
          <b>{SHORT[card.action] ?? ""}</b>
          <small>{total}장 중</small>
        </span>
      </div>
      <div className="step-strip" ref={strip} aria-hidden="true">
        {route.cards.map((c, i) => (
          <span key={c.id} className={`step${i === index ? " on" : i < index ? " done" : ""}`}>
            <small>{SHORT[c.action] ?? ""}</small>
            <b>{i + 1}</b>
          </span>
        ))}
      </div>
    </div>
  );
}

export default function WalkPage() {
  const { routeId } = useParams<{ routeId: string }>();
  const [route, setRoute] = useState<Route | null | undefined>(undefined);
  const [index, setIndex] = useState(0);
  const [dir, setDir] = useState<"next" | "prev">("next");
  const [autoMode, setAutoMode] = useState<"auto" | "manual" | "none">("none");
  const [offRoute, setOffRoute] = useState(false);
  const [arrived, setArrived] = useState<{ offCount: number; clean: boolean } | null>(null);
  const [fullView, setFullView] = useState(false); // 연습 모드에서 이번 걷기만 전부 보기
  const [showPhoto, setShowPhoto] = useState(false); // 연습 2단계: 사진을 잠깐 보기
  const [approach, setApproach] = useState(false);
  const offSince = useRef<number | null>(null);
  const indexRef = useRef(0);
  const logged = useRef({ start: false, off: false });
  const offCount = useRef(0);
  const alerted = useRef(new Set<number>());
  const farSaid = useRef(new Set<number>()); // "다음 갈림길까지 약 ○미터예요"를 말한 카드
  const nearSaid = useRef(new Set<number>()); // "곧 갈림길이에요"를 말한 카드
  const here = useRef<{ lat: number; lng: number } | null>(null); // 마지막으로 잘 잡힌 위치
  const saidManual = useRef(false);
  const quiet = useRef(false); // 연습 3단계: 꺾는 곳에서만 알린다
  const router = useRouter();
  const [startedAt] = useState(() => Date.now());

  useWakeLock(!!route && !arrived);

  useEffect(() => {
    db.routes.get(routeId).then((r) => {
      if (r) {
        // 다른 화면에 갔다 왔으면 보던 카드에서 이어 간다
        const resume = takeResume(r.id);
        const at = resume ? r.cards.findIndex((c) => c.order === resume) : -1;
        if (at > 0) setIndex(at);
        if (resume === null) clearLost(r.id); // 다른 화면에서 돌아온 게 아니면 새 걷기
        if (wasLost(r.id)) setFullView(true);
        db.routes.update(r.id, { lastWalkedAt: new Date().toISOString() });
        if (!logged.current.start) {
          logged.current.start = true;
          logEvent(r.id, "walk_start");
        }
      }
      setRoute(r ?? null);
      // 카드 문장을 미리 받아 두면 걸을 때 AI 목소리가 바로 나온다
      if (r) prefetchSpeech(r.cards.map((c) => c.instruction));
      // 건물 이름과 번지가 없는 카드는 위치로 채운다 (예전에 만든 길, 같이 걸으며 등록한 길)
      if (r)
        fillPlaces(r).then((u) => {
          if (!u) return;
          const found = new Map(u.cards.map((c) => [c.id, c.place]));
          setRoute((cur) => (cur ? { ...cur, cards: cur.cards.map((c) => (c.place === undefined ? { ...c, place: found.get(c.id) } : c)) } : cur));
        });
    });
  }, [routeId]);

  const card = route?.cards[index];

  // 카드가 바뀔 때마다: 마지막 카드 번호 저장, 진동, 음성 안내
  useEffect(() => {
    if (!card) return;
    indexRef.current = index;
    try {
      localStorage.setItem(lastCardKey(routeId), String(card.order));
    } catch {}
    buzz(200);
    speak(card.instruction);
    // 위치가 잡혀 있으면 바로 이어서 다음 갈림길까지 거리를 알린다 (카드를 손이나 말로 넘겼을 때도)
    const next = route?.cards[index + 1];
    const d = distToCard(next);
    if (next && d !== null && d > NEAR_M && !quiet.current && !farSaid.current.has(next.order)) {
      farSaid.current.add(next.order);
      speak(`다음 갈림길까지 약 ${spokenDistance(d)}예요.`, { queue: true });
    }
    // 카드가 바뀌는 순간에만 실행하고 싶어서 card.order로 묶는다 (같은 카드의 문장이 바뀔 때는 DraftPanel이 읽는다)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card?.order, index, routeId]);

  // 연습 3단계(꺾는 곳에서만 알림)에서는 "다음 갈림길까지 ○미터"를 말하지 않는다
  useEffect(() => {
    quiet.current = (route?.practiceLevel ?? 1) === 3 && !fullView;
  }, [route, fullView]);

  // 지금 위치에서 그 카드 지점까지 거리. 위치가 안 잡혔으면 null
  function distToCard(c?: Card): number | null {
    if (!c || c.lat === undefined || c.lng === undefined || !here.current) return null;
    return distanceM(here.current.lat, here.current.lng, c.lat, c.lng);
  }

  const go = useCallback(
    (d: number) => {
      if (!route) return;
      setDir(d > 0 ? "next" : "prev");
      setIndex((i) => Math.min(route.cards.length - 1, Math.max(0, i + d)));
      setOffRoute(false);
      setShowPhoto(false);
      setApproach(false);
    },
    [route],
  );

  async function arrive() {
    if (!route) return;
    logEvent(route.id, "walk_end");
    buzz([100, 60, 100, 60, 200]);
    speak("도착했어요.");
    const clean = offCount.current === 0 && !wasLost(route.id);
    clearLost(route.id);
    let r = route;
    if (clean) {
      r = { ...route, cleanArrivals: (route.cleanArrivals ?? 0) + 1 };
      await db.routes.put(r);
      setRoute(r);
    }
    setArrived({ offCount: offCount.current, clean });
  }

  // GPS: 다음 카드 30m 안이면 넘기고, 등록 경로에서 50m·20초 벗어나면 물어본다
  useEffect(() => {
    if (!route || arrived || !("geolocation" in navigator)) return;
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude: lat, longitude: lng, accuracy } = pos.coords;
        if (accuracy > BAD_ACCURACY_M) {
          setAutoMode("manual"); // 건물 사이 등 GPS가 나쁠 때는 버튼으로 넘긴다
          here.current = null;
          if (!saidManual.current) {
            saidManual.current = true;
            speak("위치가 잘 안 잡혀요. 카드를 직접 넘기거나 '다음'이라고 말해 주세요.", { queue: true });
          }
          return;
        }
        setAutoMode("auto");
        here.current = { lat, lng };
        const now = route.cards[indexRef.current];
        const next = route.cards[indexRef.current + 1];
        if (next?.lat !== undefined && next.lng !== undefined) {
          // 내비처럼: 카드가 뜬 뒤 남은 거리 → 70m 안에서 "곧 갈림길" → 30m 안에서 다음 카드(문장을 읽음)
          const d = distanceM(lat, lng, next.lat, next.lng);
          if (d <= NEXT_CARD_RADIUS_M) go(1);
          else if (d <= NEAR_M) {
            if (!nearSaid.current.has(next.order)) {
              nearSaid.current.add(next.order);
              farSaid.current.add(next.order);
              if (isDraft(next)) alerted.current.add(next.order);
              buzz([60, 60, 60]);
              speak(nearText(next), { queue: true });
            }
          } else if (!farSaid.current.has(next.order) && !quiet.current) {
            farSaid.current.add(next.order);
            speak(`다음 갈림길까지 약 ${spokenDistance(d)}예요.`, { queue: true });
          }
        }
        // 처음 가는 길: 사진 없는 카드의 갈림길 50m 전에 한 번 알린다
        if (now && isDraft(now) && now.lat !== undefined && now.lng !== undefined && !alerted.current.has(now.order)) {
          if (distanceM(lat, lng, now.lat, now.lng) <= APPROACH_M) {
            alerted.current.add(now.order);
            setApproach(true);
            buzz([80, 80, 80]);
            if (now.landmark.name) speak(`곧 갈림길이에요. ${josa(now.landmark.name, "이/가")} 보이나요? ${placeSpeech(now.place)}`.trim(), { queue: true });
          }
        }
        if (route.track && route.track.length > 5) {
          const far = distanceToTrackM(lat, lng, route.track) > OFF_ROUTE_M;
          if (far) {
            offSince.current ??= Date.now();
            if (Date.now() - offSince.current > OFF_ROUTE_SECONDS * 1000) {
              setOffRoute(true);
              setFullView(true); // 길을 벗어나면 이번 걷기는 전부 보기로
              if (!logged.current.off) {
                logged.current.off = true; // 벗어난 한 번을 한 번으로 센다
                offCount.current += 1;
                logEvent(route.id, "off_route");
                buzz([300, 100, 300]);
                speak("길에서 조금 멀어졌어요. 길이 헷갈리면 '길을 잃었어요'라고 말하거나 아래 버튼을 눌러 주세요.");
              }
            }
          } else {
            offSince.current = null;
            logged.current.off = false;
            setOffRoute(false);
          }
        }
      },
      () => setAutoMode("manual"),
      { enableHighAccuracy: true, maximumAge: 3000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [route, go, arrived]);

  if (route === undefined) {
    return (
      <main className="screen">
        <AppBar title="" back="/" />
        <div className="body">
          <div className="skeleton" style={{ height: 8, borderRadius: 4 }} />
          <div className="skeleton" style={{ height: 300, borderRadius: 24 }} />
          <div className="skeleton line" style={{ height: 32, width: "80%" }} />
          <div className="skeleton line" style={{ height: 32, width: "55%" }} />
        </div>
      </main>
    );
  }
  if (route === null || !card) {
    return (
      <main className="screen">
        <AppBar title="걷기" back="/" />
        <div className="body">
          <p className="body-large">이 길을 찾을 수 없어요. 홈에서 길을 다시 골라 주세요.</p>
        </div>
      </main>
    );
  }
  if (arrived) return <Arrived route={route} startedAt={startedAt} offCount={arrived.offCount} clean={arrived.clean} />;

  const total = route.cards.length;
  const next = route.cards[index + 1];
  const isLast = index === total - 1;
  const draft = isDraft(card);
  // 연습 단계: 길을 벗어났거나 길을 잃었던 걷기는 전부 보기. GPS가 나쁘면 3단계도 2단계처럼 보여 준다.
  let level: PracticeLevel = fullView ? 1 : (route.practiceLevel ?? 1);
  if (level === 3 && autoMode !== "auto") level = 2;
  const minimal = level === 3 && !showPhoto && !draft;
  const commands: Command[] = [
    { id: "next", say: ["다음", "넘겨", "다음 카드"], when: !isLast },
    { id: "prev", say: ["이전", "뒤로", "전 카드", "앞 카드"], when: index > 0 },
    { id: "repeat", say: ["다시", "뭐라고", "한 번 더", "안내해"] },
    { id: "where", say: ["얼마나", "남았", "몇 미터", "거리", "몇 번째"] },
    { id: "seen", say: ["보여", "보입니다", "찾았어"], when: draft },
    { id: "missing", say: ["안 보여", "안보여", "못 찾겠", "없어"] },
    { id: "accept", say: ["이걸로", "바꿔"], when: draft },
    { id: "lost", say: ["길을 잃었", "길 잃었", "여기가 어디", "어디야", "모르겠"] },
    { id: "photo", say: ["사진"], when: !draft },
    { id: "arrive", say: ["도착"], when: isLast },
    { id: "ask", say: ["물어볼", "도와줘", "도움"] },
    { id: "place", say: ["건물", "주소", "번지", "번호판"] },
    { id: "stop", say: ["그만", "조용", "멈춰"] },
    { id: "home", say: ["홈으로", "처음 화면"] },
  ];

  function onVoice(id: string) {
    if (!route || !card) return;
    if (id === "next") {
      logEvent(route.id, "manual_next");
      go(1);
    } else if (id === "prev") go(-1);
    else if (id === "repeat") speak(card.instruction, { force: true });
    else if (id === "where") {
      const left = route.cards.length - index - 1;
      const d = autoMode === "auto" ? distToCard(route.cards[index + 1]) : null;
      speak(
        `${route.cards.length}장 중 ${index + 1}번째 카드예요. ` +
          (left ? `${left}장 남았어요.` : "마지막 카드예요.") +
          (left && d !== null ? ` 다음 갈림길까지 약 ${spokenDistance(d)}예요.` : ""),
        { force: true },
      );
    } else if (id === "seen" || id === "accept" || (id === "missing" && draft)) {
      window.dispatchEvent(new CustomEvent("ijp:draft", { detail: id }));
    } else if (id === "missing") router.push(`/fix/${route.id}/${card.order}`);
    else if (id === "lost" || id === "ask") {
      setResume(route.id, card.order);
      router.push(`/${id}/${route.id}`);
    } else if (id === "photo") setShowPhoto(true);
    else if (id === "arrive") arrive();
    else if (id === "place") speak(placeSpeech(card.place) || "이 카드에는 건물 이름과 번지가 없어요.", { force: true });
    else if (id === "stop") stopSpeaking();
    else if (id === "home") router.push("/");
  }

  return (
    <main className="screen">
      <AppBar title={route.name} back="/" trailing={<IconLink href={`/review/${route.id}`} icon="edit" label="카드 고치기" />} />
      <div className="body">
        <StepStrip route={route} index={index} />
        {(route.practiceLevel ?? 1) > 1 && (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span className="chip label-medium">연습 · {LEVEL_TEXT[level]}</span>
            {level > 1 && (
              <button className="btn btn-text label-large" onClick={() => setFullView(true)}>
                전부 보기
              </button>
            )}
          </div>
        )}

        <div key={index} className={dir === "next" ? "card-in-next" : "card-in-prev"} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {draft ? (
            <>
              {approach && <div className="banner body-medium">곧 갈림길이에요.</div>}
              <DraftPanel route={route} index={index} onChange={setRoute} />
            </>
          ) : minimal ? (
            <div className="practice-quiet">
              <Icon name="walk" size={40} />
              <p className="title-large">다음 갈림길에서 진동과 음성으로 알려 줘요</p>
              <p className="body-medium muted">화면을 보지 않고 걸어도 돼요.</p>
              <button className="btn btn-outlined" onClick={() => setShowPhoto(true)}>
                지금 카드 보기
              </button>
            </div>
          ) : level === 2 && !showPhoto ? (
            <button className="photo practice-hidden pressable" style={{ height: 120 }} onClick={() => setShowPhoto(true)}>
              <span className="label-large">
                <Icon name="image" size={20} /> 사진 보기
              </span>
            </button>
          ) : (
            <PhotoView photoId={card.photoId} height={300} caption={`${card.order}번 카드 사진`} />
          )}
          {!minimal && (
            <p className="guide" aria-live="polite">
              {card.instruction}
            </p>
          )}
          {!minimal && !draft && <PlaceLine place={card.place} />}
          {level === 1 && !draft && <p className="body-large muted">{next ? `다음 길잡이: ${next.landmark.name || "방향만 안내"}` : "마지막 카드예요"}</p>}
        </div>

        {!draft && !minimal && (
          <Link href={`/fix/${route.id}/${card.order}`} className="btn btn-text label-large" style={{ alignSelf: "flex-start", marginTop: -8 }}>
            <Icon name="swap" size={18} /> 길잡이가 안 보여요
          </Link>
        )}

        {autoMode === "manual" && <p className="label-medium muted">위치가 정확하지 않아요. 카드를 직접 넘겨 주세요.</p>}
        {offRoute && (
          <div className="banner body-medium">
            {route.kind === "planned" ? "안내하는 길" : "등록한 길"}에서 조금 멀어졌어요. 길이 헷갈리면 아래 &lsquo;길을 잃었어요&rsquo;를 눌러 주세요.
          </div>
        )}
        <div className="row">
          <button className="btn btn-outlined" onClick={() => go(-1)} disabled={index === 0}>
            이전 카드
          </button>
          {isLast ? (
            <button className="btn btn-filled" onClick={arrive}>
              <Icon name="flag" size={20} /> 도착했어요
            </button>
          ) : (
            <button
              className="btn btn-filled"
              onClick={() => {
                logEvent(route.id, "manual_next");
                go(1);
              }}
            >
              다음 카드
            </button>
          )}
        </div>
        <VoiceControl
          commands={commands}
          onCommand={onVoice}
          allowAlways
          examples={draft ? "'보여요', '안 보여요', '다시'" : "'다음', '다시', '얼마나 남았어', '길을 잃었어요'"}
        />
        <div className="grow" />
        <Link
          href={`/lost/${route.id}`}
          onClick={() => setResume(route.id, card.order)}
          className="btn btn-tonal btn-large"
          style={offRoute ? { outline: "3px solid var(--primary)" } : undefined}
        >
          길을 잃었어요
        </Link>
      </div>
    </main>
  );
}
