export type TeamId = string;
export type MatchId = string;

export type Team = {
  id: TeamId;
  name: string;
  shortName: string;
  seed: number;
  themeColor: string;
};

export type MatchSlotKey = "A" | "B";

export type MatchSource =
  | { type: "team"; teamId: TeamId }
  | { type: "match_winner"; matchId: MatchId }
  | { type: "match_loser"; matchId: MatchId }
  | { type: "pending" };

export type MatchSlot = {
  key: MatchSlotKey;
  source: MatchSource;
  teamId?: TeamId;
};

export type MatchStatus = "empty" | "partial" | "ready" | "predicted" | "invalidated";
export type SwissStatus = "active" | "qualified" | "eliminated";

export type Match = {
  id: MatchId;
  stage: "swiss" | "upper_bracket" | "lower_bracket" | "grand_final" | "grand_final_reset";
  round: number;
  index: number;
  label: string;
  slotA: MatchSlot;
  slotB: MatchSlot;
  winnerId?: TeamId;
  loserId?: TeamId;
  status: MatchStatus;
};

export type SwissRecord = {
  teamId: TeamId;
  wins: number;
  losses: number;
  opponents: TeamId[];
  status: SwissStatus;
};

export type SwissRound = {
  round: number;
  matches: Match[];
  completed: boolean;
};

export type BracketLink = {
  fromMatchId: MatchId;
  result: "winner" | "loser";
  toMatchId: MatchId;
  toSlot: MatchSlotKey;
};

export type PlayoffBracket = {
  matches: Match[];
  links: BracketLink[];
  seedMap: TeamId[];
  championId?: TeamId;
  runnerUpId?: TeamId;
  requiresResetFinal: boolean;
};
