import { useState } from "react";
import { migrateCareer, recordSeries, type Career, type SeriesState } from "../../engine/src/index.ts";
import { db } from "./data.ts";
import { NewCareer } from "./NewCareer.tsx";
import { Hub } from "./Hub.tsx";
import { MatchDay } from "./MatchDay.tsx";
import { clearCareer, loadCareer, saveCareer } from "./save.ts";

export function App() {
  const [career, setCareer] = useState<Career | null>(() => {
    const saved = loadCareer();
    return saved ? migrateCareer(saved, db) : null;
  });
  const [, setVersion] = useState(0);
  const [playing, setPlaying] = useState<string | null>(null); // fixture id đang đấu

  // Career là dữ liệu thuần bị engine sửa trực tiếp: lưu lại và vẽ lại sau mỗi thay đổi
  const commit = () => {
    if (career) saveCareer(career);
    setVersion((v) => v + 1);
  };

  if (!career)
    return (
      <NewCareer
        onStart={(c) => {
          saveCareer(c);
          setCareer(c);
        }}
      />
    );

  if (playing)
    return (
      <MatchDay
        career={career}
        fixtureId={playing}
        onDone={(s: SeriesState) => {
          recordSeries(career, playing, s);
          setPlaying(null);
          commit();
        }}
        onCancel={() => setPlaying(null)}
      />
    );

  return (
    <Hub
      career={career}
      onChange={commit}
      onPlay={setPlaying}
      onQuit={() => {
        clearCareer();
        setCareer(null);
      }}
    />
  );
}
