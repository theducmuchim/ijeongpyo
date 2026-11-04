"use client";

import { useEffect, useRef, useState } from "react";
import { bearingDeg, distanceM } from "@/lib/geo";

// 출발 전 미리 둘러보기: 카카오 로드뷰를 실시간 뷰어로만 보여 준다.
// 여기서는 보기만 한다. (체험하기 사진 6장은 운영자가 약관을 확인한 뒤 로드뷰에서 따로 찍어 public/demo에 둔 것)
// NEXT_PUBLIC_KAKAO_JS_KEY = 카카오 개발자 사이트의 'JavaScript 키'. 브라우저에서 쓰는 키라 사이트 도메인을 등록해야 동작한다.
const KEY = process.env.NEXT_PUBLIC_KAKAO_JS_KEY;

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    kakao?: any;
  }
}

let loading: Promise<void> | null = null;
function addScript(src: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = () => {
      if (!window.kakao?.maps?.load) return reject(new Error("지도 설정이 꺼져 있어요"));
      window.kakao.maps.load(() => resolve());
    };
    s.onerror = () => {
      s.remove();
      reject(new Error("지도 파일을 받지 못했어요"));
    };
    document.head.appendChild(s);
  });
}
function loadSdk(): Promise<void> {
  if (window.kakao?.maps?.Roadview) return Promise.resolve();
  const base = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${KEY}&autoload=false`;
  // 예전에 받은 오류 응답(설정이 꺼져 있던 때)이 휴대폰에 저장돼 있을 수 있어, 실패하면 저장본을 피해서 한 번 더 받는다
  loading ??= addScript(base)
    .catch(() => addScript(`${base}&t=${Date.now()}`))
    .catch((e) => {
      loading = null;
      throw e;
    });
  return loading;
}

type State = "loading" | "ok" | "none" | "error";
const TIMEOUT_MS = 20000; // 지도 파일과 지점 찾기까지 (사진이 채워지는 시간은 빼고)

type Target = { lat: number; lng: number; name: string };

// 로드뷰 위에 띄우는 상호명 표시 (카카오 커스텀 오버레이 내용)
function labelEl(name: string) {
  const el = document.createElement("div");
  el.className = "rv-label";
  el.textContent = name;
  return el;
}

/** target(길잡이 가게)이 있으면 그 가게 쪽을 보게 돌리고, 가게 자리에 상호명을 띄운다. */
export function Roadview({ lat, lng, heading, target }: { lat: number; lng: number; heading?: number; target?: Target }) {
  const box = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<State>("loading");
  const [why, setWhy] = useState("");

  useEffect(() => {
    if (!KEY) return;
    let alive = true;
    const cleanups: (() => void)[] = [];
    const fail = (e: unknown) => {
      if (!alive) return;
      const msg = String((e as Error)?.message ?? e);
      console.error("[roadview]", msg);
      setWhy(msg);
      setState("error");
    };
    const timer = setTimeout(() => fail(new Error("응답이 늦어요")), TIMEOUT_MS);
    loadSdk()
      .then(() => {
        if (!alive || !box.current) return;
        const k = window.kakao.maps;
        const rv = new k.Roadview(box.current);
        const pos = new k.LatLng(lat, lng);
        new k.RoadviewClient().getNearestPanoId(pos, 50, (panoId: number | null) => {
          if (!alive) return;
          if (!panoId) {
            clearTimeout(timer);
            return setState("none");
          }
          // 카카오 로드뷰는 'init' 신호를 보내지 않는 일이 있어(실제로 확인), 신호를 기다리지 않는다.
          // 지점을 찾으면 바로 로드뷰 칸을 보여 주고, 사진은 휴대폰 망에 따라 5~15초 뒤에 채워진다.
          try {
            rv.setPanoId(panoId, pos);
          } catch (e) {
            clearTimeout(timer);
            return fail(e);
          }
          clearTimeout(timer);
          setState("ok");
          // 사진이 다 들어와도 카카오 로드뷰가 스스로 다시 그리지 않아 회색으로 남는 일이 있었다(실제로 확인).
          // 크기를 다시 재라고(relayout) 몇 번 알려 준다. 시점은 사용자가 직접 돌리기 전까지만 맞춘다.
          let touched = false;
          box.current?.addEventListener("pointerdown", () => (touched = true), { once: true });
          // 길잡이 가게가 있으면: 로드뷰 사진을 찍은 자리에서 가게 쪽으로 시점을 돌리고, 가게 자리에 상호명을 띄운다
          let overlay: any = null;
          const showTarget = () => {
            if (!target || overlay) return;
            try {
              overlay = new k.CustomOverlay({ position: new k.LatLng(target.lat, target.lng), content: labelEl(target.name), xAnchor: 0.5, yAnchor: 1 });
              overlay.setAltitude?.(3);
              overlay.setMap(rv);
              cleanups.push(() => overlay?.setMap(null));
            } catch {
              overlay = null; // 로드뷰가 아직 준비되지 않았으면 다음 차례에 다시 한다
            }
          };
          const look = (): number | undefined => {
            if (!target) return heading;
            let from = { lat, lng };
            try {
              const p = rv.getPosition();
              if (p) from = { lat: p.getLat(), lng: p.getLng() };
            } catch {}
            if (distanceM(from.lat, from.lng, target.lat, target.lng) < 2) return heading;
            return bearingDeg(from.lat, from.lng, target.lat, target.lng);
          };
          k.event?.addListener?.(rv, "init", () => {
            if (!alive) return;
            showTarget();
            const pan = look();
            if (pan !== undefined && !touched) rv.setViewpoint({ pan, tilt: 0, zoom: 0 });
          });
          for (const ms of [300, 1500, 3500, 6000, 9000, 13000, 18000]) {
            setTimeout(() => {
              if (!alive) return;
              try {
                rv.relayout();
                if (ms >= 1500) showTarget();
                const pan = look();
                if (pan !== undefined && !touched) rv.setViewpoint({ pan, tilt: 0, zoom: 0 });
              } catch {
                // 다시 그리기나 시점 맞추기를 못 해도 로드뷰는 그대로 둔다
              }
            }, ms);
          }
          const onResize = () => {
            try {
              rv.relayout();
            } catch {
              // 무시
            }
          };
          window.addEventListener("resize", onResize);
          cleanups.push(() => window.removeEventListener("resize", onResize));
          // 망이 느려 사진이 늦게 오면 위의 시간표를 넘길 수 있어서, 거리 사진이 들어올 때마다도 다시 그린다
          if (box.current) {
            const seen = new WeakSet<HTMLImageElement>();
            const hook = () =>
              box.current?.querySelectorAll("img").forEach((img) => {
                if (seen.has(img)) return;
                seen.add(img);
                img.addEventListener("load", onResize);
              });
            const mo = new MutationObserver(hook);
            mo.observe(box.current, { subtree: true, childList: true, attributes: true, attributeFilter: ["src"] });
            hook();
            cleanups.push(() => mo.disconnect());
          }
        });
      })
      .catch((e) => {
        clearTimeout(timer);
        fail(e);
      });
    return () => {
      alive = false;
      clearTimeout(timer);
      cleanups.forEach((f) => f());
    };
    // target은 화면이 그려질 때마다 새 객체라서 값으로 묶는다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lng, heading, target?.lat, target?.lng, target?.name]);

  if (!KEY) {
    return (
      <div className="roadview-msg body-medium muted">
        로드뷰를 보려면 카카오 지도 키가 필요해요. (시험 모드)
      </div>
    );
  }
  return (
    <div className="roadview-wrap">
      <div ref={box} className="roadview" aria-label={target ? `로드뷰. 가운데 쪽에 ${target.name}` : "로드뷰"} />
      {target && state === "ok" && (
        <p className="rv-badge label-large" aria-hidden>
          길잡이 <b>{target.name}</b> · 화면 가운데 쪽
        </p>
      )}
      {state !== "ok" && (
        <div className="roadview-msg body-medium muted">
          {state === "loading" ? "로드뷰 불러오는 중…" : state === "none" ? "이 지점은 로드뷰가 없어요." : `로드뷰를 불러오지 못했어요. 잠시 뒤 다시 열어 주세요. (${why})`}
        </div>
      )}
      <p className="label-medium muted" style={{ marginTop: 6 }}>
        {target ? "노란 이름표가 붙은 곳이 길잡이 가게 자리예요. " : ""}거리 사진이 뜨기까지 10초쯤 걸릴 수 있어요. 찍은 지 오래돼서 가게가 바뀌었을 수도 있어요.
      </p>
    </div>
  );
}
