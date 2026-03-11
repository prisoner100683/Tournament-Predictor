import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
  createInitialCompetitionState,
  dispatchCompetitionMutation,
  type CompetitionState,
} from "../engines/prediction/prediction-engine";
import type { MatchId, MatchSlotKey, TeamId } from "../types/competition";

type CompetitionStore = CompetitionState & {
  assignTeamToRoundOneMatch: (matchId: MatchId, slot: MatchSlotKey, teamId: TeamId) => void;
  setMatchWinner: (matchId: MatchId, winnerId: TeamId) => void;
  updateTeamDetails: (teamId: TeamId, name: string, themeColor: string) => void;
  resetCompetition: () => void;
};

export const useCompetitionStore = create<CompetitionStore>()(
  persist(
    (set) => ({
      ...createInitialCompetitionState(),
      assignTeamToRoundOneMatch: (matchId, slot, teamId) =>
        set((state) =>
          dispatchCompetitionMutation(state, {
            type: "assign_team_to_round_one_match",
            matchId,
            slot,
            teamId,
          }),
        ),
      setMatchWinner: (matchId, winnerId) =>
        set((state) =>
          dispatchCompetitionMutation(state, {
            type: "set_match_winner",
            matchId,
            winnerId,
          }),
        ),
      updateTeamDetails: (teamId, name, themeColor) =>
        set((state) => ({
          ...state,
          teams: state.teams.map((team) =>
            team.id === teamId
              ? {
                  ...team,
                  name,
                  shortName: buildShortName(name),
                  themeColor,
                }
              : team,
          ),
        })),
      resetCompetition: () => set(() => createInitialCompetitionState()),
    }),
    {
      name: "tournament-predictor-state",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        teams: state.teams,
        swissRounds: state.swissRounds,
        swissRecords: state.swissRecords,
        qualifiedTeamIds: state.qualifiedTeamIds,
        eliminatedTeamIds: state.eliminatedTeamIds,
        activeRound: state.activeRound,
        swissCompleted: state.swissCompleted,
        playoffBracket: state.playoffBracket,
      }),
    },
  ),
);

function buildShortName(name: string) {
  const compact = name.replace(/\s+/g, "");
  const ascii = compact.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  if (ascii.length >= 3) {
    return ascii.slice(0, 3);
  }
  return compact.slice(0, 3).toUpperCase() || "TEAM";
}

export function clearCompetitionStorage() {
  useCompetitionStore.persist.clearStorage();
}
