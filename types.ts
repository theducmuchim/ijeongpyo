// 경로 하나 = 등굣길, 학원 가는 길 같은 것
export type Route = {
  id: string;
  name: string; // "등굣길"
  createdAt: string;
  lastWalkedAt?: string;
  cards: Card[]; // 순서대로 넘길 카드들
  track?: [number, number][]; // 등록할 때 실제로 걸은 GPS 기록 [경도, 위도]
  status: "draft" | "ready"; // draft = 카드 확인 전
  kind?: "walked" | "planned"; // 걸어서 등록 / 처음 가는 길(지도 데이터 초안). 없으면 walked
  destName?: string; // 도착지 이름 (도움 요청 화면에 씀)
  practiceLevel?: PracticeLevel; // 연습 모드 단계. 없으면 1
  cleanArrivals?: number; // 길을 잃지 않고 도착한 횟수 (지금 단계에서)
  dest?: { lat: number; lng: number }; // 처음 가는 길의 도착지 좌표 ('여기서 다시 시작'에 씀)
};

// 연습 모드: 1 전부 보기, 2 문장만, 3 꺾는 곳에서만
export type PracticeLevel = 1 | 2 | 3;

// 건물 이름과 번지. 가게(상호)는 문을 닫거나 바뀌어도 건물 이름과 건물 번호판은 오래 남는다.
export type PlaceInfo = {
  building?: string; // 건물 이름 (예: 중앙빌딩)
  road?: string; // 도로명 주소의 길 이름과 건물 번호 (예: 중앙로 123) — 건물 벽 번호판에 적힌 것
  jibun?: string; // 동 이름과 지번 (예: 은행동 45-6)
  near?: boolean; // 갈림길 위치로 찾은 근처 건물 (GPS가 틀리면 바로 옆 건물일 수 있음)
};

// 처음 가는 길의 길잡이 후보 (상가정보 공공데이터에서 온 가게)
export type Candidate = { name: string; category?: string; floor?: string; lat: number; lng: number } & PlaceInfo;

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
  source?: "photo" | "draft"; // 사진으로 등록 / 지도 데이터 초안(아직 사진 없음). 없으면 photo
  candidates?: Candidate[]; // 초안 카드의 길잡이 후보 (첫 번째가 지금 길잡이)
  checkedAt?: string; // 처음 걸을 때 길잡이를 확인한 시각
  place?: PlaceInfo; // 길잡이가 있는 건물 이름과 번지. 빈 값({})이면 찾아봤지만 없었다는 뜻
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
  | "landmark_replaced" // 길잡이를 새 사진으로 바꿨다
  | "plan_made" // 처음 가는 길 카드 초안을 만들었다
  | "landmark_seen" // 처음 길에서 길잡이가 보였다
  | "landmark_missing" // 처음 길에서 길잡이가 안 보였다
  | "help_card" // 도움 요청 화면을 열었다
  | "practice_up"; // 연습 모드 단계를 올렸다

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

// 처음 가는 길: 카드 초안 만들기 API의 답
export type PlanCard = {
  order: number;
  action: Action;
  instruction: string;
  landmark: { name: string; side: Side };
  candidates: Candidate[];
  place?: PlaceInfo;
  lat: number;
  lng: number;
};
export type PlanResult = {
  cards: PlanCard[];
  track: [number, number][]; // [경도, 위도]
  totalDistance: number; // m
  totalTime: number; // 초
  mock?: boolean;
  missing?: string[]; // 시험 모드일 때 빠진 키: TMAP, 상가정보, AI
};

export type Place = { name: string; address: string; lat: number; lng: number };

// 처음 길에서 '보여요'로 찍은 사진 확인 결과
export type CheckResult = {
  seen: boolean; // 기대한 길잡이(또는 후보 중 하나)가 사진에 보이는가
  matched: string | null; // 보인 길잡이 이름
  photoDescription: string;
  landmark: { name: string; side: Side };
  instruction: string;
  warning: string | null;
  mock?: boolean;
};
