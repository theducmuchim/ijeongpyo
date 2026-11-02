"use client";

import { db, savePhoto } from "@/lib/db";
import { placeAsLandmark, placeFromCandidate } from "@/lib/place";
import { sentenceFor } from "@/lib/sentence";
import type { Card, CheckResult, Route } from "@/types";

export { sentenceFor };

// 처음 가는 길의 초안 카드(사진 없음)를 걸으면서 채우는 부분.

export const isDraft = (c: Card) => c.source === "draft" && !c.checkedAt;

// '안 보여요': 다음 후보로 바꾼다. 후보가 없으면 가게가 있던 건물(이름이나 번호판)로, 그것도 없으면 방향만 안내한다.
export function nextCandidate(card: Card): Card {
  const rest = (card.candidates ?? []).slice(1);
  const next = rest[0];
  const crossing = /횡단보도/.test(card.instruction);
  if (next) {
    return {
      ...card,
      candidates: rest,
      landmark: { name: next.name, side: card.landmark.side },
      instruction: sentenceFor(next.name, card.action, crossing),
      place: placeFromCandidate(next) ?? (card.place?.near ? card.place : undefined), // 없으면 그 지점 주소를 다시 찾는다
    };
  }
  const building = card.landmark.name === placeAsLandmark(card.place) ? null : placeAsLandmark(card.place);
  return {
    ...card,
    candidates: [],
    landmark: { name: building ?? "", side: card.landmark.side },
    instruction: sentenceFor(building, card.action, crossing),
  };
}

async function saveCard(route: Route, index: number, card: Card): Promise<Route> {
  const next: Route = { ...route, cards: route.cards.map((c, i) => (i === index ? card : c)) };
  await db.routes.put(next);
  return next;
}

export const replaceCard = saveCard;

// '보여요'로 찍은 사진을 확인한 결과를 카드에 넣는다. 이때부터 익숙한 길 카드와 같아진다.
export async function applyCheck(route: Route, index: number, photo: Blob, r: CheckResult): Promise<Route> {
  const old = route.cards[index];
  const photoId = await savePhoto(photo);
  return saveCard(route, index, {
    ...old,
    photoId,
    source: "photo",
    checkedAt: new Date().toISOString(),
    photoDescription: r.photoDescription,
    landmark: r.landmark,
    instruction: r.instruction || old.instruction,
    warning: r.warning,
  });
}
