import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { supabaseConfigured } from "../lib/supabase";
import { Loading } from "../shared/ui";
import { CheckinBoard } from "../features/checkin/CheckinBoard";
import { CheckinHistory } from "../features/checkin/CheckinHistory";
import { CheckinMissing } from "../features/checkin/CheckinMissing";
import { CheckinShell } from "../features/checkin/CheckinShell";
import { ClassroomGuard, ClassroomProvider } from "../features/checkin/classroom";
import { CoinsHistory } from "../features/coins/CoinsHistory";
import { CoinsNew } from "../features/coins/CoinsNew";
import { CoinsOverview } from "../features/coins/CoinsOverview";
import { CoinsStudent } from "../features/coins/CoinsStudent";
import { HomeworkHistory } from "../features/homework/HomeworkHistory";
import { HomeworkMissing } from "../features/homework/HomeworkMissing";
import { HomeworkToday } from "../features/homework/HomeworkToday";
import { PlannerPage } from "../features/planner/PlannerPage";
import { SettingsPage } from "../features/roster/SettingsPage";
import { SeatingPage } from "../features/seating/SeatingPage";
import { SeatingPrint } from "../features/seating/SeatingPrint";
import { ClassGate, Layout } from "./Layout";
import { Login } from "./Login";

export function App() {
  const { session, loading } = useAuth();
  const location = useLocation();

  if (!supabaseConfigured) {
    return (
      <div className="mx-auto max-w-lg p-6">
        <div className="card p-5">尚未設定 Supabase 連線（VITE_SUPABASE_URL、VITE_SUPABASE_ANON_KEY）。請參考 README。</div>
      </div>
    );
  }
  if (loading) return <Loading />;
  if (!session) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to={`/login?next=${encodeURIComponent(location.pathname)}`} replace />} />
      </Routes>
    );
  }

  return (
    <ClassGate>
      <ClassroomProvider>
        <ClassroomGuard>
          <Routes>
            <Route path="/seating/:layoutId/print" element={<SeatingPrint />} />
            <Route element={<Layout />}>
              <Route path="/homework" element={<HomeworkToday />} />
              <Route path="/homework/missing" element={<HomeworkMissing />} />
              <Route path="/homework/history" element={<HomeworkHistory />} />
              <Route path="/checkin" element={<CheckinShell />}>
                <Route index element={<CheckinBoard />} />
                <Route path="missing" element={<CheckinMissing />} />
                <Route path="history" element={<CheckinHistory />} />
              </Route>
              <Route path="/coins" element={<CoinsOverview />} />
              <Route path="/coins/new" element={<CoinsNew />} />
              <Route path="/coins/history" element={<CoinsHistory />} />
              <Route path="/coins/student/:id" element={<CoinsStudent />} />
              <Route path="/coins/student" element={<CoinsStudent />} />
              <Route path="/seating" element={<SeatingPage />} />
              <Route path="/planner" element={<PlannerPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="*" element={<Navigate to="/homework" replace />} />
            </Route>
          </Routes>
        </ClassroomGuard>
      </ClassroomProvider>
    </ClassGate>
  );
}
