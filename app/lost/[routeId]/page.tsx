"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AiWaiting, AppBar, CameraInput, Icon, MockBadge, PhotoView } from "@/components/ui";
import { PlaceLine } from "@/components/Place";
import { VoiceControl, useScreenSpeech } from "@/components/Voice";
import { permState } from "@/lib/permissions";
import { hasPlace, placeText } from "@/lib/place";
import { requestWhereAmI } from "@/lib/api";
import { db } from "@/lib/db";
import { blobToPayload, shrinkPhoto } from "@/lib/image";
import { markLost, setResume } from "@/lib/resume";
import { readLastCardOrder, useSettings } from "@/lib/settings";
import { logEvent } from "@/lib/usageLog";
import { type Command, speak, stopSpeaking } from "@/lib/voice";
import type { ImagePayload, Route, WhereAmIResult } from "@/types";

const MAX_TRIES = 3;

// 지금 위치 (5초 안에 못 잡으면 없이 보낸다). 카드 지점까지 거리를 AI가 참고한다.
async function currentGps(): Promise<{ lat: number; lng: number } | null> {
  // 위치를 아직 허용하지 않았으면 여기서 갑자기 묻지 않고 사진만 보낸다
  if ((await permState("location")) !== "granted") return null;
  return new Promise((resolve) => {
    if (!("geolocation" in navigator)) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve(p.coords.accuracy <= 100 ? { lat: p.coords.latitude, lng: p.coords.longitude } : null),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 10000 },
    );
  });
}

export default function LostPage() {
  const { routeId } = useParams<{ routeId: string }>();
  const router = useRouter();
  const [route, setRoute] = useState<Route | null | undefined>(undefined);
  const [photos, setPhotos] = useState<ImagePayload[]>([]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [result, setResult] = useState<WhereAmIResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [said, setSaid] = useState(""); // 말로 한 설명. 다음 사진과 같이 보낸다
  const settings = useSettings();
  const opened = useRef(false);
  // 걷기 화면이 마지막으로 보여 준 카드 번호 (route를 불러온 뒤, 휴대폰에서만 읽힌다)
  const lastOrder = route ? readLastCardOrder(routeId) : 1;

  useEffect(() => {
    db.routes.get(routeId).then((r) => {
      setRoute(r ?? null);
      if (r && !opened.current) {
        opened.current = true;
        markLost(r.id);
        logEvent(r.id, "lost_open");
      }
    });
  }, [routeId]);

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  useScreenSpeech(route ? "주변 사진을 찍으면 지금 어디쯤인지 찾아 줘요. 간판이나 출구 번호가 보이게 찍어 주세요. 보이는 것을 말로 설명해도 돼요." : null);

  async function onPhoto(file: File) {
    if (!route) return;
    setBusy(true);
    setError(null);
    try {
      const small = await shrinkPhoto(file);
      setPreviewUrl(URL.createObjectURL(small));
      const all = [...photos, await blobToPayload(small)].slice(-MAX_TRIES);
      setPhotos(all);
      logEvent(route.id, "lost_photo", all.length);
      await locate(all, said);
    } catch (e) {
      setError((e as Error).message);
      speak((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // 결과를 소리로도 들려준다
  function speakResult(res: WhereAmIResult, tries: number) {
    if (res.confidence >= 0.6 && !res.askPhoto) speak(`${res.reasonForUser} ${res.nextStep}`);
    else if (tries >= MAX_TRIES) speak("세 번 찍어도 어디인지 찾지 못했어요. 화면에 마지막으로 지나간 곳 사진을 띄웠으니, 그곳으로 돌아가 주세요.");
    else speak(`사진만으로는 확실하지 않아요. ${res.askPhoto ?? "다른 방향도 한 장 찍어 주세요."}`);
  }

  async function locate(all: ImagePayload[], saidText: string) {
    if (!route) return;
    const res = await requestWhereAmI({
      photos: all,
      said: saidText || undefined,
      lastCardOrder: lastOrder,
      gps: await currentGps(),
      cards: route.cards.map((c) => ({
        order: c.order,
        // 사진 없는 처음 가는 길 카드는 사진 설명 대신 길잡이 후보를 보낸다
        // 건물 이름과 번호판(도로명 주소)도 같이 보낸다. 가게가 바뀌어도 사진 속 건물 이름·번호판으로 맞출 수 있다
        photoDescription:
          (c.photoDescription || `사진 없음. 길잡이 후보: ${(c.candidates ?? []).map((x) => x.name).join(", ") || "없음"}`) +
          (hasPlace(c.place) ? ` / 건물·번지${c.place.near ? "(근처)" : ""}: ${placeText(c.place)}` : ""),
        landmarkName: c.landmark.name,
        instruction: c.instruction,
        lat: c.lat,
        lng: c.lng,
      })),
    });
    setResult(res);
    if (res.error) setError(res.error);
    if (res.confidence >= 0.6 && !res.askPhoto) logEvent(route.id, "lost_found", all.length);
    else if (all.length >= MAX_TRIES) logEvent(route.id, "lost_gave_up", all.length);
    speakResult(res, all.length);
  }

  // 사진을 찍은 뒤 말로 설명을 더하면, 같은 사진으로 다시 묻는다
  async function onSaid(text: string) {
    setSaid(text);
    if (!photos.length) return speak("들었어요. 이제 주변 사진을 한 장 찍어 주세요.", { force: true });
    setBusy(true);
    setError(null);
    try {
      await locate(photos, text);
    } catch (e) {
      setError((e as Error).message);
      speak((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function shareLocation() {
    const s = settings;
    if (!s || !route) return;
    logEvent(route.id, "guardian_share");
    const send = (text: string) => {
      if (s.guardianPhone) {
        window.location.href = `sms:${s.guardianPhone}?body=${encodeURIComponent(text)}`;
      } else if (navigator.share) {
        navigator.share({ text }).catch(() => {});
      }
    };
    if (!("geolocation" in navigator)) return send("길을 잃었어요. 전화 주세요.");
    navigator.geolocation.getCurrentPosition(
      (p) => send(`길을 잃었어요. 지금 여기 있어요: https://maps.google.com/?q=${p.coords.latitude},${p.coords.longitude}`),
      () => send("길을 잃었어요. 전화 주세요."),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  if (route === undefined) return <main className="screen" />;
  if (route === null) {
    return (
      <main className="screen">
        <AppBar title="길 찾기" back="/" />
        <div className="body">
          <p className="body-large">이 길을 찾을 수 없어요. 홈에서 길을 다시 골라 주세요.</p>
        </div>
      </main>
    );
  }

  const confident = result && result.confidence >= 0.6 && !result.askPhoto;
  const triesLeft = MAX_TRIES - photos.length;
  const gaveUp = result && !confident && triesLeft <= 0;
  const lastCard = route.cards.find((c) => c.order === lastOrder) ?? route.cards[0];
  const backTo = (order: number) => {
    setResume(route.id, order);
    router.push(`/walk/${route.id}`);
  };
  const replan = () => {
    try {
      sessionStorage.setItem("ijeongpyo.planDest", JSON.stringify({ name: route.destName ?? route.name, ...route.dest }));
    } catch {}
    router.push("/plan");
  };

  const commands: Command[] = [
    { id: "resume", label: "다시 걷기", say: ["다시 걷기", "이어서", "다시 걸을"], when: !!(confident && result?.matchedCardOrder) },
    { id: "last", label: "마지막 카드로", say: ["마지막 카드", "돌아갈", "돌아가기"] },
    { id: "replan", label: "다시 길 찾기", say: ["다시 길 찾", "새로 찾", "길 다시"], when: route.kind === "planned" && !!route.dest },
    { id: "ask", label: "물어보기", say: ["물어볼", "물어보기", "도와줘"] },
    { id: "guardian", label: "보호자에게 위치 보내기", say: ["보호자", "전화", "위치 보내", "엄마", "아빠"], when: !!settings?.guardianShare },
    { id: "repeat", label: "다시 읽기", say: ["다시 말해", "뭐라고", "한 번 더"] },
    { id: "stop", label: "멈춤", say: ["그만", "조용"] },
  ];
  const routeId2 = route.id;
  function onVoice(id: string) {
    if (id === "resume" && result?.matchedCardOrder) backTo(result.matchedCardOrder);
    else if (id === "last") backTo(lastCard.order);
    else if (id === "replan") replan();
    else if (id === "ask") router.push(`/ask/${routeId2}`);
    else if (id === "guardian") shareLocation();
    else if (id === "repeat" && result) speakResult(result, photos.length);
    else if (id === "stop") stopSpeaking();
  }

  return (
    <main className="screen">
      <AppBar title="길 찾기" back={`/walk/${route.id}`} />
      <div className="body">
        <p className="title-large">주변 사진을 찍으면 지금 어디쯤인지 찾아 줘요.</p>
        <MockBadge show={result?.mock} />
        <CameraInput id="lost-photo" onPick={onPhoto} />

        {!result && !busy && (
          <label htmlFor="lost-photo" className="camera">
            <span style={{ display: "grid", gap: 12, placeItems: "center" }}>
              <span className="cam-icon">
                <Icon name="camera" size={36} />
              </span>
              <span className="body-large">눌러서 사진 찍기</span>
              <span className="body-medium">간판이나 출구 번호가 보이게 찍어 주세요</span>
            </span>
          </label>
        )}

        {busy && (
          <AiWaiting
            title="위치 찾는 중"
            hint="5~15초 걸려요"
            photoUrl={previewUrl}
            steps={["사진 보내는 중", "간판과 출구 번호 찾는 중", "카드와 비교하는 중", "다음 할 일 정하는 중"]}
          />
        )}

        {result && previewUrl && !busy && (
          <div className="list-row" style={{ background: "transparent", padding: 0 }}>
            <div className="photo" style={{ width: 120, height: 90, borderRadius: 16, flex: "none" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={previewUrl} alt="방금 찍은 사진" />
            </div>
            <div className="text">
              <p className="label-medium muted">사진에서 찾은 것</p>
              <p className="body-large">{result.seenLandmarks.length ? result.seenLandmarks.join(", ") : "알아볼 수 있는 간판이 없어요"}</p>
            </div>
          </div>
        )}

        {result && confident && !busy && (
          <div className="result-card" aria-live="polite">
            <p className="label-large">다음에 할 일</p>
            <p className="guide">{result.nextStep}</p>
            <p className="body-medium">{result.reasonForUser}</p>
            <PlaceLine place={route.cards.find((c) => c.order === result.matchedCardOrder)?.place} className="body-medium" />
          </div>
        )}

        {result && !confident && !gaveUp && !busy && (
          <div className="surface-card" aria-live="polite">
            <p className="title-medium">{result.askPhoto ?? "다른 방향도 한 장 찍어 주세요"}</p>
            <p className="body-medium muted">사진만으로는 확실하지 않아요. {triesLeft}번 더 찍을 수 있어요.</p>
          </div>
        )}

        {gaveUp && !busy && (
          <div className="surface-card">
            <p className="title-medium">마지막으로 지나간 곳이에요</p>
            <PhotoView photoId={lastCard.photoId} height={200} caption={`${lastCard.order}번 카드 사진`} />
            <p className="body-medium muted">{lastCard.order}번 카드: {lastCard.instruction}</p>
            <PlaceLine place={lastCard.place} className="body-medium muted" />
          </div>
        )}

        {said && !busy && <p className="chip label-medium">말한 내용: &ldquo;{said}&rdquo;</p>}
        <VoiceControl
          commands={commands}
          onCommand={onVoice}
          onOther={onSaid}
          allowAlways
          label="말로 설명하기"
          examples={result ? "'다시 걷기', '마지막 카드', '물어보기'" : "'편의점 앞이에요', '큰길이 보여요'"}
        />
        <p className="body-medium muted">길을 건널 때는 신호를 직접 확인하세요.</p>
        {error && <p className="banner body-medium">{error}</p>}

        <div className="grow" />
        {result && triesLeft > 0 && !busy && (
          <label htmlFor="lost-photo" className={`btn ${confident ? "btn-tonal" : "btn-filled"}`}>
            사진 한 장 더 찍기
          </label>
        )}
        {confident && result?.matchedCardOrder ? (
          <button className="btn btn-filled" onClick={() => backTo(result.matchedCardOrder!)}>
            {result.matchedCardOrder}번 카드부터 다시 걷기
          </button>
        ) : null}
        <button className="btn btn-outlined" onClick={() => backTo(lastCard.order)}>
          마지막 카드로 돌아가기
        </button>
        {route.kind === "planned" && route.dest && (
          <button
            className="btn btn-outlined"
            onClick={replan}
          >
            여기서 다시 길 찾기
          </button>
        )}
        <Link href={`/ask/${route.id}`} className="btn btn-outlined">
          지나가는 사람에게 물어보기
        </Link>
        {settings?.guardianShare && (
          <button className="btn btn-text label-large" style={{ alignSelf: "center" }} onClick={shareLocation}>
            {settings.guardianName ? `${settings.guardianName}에게` : "보호자에게"} 위치 보내기
          </button>
        )}
      </div>
    </main>
  );
}
