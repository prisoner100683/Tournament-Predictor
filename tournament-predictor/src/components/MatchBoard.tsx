import { MatchCard } from "./MatchCard";
import { useCompetitionStore } from "../stores/competition-store";

export function MatchBoard() {
  const rounds = useCompetitionStore((state) => state.swissRounds);

  return (
    <div className="round-stack">
      {rounds.map((round) => (
        <section key={round.round} className="round-section">
          <div className="round-header">
            <h3>第 {round.round} 轮</h3>
            <span>{round.completed ? "本轮已完成" : "进行中"}</span>
          </div>
          <div className="match-grid">
            {round.matches.map((match) => (
              <MatchCard key={match.id} match={match} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
