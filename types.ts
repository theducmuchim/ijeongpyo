// 경로 하나 = 등굣길, 학원 가는 길 같은 것
export type Route = {
  id: string;
  name: string; // "등굣길"
  createdAt: string;
  lastWalkedAt?: string;
  cards: Card[]; // 순서대로 넘길 카드들
  track?: [number, number][]; // 등록할 때 실제로 걸은 GPS 기록 [경도, 위도]
  status: "draft" | "ready"; // draft = 카드 확인 전
};

export type Side = "left" | "right" | "ahead";
export type Action = "straight" | "left" | "right" | "arrive";

// 카드 한 장 = 갈림길 하나
export type Card = {
  id: string;
  order: number; // 몇 번째 카드인지 (1부터)
  photoId: string; // 휴대폰에 저장한 사진 번호
  photoDescription: string; // AI가 쓴 사진 설명
  landmark: { name: string; side: Side };
  action: Action;
  instruction: string; // 화면에 보일 문장
  userNote: string; // 등록할 때 남긴 원래 메모
  warning?: string | null; // 사진을 다시 찍으라는 경고
  lat?: number; // 갈림길 위치 (GPS가 잡힐 때만)
  lng?: number;
};

// 등록 중에 모으는 갈림길 하나 (아직 AI가 정리하기 전)
export type Junction = {
  photoId: string;
  note: string;
  lat?: number;
  lng?: number;
};

// '길을 잃었어요'에 대한 AI의 답
export type WhereAmIResult = {
  status: "on_route" | "off_route" | "unsure";
  confidence: number; // 0~1
  seenLandmarks: string[];
  matchedCardOrder: number | null;
  nextStep: string;
  askPhoto: string | null;
  reasonForUser: string;
  mock?: boolean; // 키 없이 돌리는 시험 모드인지
};

// 카드 만들기 API의 답 한 장
export type CardDraft = {
  order: number;
  photoDescription: string;
  landmark: { name: string; side: Side };
  action: Action;
  instruction: string;
  warning: string | null;
};

export type ImagePayload = { base64: string; mediaType: "image/jpeg" };

// 시험 기간에 휴대폰 안에만 남기는 사용 기록 (설계서 11장). 사진, 위치, 길 이름은 넣지 않는다.
export type UsageEventType =
  | "walk_start" // 걷기 화면을 열었다
  | "walk_end" // 마지막 카드까지 갔다
  | "manual_next" // '다음 카드'를 손으로 눌렀다
  | "off_route" // 길 벗어남 알림이 떴다
  | "lost_open" // '길을 잃었어요'를 눌렀다
  | "lost_photo" // 길을 잃었을 때 사진을 찍어 보냈다 (detail: 몇 번째 사진인지)
  | "lost_found" // AI가 확실하게 답했다 (detail: 그때까지 찍은 사진 수)
  | "lost_gave_up" // 3번 찍어도 못 찾았다
  | "guardian_share" // 보호자에게 위치 보내기를 눌렀다
  | "landmark_replaced"; // 길잡이를 새 사진으로 바꿨다

export type UsageEvent = {
  id?: number;
  at: string;
  routeId: string;
  type: UsageEventType;
  detail?: number;
};

// 길잡이 바꾸기 API의 답
export type ReplaceResult = {
  photoDescription: string;
  landmark: { name: string; side: Side };
  instruction: string;
  changeNote: string;
  warning: string | null;
  mock?: boolean;
};
