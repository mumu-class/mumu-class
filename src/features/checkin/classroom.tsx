import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";

// 教室模式（設計 §3.2）：這台 iPad 記住狀態；解鎖只在記憶體裡，重新整理就回到上鎖
const MODE_KEY = "mumu.classroom";
const IDLE_MS = 2 * 60_000;

type Classroom = {
  classroom: boolean; unlocked: boolean;
  /** 老師的功能能不能用：不在教室模式，或已用 PIN 解鎖 */
  canTeach: boolean;
  enter: () => void; exit: () => void; unlock: () => void; lock: () => void;
};

const Ctx = createContext<Classroom | null>(null);

function readMode(): boolean {
  try { return localStorage.getItem(MODE_KEY) === "on"; } catch { return false; }
}

function writeMode(on: boolean) {
  try {
    if (on) localStorage.setItem(MODE_KEY, "on");
    else localStorage.removeItem(MODE_KEY);
  } catch { /* 無痕模式等情況寫不進去：只影響重新整理後是否維持教室模式 */ }
}

export function ClassroomProvider({ children }: { children: ReactNode }) {
  const [classroom, setClassroom] = useState(readMode);
  const [unlocked, setUnlocked] = useState(false);

  // 解鎖後 2 分鐘沒有操作就自動上鎖；任何點擊或按鍵都重新計時
  useEffect(() => {
    if (!classroom || !unlocked) return;
    let timer = window.setTimeout(() => setUnlocked(false), IDLE_MS);
    const reset = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setUnlocked(false), IDLE_MS);
    };
    window.addEventListener("pointerdown", reset);
    window.addEventListener("keydown", reset);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("pointerdown", reset);
      window.removeEventListener("keydown", reset);
    };
  }, [classroom, unlocked]);

  const value: Classroom = {
    classroom, unlocked, canTeach: !classroom || unlocked,
    enter: () => { writeMode(true); setClassroom(true); setUnlocked(false); },
    exit: () => { writeMode(false); setClassroom(false); setUnlocked(false); },
    unlock: () => setUnlocked(true),
    lock: () => setUnlocked(false),
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useClassroom(): Classroom {
  const v = useContext(Ctx);
  if (!v) throw new Error("useClassroom must be inside ClassroomProvider");
  return v;
}

/** 教室模式下只能停在任務打卡的頁面，其他路由一律導回 /checkin（AC41） */
export function ClassroomGuard({ children }: { children: ReactNode }) {
  const { classroom } = useClassroom();
  const { pathname } = useLocation();
  if (classroom && !pathname.startsWith("/checkin")) return <Navigate to="/checkin" replace />;
  return <>{children}</>;
}
