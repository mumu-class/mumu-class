import { useState } from "react";
import { useClassData } from "../../lib/classData";
import { useToast } from "../../shared/Toast";
import { useCheckinSettings, useSavePin } from "./api";
import { hashPin, isValidPin, newSalt } from "./logic/pin";

/** 設定頁：教室模式的 PIN。老師在自己的手機上設定或重設（設計 §3.2） */
export function CheckinPinSection() {
  const { cls } = useClassData();
  const settings = useCheckinSettings(cls.id);
  const save = useSavePin(cls.id);
  const toast = useToast();
  const [pin, setPin] = useState("");
  const [again, setAgain] = useState("");
  const hasPin = !!settings.data?.pin_hash;

  async function submit() {
    if (!isValidPin(pin)) { toast("PIN 要是 4 位數字"); return; }
    if (pin !== again) { toast("兩次輸入的 PIN 不一樣"); return; }
    const salt = newSalt();
    save.mutate({ pin_hash: await hashPin(pin, salt), pin_salt: salt }, {
      onSuccess: () => { setPin(""); setAgain(""); toast(hasPin ? "已重設 PIN" : "已設定 PIN，可以進入教室模式了"); },
      onError: () => toast("儲存失敗，請再試一次"),
    });
  }

  return (
    <section className="card p-4">
      <h2 className="mb-1 text-lg font-black">任務打卡｜教室模式 PIN</h2>
      <p className="mb-3 text-sm text-muted">
        {hasPin ? "已設定。" : "尚未設定，設定後才能進入教室模式。"}
        教室模式下，編輯任務、封存、標免交、離開教室模式都要輸入 PIN。PIN 只是防止學生在白板上誤按，忘記時在這裡重設即可。
      </p>
      <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <input id="pin-new" aria-label="新的 PIN" className="input" type="password" inputMode="numeric" maxLength={4}
          placeholder="4 位數字" value={pin} onChange={(e) => setPin(e.target.value)} />
        <input id="pin-again" aria-label="再輸入一次" className="input" type="password" inputMode="numeric" maxLength={4}
          placeholder="再輸入一次" value={again} onChange={(e) => setAgain(e.target.value)} />
        <button type="button" className="btn-primary" disabled={save.isPending} onClick={submit}>{hasPin ? "重設 PIN" : "設定 PIN"}</button>
      </div>
    </section>
  );
}
