"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AppBar, CameraInput, PhotoView } from "@/components/ui";
import { db, deleteRoute, savePhoto } from "@/lib/db";
import { shrinkPhoto } from "@/lib/image";
import type { Route } from "@/types";

export default function ReviewPage() {
  const { routeId } = useParams<{ routeId: string }>();
  const router = useRouter();
  const [route, setRoute] = useState<Route | null | undefined>(undefined);

  useEffect(() => {
    db.routes.get(routeId).then((r) => setRoute(r ?? null));
  }, [routeId]);

  if (route === undefined) return <main className="screen" />;
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

  async function retake(i: number, file: File) {
    const id = await savePhoto(await shrinkPhoto(file));
    await db.photos.delete(route!.cards[i].photoId);
    update(i, { photoId: id, warning: null });
  }

  async function save() {
    await db.routes.put({ ...route!, status: "ready" });
    router.push("/");
  }

  async function remove() {
    if (!confirm("이 길과 사진을 모두 지울까요?")) return;
    await deleteRoute(route!.id);
    router.push("/");
  }

  return (
    <main className="screen">
      <AppBar title={`카드 확인 · ${route.cards.length}장`} back="/" />
      <div className="body" style={{ gap: 12 }}>
        <p className="body-medium muted">같이 걸은 사람과 문장을 확인하고, 어색한 부분은 눌러서 고쳐 주세요.</p>
        {route.cards.map((c, i) => (
          <div key={c.id} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {c.warning && (
              <div className="surface-card warn-card">
                <p className="title-medium">{c.order}번 사진을 다시 찍으면 좋겠어요</p>
                <p className="body-medium">{c.warning}</p>
                <label htmlFor={`retake-${c.id}`} className="btn btn-text label-large" style={{ alignSelf: "flex-start" }}>
                  다시 찍기
                </label>
              </div>
            )}
            <CameraInput id={`retake-${c.id}`} onPick={(f) => retake(i, f)} />
            <div className="list-row" style={{ alignItems: "flex-start", padding: 12 }}>
              <label htmlFor={`retake-${c.id}`} style={{ cursor: "pointer" }} aria-label={`${c.order}번 사진 다시 찍기`}>
                <PhotoView photoId={c.photoId} thumb />
              </label>
              <div className="text" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <p className="label-medium primary-text">
                  {c.order}번 카드 · 길잡이: {c.landmark.name}
                </p>
                <textarea
                  className="field body-large"
                  value={c.instruction}
                  onChange={(e) => update(i, { instruction: e.target.value })}
                  aria-label={`${c.order}번 카드 안내 문장`}
                  rows={2}
                />
                {c.userNote && <p className="label-medium muted">메모: “{c.userNote}”</p>}
              </div>
            </div>
          </div>
        ))}
        <div className="grow" />
        <button className="btn btn-filled btn-large" onClick={save}>
          저장하기
        </button>
        <button className="btn btn-text label-large" style={{ alignSelf: "center" }} onClick={remove}>
          이 길 지우기
        </button>
      </div>
    </main>
  );
}
