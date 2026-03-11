import type {
  BracketLink,
  Match,
  MatchId,
  MatchSlot,
  MatchSlotKey,
  PlayoffBracket,
  TeamId,
} from "../../types/competition";
import { updateMatchStatus } from "../swiss/swiss-setup-engine";

type MatchTemplate = {
  id: MatchId;
  stage: Match["stage"];
  round: number;
  index: number;
  label: string;
  slotA: MatchSlot;
  slotB: MatchSlot;
};

const PLAYOFF_LINKS: BracketLink[] = [
  { fromMatchId: "U1", result: "winner", toMatchId: "U5", toSlot: "A" },
  { fromMatchId: "U1", result: "loser", toMatchId: "L1", toSlot: "A" },
  { fromMatchId: "U2", result: "winner", toMatchId: "U5", toSlot: "B" },
  { fromMatchId: "U2", result: "loser", toMatchId: "L1", toSlot: "B" },
  { fromMatchId: "U3", result: "winner", toMatchId: "U6", toSlot: "A" },
  { fromMatchId: "U3", result: "loser", toMatchId: "L2", toSlot: "A" },
  { fromMatchId: "U4", result: "winner", toMatchId: "U6", toSlot: "B" },
  { fromMatchId: "U4", result: "loser", toMatchId: "L2", toSlot: "B" },
  { fromMatchId: "U5", result: "winner", toMatchId: "U7", toSlot: "A" },
  { fromMatchId: "U5", result: "loser", toMatchId: "L4", toSlot: "B" },
  { fromMatchId: "U6", result: "winner", toMatchId: "U7", toSlot: "B" },
  { fromMatchId: "U6", result: "loser", toMatchId: "L3", toSlot: "B" },
  { fromMatchId: "L1", result: "winner", toMatchId: "L3", toSlot: "A" },
  { fromMatchId: "L2", result: "winner", toMatchId: "L4", toSlot: "A" },
  { fromMatchId: "L3", result: "winner", toMatchId: "L5", toSlot: "A" },
  { fromMatchId: "L4", result: "winner", toMatchId: "L5", toSlot: "B" },
  { fromMatchId: "L5", result: "winner", toMatchId: "L6", toSlot: "A" },
  { fromMatchId: "U7", result: "loser", toMatchId: "L6", toSlot: "B" },
  { fromMatchId: "U7", result: "winner", toMatchId: "GF", toSlot: "A" },
  { fromMatchId: "L6", result: "winner", toMatchId: "GF", toSlot: "B" },
];

const MATCH_ORDER: MatchId[] = [
  "U1",
  "U2",
  "U3",
  "U4",
  "L1",
  "L2",
  "U5",
  "U6",
  "L3",
  "L4",
  "U7",
  "L5",
  "L6",
  "GF",
  "GF_RESET",
];

export function createPlayoffBracket(seedTeamIds: TeamId[]): PlayoffBracket {
  return recomputePlayoffBracket(
    {
      matches: createTemplates(seedTeamIds).map(createMatchFromTemplate),
      links: PLAYOFF_LINKS,
      seedMap: seedTeamIds,
      requiresResetFinal: false,
    },
    new Map<MatchId, TeamId>(),
  );
}

export function setPlayoffMatchWinner(
  bracket: PlayoffBracket,
  matchId: MatchId,
  winnerId: TeamId,
): PlayoffBracket {
  const preserved = new Map<MatchId, TeamId>();
  for (const match of bracket.matches) {
    if (match.winnerId) {
      preserved.set(match.id, match.winnerId);
    }
  }
  preserved.set(matchId, winnerId);

  return recomputePlayoffBracket(
    {
      matches: createTemplates(bracket.seedMap).map(createMatchFromTemplate),
      links: bracket.links,
      seedMap: bracket.seedMap,
      requiresResetFinal: false,
    },
    preserved,
  );
}

function recomputePlayoffBracket(
  bracket: Omit<PlayoffBracket, "championId" | "runnerUpId">,
  preserved: Map<MatchId, TeamId>,
): PlayoffBracket {
  const matches: Match[] = bracket.matches.map((match) => ({
    ...match,
    slotA: cloneSlot(match.slotA),
    slotB: cloneSlot(match.slotB),
    winnerId: undefined,
    loserId: undefined,
  }));
  const byId = new Map(matches.map((match) => [match.id, match]));

  for (const matchId of MATCH_ORDER) {
    const rawMatch = byId.get(matchId);
    if (!rawMatch) {
      continue;
    }

    resolveSlotTeam(rawMatch.slotA, byId);
    resolveSlotTeam(rawMatch.slotB, byId);
    const refreshed = updateMatchStatus(rawMatch);
    byId.set(matchId, refreshed);

    const preservedWinner = preserved.get(matchId);
    if (!preservedWinner) {
      continue;
    }
    const slotA = refreshed.slotA.teamId;
    const slotB = refreshed.slotB.teamId;
    if (!slotA || !slotB) {
      continue;
    }
    if (preservedWinner !== slotA && preservedWinner !== slotB) {
      continue;
    }

    refreshed.winnerId = preservedWinner;
    refreshed.loserId = preservedWinner === slotA ? slotB : slotA;
    refreshed.status = "predicted";
    byId.set(matchId, refreshed);

    for (const link of bracket.links.filter((item) => item.fromMatchId === matchId)) {
      const target = byId.get(link.toMatchId);
      if (!target) {
        continue;
      }
      const propagatedTeamId =
        link.result === "winner" ? refreshed.winnerId : refreshed.loserId;
      if (!propagatedTeamId) {
        continue;
      }
      setSlotTeam(
        target,
        link.toSlot,
        {
          type: link.result === "winner" ? "match_winner" : "match_loser",
          matchId,
        },
        propagatedTeamId,
      );
    }
  }

  const grandFinal = byId.get("GF");
  const resetFinal = byId.get("GF_RESET");
  let requiresResetFinal = false;
  let championId: TeamId | undefined;
  let runnerUpId: TeamId | undefined;

  if (grandFinal?.winnerId && grandFinal.slotA.teamId && grandFinal.slotB.teamId) {
    if (grandFinal.winnerId === grandFinal.slotA.teamId) {
      championId = grandFinal.winnerId;
      runnerUpId = grandFinal.loserId;
    } else if (resetFinal) {
      requiresResetFinal = true;
      setSlotTeam(
        resetFinal,
        "A",
        { type: "team", teamId: grandFinal.slotA.teamId },
        grandFinal.slotA.teamId,
      );
      setSlotTeam(
        resetFinal,
        "B",
        { type: "team", teamId: grandFinal.slotB.teamId },
        grandFinal.slotB.teamId,
      );
      const refreshedReset: Match = updateMatchStatus(resetFinal);
      byId.set("GF_RESET", refreshedReset);
      const resetWinner = preserved.get("GF_RESET");
      if (
        resetWinner &&
        (resetWinner === refreshedReset.slotA.teamId || resetWinner === refreshedReset.slotB.teamId)
      ) {
        refreshedReset.winnerId = resetWinner;
        refreshedReset.loserId =
          resetWinner === refreshedReset.slotA.teamId
            ? refreshedReset.slotB.teamId
            : refreshedReset.slotA.teamId;
        refreshedReset.status = "predicted";
        championId = refreshedReset.winnerId;
        runnerUpId = refreshedReset.loserId;
        byId.set("GF_RESET", refreshedReset);
      }
    }
  }

  if (!requiresResetFinal && resetFinal) {
    byId.set("GF_RESET", {
      ...resetFinal,
      slotA: { ...resetFinal.slotA, source: { type: "pending" }, teamId: undefined },
      slotB: { ...resetFinal.slotB, source: { type: "pending" }, teamId: undefined },
      winnerId: undefined,
      loserId: undefined,
      status: "empty",
    });
  }

  return {
    matches: [...byId.values()],
    links: bracket.links,
    seedMap: bracket.seedMap,
    championId,
    runnerUpId,
    requiresResetFinal,
  };
}

function createTemplates(seedTeamIds: TeamId[]): MatchTemplate[] {
  return [
    createSeededTemplate("U1", "upper_bracket", 1, 0, "胜者组首轮 1", seedTeamIds[0], seedTeamIds[7]),
    createSeededTemplate("U2", "upper_bracket", 1, 1, "胜者组首轮 2", seedTeamIds[3], seedTeamIds[4]),
    createSeededTemplate("U3", "upper_bracket", 1, 2, "胜者组首轮 3", seedTeamIds[1], seedTeamIds[6]),
    createSeededTemplate("U4", "upper_bracket", 1, 3, "胜者组首轮 4", seedTeamIds[2], seedTeamIds[5]),
    createPendingTemplate("L1", "lower_bracket", 1, 0, "败者组首轮 1"),
    createPendingTemplate("L2", "lower_bracket", 1, 1, "败者组首轮 2"),
    createPendingTemplate("U5", "upper_bracket", 2, 0, "胜者组半决 1"),
    createPendingTemplate("U6", "upper_bracket", 2, 1, "胜者组半决 2"),
    createPendingTemplate("L3", "lower_bracket", 2, 0, "败者组次轮 1"),
    createPendingTemplate("L4", "lower_bracket", 2, 1, "败者组次轮 2"),
    createPendingTemplate("U7", "upper_bracket", 3, 0, "胜者组决赛"),
    createPendingTemplate("L5", "lower_bracket", 3, 0, "败者组三轮"),
    createPendingTemplate("L6", "lower_bracket", 4, 0, "败者组决赛"),
    createPendingTemplate("GF", "grand_final", 1, 0, "总决赛"),
    createPendingTemplate("GF_RESET", "grand_final_reset", 2, 0, "总决赛加赛"),
  ];
}

function createSeededTemplate(
  id: MatchId,
  stage: Match["stage"],
  round: number,
  index: number,
  label: string,
  teamA?: TeamId,
  teamB?: TeamId,
): MatchTemplate {
  return {
    id,
    stage,
    round,
    index,
    label,
    slotA: teamA
      ? { key: "A", source: { type: "team", teamId: teamA }, teamId: teamA }
      : { key: "A", source: { type: "pending" } },
    slotB: teamB
      ? { key: "B", source: { type: "team", teamId: teamB }, teamId: teamB }
      : { key: "B", source: { type: "pending" } },
  };
}

function createPendingTemplate(
  id: MatchId,
  stage: Match["stage"],
  round: number,
  index: number,
  label: string,
): MatchTemplate {
  return {
    id,
    stage,
    round,
    index,
    label,
    slotA: { key: "A", source: { type: "pending" } },
    slotB: { key: "B", source: { type: "pending" } },
  };
}

function createMatchFromTemplate(template: MatchTemplate): Match {
  const match: Match = {
    ...template,
    status: "empty",
  };
  return updateMatchStatus(match);
}

function resolveSlotTeam(slot: MatchSlot, matches: Map<MatchId, Match>) {
  if (slot.source.type === "team") {
    slot.teamId = slot.source.teamId;
    return;
  }
  if (slot.source.type === "match_winner") {
    slot.teamId = matches.get(slot.source.matchId)?.winnerId;
    return;
  }
  if (slot.source.type === "match_loser") {
    slot.teamId = matches.get(slot.source.matchId)?.loserId;
    return;
  }
  slot.teamId = undefined;
}

function setSlotTeam(match: Match, slot: MatchSlotKey, source: MatchSlot["source"], teamId: TeamId) {
  const target = slot === "A" ? match.slotA : match.slotB;
  target.source = source;
  target.teamId = teamId;
}

function cloneSlot(slot: MatchSlot): MatchSlot {
  return {
    ...slot,
    source: { ...slot.source },
  };
}
