"use client";

import { Roadview } from "@/components/Roadview";
import { AppBar } from "@/components/ui";

// 로드뷰 점검용 화면: 대전역 앞 중앙로 한 지점의 로드뷰를 띄운다. 메뉴에는 없다.
export default function RoadviewTest() {
  return (
    <main className="screen">
      <AppBar title="로드뷰 점검" back="/" />
      <div className="body">
        <p className="body-medium muted">대전역 앞 중앙로. 거리 사진이 나오고 손가락으로 돌려지면 정상이에요.</p>
        <Roadview lat={36.3293} lng={127.4275} heading={60} />
      </div>
    </main>
  );
}
