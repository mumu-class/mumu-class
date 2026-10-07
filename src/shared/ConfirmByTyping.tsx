import { useState } from "react";

/** 大範圍破壞性操作：必須輸入指定文字才能執行 */
export function ConfirmByTyping({ title, phrase, onConfirm, onCancel }: {
  title: string; phrase: string; onConfirm: () => void; onCancel: () => void;
}) {
  const [text, setText] = useState("");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" role="dialog" aria-modal="true">
      <div className="card w-full max-w-md p-5 space-y-3">
        <h2 className="text-lg font-black">{title}</h2>
        <p className="text-sm text-muted">請輸入「<b className="text-ink">{phrase}</b>」確認。</p>
        <input id="confirm-typing" className="input" value={text} onChange={(e) => setText(e.target.value)} autoFocus />
        <div className="flex justify-end gap-2">
          <button className="btn" onClick={onCancel}>取消</button>
          <button className="btn-primary" disabled={text.trim() !== phrase} onClick={onConfirm}>確定執行</button>
        </div>
      </div>
    </div>
  );
}
