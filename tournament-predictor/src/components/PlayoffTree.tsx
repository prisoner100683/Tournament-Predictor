import type { Match, TeamId } from "../types/competition";
import { useCompetitionStore } from "../stores/competition-store";

const UPPER_COLUMNS = [
  { title: "8 强叶子", ids: [] as string[] },
  { title: "胜者组首轮", ids: ["U1", "U2", "U3", "U4"] },
  { title: "胜者组半决", ids: ["U5", "U6"] },
  { title: "胜者组决赛", ids: ["U7"] },
  { title: "总决赛路径", ids: ["GF", "GF_RESET"] },
];

const LOWER_COLUMNS = [
  { title: "败者组首轮", ids: ["L1", "L2"] },
  { title: "败者组次轮", ids: ["L3", "L4"] },
  { title: "败者组终段", ids: ["L5", "L6"] },
];

export function PlayoffTree() {
  const bracket = useCompetitionStore((state) => state.playoffBracket);
  const teams = useCompetitionStore((state) => state.teams);
  const setWinner = useCompetitionStore((state) => state.setMatchWinner);

  if (!bracket) {
    return null;
  }

  const byId = new Map(bracket.matches.map((match) => [match.id, match]));
  const leaves = bracket.seedMap
    .map((teamId) => teams.find((team) => team.id === teamId))
    .filter((team): team is NonNullable<typeof team> => Boolean(team));

  return (
    <div className="playoff-tree">
      <div className="tree-upper">
        <svg className="tree-svg tree-svg-upper" viewBox="0 0 1600 520" aria-hidden="true">
          <path d="M190 90 C250 90, 250 75, 320 75" />
          <path d="M190 200 C250 200, 250 205, 320 205" />
          <path d="M190 310 C250 310, 250 335, 320 335" />
          <path d="M190 420 C250 420, 250 465, 320 465" />

          <path d="M560 140 C650 140, 650 160, 820 160" />
          <path d="M560 400 C650 400, 650 360, 820 360" />

          <path d="M1060 260 C1140 260, 1140 250, 1180 250" />
          <path d="M1300 250 C1380 250, 1400 250, 1490 250" />
          <path d="M1300 360 C1380 360, 1400 315, 1490 315" />
        </svg>
        <div className="tree-backbone tree-backbone-upper" aria-hidden="true" />

        <div className="tree-column leaves-column tree-source-column">
          <h3>8 强种子</h3>
          <div className="leaf-stack">
            {leaves.map((team) => (
              <div
                key={team.id}
                className="leaf-node"
                style={{ ["--team-accent" as string]: team.themeColor }}
              >
                <span>Seed {team.seed}</span>
                <strong>{team.shortName}</strong>
                <small>{team.name}</small>
              </div>
            ))}
          </div>
        </div>

        {UPPER_COLUMNS.slice(1).map((column, index) => (
          <div
            key={column.title}
            className={`tree-column ${index < UPPER_COLUMNS.length - 2 ? "tree-connected" : ""} ${
              column.ids.includes("GF") ? "tree-finals-column" : ""
            }`}
          >
            <h3>{column.title}</h3>
            <div className="compact-stack">
              {column.ids.map((id) => {
                const match = byId.get(id);
                if (!match) {
                  return null;
                }
                if (id === "GF_RESET" && !bracket.requiresResetFinal && !match.winnerId) {
                  return <ResetPlaceholder key={id} />;
                }
                return <PlayoffMatchCard key={id} match={match} onPick={setWinner} />;
              })}
            </div>
          </div>
        ))}

        <div className="champion-root">
          <div className="root-connector" aria-hidden="true" />
          <div className="root-core">
            <span>冠军根节点</span>
            <strong>{teams.find((team) => team.id === bracket.championId)?.shortName ?? "待定"}</strong>
            <small>{teams.find((team) => team.id === bracket.championId)?.name ?? "总决赛尚未结束"}</small>
          </div>
        </div>
      </div>

      <div className="tree-lower">
        <svg className="tree-svg tree-svg-lower" viewBox="0 0 900 280" aria-hidden="true">
          <path d="M120 70 C200 70, 210 80, 320 80" />
          <path d="M120 210 C200 210, 210 200, 320 200" />
          <path d="M560 80 C650 80, 660 115, 780 115" />
          <path d="M560 200 C650 200, 660 165, 780 165" />
        </svg>
        <div className="tree-backbone tree-backbone-lower" aria-hidden="true" />
        {LOWER_COLUMNS.map((column, index) => (
          <div
            key={column.title}
            className={`tree-column lower-column ${index < LOWER_COLUMNS.length - 1 ? "tree-connected" : ""}`}
          >
            <h3>{column.title}</h3>
            <div className="compact-stack">
              {column.ids.map((id) => {
                const match = byId.get(id);
                return match ? <PlayoffMatchCard key={id} match={match} onPick={setWinner} /> : null;
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PlayoffMatchCard({
  match,
  onPick,
}: {
  match: Match;
  onPick: (matchId: string, winnerId: TeamId) => void;
}) {
  const teams = useCompetitionStore((state) => state.teams);
  const teamA = teams.find((team) => team.id === match.slotA.teamId);
  const teamB = teams.find((team) => team.id === match.slotB.teamId);

  return (
    <article className={`match-card compact-card status-${match.status}`}>
      <div className="match-header compact-header">
        <span>{match.label}</span>
        <span className="status-pill">{renderStatus(match.status)}</span>
      </div>
      <div className="slot-stack compact-stack">
        {[teamA, teamB].map((team, index) => {
          const teamId = index === 0 ? match.slotA.teamId : match.slotB.teamId;
          const isWinner = match.winnerId === teamId;
          return (
            <div
              key={`${match.id}-${index}`}
              className={`match-slot compact-slot ${team ? "filled" : "empty"} ${isWinner ? "winner" : ""}`}
              onDoubleClick={() => {
                if (teamId) {
                  onPick(match.id, teamId);
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
                <span className="slot-placeholder">等待来源节点</span>
              )}
            </div>
          );
        })}
      </div>
    </article>
  );
}

function ResetPlaceholder() {
  return (
    <div className="reset-branch-placeholder tree-extension-card">
      <span>若败者组冠军先赢总决赛</span>
      <strong>此处自动延伸加赛</strong>
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
