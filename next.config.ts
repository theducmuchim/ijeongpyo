import type { NextConfig } from "next";

// 이정표는 대부분의 화면이 휴대폰 안 저장소(IndexedDB)를 읽는 클라이언트 화면이라
// 서버 쪽 캐시 기능은 쓰지 않는다.
const nextConfig: NextConfig = {};

export default nextConfig;
