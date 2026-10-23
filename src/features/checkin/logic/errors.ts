// RPC 用 raise exception 'checkin_xxx' 拒絕的業務規則；同一格重複建立任務是 unique_violation（23505）
const TEXT = new Map([
  ["checkin_stale", "狀態已變動，無法復原"],
  ["checkin_archived", "這項任務已經封存，不能再修改"],
  ["checkin_exempt", "這位同學這一項免交"],
  ["checkin_no_student", "名單已更新，請重新整理"],
  ["checkin_forbidden", "沒有權限，請重新登入"],
  ["checkin_not_undoable", "這個動作不能復原"],
  ["checkin_archive_invalid", "任務狀態已變動，請重新整理後再封存"],
]);

type ErrLike = { message?: unknown; code?: unknown } | null | undefined;

/** 重試也不會成功的錯誤：交給畫面提示，不進 SaveStatus 的重試 */
export function isRuleError(e: unknown): boolean {
  const err = e as ErrLike;
  return err?.code === "23505" || (typeof err?.message === "string" && TEXT.has(err.message));
}

export function checkinErrorText(e: unknown): string {
  const err = e as ErrLike;
  if (err?.code === "23505") return "這一格已經有任務了，請重新整理";
  return (typeof err?.message === "string" && TEXT.get(err.message)) || "儲存失敗，請再試一次";
}
