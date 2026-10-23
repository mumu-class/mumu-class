import { useState } from "react";
import { Dialog } from "../../shared/Dialog";
import { verifyPin } from "./logic/pin";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "清除", "0", "⌫"];

/** 畫面上的大數字鍵盤，不叫出系統鍵盤（設計 §3.2）。輸入滿 4 位自動比對 */
export function PinPad({ salt, hash, onSuccess, onCancel }: {
  salt: string | null; hash: string | null; onSuccess: () => void; onCancel: () => void;
}) {
  const [digits, setDigits] = useState("");
  const [wrong, setWrong] = useState(false);

  async function press(k: string) {
    setWrong(false);
    if (k === "清除") { setDigits(""); return; }
    if (k === "⌫") { setDigits((d) => d.slice(0, -1)); return; }
    const next = (digits + k).slice(0, 4);
    setDigits(next);
    if (next.length < 4) return;
    if (await verifyPin(next, salt, hash)) onSuccess();
    else { setWrong(true); setDigits(""); }
  }

  return (
    <Dialog title="輸入老師 PIN" onClose={onCancel}>
      <div className="mb-3 flex justify-center gap-3" aria-label={`已輸入 ${digits.length} 位`}>
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={`h-4 w-4 rounded-full border-2 border-sage ${i < digits.length ? "bg-sage" : ""}`} />
        ))}
      </div>
      <p className={`mb-3 text-center text-sm font-bold ${wrong ? "text-rose-ink" : "text-muted"}`}>
        {wrong ? "PIN 不正確，請再試一次" : "解鎖後 2 分鐘沒有操作會自動上鎖"}
      </p>
      <div className="grid grid-cols-3 gap-2">
        {KEYS.map((k) => (
          <button key={k} type="button" className="btn h-16 touch-manipulation text-2xl" onClick={() => press(k)}>{k}</button>
        ))}
      </div>
    </Dialog>
  );
}
