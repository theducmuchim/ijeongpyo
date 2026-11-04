"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { CornerBlob, LineIcon, TabBar, TONES } from "@/components/brand";
import { Roadview } from "@/components/Roadview";
import { AiWaiting, AppBar, CameraInput, Icon, MockBadge } from "@/components/ui";
import { usePermission } from "@/components/Permission";
import { PlaceLine } from "@/components/Place";
import { DictateButton, VoiceControl, useScreenSpeech } from "@/components/Voice";
import { requestCheck, requestPlaces, requestPlan } from "@/lib/api";
import { db, newId, savePhoto } from "@/lib/db";
import { blobToPayload, shrinkPhoto } from "@/lib/image";
import { josa } from "@/lib/josa";
import { toast } from "@/lib/toast";
import { bearingDeg, distanceM } from "@/lib/geo";
import { logEvent } from "@/lib/usageLog";
import { permState } from "@/lib/permissions";
import { freshFix, POOR_FIX_M, type Fix } from "@/lib/locate";
import { placeSpeech, placeText } from "@/lib/place";
import { type Command, PLAN_QUERY_KEY, speak } from "@/lib/voice";
import type { Card, CheckResult, Place, PlanCard, PlanResult, Route } from "@/types";

// 로드뷰를 보고 그 자리를 직접 찍어(또는 앨범에서 골라) 올린 사진. 저장할 때 카드에 들어간다.
type Shot = { url: string; blob: Blob; result?: CheckResult; busy?: boolean };

// 처음 가는 길: 도착지를 고르면 지도 데이터로 사진 없는 카드 초안을 만들고, 미리 둘러본 뒤 걷는다.

const SHORT_LABEL = { straight: "곧장", left: "왼쪽", right: "오른쪽", arrive: "도착" } as const;
const shortLabel = (c: PlanCard) => (c.start ? "출발" : SHORT_LABEL[c.action]);

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


const ORDINALS = [
  ["첫 번째", "첫번째", "1번", "일번"],
  ["두 번째", "두번째", "2번", "이번 거"],
  ["세 번째", "세번째", "3번", "삼번"],
  ["네 번째", "네번째", "4번", "사번"],
  ["다섯 번째", "다섯번째", "5번", "오번"],
];

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
  const [gps, setGps] = useState<Gps | "waiting" | "ask" | "denied">("waiting");
  const [permDialog, ensurePerm] = usePermission();
  const [q, setQ] = useState("");
  const [places, setPlaces] = useState<Place[] | null>(null);
  const [placesMock, setPlacesMock] = useState(false);
  const [dest, setDest] = useState<Place | null>(null);
  const [plan, setPlan] = useState<PlanResult | null>(null);
  const [busy, setBusy] = useState<"search" | "locate" | "plan" | "save" | null>(null);
  const [startFix, setStartFix] = useState<Fix | null>(null); // 카드를 만들 때 새로 잡은 출발 위치
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<number | null>(null); // 로드뷰를 연 카드
  const [name, setName] = useState("");
  const [shots, setShots] = useState<Record<number, Shot>>({});

  function locate() {
    if (!("geolocation" in navigator)) return setGps("denied");
    setGps("waiting");
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
  }

  // 위치 권한을 이미 허용했으면 바로 위치를 잡고, 아니면 먼저 물어본다(버튼)
  async function askLocation() {
    const perm = await ensurePerm("location");
    if (perm.ok) locate();
    else setGps("denied");
  }

  useEffect(() => {
    permState("location").then((st) => (st === "granted" ? locate() : setGps(st === "denied" ? "denied" : "ask")));
    // 홈에서 말로 고른 도착지가 있으면 바로 찾는다
    try {
      const pq = sessionStorage.getItem(PLAN_QUERY_KEY);
      sessionStorage.removeItem(PLAN_QUERY_KEY);
      if (pq) setTimeout(() => search(pq, true), 0);
    } catch {}
    return () => {
      destCache = undefined; // 다음에 들어올 때는 미리 채운 도착지를 다시 쓰지 않는다
    };
    // 화면을 열 때 한 번만 위치를 잡는다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const here = typeof gps === "object" ? gps : null;
  const target = dest ?? prefill;

  async function search(query = q, byVoice = false) {
    const text = query.trim();
    if (!text) return;
    setQ(text);
    setBusy("search");
    setError(null);
    try {
      const r = await requestPlaces(text, here?.lat, here?.lng);
      setPlaces(r.places);
      setPlacesMock(!!r.mock);
      if (byVoice) {
        const top = r.places.slice(0, 3).map((p, i) => `${i + 1}번, ${p.name.replace(/^\(시험\)\s*/, "")}.`).join(" ");
        speak(r.places.length ? `${r.places.length}곳을 찾았어요. ${top} 고르려면 '첫 번째'처럼 말해 주세요.` : "찾는 장소가 없어요. 다른 이름으로 말해 주세요.");
      }
    } catch (e) {
      setError((e as Error).message);
      if (byVoice) speak((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  // 출발지는 '지금 서 있는 곳'이다. 화면을 열 때 잡은 위치는 오래됐거나 부정확할 수 있어서,
  // 카드를 만들기 직전에 위치를 새로 잡는다. 잡히지 않으면 화면을 열 때 잡은 위치를 쓴다.
  async function makePlan(to: Place, fallback: Gps = here) {
    setDest(to);
    setName(`${to.name.replace(/^\(시험\)\s*/, "")} 가는 길`);
    setError(null);
    setBusy("locate");
    let from: Fix | null = null;
    try {
      from = await freshFix();
    } catch (e) {
      if (fallback) from = { ...fallback, accuracy: -1 };
      else {
        setBusy(null);
        return setError((e as Error).message);
      }
    }
    setStartFix(from);
    setGps({ lat: from.lat, lng: from.lng });
    setBusy("plan");
    try {
      setPlan(await requestPlan({ start: { lat: from.lat, lng: from.lng }, end: { lat: to.lat, lng: to.lng, name: to.name } }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  // 도착지를 고르면: 위치 권한이 없으면 먼저 물어보고, 지금 위치에서 출발하는 카드를 만든다
  async function choose(to: Place) {
    if (gps === "ask" || gps === "denied") {
      const perm = await ensurePerm("location");
      if (!perm.ok) {
        setGps("denied");
        return setError("출발지는 지금 위치라서 위치 권한이 필요해요. 설정에서 위치를 허용해 주세요.");
      }
    }
    makePlan(to);
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
      const name = c.landmark.name;
      speak(
        result.seen && name
          ? `${c.order}번 사진에 ${josa(name, "이/가")} 보여요.`
          : name
            ? `${c.order}번 사진에서 ${josa(name, "을/를")} 못 찾았어요. 대신 ${josa(result.landmark.name, "을/를")} 길잡이로 써요.`
            : `${c.order}번은 ${josa(result.landmark.name, "을/를")} 길잡이로 써요.`,
      );
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
          place: c.place,
          start: c.start,
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
      place: c.place,
      start: c.start,
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

  const planCommands: Command[] = [
    { id: "go", label: "이 길로 가기", say: ["이 길로", "출발", "가자", "갈게"] },
    { id: "read", label: "카드 읽기", say: ["읽어", "카드", "알려 줘", "알려줘"] },
    { id: "back", label: "다시 고르기", say: ["다시 고르", "다른 곳"] },
  ];
  function onPlanVoice(id: string) {
    if (!plan) return;
    if (id === "go") save();
    else if (id === "back") setPlan(null);
    else if (id === "read") plan.cards.forEach((c, i) => speak(`${c.order}번. ${c.instruction}. ${placeSpeech(c.place)}`.trim(), { queue: i > 0, force: true }));
  }
  useScreenSpeech(
    busy === "plan"
      ? null
      : plan && target
        ? `카드 ${plan.cards.length}장을 만들었어요. 걸어서 약 ${Math.max(1, Math.round(plan.totalTime / 60))}분이에요. 출발하려면 '이 길로 가기'를 눌러 주세요.`
        : "도착지 이름을 적거나 말해 주세요. 출발지는 지금 위치예요.",
  );
  const searchCommands: Command[] = ORDINALS.map((say, i) => ({ id: String(i), label: `${i + 1}번 고르기`, say, when: !!places && i < places.length }));

  if (busy === "locate") {
    return (
      <main className="screen">
        <AppBar title="처음 가는 길" />
        <div className="body">
          <AiWaiting title="지금 위치 확인 중" hint="출발지를 정확히 잡고 있어요. 몇 초 걸려요" stepMs={2500} steps={["GPS 받는 중", "위치 맞추는 중"]} />
        </div>
      </main>
    );
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
            <p className="body-medium">
              출발: 지금 위치{placeText(plan.from) ? ` · ${placeText(plan.from)} 근처` : ""}
              {startFix && startFix.accuracy >= 0 && <span className="muted"> · 오차 약 {startFix.accuracy}m</span>}
            </p>
          </div>
          {startFix && (startFix.accuracy < 0 || startFix.accuracy > POOR_FIX_M) && (
            <div className="banner body-medium" role="status" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <span>
                {startFix.accuracy < 0
                  ? "지금 위치를 새로 잡지 못해서 조금 전 위치로 만들었어요."
                  : `위치가 정확하지 않아요(오차 약 ${startFix.accuracy}m). 출발 카드가 실제 자리와 다를 수 있어요.`}{" "}
                밖으로 나가 잠시 기다린 뒤 다시 잡아 주세요.
              </span>
              <button className="btn btn-tonal" style={{ alignSelf: "flex-start" }} onClick={() => makePlan(target)}>
                <Icon name="flag" size={18} /> 지금 위치로 다시 만들기
              </button>
            </div>
          )}
          <p className="body-medium muted">
            아직 사진이 없는 카드예요. 로드뷰로 그 자리를 미리 보고, 사진이 있으면 올려 주세요. 없으면 걸으면서 채워요.
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
              const guide = c.candidates[0];
              // 로드뷰는 길잡이 가게 쪽을 보게 하고 상호명을 띄운다 (지도 안내 이름은 좌표가 지점 좌표라 방향만)
              const shop = guide && guide.category !== "지도 안내에 나오는 곳" ? { lat: guide.lat, lng: guide.lng, name: guide.name } : undefined;
              const tone = c.action === "arrive" ? TONES[3] : i === 0 ? TONES[0] : null;
              return (
                <div key={c.order} className="t-row">
                  <div className="t-num">
                    <b>{c.order}</b>
                    <small>{shortLabel(c)}</small>
                  </div>
                  <div className={`t-card${tone ? " tone" : ""}`} style={tone ? { background: tone.bg } : undefined}>
                    {tone && <CornerBlob color={tone.blob} />}
                    <p className="t-title">{c.instruction}</p>
                    {c.landmark.name && (
                      <p className="t-meta">
                        <LineIcon name="pin" size={16} /> {c.landmark.name}
                      </p>
                    )}
                    <PlaceLine place={c.place} className="t-meta" />
                    {c.candidates.length > 1 && (
                      <p className="t-meta muted">
                        <LineIcon name="cards" size={16} /> 안 보이면 {c.candidates.slice(1).map((x) => x.name).join(", ")}
                      </p>
                    )}
                    <button className="btn btn-text label-large" style={{ alignSelf: "flex-start", padding: 0, minHeight: 36, position: "relative" }} onClick={() => setOpen(open === i ? null : i)}>
                      <Icon name="image" size={18} /> {open === i ? "로드뷰 닫기" : "로드뷰로 미리 보기"}
                    </button>
                    {open === i && <Roadview lat={c.lat} lng={c.lng} heading={heading} target={shop} />}
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
          <VoiceControl commands={planCommands} onCommand={onPlanVoice} examples="'카드 읽어 줘', '출발', '다시 고르기'" />
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
        {gps === "ask" || gps === "denied" ? (
          <div className="surface-card tonal-card" style={{ gap: 8 }}>
            <p className="body-medium">
              {gps === "ask" ? "출발지는 지금 위치예요. 지금 위치를 알려면 위치 권한이 필요해요." : "위치를 쓸 수 없어서 출발지를 알 수 없어요."}
            </p>
            <button className="btn btn-filled" onClick={askLocation}>
              <Icon name="flag" size={18} /> 위치 허용하기
            </button>
          </div>
        ) : (
          <p className="label-medium muted">{gps === "waiting" ? "지금 위치 찾는 중…" : "출발지: 지금 위치"}</p>
        )}
        {permDialog}
        <form
          className="row"
          style={{ alignItems: "center" }}
          onSubmit={(e) => {
            e.preventDefault();
            search();
          }}
        >
          <input className="field body-large" style={{ flex: 3 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="도착지 이름 (예: 서대전역)" aria-label="도착지 검색" />
          <DictateButton label="도착지를 말로 찾기" onText={(t) => search(t, true)} />
          <button className="btn btn-filled" style={{ flex: 1, padding: 0 }} disabled={busy === "search" || !q.trim()}>
            검색
          </button>
        </form>
        {places && places.length > 0 && (
          <VoiceControl
            commands={searchCommands}
            onCommand={(id) => places[Number(id)] && choose(places[Number(id)])}
            onOther={(t) => search(t, true)}
            examples="'첫 번째', 또는 다른 도착지 이름"
            label="말로 고르기"
          />
        )}
        <MockBadge show={placesMock} />
        {error && <p className="banner body-medium">{error}</p>}
        {busy === "search" && <div className="linear" />}
        {places?.length === 0 && <p className="body-medium muted">찾는 장소가 없어요. 다른 이름으로 검색해 보세요.</p>}
        <div className="stagger" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {places?.map((p) => (
            <button key={`${p.name}-${p.lat}`} className="list-row" style={{ textAlign: "left", border: "none", width: "100%" }} onClick={() => choose(p)}>
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
