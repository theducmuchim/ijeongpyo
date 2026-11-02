"use client";

import { db } from "@/lib/db";
import type { CardDraft, ReplaceResult, Route, WhereAmIResult } from "@/types";

// 체험하기에 쓰는 길. 사진은 public/demo에 직접 그려 둔 거리 그림이고, 실제 장소가 아니다.
// AI 답도 미리 써 둔 것이라 사용 횟수를 쓰지 않는다. ('진짜 AI로 만들어 보기'를 누를 때만 AI를 부른다)

export const DEMO_ROUTE_ID = "demo-route";
export const DEMO_ROUTE_NAME = "체험: 학교 가는 길";

export const DEMO_JUNCTIONS = [
  { photo: "/demo/demo-1.jpg", note: "꽃집에서 왼쪽" },
  { photo: "/demo/demo-2.jpg", note: "약국 지나서 횡단보도 건너기" },
  { photo: "/demo/demo-3.jpg", note: "파란 편의점에서 오른쪽" },
  { photo: "/demo/demo-4.jpg", note: "학교 정문 도착" },
];

export const DEMO_CARDS: CardDraft[] = [
  {
    order: 1,
    photoDescription: "왼쪽 건물 1층에 초록 간판 '꽃집 초록뜰'과 초록·흰색 줄무늬 차양. 가게 왼쪽으로 골목이 있다.",
    landmark: { name: "초록 간판 꽃집", side: "left" },
    action: "left",
    instruction: "초록 간판 꽃집을 끼고 왼쪽 골목으로 가세요",
    warning: null,
  },
  {
    order: 2,
    photoDescription: "왼쪽에 초록 간판 '온누리약국', 길 건너 빨간 간판 분식집. 바로 앞에 횡단보도가 있다.",
    landmark: { name: "온누리약국", side: "left" },
    action: "straight",
    instruction: "온누리약국을 지나 횡단보도를 건너세요",
    warning: null,
  },
  {
    order: 3,
    photoDescription: "왼쪽 1층에 파란 간판 '하늘편의점'과 파란·흰색 줄무늬 차양. 오른쪽에 가로수와 가로등.",
    landmark: { name: "파란 간판 편의점", side: "left" },
    action: "right",
    instruction: "파란 간판 편의점 앞에서 오른쪽으로 가세요",
    warning: "가로수가 간판 오른쪽을 조금 가려요. 두세 걸음 옆에서 다시 찍어 주세요.",
  },
  {
    order: 4,
    photoDescription: "정면에 '한빛중학교' 글자가 있는 정문과 철문. 정문 양옆에 나무가 한 그루씩 있다.",
    landmark: { name: "한빛중학교 정문", side: "ahead" },
    action: "arrive",
    instruction: "한빛중학교 정문이 보이면 도착이에요",
    warning: null,
  },
];

// 1번 카드의 꽃집이 빵집으로 바뀐 경우
export const DEMO_FIX: { photo: string; result: ReplaceResult } = {
  photo: "/demo/demo-1-changed.jpg",
  result: {
    photoDescription: "왼쪽 건물 1층에 주황 간판 '바삭빵집'과 주황·흰색 줄무늬 차양. 가게 왼쪽으로 골목이 있다.",
    landmark: { name: "주황 간판 빵집", side: "left" },
    instruction: "주황 간판 빵집을 끼고 왼쪽 골목으로 가세요",
    changeNote: "꽃집 자리에 빵집이 생겨서 빵집으로 바꿨어요",
    warning: null,
  },
};

// 1번 카드를 지난 뒤 길을 잃은 경우
export const DEMO_LOST: { photo: string; lastCard: number; result: WhereAmIResult } = {
  photo: "/demo/demo-lost.jpg",
  lastCard: 1,
  result: {
    status: "on_route",
    confidence: 0.78,
    seenLandmarks: ["온누리약국 간판", "버스정류장"],
    matchedCardOrder: 2,
    nextStep: "온누리약국 쪽으로 걸어가서 횡단보도를 건너세요",
    askPhoto: null,
    reasonForUser: "사진 오른쪽에 2번 카드의 온누리약국 간판이 보여요",
  },
};

export async function fetchDemoPhoto(url: string): Promise<Blob> {
  const res = await fetch(url);
  if (!res.ok) throw new Error("체험용 사진을 불러오지 못했어요.");
  return res.blob();
}

// 체험용 길을 휴대폰에 저장해서 실제 걷기 화면으로 걸어 볼 수 있게 한다. 여러 번 눌러도 하나만 남는다.
export async function saveDemoRoute(cards: CardDraft[]): Promise<string> {
  const blobs = await Promise.all(DEMO_JUNCTIONS.map((j) => fetchDemoPhoto(j.photo)));
  const now = new Date().toISOString();
  const route: Route = {
    id: DEMO_ROUTE_ID,
    name: DEMO_ROUTE_NAME,
    createdAt: now,
    status: "ready",
    cards: cards.map((c, i) => ({
      id: `demo-card-${i + 1}`,
      order: c.order,
      photoId: `demo-photo-${i + 1}`,
      photoDescription: c.photoDescription,
      landmark: c.landmark,
      action: c.action,
      instruction: c.instruction,
      userNote: DEMO_JUNCTIONS[i]?.note ?? "",
      warning: null,
    })),
  };
  await db.transaction("rw", db.routes, db.photos, async () => {
    for (let i = 0; i < blobs.length; i++) {
      await db.photos.put({ id: `demo-photo-${i + 1}`, blob: blobs[i], createdAt: now });
    }
    await db.routes.put(route);
  });
  return route.id;
}
