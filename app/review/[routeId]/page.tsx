"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AppBar, CameraInput, Icon, PhotoView, SkeletonList, useConfirm } from "@/components/ui";
import { db, deleteRoute, savePhoto } from "@/lib/db";
import { shrinkPhoto } from "@/lib/image";
import { applyReplacement, suggestReplacement } from "@/lib/replaceCard";
import { toast } from "@/lib/toast";
import type { Route } from "@/types";

const ACTION_LABEL = { straight: "곧장", left: "왼쪽으로", right: "오른쪽으로", arrive: "도착" } as const;

export default function ReviewPage() {
  const { routeId } = useParams<{ routeId: string }>();
  const router = useRouter();
  const [route, setRoute] = useState<Route | null | undefined>(undefined);
  const [fixing, setFixing] = useState<number | null>(null); // 다시 찍은 사진을 AI가 보는 중인 카드
  const [dialog, ask] = useConfirm();

  useEffect(() => {
    db.routes.get(routeId).then((r) => setRoute(r ?? null));
  }, [routeId]);

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
          <p className="body-large">이 길을 찾을 수 없어요.</p>
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
      toast(`${route.cards[i].order}번 카드를 새 사진에 맞게 고쳤어요`);
    } catch (e) {
      setRoute(await applyReplacement(route, i, id, null));
      toast(`사진은 바꿨지만 ${(e as Error).message} 문장은 직접 확인해 주세요.`);
    } finally {
      setFixing(null);
    }
  }

  async function save() {
    if (!route) return;
    await db.routes.put({ ...route, status: "ready" });
    // 브라우저가 공간이 부족할 때 길과 사진을 마음대로 지우지 않게 부탁한다
    navigator.storage?.persist?.().catch(() => {});
    toast(`'${route.name}'을(를) 저장했어요. 이제 혼자 걸어 볼 수 있어요.`);
    router.push("/");
  }

  async function remove() {
    if (!route) return;
    const ok = await ask({
      title: "이 길을 지울까요?",
      body: `'${route.name}'의 카드 ${route.cards.length}장과 사진이 모두 지워져요. 되돌릴 수 없어요.`,
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
        <p className="body-medium muted">같이 걸은 사람과 문장을 확인하고, 어색한 부분은 눌러서 고쳐 주세요. 사진을 누르면 다시 찍을 수 있어요.</p>
        <div className="stagger" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {route.cards.map((c, i) => (
            <div key={c.id} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {c.warning && fixing !== i && (
                <div className="surface-card warn-card">
                  <p className="title-medium">{c.order}번 사진을 다시 찍으면 좋겠어요</p>
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
                      <p className="body-medium muted">AI가 새 사진을 보고 있어요…</p>
                      <div className="linear" />
                    </>
                  ) : (
                    <textarea
                      className="field body-large"
                      value={c.instruction}
                      onChange={(e) => update(i, { instruction: e.target.value })}
                      readOnly={fixing !== null}
                      aria-label={`${c.order}번 카드 안내 문장`}
                      rows={2}
                    />
                  )}
                  {c.userNote && <p className="label-medium muted">메모: “{c.userNote}”</p>}
                </div>
              </div>
            </div>
          ))}
        </div>
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
