"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AppBar, CameraInput, Icon, PhotoView, SkeletonList, useConfirm } from "@/components/ui";
import { PlaceLine } from "@/components/Place";
import { DictateButton, VoiceControl, useScreenSpeech } from "@/components/Voice";
import { fillPlaces } from "@/lib/fillPlaces";
import { db, deleteRoute, savePhoto } from "@/lib/db";
import { shrinkPhoto } from "@/lib/image";
import { applyReplacement, suggestReplacement } from "@/lib/replaceCard";
import { toast } from "@/lib/toast";
import { josa } from "@/lib/josa";
import { tidySpoken } from "@/lib/tone";
import { speak } from "@/lib/voice";
import type { Route } from "@/types";

const ACTION_LABEL = { straight: "곧장", left: "왼쪽으로", right: "오른쪽으로", arrive: "도착" } as const;

export default function ReviewPage() {
  const { routeId } = useParams<{ routeId: string }>();
  const router = useRouter();
  const [route, setRoute] = useState<Route | null | undefined>(undefined);
  const [fixing, setFixing] = useState<number | null>(null); // 다시 찍은 사진을 AI가 보는 중인 카드
  const [dialog, ask] = useConfirm();

  useEffect(() => {
    db.routes.get(routeId).then((r) => {
      setRoute(r ?? null);
      // 같이 걸으며 등록한 길은 카드 위치로 근처 건물 이름과 번지를 찾아 붙인다
      if (r)
        fillPlaces(r).then((u) => {
          if (!u) return;
          const found = new Map(u.cards.map((c) => [c.id, c.place]));
          setRoute((cur) => (cur ? { ...cur, cards: cur.cards.map((c) => (c.place === undefined ? { ...c, place: found.get(c.id) } : c)) } : cur));
        });
    });
  }, [routeId]);

  useScreenSpeech(route ? `카드 ${route.cards.length}장이에요. 문장이 어색하면 눌러서 고치거나, 마이크를 눌러 말로 고쳐 주세요.` : null);

  if (route === undefined) {
    return (
      <main className="screen">
        <AppBar title="카드 확인" back="/" />
        <div className="body">
          <SkeletonList rows={3} />
        </div>
      </main>
    );
  }
  if (route === null) {
    return (
      <main className="screen">
        <AppBar title="카드 확인" back="/" />
        <div className="body">
          <p className="body-large">이 길을 찾을 수 없어요. 홈에서 길을 다시 골라 주세요.</p>
        </div>
      </main>
    );
  }

  const update = (i: number, patch: Partial<Route["cards"][number]>) =>
    setRoute({ ...route, cards: route.cards.map((c, j) => (j === i ? { ...c, ...patch } : c)) });

  // 다시 찍으면 사진만 바꾸지 않고, AI에게 새 사진의 설명과 길잡이도 다시 받는다.
  // (설명이 옛 사진 그대로면 '길을 잃었어요'에서 엉뚱한 설명과 비교하게 되기 때문)
  async function retake(i: number, file: File) {
    if (!route) return;
    setFixing(i);
    const small = await shrinkPhoto(file);
    const id = await savePhoto(small);
    try {
      const r = await suggestReplacement(route, i, small);
      setRoute(await applyReplacement(route, i, id, r));
      toast(`${route.cards[i].order}번 카드를 새 사진으로 바꿨어요`);
    } catch (e) {
      setRoute(await applyReplacement(route, i, id, null));
      console.warn(e);
      toast("사진만 바꿨어요. 문장은 직접 확인해 주세요.");
    } finally {
      setFixing(null);
    }
  }

  async function save() {
    if (!route) return;
    await db.routes.put({ ...route, status: "ready" });
    // 브라우저가 공간이 부족할 때 길과 사진을 마음대로 지우지 않게 부탁한다
    navigator.storage?.persist?.().catch(() => {});
    toast(`${josa(route.name, "을/를")} 저장했어요`);
    router.push("/");
  }

  async function remove() {
    if (!route) return;
    const ok = await ask({
      title: "이 길을 지울까요?",
      body: `카드 ${route.cards.length}장과 사진이 모두 지워지고, 되돌릴 수 없어요.`,
      ok: "지우기",
      danger: true,
    });
    if (!ok) return;
    await deleteRoute(route.id);
    toast("길을 지웠어요");
    router.push("/");
  }

  return (
    <main className="screen">
      <AppBar title={`카드 확인 · ${route.cards.length}장`} back="/" />
      <div className="body" style={{ gap: 12 }}>
        <p className="body-medium muted">문장이 어색하면 눌러서 고쳐 주세요. 사진을 누르면 다시 찍을 수 있어요.</p>
        <div className="stagger" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {route.cards.map((c, i) => (
            <div key={c.id} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {c.warning && fixing !== i && (
                <div className="surface-card warn-card">
                  <p className="title-medium">{c.order}번 사진을 다시 찍어 주세요</p>
                  <p className="body-medium">{c.warning}</p>
                  <label htmlFor={`retake-${c.id}`} className="btn btn-text label-large" style={{ alignSelf: "flex-start" }}>
                    <Icon name="camera" size={18} /> 다시 찍기
                  </label>
                </div>
              )}
              <CameraInput id={`retake-${c.id}`} onPick={(f) => retake(i, f)} />
              <div className="list-row" style={{ alignItems: "flex-start", padding: 12, cursor: "default" }}>
                <label htmlFor={`retake-${c.id}`} style={{ cursor: "pointer", position: "relative" }} aria-label={`${c.order}번 사진 다시 찍기`}>
                  <PhotoView photoId={c.photoId} thumb scanning={fixing === i} />
                  <span
                    style={{
                      position: "absolute", right: -4, bottom: -4, width: 28, height: 28, borderRadius: 14,
                      background: "var(--primary)", color: "var(--on-primary)", display: "grid", placeItems: "center",
                    }}
                  >
                    <Icon name="camera" size={16} />
                  </span>
                </label>
                <div className="text" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <p className="label-medium primary-text">
                    {c.order}번 · {ACTION_LABEL[c.action]} · 길잡이: {c.landmark.name}
                  </p>
                  {fixing === i ? (
                    <>
                      <p className="body-medium muted">새 사진 보는 중…</p>
                      <div className="linear" />
                    </>
                  ) : (
                    <div style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
                      <textarea
                        className="field body-large"
                        style={{ flex: 1 }}
                        value={c.instruction}
                        onChange={(e) => update(i, { instruction: e.target.value })}
                        readOnly={fixing !== null}
                        aria-label={`${c.order}번 카드 안내 문장`}
                        rows={2}
                      />
                      <DictateButton
                        label={`${c.order}번 문장을 말로 고치기`}
                        onText={(t) => {
                          const sentence = tidySpoken(t);
                          update(i, { instruction: sentence });
                          speak(`${c.order}번 문장을 바꿨어요. ${sentence}`, { force: true });
                        }}
                      />
                    </div>
                  )}
                  <PlaceLine place={c.place} className="label-medium muted" />
                  {c.userNote && <p className="label-medium muted">메모: “{c.userNote}”</p>}
                </div>
              </div>
            </div>
          ))}
        </div>
        <VoiceControl
          commands={[
            { id: "read", label: "카드 읽기", say: ["읽어", "들려"] },
            { id: "save", label: "저장하기", say: ["저장"] },
          ]}
          onCommand={(id) => {
            if (id === "save") save();
            else route.cards.forEach((c, i) => speak(`${c.order}번. ${c.instruction}`, { queue: i > 0, force: true }));
          }}
          examples="'카드 읽어 줘', '저장해 줘'"
        />
        <div className="grow" />
        <button className="btn btn-filled btn-large" onClick={save} disabled={fixing !== null}>
          <Icon name="check" size={28} /> 저장하기
        </button>
        <button className="btn btn-danger label-large center" onClick={remove}>
          <Icon name="trash" size={18} /> 이 길 지우기
        </button>
      </div>
      {dialog}
    </main>
  );
}
