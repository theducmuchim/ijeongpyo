"use client";

import { requestReplace } from "@/lib/api";
import { db } from "@/lib/db";
import { blobToPayload } from "@/lib/image";
import type { Route, ReplaceResult } from "@/types";

// 카드 한 장을 새 사진에 맞게 고치는 공통 부분.
// '길잡이가 없어졌어요' 화면과 카드 확인 화면의 '다시 찍기'가 같이 쓴다.

export async function suggestReplacement(route: Route, index: number, photo: Blob): Promise<ReplaceResult> {
  const c = route.cards[index];
  return requestReplace({
    photo: await blobToPayload(photo),
    card: {
      order: c.order,
      photoDescription: c.photoDescription,
      landmarkName: c.landmark.name,
      side: c.landmark.side,
      action: c.action,
      instruction: c.instruction,
      userNote: c.userNote,
    },
    prevInstruction: route.cards[index - 1]?.instruction,
    nextInstruction: route.cards[index + 1]?.instruction,
  });
}

// 새 사진과 AI 제안을 카드에 넣고 저장한다. 옛 사진은 지운다. 꺾는 방향은 그대로 둔다.
export async function applyReplacement(
  route: Route,
  index: number,
  newPhotoId: string,
  r: Pick<ReplaceResult, "photoDescription" | "landmark" | "instruction"> | null,
  instruction?: string,
): Promise<Route> {
  const old = route.cards[index];
  const card = {
    ...old,
    photoId: newPhotoId,
    photoDescription: r?.photoDescription ?? old.photoDescription,
    landmark: r?.landmark ?? old.landmark,
    instruction: (instruction ?? r?.instruction ?? old.instruction).trim() || old.instruction,
    warning: null,
  };
  const next: Route = { ...route, cards: route.cards.map((c, i) => (i === index ? card : c)) };
  await db.transaction("rw", db.routes, db.photos, async () => {
    await db.routes.put(next);
    if (old.photoId !== newPhotoId) await db.photos.delete(old.photoId);
  });
  return next;
}
