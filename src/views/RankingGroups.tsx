import type { BoardEntryItem, RankingEntryItem } from "../types";
import { fanTypeLabel, seatDecisionLabel } from "../utils/labels";

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
  emptyText = "当前分区还没有粉丝。",
  fixedRows = false
}: {
  title: string;
  entries: BoardEntryItem[];
  emptyText?: string;
  fixedRows?: boolean;
}) {
  const tableClassName = fixedRows ? "board-table fixed-board-table" : "board-table";

  return (
    <div className="ranking-group">
      <div className="ranking-group-title">
        <strong>{title}</strong>
        <span>{entries.length}</span>
      </div>
      {entries.length === 0 && !fixedRows ? (
        <p className="muted">{emptyText}</p>
      ) : (
        <div className={tableClassName}>
          <div className="board-table-head">
            <span>排名 / 粉丝 / 总票</span>
            <span>票数明细</span>
            <span>余额预览</span>
            <span>备注</span>
          </div>
          {entries.length === 0 ? <p className="muted board-empty">{emptyText}</p> : null}
          {entries.map((entry, index) => (
            <article className="board-row" key={entry.id}>
              <div>
                <strong>
                  <span className="rank-number">{index + 1}</span>
                  {entry.displayName} {entry.competitionScore}
                </strong>
                {entry.tieOrder ? <span>同票顺序 {entry.tieOrder}</span> : null}
              </div>
              <div>
                <span>{formatBoardScore(entry)}</span>
              </div>
              <div>
                <span>
                  {entry.cachedTicketBalance} → {entry.balancePreview}
                </span>
              </div>
              <div>{entry.note ? <span>{entry.note}</span> : null}</div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function formatBoardScore(entry: BoardEntryItem) {
  const parts = [`礼物 ${entry.giftDiamonds}`];
  if (entry.ticketUsed !== 0) parts.push(`取票 ${entry.ticketUsed}`);
  if (entry.ticketDeposit !== 0) parts.push(`存票 -${entry.ticketDeposit}`);
  if (entry.manualAdjustment !== 0) parts.push(`调整 ${entry.manualAdjustment > 0 ? "+" : ""}${entry.manualAdjustment}`);
  return parts.join(" · ");
}
