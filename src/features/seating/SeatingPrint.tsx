import { Link, useParams } from "react-router-dom";
import { useClassData } from "../../lib/classData";
import { ErrorBox, Loading } from "../../shared/ui";
import { useLayouts, useSeats } from "./api";
import { groupName } from "./logic/seating";

/** A4 直式單頁：只印黑板、組別、座位；姓名放大、組長小字、下方留手寫空白（沿用舊版尺寸） */
export function SeatingPrint() {
  const { layoutId } = useParams();
  const { cls, allStudents } = useClassData();
  const layouts = useLayouts(cls.id);
  const seatsQ = useSeats(layoutId);
  if (layouts.error || seatsQ.error) return <ErrorBox error={layouts.error || seatsQ.error} />;
  const layout = layouts.data?.find((l) => l.id === layoutId);
  if (!layout || !seatsQ.data) return <Loading />;
  const byId = new Map(allStudents.map((s) => [s.id, s]));
  const gap = 2;
  const seatW = (196 - (layout.cols - 1) * gap) / layout.cols;
  const seatH = (285 - 12 - 5 - (layout.rows - 1) * gap) / layout.rows;

  return (
    <div className="print-root">
      <style>{`
        @page { size: A4 portrait; margin: 6mm; }
        .sheet { width: 198mm; margin: 0 auto; background: #fff; color: #000; }
        .p-board { width: 112mm; height: 10mm; line-height: 8mm; margin: 0 auto 2mm; border: 1px solid #000; text-align: center; font-weight: 700; font-size: 10pt; }
        .p-grid { display: grid; grid-template-columns: repeat(${layout.cols}, ${seatW}mm); column-gap: ${gap}mm; row-gap: ${gap}mm; width: 196mm; margin: 0 auto; }
        .p-label { text-align: center; font-size: 7.5pt; font-weight: 700; }
        .p-seat { height: ${seatH}mm; border: 0.8px solid #000; padding: 1.2mm; display: flex; flex-direction: column; overflow: hidden; }
        .p-no { font-size: 5.8pt; text-align: center; }
        .p-cn { font-size: 9.2pt; font-weight: 700; text-align: center; }
        .p-en { font-size: 5.8pt; text-align: center; margin-top: .25mm; }
        .p-role { font-size: 5.6pt; text-align: center; min-height: 2mm; margin-top: .35mm; }
        .p-note { flex: 1; border-top: 0.7px solid #aaa; margin-top: 1mm; }
        @media screen { .print-root { padding: 16px; background: var(--color-paper); min-height: 100vh; } .sheet { padding: 6mm; box-shadow: 0 2px 12px rgba(0,0,0,.1); } }
        @media print { .no-print { display: none !important; } html, body { background: #fff !important; } }
      `}</style>
      <div className="no-print mx-auto mb-4 flex max-w-3xl items-center gap-2">
        <Link to="/seating" className="btn">← 回座位表</Link>
        <button className="btn-primary" onClick={() => window.print()}>列印／輸出 PDF</button>
        <span className="text-sm text-muted">A4 直式，一頁印完</span>
      </div>
      <div className="sheet">
        <div className="p-board">黑板</div>
        <div className="p-grid">
          {Array.from({ length: layout.cols }, (_, c) => <div key={`g${c}`} className="p-label">{groupName(c, layout.cols)}</div>)}
          {Array.from({ length: layout.rows }, (_, r) => Array.from({ length: layout.cols }, (_, c) => {
            const seat = seatsQ.data!.find((s) => s.row === r && s.col === c);
            const st = seat?.student_id ? byId.get(seat.student_id) : undefined;
            return (
              <div key={`${r}-${c}`} className="p-seat">
                {st ? (<>
                  <div className="p-no">{st.student_no}號</div>
                  <div className="p-cn">{st.name_zh}</div>
                  <div className="p-en">{st.name_en}</div>
                  <div className="p-role">{seat?.is_leader ? "組長" : ""}</div>
                </>) : <div className="p-cn" style={{ color: "#aaa" }}>空位</div>}
                <div className="p-note" />
              </div>
            );
          }))}
        </div>
      </div>
    </div>
  );
}
