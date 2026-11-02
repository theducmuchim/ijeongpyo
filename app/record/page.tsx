"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { AiWaiting, AppBar, CameraInput, Icon, PhotoView } from "@/components/ui";
import { usePermission } from "@/components/Permission";
import { DictateButton, useScreenSpeech } from "@/components/Voice";
import { requestCards } from "@/lib/api";
import { db, getPhoto, newId, savePhoto } from "@/lib/db";
import { blobToPayload, shrinkPhoto } from "@/lib/image";
import { saveSettings, useSettings } from "@/lib/settings";
import { toast } from "@/lib/toast";
import type { Card, Junction, Route } from "@/types";

const MAX_JUNCTIONS = 20;


// 도착 화면에서 '돌아오는 길도 등록하기'를 누르면 이름을 미리 채워 둔다
let prefillCache: string | null = null;
function readPrefill() {
  if (prefillCache === null) {
    try {
      prefillCache = sessionStorage.getItem("ijeongpyo.prefillName") ?? "";
      sessionStorage.removeItem("ijeongpyo.prefillName");
    } catch {
      prefillCache = "";
    }
  }
  return prefillCache;
}
const noSubscribe = () => () => {};

// 서버 오류 문장에서 첫 문장만 쓴다. "내일 다시 해 주세요"처럼 뒤에 붙는 안내와 어긋나는 말을 뺀다.
const firstSentence = (m: string) => (m.match(/^.*?[.?](?=\s|$)/)?.[0] ?? m).trim();

export default function RecordPage() {
  const router = useRouter();
  const prefill = useSyncExternalStore(noSubscribe, readPrefill, () => "");
  const [typed, setName] = useState<string | null>(null);
  const name = typed ?? prefill;
  const [started, setStarted] = useState(false);
  const [junctions, setJunctions] = useState<Junction[]>([]);
  const [pendingPhoto, setPendingPhoto] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [aiWorking, setAiWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const settings = useSettings();
  const showNotice = settings ? !settings.seenPhotoNotice : false;
  const track = useRef<[number, number][]>([]);
  const lastPos = useRef<GeolocationPosition | null>(null);
  const watchId = useRef<number | null>(null);
  const [permDialog, ensurePerm] = usePermission();

  useScreenSpeech(
    aiWorking
      ? null
      : started
        ? "갈림길에 서면 사진을 한 장 찍고, 짧게 메모한 뒤 '여기서 꺾어요'를 눌러 주세요. 메모는 마이크를 눌러 말로 남겨도 돼요."
        : "보호자나 친구와 같이 걸으면서 길을 등록해요. 길 이름을 적고 '걷기 시작'을 눌러 주세요.",
  );

  useEffect(() => {
    return () => {
      if (watchId.current !== null) navigator.geolocation?.clearWatch(watchId.current);
      prefillCache = null; // 다음에 들어올 때는 미리 채운 이름을 다시 쓰지 않는다
    };
  }, []);

  async function start() {
    if (!name.trim()) return setError("길 이름을 적어 주세요");
    setError(null);
    // 걸어간 길을 기록하려면 위치가 필요하다. 먼저 물어보고, 허용하지 않아도 사진과 메모만으로 등록할 수 있다.
    const perm = await ensurePerm("location");
    setStarted(true);
    if (perm.ok && "geolocation" in navigator) {
      watchId.current = navigator.geolocation.watchPosition(
        (pos) => {
          lastPos.current = pos;
          track.current.push([pos.coords.longitude, pos.coords.latitude]);
        },
        () => {},
        { enableHighAccuracy: true, maximumAge: 5000 },
      );
    }
  }

  async function onPhoto(file: File) {
    try {
      setBusy("사진을 줄이는 중…");
      const small = await shrinkPhoto(file);
      const id = await savePhoto(small);
      setPendingPhoto(id);
    } catch (e) {
      setError(String((e as Error).message));
    } finally {
      setBusy(null);
    }
  }


  function addJunction() {
    if (!pendingPhoto) return;
    const pos = lastPos.current;
    setJunctions((js) => [
      ...js,
      { photoId: pendingPhoto, note: note.trim(), lat: pos?.coords.latitude, lng: pos?.coords.longitude },
    ]);
    setPendingPhoto(null);
    setNote("");
    if ("vibrate" in navigator) navigator.vibrate(30); // 남긴 갈림길은 아래 사진 줄에 바로 나타난다
  }

  async function finish() {
    if (junctions.length === 0) return setError("갈림길을 한 곳 이상 남겨 주세요");
    if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
    setError(null);
    setAiWorking(true);
    const routeId = newId();
    let cards: Card[];
    try {
      const payload = await Promise.all(
        junctions.map(async (j) => ({ photo: await blobToPayload((await getPhoto(j.photoId))!), note: j.note })),
      );
      const res = await requestCards(payload); // 갈림길마다 부르지 않고 한 번만 부른다
      cards = res.cards.map((d, i) => ({
        id: newId(),
        order: i + 1,
        photoId: junctions[i].photoId,
        photoDescription: d.photoDescription,
        landmark: d.landmark,
        action: d.action,
        instruction: d.instruction,
        userNote: junctions[i].note,
        warning: d.warning,
        lat: junctions[i].lat,
        lng: junctions[i].lng,
      }));
    } catch (e) {
      // AI가 안 될 때도 등록이 끊기지 않게, 메모로 카드를 만들고 확인 화면에서 고치게 한다.
      toast(`${firstSentence((e as Error).message)} 대신 메모로 카드를 만들었어요. 확인 화면에서 고쳐 주세요.`);
      cards = junctions.map((j, i) => ({
        id: newId(),
        order: i + 1,
        photoId: j.photoId,
        photoDescription: j.note || `${i + 1}번째 갈림길`,
        landmark: { name: j.note || `${i + 1}번 길잡이`, side: "ahead" },
        action: i === junctions.length - 1 ? "arrive" : "straight",
        instruction: j.note || "다음 갈림길까지 가세요",
        userNote: j.note,
        warning: null,
        lat: j.lat,
        lng: j.lng,
      }));
    }
    const route: Route = {
      id: routeId,
      name: name.trim(),
      createdAt: new Date().toISOString(),
      cards,
      track: track.current,
      status: "draft",
    };
    await db.routes.put(route);
    router.push(`/review/${routeId}`);
  }

  if (!started) {
    return (
      <main className="screen">
        <AppBar title="새 길 등록" back="/" />
        {permDialog}
        <div className="body">
          <p className="body-large">
            보호자나 친구와 같이 걸으면서 등록해요. 갈림길마다 사진 한 장과 짧은 메모를 남기면 AI가 안내 카드로 만들어요.
          </p>
          <label className="label-large" htmlFor="route-name">
            길 이름
          </label>
          <input
            id="route-name"
            className="field"
            placeholder="예: 등굣길"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          {showNotice && (
            <div className="surface-card">
              <p className="title-medium">사진은 구글 AI로 보내져요</p>
              <p className="body-medium muted">
                카드를 만들 때 사진을 구글 Gemini로 보내요. 얼굴, 집 주소, 문패가 찍히지 않게 해 주세요. 사진과 길 기록은 이
                휴대폰에만 저장돼요.
              </p>
              <button
                className="btn btn-text label-large"
                style={{ alignSelf: "flex-start" }}
                onClick={() => settings && saveSettings({ ...settings, seenPhotoNotice: true })}
              >
                확인
              </button>
            </div>
          )}
          {error && <p className="banner body-medium">{error}</p>}
          <div className="grow" />
          <button className="btn btn-filled btn-large" onClick={start}>
            걷기 시작
          </button>
        </div>
      </main>
    );
  }

  if (aiWorking) {
    return (
      <main className="screen">
        <AppBar title={`새 길 등록 · ${name}`} />
        <div className="body">
          <AiWaiting
            title="안내 카드 만드는 중"
            hint="10~30초 걸려요. 화면을 끄지 마세요."
            photoId={junctions.at(-1)?.photoId}
            steps={[
              `사진 ${junctions.length}장 보내는 중`,
              "간판과 건물 찾는 중",
              "길잡이 고르는 중",
              "안내 문장 쓰는 중",
            ]}
          />
        </div>
      </main>
    );
  }

  return (
    <main className="screen">
      <AppBar title={`새 길 등록 · ${name}`} back="/" />
      <div className="body">
        <CameraInput id="junction-photo" onPick={onPhoto} />
        <label htmlFor="junction-photo" className={`camera${pendingPhoto ? " has-photo" : ""}`}>
          {pendingPhoto ? (
            <PhotoView photoId={pendingPhoto} height={300} caption="방금 찍은 사진" />
          ) : (
            <span style={{ display: "grid", gap: 12, placeItems: "center" }}>
              <span className="cam-icon">
                <Icon name="camera" size={36} />
              </span>
              <span className="body-large">눌러서 사진 찍기</span>
              <span className="body-medium">간판이 보이게, 사람이 적은 쪽으로 찍어 주세요</span>
            </span>
          )}
        </label>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <p className="chip label-large">갈림길 {junctions.length}곳</p>
          {pendingPhoto && (
            <label htmlFor="junction-photo" className="btn btn-text label-large">
              <Icon name="refresh" size={18} /> 다시 찍기
            </label>
          )}
        </div>
        {junctions.length > 0 && (
          <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4 }} aria-label="지금까지 남긴 갈림길">
            {junctions.map((j, i) => (
              <div key={j.photoId} style={{ position: "relative" }} className="pop">
                <PhotoView photoId={j.photoId} thumb caption={`${i + 1}번째 갈림길`} />
                <span
                  className="label-medium"
                  style={{
                    position: "absolute", left: 4, top: 4, minWidth: 22, height: 22, borderRadius: 11,
                    background: "var(--primary)", color: "var(--on-primary)", display: "grid", placeItems: "center",
                  }}
                >
                  {i + 1}
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="list-row">
          <DictateButton label="음성으로 메모하기" onText={setNote} />
          <div className="text">
            <p className="label-medium muted">메모 (예: 꽃집에서 왼쪽)</p>
            <input
              className="field"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="말하거나 적어 주세요"
              aria-label="갈림길 메모"
            />
          </div>
        </div>

        {busy && <p className="banner body-medium">{busy}</p>}
        {error && <p className="banner body-medium">{error}</p>}

        <button
          className="btn btn-filled btn-large"
          onClick={addJunction}
          disabled={!pendingPhoto || !!busy || junctions.length >= MAX_JUNCTIONS}
        >
          여기서 꺾어요
        </button>
        <button className="btn btn-outlined" onClick={finish} disabled={!!busy || junctions.length === 0}>
          도착했어요
        </button>
        {junctions.length >= MAX_JUNCTIONS && (
          <p className="body-medium muted">갈림길은 {MAX_JUNCTIONS}곳까지 등록할 수 있어요.</p>
        )}
      </div>
    </main>
  );
}
