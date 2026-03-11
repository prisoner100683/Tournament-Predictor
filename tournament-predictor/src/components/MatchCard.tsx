import type { Match, MatchSlot as SlotType } from "../types/competition";
import { useCompetitionStore } from "../stores/competition-store";

type Props = {
  match: Match;
};

export function MatchCard({ match }: Props) {
  return (
    <article className={`match-card status-${match.status}`}>
      <div className="match-header">
        <span>{match.label}</span>
        <span className="status-pill">{renderStatus(match.status)}</span>
      </div>
      <div className="slot-stack">
        <MatchSlot match={match} slot={match.slotA} />
        <MatchSlot match={match} slot={match.slotB} />
      </div>
    </article>
  );
}

function MatchSlot({
  match,
  slot,
}: {
  match: Match;
  slot: SlotType;
}) {
  const teams = useCompetitionStore((state) => state.teams);
  const assignTeam = useCompetitionStore((state) => state.assignTeamToRoundOneMatch);
  const setWinner = useCompetitionStore((state) => state.setMatchWinner);
  const team = teams.find((item) => item.id === slot.teamId);
  const isWinner = match.winnerId && team?.id === match.winnerId;
  const allowDrop = match.stage === "swiss" && match.round === 1;

  return (
    <div
      className={`match-slot ${team ? "filled" : "empty"} ${isWinner ? "winner" : ""}`}
      onDragOver={(event) => {
        if (allowDrop) {
          event.preventDefault();
        }
      }}
      onDrop={(event) => {
        if (!allowDrop) {
          return;
        }
        event.preventDefault();
        const teamId = event.dataTransfer.getData("text/team-id");
        if (teamId) {
          assignTeam(match.id, slot.key, teamId);
        }
      }}
      onDoubleClick={() => {
        if (team?.id) {
          setWinner(match.id, team.id);
        }
      }}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if ((event.key === "Enter" || event.key === " ") && team?.id) {
          event.preventDefault();
          setWinner(match.id, team.id);
        }
      }}
    >
      {team ? (
        <>
          <div className="slot-team-line">
            <strong>{team.shortName}</strong>
            <span>#{team.seed}</span>
          </div>
          <small>{team.name}</small>
        </>
      ) : (
        <span className="slot-placeholder">
          {allowDrop ? `拖入队伍到 ${slot.key} 槽位` : "等待上游结果"}
        </span>
      )}
    </div>
  );
}

function renderStatus(status: Match["status"]) {
  switch (status) {
    case "empty":
      return "空";
    case "partial":
      return "待补全";
    case "ready":
      return "可双击判胜";
    case "predicted":
      return "已预测";
    case "invalidated":
      return "待重算";
    default:
      return status;
  }
}
