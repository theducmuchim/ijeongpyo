"use client";

import { z } from "zod";
import { db } from "@/lib/db";
import { blobToPayload } from "@/lib/image";
import type { Route } from "@/types";

// 길과 사진은 이 휴대폰 안에만 있어서, 휴대폰을 바꾸거나 브라우저 기록을 지우면 사라진다.
// 그래서 길과 사진을 한 파일로 묶어 내보내고, 다른 휴대폰에서 다시 불러올 수 있게 한다. (설계서 9장 2차)

const BACKUP_KIND = "ijeongpyo-backup";

const cardSchema = z.object({
  id: z.string(),
  order: z.number(),
  photoId: z.string(),
  photoDescription: z.string(),
  landmark: z.object({ name: z.string(), side: z.enum(["left", "right", "ahead"]) }),
  action: z.enum(["straight", "left", "right", "arrive"]),
  instruction: z.string(),
  userNote: z.string(),
  warning: z.string().nullable().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
});
const routeSchema = z.object({
  id: z.string(),
  name: z.string(),
  createdAt: z.string(),
  lastWalkedAt: z.string().optional(),
  cards: z.array(cardSchema).min(1),
  track: z.array(z.tuple([z.number(), z.number()])).optional(),
  status: z.enum(["draft", "ready"]),
});
const backupSchema = z.object({
  kind: z.literal(BACKUP_KIND),
  version: z.literal(1),
  exportedAt: z.string(),
  routes: z.array(routeSchema),
  photos: z.record(z.string(), z.string()), // 사진 번호 → JPEG base64
});

export async function makeBackup() {
  const routes = await db.routes.toArray();
  const photos: Record<string, string> = {};
  for (const r of routes) {
    for (const c of r.cards) {
      const row = await db.photos.get(c.photoId);
      if (row) photos[c.photoId] = (await blobToPayload(row.blob)).base64;
    }
  }
  return { kind: BACKUP_KIND, version: 1 as const, exportedAt: new Date().toISOString(), routes, photos };
}

function base64ToBlob(b64: string) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: "image/jpeg" });
}

// 같은 길(같은 번호)이 이미 있으면 백업 내용으로 바꾸고, 없으면 새로 넣는다.
export async function restoreBackup(file: File): Promise<{ added: number; replaced: number }> {
  let json: unknown;
  try {
    json = JSON.parse(await file.text());
  } catch {
    throw new Error("이정표 백업 파일이 아니에요.");
  }
  const parsed = backupSchema.safeParse(json);
  if (!parsed.success) throw new Error("이정표 백업 파일이 아니거나 파일이 깨졌어요.");
  const { routes, photos } = parsed.data;
  let added = 0;
  let replaced = 0;
  await db.transaction("rw", db.routes, db.photos, async () => {
    for (const r of routes) {
      const exists = await db.routes.get(r.id);
      if (exists) {
        // 옛 사진 중 새 백업에 없는 것은 지운다
        const keep = new Set(r.cards.map((c) => c.photoId));
        await db.photos.bulkDelete(exists.cards.map((c) => c.photoId).filter((id) => !keep.has(id)));
        replaced++;
      } else added++;
      for (const c of r.cards) {
        const b64 = photos[c.photoId];
        if (b64) await db.photos.put({ id: c.photoId, blob: base64ToBlob(b64), createdAt: r.createdAt });
      }
      await db.routes.put(r as Route);
    }
  });
  navigator.storage?.persist?.().catch(() => {});
  return { added, replaced };
}
