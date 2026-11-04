"use client";

import Dexie, { type Table } from "dexie";
import type { Route, UsageEvent } from "@/types";

// 사진은 Blob 그대로 휴대폰 안에 저장한다. 서버로는 보내기 직전에만 꺼낸다.
type PhotoRow = { id: string; blob: Blob; createdAt: string };

class IjeongpyoDB extends Dexie {
  routes!: Table<Route, string>;
  photos!: Table<PhotoRow, string>;
  events!: Table<UsageEvent, number>;

  constructor() {
    super("ijeongpyo");
    this.version(1).stores({
      routes: "id, createdAt, status",
      photos: "id, createdAt",
    });
    // 2판: 시험용 사용 기록 (휴대폰 안에만 둔다)
    this.version(2).stores({
      routes: "id, createdAt, status",
      photos: "id, createdAt",
      events: "++id, at, routeId, type",
    });
  }
}

export const db = new IjeongpyoDB();

export const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

export async function savePhoto(blob: Blob): Promise<string> {
  const id = newId();
  await db.photos.put({ id, blob, createdAt: new Date().toISOString() });
  return id;
}

export async function getPhoto(id: string): Promise<Blob | undefined> {
  return (await db.photos.get(id))?.blob;
}

export async function deleteRoute(id: string) {
  const route = await db.routes.get(id);
  if (!route) return;
  await db.transaction("rw", db.routes, db.photos, async () => {
    await db.photos.bulkDelete(route.cards.map((c) => c.photoId));
    await db.routes.delete(id);
  });
}

// 지우기 전에 길과 사진을 잠깐 들고 있다가, '되돌리기'를 누르면 그대로 다시 넣는다
export type RouteSnapshot = { route: Route; photos: { id: string; blob: Blob; createdAt: string }[] };

export async function deleteRoutes(ids: string[]): Promise<RouteSnapshot[]> {
  const snaps: RouteSnapshot[] = [];
  await db.transaction("rw", db.routes, db.photos, async () => {
    for (const id of ids) {
      const route = await db.routes.get(id);
      if (!route) continue;
      const photoIds = route.cards.map((c) => c.photoId).filter(Boolean);
      const photos = (await db.photos.bulkGet(photoIds)).filter((x): x is NonNullable<typeof x> => !!x);
      snaps.push({ route, photos: photos.map((p) => ({ id: p.id, blob: p.blob, createdAt: p.createdAt })) });
      await db.photos.bulkDelete(photoIds);
      await db.routes.delete(id);
    }
  });
  return snaps;
}

export async function restoreRoutes(snaps: RouteSnapshot[]) {
  await db.transaction("rw", db.routes, db.photos, async () => {
    for (const s of snaps) {
      await db.photos.bulkPut(s.photos);
      await db.routes.put(s.route);
    }
  });
}
