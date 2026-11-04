"use client";

import { db } from "@/lib/db";
import type { CardDraft, ReplaceResult, Route, WhereAmIResult } from "@/types";

// 체험하기에 쓰는 길. 사진은 카카오맵 로드뷰에서 찍은 실제 거리(대전 은행동 중앙로 → 대전역)다.
// AI 답도 미리 써 둔 것이라 AI를 부르지 않는다. ('진짜 AI로 만들어 보기'를 누를 때만 AI를 부른다)

export const DEMO_ROUTE_ID = "demo-route";
export const DEMO_ROUTE_NAME = "체험: 대전역 가는 길";
export const DEMO_PHOTO_CREDIT = "사진: 카카오맵 로드뷰 (대전 은행동 중앙로 → 대전역)";

export const DEMO_JUNCTIONS = [
  { photo: "/demo/demo-1.jpg", note: "ABC마트 지나 곧장" },
  { photo: "/demo/demo-2.jpg", note: "대우당약국 앞 횡단보도 건너기" },
  { photo: "/demo/demo-3.jpg", note: "지하철 입구에서 오른쪽" },
  { photo: "/demo/demo-4.jpg", note: "대전역 도착" },
];

export const DEMO_CARDS: CardDraft[] = [
  {
    order: 1,
    photoDescription: "왼쪽 건물에 노란 간판 'ABC-MART'와 그 위 검은 간판 '확실한 치과'. 옆 회색 건물에 흰 나이키 로고. 앞으로 넓은 큰길이 이어진다.",
    landmark: { name: "노란 간판 ABC마트", side: "left" },
    action: "straight",
    instruction: "노란 간판 ABC마트를 지나 큰길을 따라 곧장 가세요",
    warning: null,
  },
  {
    order: 2,
    photoDescription: "왼쪽 모퉁이 건물에 초록·빨간 글자 '대우당약국'과 '대우당건강' 간판, 앞에 태극기. 오른쪽 아래에 횡단보도가 있다.",
    landmark: { name: "대우당약국", side: "left" },
    action: "straight",
    instruction: "대우당약국 앞 횡단보도를 건너세요",
    warning: null,
  },
  {
    order: 3,
    photoDescription: "왼쪽에 유리 지붕을 씌운 지하철 입구(에스컬레이터). 뒤 건물에 검은 간판 '정덕영비뇨기과'. 길이 오른쪽으로 이어진다.",
    landmark: { name: "지하철 입구", side: "left" },
    action: "right",
    instruction: "지하철 입구를 지나 오른쪽으로 가세요",
    warning: "가까이 가면 지하철 입구 지붕이 아래층 간판을 가려요. 몇 걸음 뒤에서 찍으면 병원 간판도 같이 보여요.",
  },
  {
    order: 4,
    photoDescription: "정면에 흰 지붕과 빨간 기둥이 있는 큰 유리 건물. 대전역이다. 앞은 넓은 광장.",
    landmark: { name: "대전역 빨간 기둥 건물", side: "ahead" },
    action: "arrive",
    instruction: "빨간 기둥이 있는 대전역 건물이 보이면 도착이에요",
    warning: null,
  },
];

// 1번 카드 자리에서 ABC마트 간판이 안 보이는 경우 (다른 쪽에서 찍은 사진)
export const DEMO_FIX: { photo: string; result: ReplaceResult } = {
  photo: "/demo/demo-1-changed.jpg",
  result: {
    photoDescription: "오른쪽 건물 1층에 아디다스 매장, 그 위에 파란 간판 '성모피부과의원'. 왼쪽에 회색 나이키 건물과 횡단보도.",
    landmark: { name: "파란 간판 성모피부과의원", side: "right" },
    instruction: "파란 간판 성모피부과의원을 오른쪽에 두고 곧장 가세요",
    changeNote: "이 자리에서는 ABC마트 간판이 안 보여서, 잘 보이는 파란 병원 간판으로 바꿨어요",
    warning: null,
  },
};

// 2번 카드를 지난 뒤 길을 잃은 경우
export const DEMO_LOST: { photo: string; lastCard: number; result: WhereAmIResult } = {
  photo: "/demo/demo-lost.jpg",
  lastCard: 2,
  result: {
    status: "on_route",
    confidence: 0.74,
    seenLandmarks: ["파란 간판 '구제나라'", "버스 정류장", "앞쪽 유리 고층 건물"],
    matchedCardOrder: 3,
    nextStep: "이 큰길을 따라 곧장 가세요. 지하철 입구가 나오면 3번 카드대로 오른쪽으로 가요",
    askPhoto: null,
    reasonForUser: "2번 카드 횡단보도를 건넌 뒤의 큰길이에요. 앞쪽에 대전역 근처 고층 건물이 보여요",
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
