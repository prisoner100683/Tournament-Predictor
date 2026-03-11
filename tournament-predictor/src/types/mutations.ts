import type { MatchId, MatchSlotKey, TeamId } from "./competition";

export type PredictionMutation =
  | {
      type: "assign_team_to_round_one_match";
      matchId: MatchId;
      slot: MatchSlotKey;
      teamId: TeamId;
    }
  | {
      type: "set_match_winner";
      matchId: MatchId;
      winnerId: TeamId;
    };
