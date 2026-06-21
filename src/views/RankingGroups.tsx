import type { BoardEntryItem, RankingEntryItem } from "../types";
import { boardStatusLabel, fanTypeLabel, seatDecisionLabel } from "../utils/labels";

export function RankingEntryGroup({
  title,
  entries,
  emptyText = "当前分区还没有粉丝。"
}: {
  title: string;
  entries: RankingEntryItem[];
  emptyText?: string;
}) {
  return (
    <div className="ranking-group">
      <div className="ranking-group-title">
        <strong>{title}</strong>
        <span>{entries.length}</span>
      </div>
      {entries.length === 0 ? (
        <p className="muted">{emptyText}</p>
      ) : (
        <div className="account-list">
          {entries.map((entry, index) => (
            <article className="account-row fan-row ranking-row" key={entry.id}>
              <div>
                <strong>
                  #{index + 1} {entry.displayNameAtTime} · {seatDecisionLabel(entry.seatDecision)}
                </strong>
                <span>
                  总票数：{entry.competitionScore} = 礼物 {entry.giftDiamonds} + 取票 {entry.ticketUsed} + 调整{" "}
                  {entry.manualAdjustment}
                </span>
                <span>
                  粉丝类型：{fanTypeLabel(entry.fanTypeAtTime)} · 同票顺序：{entry.rankOrder}
                </span>
                {entry.note ? <span>备注：{entry.note}</span> : null}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

export function BoardEntryGroup({
  title,
  entries,
  emptyText = "当前分区还没有粉丝。"
}: {
  title: string;
  entries: BoardEntryItem[];
  emptyText?: string;
}) {
  return (
    <div className="ranking-group">
      <div className="ranking-group-title">
        <strong>{title}</strong>
        <span>{entries.length}</span>
      </div>
      {entries.length === 0 ? (
        <p className="muted">{emptyText}</p>
      ) : (
        <div className="board-table">
          <div className="board-table-head">
            <span>粉丝 / 总票</span>
            <span>票数明细</span>
            <span>余额预览</span>
            <span>备注</span>
          </div>
          {entries.map((entry, index) => (
            <article className="board-row" key={entry.id}>
              <div>
                <strong>
                  #{index + 1} {entry.displayName} {entry.competitionScore}
                </strong>
                <span>
                  {boardStatusLabel(entry.status)} · 同票顺序 {entry.tieOrder || "-"}
                </span>
              </div>
              <div>
                <span>
                  礼物 {entry.giftDiamonds} + 取票 {entry.ticketUsed} - 存票 {entry.ticketDeposit} + 调整{" "}
                  {entry.manualAdjustment}
                </span>
              </div>
              <div>
                <span>
                  {entry.cachedTicketBalance} 到 {entry.balancePreview}
                </span>
              </div>
              <div>{entry.note ? <span>{entry.note}</span> : <span className="muted">无</span>}</div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
