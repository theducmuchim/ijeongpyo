"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppBar, PhotoView } from "@/components/ui";
import { db } from "@/lib/db";
import {
  BAD_ACCURACY_M,
  NEXT_CARD_RADIUS_M,
  OFF_ROUTE_M,
  OFF_ROUTE_SECONDS,
  distanceM,
  distanceToTrackM,
} from "@/lib/geo";
import { lastCardKey, loadSettings } from "@/lib/settings";
import { logEvent } from "@/lib/usageLog";
import type { Route } from "@/types";

export default function WalkPage() {
  const { routeId } = useParams<{ routeId: string }>();
  const [route, setRoute] = useState<Route | null | undefined>(undefined);
  const [index, setIndex] = useState(0);
  const [autoMode, setAutoMode] = useState<"auto" | "manual" | "none">("none");
  const [offRoute, setOffRoute] = useState(false);
  const offSince = useRef<number | null>(null);
  const settings = useRef(loadSettings());
  const indexRef = useRef(0);
  const logged = useRef({ start: false, end: false, off: false });

  useEffect(() => {
    db.routes.get(routeId).then((r) => {
      setRoute(r ?? null);
      if (r) db.routes.update(r.id, { lastWalkedAt: new Date().toISOString() });
      if (r && !logged.current.start) {
        logged.current.start = true;
        logEvent(r.id, "walk_start");
      }
    });
  }, [routeId]);

  const card = route?.cards[index];

  // 카드가 바뀔 때마다: 마지막 카드 번호 저장, 진동, 음성 안내
  useEffect(() => {
    if (!card) return;
    indexRef.current = index;
    if (route && route.cards.length > 1 && index === route.cards.length - 1 && !logged.current.end) {
      logged.current.end = true;
      logEvent(routeId, "walk_end");
    }
    try {
      localStorage.setItem(lastCardKey(routeId), String(card.order));
    } catch {}
    if (settings.current.vibrate && "vibrate" in navigator) navigator.vibrate(200);
    if (settings.current.voice && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(card.instruction);
      u.lang = "ko-KR";
      window.speechSynthesis.speak(u);
    }
  }, [card, index, routeId, route]);

  const go = useCallback(
    (d: number) => {
      if (!route) return;
      setIndex((i) => Math.min(route.cards.length - 1, Math.max(0, i + d)));
      setOffRoute(false);
    },
    [route],
  );

  // GPS: 다음 카드 30m 안이면 넘기고, 등록 경로에서 50m·20초 벗어나면 물어본다
  useEffect(() => {
    if (!route || !("geolocation" in navigator)) return;
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
  }, [route, go]);

  if (route === undefined) return <main className="screen" />;
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

  const total = route.cards.length;
  const next = route.cards[index + 1];

  return (
    <main className="screen">
      <AppBar title={route.name} back="/" />
      <div className="body">
        <div className="progress">
          <span className="label-large muted">
            {index + 1} / {total}
          </span>
          <div className="track" aria-hidden="true">
            <div className="fill" style={{ width: `${((index + 1) / total) * 100}%` }} />
          </div>
        </div>
        <PhotoView photoId={card.photoId} height={300} caption={`${card.order}번 카드 사진`} />
        <p className="guide" aria-live="polite">
          {card.instruction}
        </p>
        <p className="body-large muted">
          {next ? `다음 길잡이: ${next.landmark.name}` : "마지막 카드예요. 도착하면 끝!"}
        </p>
        {autoMode === "manual" && (
          <p className="label-medium muted">위치가 정확하지 않아서 버튼으로 카드를 넘겨 주세요.</p>
        )}
        {offRoute && (
          <div className="banner body-medium">
            혹시 길이 헷갈리나요? 같이 찾아봐요. 아래 &lsquo;길을 잃었어요&rsquo;를 눌러 주세요.
          </div>
        )}
        <div className="row">
          <button className="btn btn-outlined" onClick={() => go(-1)} disabled={index === 0}>
            이전 카드
          </button>
          <button
            className="btn btn-filled"
            onClick={() => {
              logEvent(route.id, "manual_next");
              go(1);
            }}
            disabled={index === total - 1}
          >
            다음 카드
          </button>
        </div>
        <div className="grow" />
        <Link
          href={`/lost/${route.id}`}
          className="btn btn-tonal btn-large"
          style={offRoute ? { outline: "3px solid var(--primary)" } : undefined}
        >
          길을 잃었어요
        </Link>
      </div>
    </main>
  );
}
