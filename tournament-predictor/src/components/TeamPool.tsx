import { useEffect, useState } from "react";
import { useCompetitionStore } from "../stores/competition-store";

export function TeamPool() {
  const teams = useCompetitionStore((state) => state.teams);
  const matches = useCompetitionStore((state) => state.swissRounds[0]?.matches ?? []);
  const updateTeamDetails = useCompetitionStore((state) => state.updateTeamDetails);
  const [editingTeamId, setEditingTeamId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftColor, setDraftColor] = useState("#ff6b6b");
  const usedTeamIds = new Set(
    matches.flatMap((match) => [match.slotA.teamId, match.slotB.teamId]).filter(Boolean),
  );
  const editingTeam = teams.find((team) => team.id === editingTeamId) ?? null;

  useEffect(() => {
    if (!editingTeam) {
      return;
    }
    setDraftName(editingTeam.name);
    setDraftColor(editingTeam.themeColor);
  }, [editingTeam]);

  return (
    <>
      <div className="team-pool">
        {teams.map((team) => {
          const isUsed = usedTeamIds.has(team.id);

          return (
            <button
              key={team.id}
              className={`team-chip ${isUsed ? "team-chip-used" : ""} ${
                editingTeamId === team.id ? "team-chip-editing" : ""
              }`}
              draggable={!isUsed}
              onDragStart={(event) => {
                if (isUsed) {
                  event.preventDefault();
                  return;
                }
                event.dataTransfer.setData("text/team-id", team.id);
              }}
              onDoubleClick={() => {
                setEditingTeamId(team.id);
                setDraftName(team.name);
                setDraftColor(team.themeColor);
              }}
              style={{ ["--team-accent" as string]: team.themeColor }}
              type="button"
            >
              <span className="seed-badge">#{team.seed}</span>
              <span className="team-text">
                <strong>{team.shortName}</strong>
                <small>{team.name}</small>
              </span>
              <span className="team-chip-meta">{isUsed ? "已上场" : "可拖拽"}</span>
            </button>
          );
        })}
      </div>

      {editingTeam ? (
        <div
          className="team-editor-modal"
          onClick={() => setEditingTeamId(null)}
          role="presentation"
        >
          <div
            className="team-editor"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="队伍详细编辑"
          >
            <div className="team-editor-header">
              <div>
                <span>队伍详细编辑</span>
                <strong>{editingTeam.shortName}</strong>
              </div>
              <button
                className="editor-close"
                onClick={() => setEditingTeamId(null)}
                type="button"
              >
                关闭
              </button>
            </div>

            <label className="editor-field">
              <span>名字</span>
              <input
                value={draftName}
                onChange={(event) => setDraftName(event.target.value)}
                placeholder="输入队伍名称"
                type="text"
              />
            </label>

            <label className="editor-field">
              <span>队伍颜色</span>
              <div className="color-field">
                <input
                  value={draftColor}
                  onChange={(event) => setDraftColor(event.target.value)}
                  type="color"
                />
                <input
                  value={draftColor}
                  onChange={(event) => setDraftColor(event.target.value)}
                  type="text"
                />
              </div>
            </label>

            <button
              className="editor-save"
              onClick={() => {
                const trimmedName = draftName.trim();
                if (!trimmedName) {
                  return;
                }
                updateTeamDetails(editingTeam.id, trimmedName, draftColor);
                setEditingTeamId(null);
              }}
              type="button"
            >
              保存队伍信息
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
