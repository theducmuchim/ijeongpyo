"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AiWaiting, AppBar, CameraInput, Icon, MockBadge, PhotoView } from "@/components/ui";
import { db, savePhoto } from "@/lib/db";
import { shrinkPhoto } from "@/lib/image";
import { applyReplacement, suggestReplacement } from "@/lib/replaceCard";
import { setResume } from "@/lib/resume";
import { toast } from "@/lib/toast";
import { logEvent } from "@/lib/usageLog";
import { josa } from "@/lib/josa";
import type { ReplaceResult, Route } from "@/types";

// 2차 기능: 길잡이가 없어졌거나 바뀌었을 때, 같은 자리에서 다시 찍어 카드 한 장을 고친다.
export default function FixLandmarkPage() {
  const { routeId, order } = useParams<{ routeId: string; order: string }>();
  const router = useRouter();
  const [route, setRoute] = useState<Route | null | undefined>(undefined);
  const [photo, setPhoto] = useState<{ blob: Blob; url: string } | null>(null);
  const [working, setWorking] = useState(false);
  const [result, setResult] = useState<ReplaceResult | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    db.routes.get(routeId).then((r) => setRoute(r ?? null));
  }, [routeId]);

  useEffect(() => () => {
    if (photo) URL.revokeObjectURL(photo.url);
  }, [photo]);

  const index = route ? route.cards.findIndex((c) => c.order === Number(order)) : -1;
  const card = route && index >= 0 ? route.cards[index] : null;

  const backToWalk = () => {
    setResume(routeId, Number(order));
    router.push(`/walk/${routeId}`);
  };

  async function onPhoto(file: File) {
    if (!route || !card) return;
    const small = await shrinkPhoto(file);
    setPhoto({ blob: small, url: URL.createObjectURL(small) });
    setResult(null);
    setFailed(null);
    setWorking(true);
    try {
      const r = await suggestReplacement(route, index, small);
      setResult(r);
      setText(r.instruction);
    } catch (e) {
      // AI가 안 돼도 사진은 바꿀 수 있게 한다. 문장은 직접 고친다.
      setFailed((e as Error).message);
      setText(card.instruction);
    } finally {
      setWorking(false);
    }
  }

  async function confirm() {
    if (!route || !card || !photo) return;
    setSaving(true);
    const id = await savePhoto(photo.blob);
    await applyReplacement(route, index, id, result, text);
    logEvent(route.id, "landmark_replaced");
    toast(`${card.order}번 카드를 바꿨어요`);
    backToWalk();
  }

  if (route === undefined) return <main className="screen" />;
  if (!route || !card) {
    return (
      <main className="screen">
        <AppBar title="길잡이 바꾸기" back="/" />
        <div className="body">
          <p className="body-large">이 카드를 찾을 수 없어요.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="screen">
      <AppBar title={`${card.order}번 길잡이 바꾸기`} back={`/walk/${routeId}`} />
      <div className="body">
        <CameraInput id="fix-photo" onPick={onPhoto} />

        {!photo && (
          <>
            <p className="body-large">
              {josa(card.landmark.name, "이/가")} 안 보이면 이 자리를 다시 찍어 주세요. AI가 새 길잡이를 골라요.
            </p>
            <div className="surface-card" style={{ gap: 12 }}>
              <p className="label-medium muted">지금 카드</p>
              <PhotoView photoId={card.photoId} height={200} caption={`${card.order}번 카드 사진`} />
              <p className="title-medium">{card.instruction}</p>
            </div>
            <div className="grow" />
            <label htmlFor="fix-photo" className="btn btn-filled btn-large">
              <Icon name="camera" size={28} /> 이 자리 다시 찍기
            </label>
            <button className="btn btn-text label-large center" onClick={backToWalk}>
              돌아가기
            </button>
          </>
        )}

        {photo && working && (
          <AiWaiting
            title="새 길잡이 고르는 중"
            hint="5~15초 걸려요"
            photoUrl={photo.url}
            steps={["사진 보내는 중", "간판과 건물 찾는 중", "안내 문장 쓰는 중"]}
          />
        )}

        {photo && !working && (
          <>
            <MockBadge show={result?.mock} />
            {result?.changeNote && (
              <div className="result-card" style={{ padding: 16 }}>
                <p className="label-large">
                  <Icon name="sparkle" size={16} /> 바뀐 점
                </p>
                <p className="body-large">{result.changeNote}</p>
              </div>
            )}
            {failed && (
              <div className="surface-card error-card">
                <p className="title-medium">AI 답을 받지 못했어요</p>
                <p className="body-medium">사진만 바꾸고, 문장은 아래에서 직접 고쳐 주세요.</p>
              </div>
            )}
            {result?.warning && (
              <div className="surface-card warn-card">
                <p className="title-medium">다시 찍는 게 좋아요</p>
                <p className="body-medium">{result.warning}</p>
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <p className="label-medium muted">전</p>
                <div style={{ opacity: 0.6 }}>
                  <PhotoView photoId={card.photoId} height={130} caption="원래 사진" />
                </div>
                <p className="body-medium muted" style={{ textDecoration: "line-through" }}>
                  {card.landmark.name}
                </p>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <p className="label-medium primary-text">후</p>
                <div className="photo" style={{ height: 130 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photo.url} alt="새로 찍은 사진" />
                </div>
                <p className="title-medium">{result?.landmark.name ?? card.landmark.name}</p>
              </div>
            </div>

            <label className="label-large" htmlFor="fix-text">
              새 안내 문장
            </label>
            <textarea id="fix-text" className="field body-large" rows={2} value={text} onChange={(e) => setText(e.target.value)} />

            <div className="grow" />
            <button className="btn btn-filled btn-large" onClick={confirm} disabled={saving || !text.trim()}>
              <Icon name="check" size={28} /> 이걸로 바꾸기
            </button>
            <label htmlFor="fix-photo" className="btn btn-outlined">
              <Icon name="refresh" size={20} /> 다시 찍기
            </label>
          </>
        )}
      </div>
    </main>
  );
}
