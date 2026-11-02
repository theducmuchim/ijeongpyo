"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { CornerBlob, LineIcon, TabBar, TONES } from "@/components/brand";
import { Roadview } from "@/components/Roadview";
import { AiWaiting, AppBar, CameraInput, Icon, MockBadge } from "@/components/ui";
import { requestCheck, requestPlaces, requestPlan } from "@/lib/api";
import { db, newId, savePhoto } from "@/lib/db";
import { blobToPayload, shrinkPhoto } from "@/lib/image";
import { josa } from "@/lib/josa";
import { toast } from "@/lib/toast";
import { bearingDeg, distanceM } from "@/lib/geo";
import { logEvent } from "@/lib/usageLog";
import type { Card, CheckResult, Place, PlanCard, PlanResult, Route } from "@/types";

// 로드뷰를 보고 그 자리를 직접 찍어(또는 앨범에서 골라) 올린 사진. 저장할 때 카드에 들어간다.
type Shot = { url: string; blob: Blob; result?: CheckResult; busy?: boolean };

// 처음 가는 길: 도착지를 고르면 지도 데이터로 사진 없는 카드 초안을 만들고, 미리 둘러본 뒤 걷는다.

const SHORT_LABEL = { straight: "곧장", left: "왼쪽", right: "오른쪽", arrive: "도착" } as const;

// '길을 잃었어요'에서 '여기서 다시 길 찾기'로 오면 도착지가 미리 들어 있다
let destCache: (Place & { from?: string }) | null | undefined;
function readDest() {
  if (destCache === undefined) {
    try {
      const raw = sessionStorage.getItem("ijeongpyo.planDest");
      sessionStorage.removeItem("ijeongpyo.planDest");
      destCache = raw ? { address: "", ...JSON.parse(raw) } : null;
    } catch {
      destCache = null;
    }
  }
  return destCache ?? null;
}
const noSubscribe = () => () => {};

type Gps = { lat: number; lng: number } | null;

function km(m: number) {
  return m >= 1000 ? `${(m / 1000).toFixed(1)}km` : `${m}m`;
}

function ShotBox({ i, card, shot, onPick, onRemove }: { i: number; card: PlanCard; shot?: Shot; onPick: (f: File) => void; onRemove: () => void }) {
  const inputId = `shot-${i}`;
  if (!shot) {
    return (
      <>
        <CameraInput id={inputId} gallery onPick={onPick} />
        <label htmlFor={inputId} className="btn btn-text label-large" style={{ alignSelf: "flex-start", padding: 0, minHeight: 36, position: "relative", cursor: "pointer" }}>
          <Icon name="camera" size={18} /> 이 자리 사진 올리기
        </label>
      </>
    );
  }
  const r = shot.result;
  const name = card.landmark.name;
  return (
    <div className="shot-box">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={shot.url} alt={`${card.order}번 자리 사진`} />
      <div className="shot-text">
        {shot.busy ? (
          <p className="body-medium">사진 확인하는 중…</p>
        ) : r ? (
          <>
            <p className="body-medium">
              {r.seen && name ? `사진에 ${josa(name, "이/가")} 보여요` : name ? `사진에서 ${josa(name, "을/를")} 못 찾았어요. 대신 ${josa(r.landmark.name, "을/를")} 길잡이로 써요` : `${josa(r.landmark.name, "을/를")} 길잡이로 써요`}
            </p>
            <p className="label-medium">저장하면: {r.instruction}</p>
          </>
        ) : (
          <p className="body-medium">사진만 넣어 둘게요. 문장은 그대로예요.</p>
        )}
        <button className="btn btn-text label-large" style={{ padding: 0, minHeight: 32, width: "auto", alignSelf: "flex-start" }} onClick={onRemove}>
          사진 빼기
        </button>
      </div>
    </div>
  );
}

export default function PlanPage() {
  const router = useRouter();
  const prefill = useSyncExternalStore(noSubscribe, readDest, () => null);
  const [gps, setGps] = useState<Gps | "waiting" | "denied">("waiting");
  const [q, setQ] = useState("");
  const [places, setPlaces] = useState<Place[] | null>(null);
  const [placesMock, setPlacesMock] = useState(false);
  const [dest, setDest] = useState<Place | null>(null);
  const [plan, setPlan] = useState<PlanResult | null>(null);
  const [busy, setBusy] = useState<"search" | "plan" | "save" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<number | null>(null); // 로드뷰를 연 카드
  const [name, setName] = useState("");
  const [shots, setShots] = useState<Record<number, Shot>>({});

  useEffect(() => {
    if (!("geolocation" in navigator)) return void setTimeout(() => setGps("denied"), 0);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const at = { lat: p.coords.latitude, lng: p.coords.longitude };
        setGps(at);
        // '여기서 다시 길 찾기'로 왔으면 위치가 잡히는 대로 바로 초안을 만든다
        const pre = readDest();
        if (pre) makePlan(pre, at);
      },
      () => setGps("denied"),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
    );
    return () => {
      destCache = undefined; // 다음에 들어올 때는 미리 채운 도착지를 다시 쓰지 않는다
    };
    // 화면을 열 때 한 번만 위치를 잡는다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const here = typeof gps === "object" ? gps : null;
  const target = dest ?? prefill;

  async function search() {
    if (!q.trim()) return;
    setBusy("search");
    setError(null);
    try {
      const r = await requestPlaces(q.trim(), here?.lat, here?.lng);
      setPlaces(r.places);
      setPlacesMock(!!r.mock);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function makePlan(to: Place, from: Gps = here) {
    if (!from) return setError("출발 위치를 알 수 없어요. 휴대폰 설정에서 위치를 허용해 주세요.");
    setDest(to);
    setName(`${to.name.replace(/^\(시험\)\s*/, "")} 가는 길`);
    setBusy("plan");
    setError(null);
    try {
      setPlan(await requestPlan({ start: from, end: { lat: to.lat, lng: to.lng, name: to.name } }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function addShot(i: number, c: PlanCard, file: File) {
    const blob = await shrinkPhoto(file);
    const url = URL.createObjectURL(blob);
    setShots((m) => ({ ...m, [i]: { url, blob, busy: true } }));
    try {
      const result = await requestCheck({
        photo: await blobToPayload(blob),
        expected: c.landmark.name || null,
        candidates: c.candidates.map((x) => x.name),
        action: c.action,
        instruction: c.instruction,
      });
      setShots((m) => (m[i]?.url === url ? { ...m, [i]: { url, blob, result } } : m));
    } catch (e) {
      // AI를 못 불러도 사진은 넣어 둔다. 카드 문장은 지도 데이터로 만든 그대로.
      setShots((m) => (m[i]?.url === url ? { ...m, [i]: { url, blob } } : m));
      toast((e as Error).message);
    }
  }

  function removeShot(i: number) {
    setShots((m) => {
      const next = { ...m };
      if (next[i]) URL.revokeObjectURL(next[i].url);
      delete next[i];
      return next;
    });
  }

  async function save() {
    if (!plan || !target) return;
    setBusy("save");
    const id = newId();
    const photoIds: Record<number, string> = {};
    for (const [k, shot] of Object.entries(shots)) photoIds[Number(k)] = await savePhoto(shot.blob);
    const cards: Card[] = plan.cards.map((c, i) => {
      const shot = shots[i];
      if (shot) {
        // 직접 올린 사진이 있으면 그 카드는 처음부터 사진 카드
        const r = shot.result;
        return {
          id: newId(),
          order: c.order,
          photoId: photoIds[i],
          photoDescription: r?.photoDescription ?? "",
          landmark: r?.landmark ?? c.landmark,
          action: c.action,
          instruction: r?.instruction || c.instruction,
          userNote: "",
          warning: r?.warning ?? null,
          lat: c.lat,
          lng: c.lng,
          source: "photo",
          candidates: c.candidates,
          checkedAt: new Date().toISOString(),
        };
      }
      return {
      id: newId(),
      order: c.order,
      photoId: "",
      photoDescription: "",
      landmark: c.landmark,
      action: c.action,
      instruction: c.instruction,
      userNote: "",
      warning: null,
      lat: c.lat,
      lng: c.lng,
      source: "draft",
      candidates: c.candidates,
      };
    });
    const route: Route = {
      id,
      name: name.trim() || `${target.name} 가는 길`,
      createdAt: new Date().toISOString(),
      cards,
      track: plan.track,
      status: "ready",
      kind: "planned",
      destName: target.name.replace(/^\(시험\)\s*/, ""),
      dest: { lat: target.lat, lng: target.lng },
    };
    await db.routes.put(route);
    navigator.storage?.persist?.().catch(() => {});
    logEvent(id, "plan_made", cards.length);
    if (Object.keys(shots).length) toast(`사진 ${Object.keys(shots).length}장을 넣어 저장했어요`);
    router.push(`/walk/${id}`);
  }

  if (busy === "plan") {
    return (
      <main className="screen">
        <AppBar title="처음 가는 길" />
        <div className="body">
          <AiWaiting
            title="카드 초안 만드는 중"
            hint="10~30초 걸려요"
            stepMs={2200}
            steps={["걷는 길 찾는 중", "꺾는 곳 근처 가게 찾는 중", "길잡이 고르는 중", "안내 문장 쓰는 중"]}
          />
        </div>
      </main>
    );
  }

  if (plan && target) {
    return (
      <main className="screen">
        <AppBar title="카드 초안" back="/" />
        <div className="body" style={{ paddingBottom: 140 }}>
          {plan.mock && (
            <p className="chip label-medium" role="status">
              시험 모드 · {plan.missing?.join(", ") || "키"} 없이 만든 예시 경로예요
            </p>
          )}
          <div className="surface-card">
            <p className="title-large">{target.name.replace(/^\(시험\)\s*/, "")}</p>
            <p className="body-medium muted">
              {km(plan.totalDistance)} · 걸어서 약 {Math.max(1, Math.round(plan.totalTime / 60))}분 · 카드 {plan.cards.length}장
            </p>
          </div>
          <p className="body-medium muted">
            사진이 없는 카드예요. 로드뷰로 미리 둘러보고, 그 자리 사진이 있으면 올려서 바로 사진 카드로 만들 수 있어요. 없으면 걸으면서 채워요.
          </p>
          {Object.keys(shots).length > 0 && (
            <p className="chip label-medium">
              사진 {Object.keys(shots).length}/{plan.cards.length}장 넣음
            </p>
          )}
          <div className="timeline stagger">
            <div className="timeline-head">
              <span>순서</span>
              <span>할 일</span>
            </div>
            {plan.cards.map((c, i) => {
              const nx = plan.cards[i + 1];
              const heading = nx ? bearingDeg(c.lat, c.lng, nx.lat, nx.lng) : undefined;
              const tone = c.action === "arrive" ? TONES[3] : i === 0 ? TONES[0] : null;
              return (
                <div key={c.order} className="t-row">
                  <div className="t-num">
                    <b>{c.order}</b>
                    <small>{SHORT_LABEL[c.action]}</small>
                  </div>
                  <div className={`t-card${tone ? " tone" : ""}`} style={tone ? { background: tone.bg } : undefined}>
                    {tone && <CornerBlob color={tone.blob} />}
                    <p className="t-title">{c.instruction}</p>
                    {c.landmark.name && (
                      <p className="t-meta">
                        <LineIcon name="pin" size={16} /> {c.landmark.name}
                      </p>
                    )}
                    {c.candidates.length > 1 && (
                      <p className="t-meta muted">
                        <LineIcon name="cards" size={16} /> 안 보이면 {c.candidates.slice(1).map((x) => x.name).join(", ")}
                      </p>
                    )}
                    <button className="btn btn-text label-large" style={{ alignSelf: "flex-start", padding: 0, minHeight: 36, position: "relative" }} onClick={() => setOpen(open === i ? null : i)}>
                      <Icon name="image" size={18} /> {open === i ? "로드뷰 닫기" : "로드뷰로 미리 보기"}
                    </button>
                    {open === i && <Roadview lat={c.lat} lng={c.lng} heading={heading} />}
                    <ShotBox i={i} card={c} shot={shots[i]} onPick={(f) => addShot(i, c, f)} onRemove={() => removeShot(i)} />
                  </div>
                </div>
              );
            })}
          </div>
          <label className="label-large" htmlFor="plan-name">
            길 이름
          </label>
          <input id="plan-name" className="field" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <nav className="demo-nav">
          <button className="btn btn-outlined" onClick={() => setPlan(null)}>
            다시 고르기
          </button>
          <button className="btn btn-filled" onClick={save} disabled={busy === "save"}>
            <Icon name="walk" size={20} /> 이 길로 가기
          </button>
        </nav>
      </main>
    );
  }

  return (
    <main className="screen with-tabs">
      <AppBar title="처음 가는 길" />
      <div className="body">
        <p className="body-large">도착지를 고르면 꺾는 곳마다 근처 가게를 길잡이로 삼아 카드 초안을 만들어요.</p>
        <p className="label-medium muted">
          {gps === "waiting"
            ? "지금 위치 찾는 중…"
            : gps === "denied"
              ? "위치를 쓸 수 없어요. 휴대폰 설정에서 위치를 허용해 주세요. 출발지는 지금 위치예요."
              : "출발지: 지금 위치"}
        </p>
        <form
          className="row"
          style={{ alignItems: "center" }}
          onSubmit={(e) => {
            e.preventDefault();
            search();
          }}
        >
          <input className="field body-large" style={{ flex: 3 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="도착지 이름 (예: 서대전역)" aria-label="도착지 검색" />
          <button className="btn btn-filled" style={{ flex: 1, padding: 0 }} disabled={busy === "search" || !q.trim()}>
            검색
          </button>
        </form>
        <MockBadge show={placesMock} />
        {error && <p className="banner body-medium">{error}</p>}
        {busy === "search" && <div className="linear" />}
        {places?.length === 0 && <p className="body-medium muted">찾는 장소가 없어요. 다른 이름으로 검색해 보세요.</p>}
        <div className="stagger" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {places?.map((p) => (
            <button key={`${p.name}-${p.lat}`} className="list-row" style={{ textAlign: "left", border: "none", width: "100%" }} onClick={() => makePlan(p)} disabled={!here}>
              <span className="avatar">
                <Icon name="flag" />
              </span>
              <span className="text">
                <p className="title-medium">{p.name}</p>
                <p className="body-medium muted">
                  {p.address}
                  {here ? ` · ${km(Math.round(distanceM(here.lat, here.lng, p.lat, p.lng)))}` : ""}
                </p>
              </span>
              <Icon name="forward" />
            </button>
          ))}
        </div>
        <div className="surface-card" style={{ marginTop: 8 }}>
          <p className="title-medium">처음 가는 길은 이렇게 걸어요</p>
          <p className="body-medium muted">
            카드는 지도 데이터로 만든 초안이라 사진이 없어요. 갈림길에 가까워지면 &ldquo;○○이 보이나요?&rdquo;라고 물어요. 보이면 사진을 찍고,
            안 보이면 다른 가게로 바꿔요. 다 걸으면 다음부터 익숙한 길처럼 사진 카드로 걸어요.
          </p>
        </div>
      </div>
      <TabBar />
    </main>
  );
}
