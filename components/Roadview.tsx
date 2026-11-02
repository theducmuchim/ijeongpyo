"use client";

import { useEffect, useRef, useState } from "react";

// 출발 전 미리 둘러보기: 카카오 로드뷰를 실시간 뷰어로만 보여 준다.
// 카카오 정책상 화면 캡처·저장·AI 분석은 하지 않는다 (사람이 보는 용도만).
// NEXT_PUBLIC_KAKAO_JS_KEY = 카카오 개발자 사이트의 'JavaScript 키'. 브라우저에서 쓰는 키라 사이트 도메인을 등록해야 동작한다.
const KEY = process.env.NEXT_PUBLIC_KAKAO_JS_KEY;

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    kakao?: any;
  }
}

let loading: Promise<void> | null = null;
function loadSdk(): Promise<void> {
  if (window.kakao?.maps?.Roadview) return Promise.resolve();
  loading ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${KEY}&autoload=false`;
    s.onload = () => window.kakao.maps.load(() => resolve());
    s.onerror = () => {
      loading = null;
      reject(new Error("카카오 지도를 불러오지 못했어요"));
    };
    document.head.appendChild(s);
  });
  return loading;
}

type State = "loading" | "ok" | "none" | "error";

export function Roadview({ lat, lng, heading }: { lat: number; lng: number; heading?: number }) {
  const box = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<State>("loading");

  useEffect(() => {
    if (!KEY) return;
    let alive = true;
    loadSdk()
      .then(() => {
        if (!alive || !box.current) return;
        const k = window.kakao.maps;
        const rv = new k.Roadview(box.current);
        const pos = new k.LatLng(lat, lng);
        new k.RoadviewClient().getNearestPanoId(pos, 50, (panoId: number | null) => {
          if (!alive) return;
          if (!panoId) return setState("none");
          if (heading !== undefined) {
            k.event.addListener(rv, "init", () => {
              try {
                rv.setViewpoint({ pan: heading, tilt: 0, zoom: 0 });
              } catch {
                // 시점을 못 돌려도 로드뷰는 그대로 보인다
              }
            });
          }
          rv.setPanoId(panoId, pos);
          setState("ok");
        });
      })
      .catch(() => alive && setState("error"));
    return () => {
      alive = false;
    };
  }, [lat, lng, heading]);

  if (!KEY) {
    return (
      <div className="roadview-msg body-medium muted">
        로드뷰를 보려면 카카오 지도 키가 필요해요. (시험 모드)
      </div>
    );
  }
  return (
    <div className="roadview-wrap">
      <div ref={box} className="roadview" aria-label="로드뷰" />
      {state !== "ok" && (
        <div className="roadview-msg body-medium muted">
          {state === "loading" ? "로드뷰 불러오는 중…" : state === "none" ? "이 지점은 로드뷰가 없어요." : "로드뷰를 불러오지 못했어요."}
        </div>
      )}
      <p className="label-medium muted" style={{ marginTop: 6 }}>
        로드뷰는 찍은 지 오래됐을 수 있어요. 가게가 바뀌었을 수도 있어요.
      </p>
    </div>
  );
}
