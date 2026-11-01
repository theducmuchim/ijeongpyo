"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppBar, Icon, IconLink, PhotoView } from "@/components/ui";
import { db } from "@/lib/db";
import {
  BAD_ACCURACY_M,
  NEXT_CARD_RADIUS_M,
  OFF_ROUTE_M,
  OFF_ROUTE_SECONDS,
  distanceM,
  distanceToTrackM,
} from "@/lib/geo";
import { setResume, takeResume } from "@/lib/resume";
import { lastCardKey, loadSettings } from "@/lib/settings";
import { logEvent } from "@/lib/usageLog";
import { josa } from "@/lib/josa";
import type { Route } from "@/types";

const RETURN_SUFFIX = " 돌아오는 길";

function speak(text: string) {
  if (!loadSettings().voice || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "ko-KR";
  window.speechSynthesis.speak(u);
}

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

function Arrived({ route, startedAt, offCount }: { route: Route; startedAt: number; offCount: number }) {
  const router = useRouter();
  const [minutes] = useState(() => Math.max(1, Math.round((Date.now() - startedAt) / 60000)));
  const canAddReturn = !route.name.endsWith(RETURN_SUFFIX.trim());
  const colors = ["var(--primary)", "var(--tertiary-container)", "var(--primary-container)", "var(--secondary-container)"];
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
        <p className="body-large muted">{josa(route.name, "을/를")} 끝까지 걸었어요.</p>
        <div className="stat-row" style={{ marginTop: 12 }}>
          <div className="stat">
            <span className="label-medium muted">걸린 시간</span>
            <span className="title-large">{minutes}분</span>
          </div>
          <div className="stat">
            <span className="label-medium muted">카드</span>
            <span className="title-large">{route.cards.length}장</span>
          </div>
          <div className="stat">
            <span className="label-medium muted">길 벗어남</span>
            <span className="title-large">{offCount}번</span>
          </div>
        </div>
      </div>
      <div className="body" style={{ flex: "none" }}>
        {canAddReturn && (
          <button
            className="btn btn-tonal"
            onClick={() => {
              try {
                sessionStorage.setItem("ijeongpyo.prefillName", route.name + RETURN_SUFFIX);
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

export default function WalkPage() {
  const { routeId } = useParams<{ routeId: string }>();
  const [route, setRoute] = useState<Route | null | undefined>(undefined);
  const [index, setIndex] = useState(0);
  const [dir, setDir] = useState<"next" | "prev">("next");
  const [autoMode, setAutoMode] = useState<"auto" | "manual" | "none">("none");
  const [offRoute, setOffRoute] = useState(false);
  const [arrived, setArrived] = useState<{ offCount: number } | null>(null);
  const offSince = useRef<number | null>(null);
  const indexRef = useRef(0);
  const logged = useRef({ start: false, off: false });
  const offCount = useRef(0);
  const [startedAt] = useState(() => Date.now());

  useWakeLock(!!route && !arrived);

  useEffect(() => {
    db.routes.get(routeId).then((r) => {
      if (r) {
        // 다른 화면에 갔다 왔으면 보던 카드에서 이어 간다
        const resume = takeResume(r.id);
        const at = resume ? r.cards.findIndex((c) => c.order === resume) : -1;
        if (at > 0) setIndex(at);
        db.routes.update(r.id, { lastWalkedAt: new Date().toISOString() });
        if (!logged.current.start) {
          logged.current.start = true;
          logEvent(r.id, "walk_start");
        }
      }
      setRoute(r ?? null);
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
    if (loadSettings().vibrate && "vibrate" in navigator) navigator.vibrate(200);
    speak(card.instruction);
  }, [card, index, routeId]);

  const go = useCallback(
    (d: number) => {
      if (!route) return;
      setDir(d > 0 ? "next" : "prev");
      setIndex((i) => Math.min(route.cards.length - 1, Math.max(0, i + d)));
      setOffRoute(false);
    },
    [route],
  );

  function arrive() {
    if (!route) return;
    logEvent(route.id, "walk_end");
    if (loadSettings().vibrate && "vibrate" in navigator) navigator.vibrate([100, 60, 100, 60, 200]);
    speak("도착했어요.");
    setArrived({ offCount: offCount.current });
  }

  // GPS: 다음 카드 30m 안이면 넘기고, 등록 경로에서 50m·20초 벗어나면 물어본다
  useEffect(() => {
    if (!route || arrived || !("geolocation" in navigator)) return;
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude: lat, longitude: lng, accuracy } = pos.coords;
        if (accuracy > BAD_ACCURACY_M) {
          setAutoMode("manual"); // 건물 사이 등 GPS가 나쁠 때는 버튼으로 넘긴다
          return;
        }
        setAutoMode("auto");
        const next = route.cards[indexRef.current + 1];
        if (next?.lat !== undefined && next.lng !== undefined) {
          if (distanceM(lat, lng, next.lat, next.lng) <= NEXT_CARD_RADIUS_M) go(1);
        }
        if (route.track && route.track.length > 5) {
          const far = distanceToTrackM(lat, lng, route.track) > OFF_ROUTE_M;
          if (far) {
            offSince.current ??= Date.now();
            if (Date.now() - offSince.current > OFF_ROUTE_SECONDS * 1000) {
              setOffRoute(true);
              if (!logged.current.off) {
                logged.current.off = true; // 벗어난 한 번을 한 번으로 센다
                offCount.current += 1;
                logEvent(route.id, "off_route");
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
          <p className="body-large">이 길을 찾을 수 없어요.</p>
        </div>
      </main>
    );
  }
  if (arrived) return <Arrived route={route} startedAt={startedAt} offCount={arrived.offCount} />;

  const total = route.cards.length;
  const next = route.cards[index + 1];
  const isLast = index === total - 1;

  return (
    <main className="screen">
      <AppBar title={route.name} back="/" trailing={<IconLink href={`/review/${route.id}`} icon="edit" label="카드 고치기" />} />
      <div className="body">
        <div className="progress">
          <span className="label-large muted" aria-label={`${total}장 중 ${index + 1}번째 카드`}>
            {index + 1} / {total}
          </span>
          <div className="track" aria-hidden="true">
            <div className="fill" style={{ width: `${((index + 1) / total) * 100}%` }} />
          </div>
        </div>

        <div key={index} className={dir === "next" ? "card-in-next" : "card-in-prev"} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <PhotoView photoId={card.photoId} height={300} caption={`${card.order}번 카드 사진`} />
          <p className="guide" aria-live="polite">
            {card.instruction}
          </p>
          <p className="body-large muted">{next ? `다음 길잡이: ${next.landmark.name}` : "마지막 카드예요"}</p>
        </div>

        <Link
          href={`/fix/${route.id}/${card.order}`}
          className="btn btn-text label-large"
          style={{ alignSelf: "flex-start", marginTop: -8 }}
        >
          <Icon name="swap" size={18} /> 길잡이가 안 보여요
        </Link>

        {autoMode === "manual" && (
          <p className="label-medium muted">위치가 정확하지 않아요. 카드를 직접 넘겨 주세요.</p>
        )}
        {offRoute && (
          <div className="banner body-medium">
            등록한 길에서 조금 멀어졌어요. 길이 헷갈리면 아래 &lsquo;길을 잃었어요&rsquo;를 누르세요.
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
