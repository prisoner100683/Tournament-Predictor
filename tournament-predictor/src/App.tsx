import { MatchBoard } from "./components/MatchBoard";
import { PlayoffTree } from "./components/PlayoffTree";
import { TeamPool } from "./components/TeamPool";
import { clearCompetitionStorage, useCompetitionStore } from "./stores/competition-store";

export function App() {
  const rounds = useCompetitionStore((state) => state.swissRounds);
  const teams = useCompetitionStore((state) => state.teams);
  const activeRound = useCompetitionStore((state) => state.activeRound);
  const swissCompleted = useCompetitionStore((state) => state.swissCompleted);
  const swissRecords = useCompetitionStore((state) => state.swissRecords);
  const qualifiedTeamIds = useCompetitionStore((state) => state.qualifiedTeamIds);
  const eliminatedTeamIds = useCompetitionStore((state) => state.eliminatedTeamIds);
  const playoffBracket = useCompetitionStore((state) => state.playoffBracket);
  const resetCompetition = useCompetitionStore((state) => state.resetCompetition);
  const roundOne = rounds[0]?.matches ?? [];
  const readyMatches = roundOne.filter((match) => match.slotA.teamId && match.slotB.teamId).length;
  const predictedMatches = roundOne.filter((match) => match.winnerId).length;
  const standings = Object.values(swissRecords).sort((left, right) => {
    if (right.wins !== left.wins) {
      return right.wins - left.wins;
    }
    if (left.losses !== right.losses) {
      return left.losses - right.losses;
    }
    return left.teamId.localeCompare(right.teamId);
  });

  return (
    <div className="app-shell">
      <header className="hero">
        <div>
          <p className="eyebrow">Tournament Predictor</p>
          <h1>16 队赛事预测工作台</h1>
          <p className="hero-copy">
            先将队伍拖入瑞士轮首轮比赛卡，再双击已就位的队伍判定胜者。凑满 8 支三胜队伍后，
            系统会自动生成 8 强严格双败树，并在总决赛出现败者组翻盘时继续延伸一场加赛。
          </p>
        </div>
        <div className="hero-stats">
          <div className="stat-card">
            <span>队伍池</span>
            <strong>{teams.length}</strong>
          </div>
          <div className="stat-card">
            <span>首轮就绪比赛</span>
            <strong>{readyMatches} / 8</strong>
          </div>
          <div className="stat-card">
            <span>首轮已预测</span>
            <strong>{predictedMatches} / 8</strong>
          </div>
          <div className="stat-card">
            <span>当前阶段</span>
            <strong>{swissCompleted ? "双败赛" : `瑞士轮第 ${activeRound} 轮`}</strong>
          </div>
        </div>
        <div className="hero-actions">
          <button
            className="danger-action"
            onClick={() => {
              if (!window.confirm("确认清空本地存档并重置全部预测吗？")) {
                return;
              }
              clearCompetitionStorage();
              resetCompetition();
            }}
            type="button"
          >
            清空本地存档 / 重置全部预测
          </button>
        </div>
      </header>

      <main className="workspace">
        <section className="panel team-panel">
          <div className="panel-header">
            <h2>队伍池</h2>
            <p>仅用于瑞士轮第 1 轮建局。已使用的队伍会从池中消失。</p>
          </div>
          <TeamPool />
        </section>

        <section className="panel board-panel">
          <div className="panel-header">
            <h2>瑞士轮</h2>
            <p>第 1 轮手动拖拽建局，第 2 轮起自动配对。双击队伍即可判定该场胜者。</p>
          </div>
          <MatchBoard />
        </section>

        <section className="panel standings-panel">
          <div className="panel-header">
            <h2>战绩总览</h2>
            <p>达到 3 胜晋级，赛事凑满 8 个晋级名额后，其余队伍直接淘汰。</p>
          </div>
          <div className="summary-strip">
            <div>
              <span>已晋级</span>
              <strong>{qualifiedTeamIds.length}</strong>
            </div>
            <div>
              <span>已淘汰</span>
              <strong>{eliminatedTeamIds.length}</strong>
            </div>
            <div>
              <span>瑞士轮总轮次</span>
              <strong>{rounds.length}</strong>
            </div>
          </div>
          <div className="standings-table">
            {standings.map((record) => {
              const team = teams.find((item) => item.id === record.teamId);
              if (!team) {
                return null;
              }

              return (
                <div key={record.teamId} className={`standing-row standing-${record.status}`}>
                  <div>
                    <strong>{team.shortName}</strong>
                    <small>{team.name}</small>
                  </div>
                  <div className="record-badge">
                    {record.wins}-{record.losses}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </main>

      {playoffBracket ? (
        <section className="panel playoff-panel">
          <div className="panel-header">
            <h2>8 强双败树</h2>
            <p>8 个晋级队作为叶子节点向冠军根节点汇聚。双击任意已就位队伍判定胜者。</p>
          </div>
          <PlayoffTree />
        </section>
      ) : null}
    </div>
  );
}
