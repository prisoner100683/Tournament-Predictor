import type { Match, SwissRecord, SwissRound, Team, TeamId } from "../../types/competition";
import { updateMatchStatus } from "./swiss-setup-engine";

const QUALIFY_WINS = 3;
const ELIMINATE_LOSSES = 3;
const MAX_SWISS_ROUNDS = 5;

type SwissComputation = {
  rounds: SwissRound[];
  records: Record<TeamId, SwissRecord>;
  qualifiedTeamIds: TeamId[];
  eliminatedTeamIds: TeamId[];
  completed: boolean;
  activeRound: number;
};

export function recomputeSwissState(teams: Team[], existingRounds: SwissRound[]): SwissComputation {
  const preservedPredictions = new Map<string, TeamId>();
  for (const round of existingRounds) {
    for (const match of round.matches) {
      if (match.winnerId) {
        preservedPredictions.set(match.id, match.winnerId);
      }
    }
  }

  const roundOne = cloneRound(existingRounds[0]);
  const records = createInitialRecords(teams);
  const rounds: SwissRound[] = [applyRoundPredictions(roundOne, preservedPredictions)];

  processCompletedMatches(rounds[0].matches, records);

  let currentRoundNumber = 2;
  while (currentRoundNumber <= MAX_SWISS_ROUNDS) {
    const qualifiedTeamIds = getTeamsByStatus(records, "qualified");
    const eliminatedTeamIds = getTeamsByStatus(records, "eliminated");

    if (qualifiedTeamIds.length >= 8) {
      return finalizeSwissState(rounds, records);
    }

    const activeTeams = teams
      .map((team) => team.id)
      .filter((teamId) => records[teamId].status === "active");

    if (activeTeams.length < 2) {
      return finalizeSwissState(rounds, records);
    }

    const generatedRound = createSwissRound(currentRoundNumber, activeTeams, records, teams);
    const appliedRound = applyRoundPredictions(generatedRound, preservedPredictions);
    rounds.push(appliedRound);
    processCompletedMatches(appliedRound.matches, records);

    const hasUnpredictedReadyMatch = appliedRound.matches.some(
      (match) => match.status === "ready" || match.status === "partial" || match.status === "empty",
    );

    if (hasUnpredictedReadyMatch) {
      return {
        rounds,
        records,
        qualifiedTeamIds,
        eliminatedTeamIds,
        completed: false,
        activeRound: appliedRound.round,
      };
    }

    currentRoundNumber += 1;
  }

  return finalizeSwissState(rounds, records);
}

function createInitialRecords(teams: Team[]): Record<TeamId, SwissRecord> {
  return Object.fromEntries(
    teams.map((team) => [
      team.id,
      {
        teamId: team.id,
        wins: 0,
        losses: 0,
        opponents: [],
        status: "active",
      },
    ]),
  );
}

function cloneRound(round?: SwissRound): SwissRound {
  return {
    round: round?.round ?? 1,
    completed: round?.completed ?? false,
    matches:
      round?.matches.map((match) => ({
        ...match,
        slotA: { ...match.slotA, source: { ...match.slotA.source } },
        slotB: { ...match.slotB, source: { ...match.slotB.source } },
      })) ?? [],
  };
}

function applyRoundPredictions(round: SwissRound, preservedPredictions: Map<string, TeamId>): SwissRound {
  const matches = round.matches.map((match) => {
    const nextMatch = updateMatchStatus({
      ...match,
      winnerId: undefined,
      loserId: undefined,
      status: match.status === "invalidated" ? "invalidated" : match.status,
    });
    const winnerId = preservedPredictions.get(match.id);
    if (!winnerId) {
      return nextMatch;
    }

    const slotA = nextMatch.slotA.teamId;
    const slotB = nextMatch.slotB.teamId;
    if (!slotA || !slotB) {
      return nextMatch;
    }
    if (winnerId !== slotA && winnerId !== slotB) {
      return nextMatch;
    }

    const predictedMatch: Match = {
      ...nextMatch,
      winnerId,
      loserId: winnerId === slotA ? slotB : slotA,
      status: "predicted",
    };
    return predictedMatch;
  });

  return {
    ...round,
    matches,
    completed: matches.every((match) => match.status === "predicted"),
  };
}

function processCompletedMatches(
  matches: Match[],
  records: Record<TeamId, SwissRecord>,
) {
  for (const match of matches) {
    if (!match.winnerId || !match.loserId) {
      continue;
    }

    const winner = records[match.winnerId];
    const loser = records[match.loserId];
    if (!winner || !loser) {
      continue;
    }

    winner.wins += 1;
    loser.losses += 1;
    winner.opponents.push(loser.teamId);
    loser.opponents.push(winner.teamId);
  }

  for (const record of Object.values(records)) {
    if (record.wins >= QUALIFY_WINS) {
      record.status = "qualified";
    } else if (record.losses >= ELIMINATE_LOSSES) {
      record.status = "eliminated";
    } else {
      record.status = "active";
    }
  }
}

function createSwissRound(
  round: number,
  activeTeamIds: TeamId[],
  records: Record<TeamId, SwissRecord>,
  teams: Team[],
): SwissRound {
  const orderedTeamIds = [...activeTeamIds].sort((a, b) => compareTeamOrder(a, b, records, teams));
  const pairings: Array<[TeamId, TeamId]> = [];

  while (orderedTeamIds.length >= 2) {
    const first = orderedTeamIds.shift()!;
    const opponentIndex = findBestOpponentIndex(first, orderedTeamIds, records, teams);
    const second = orderedTeamIds.splice(opponentIndex, 1)[0];
    pairings.push([first, second]);
  }

  const matches = pairings.map(([teamA, teamB], index) =>
    updateMatchStatus({
      id: `swiss-r${round}-m${index + 1}`,
      stage: "swiss",
      round,
      index,
      label: `R${round} - Match ${index + 1}`,
      slotA: {
        key: "A",
        source: { type: "team", teamId: teamA },
        teamId: teamA,
      },
      slotB: {
        key: "B",
        source: { type: "team", teamId: teamB },
        teamId: teamB,
      },
      status: "ready",
    }),
  );

  return {
    round,
    matches,
    completed: false,
  };
}

function findBestOpponentIndex(
  teamId: TeamId,
  candidates: TeamId[],
  records: Record<TeamId, SwissRecord>,
  teams: Team[],
) {
  const source = records[teamId];
  let bestIndex = 0;
  let bestScore = Number.POSITIVE_INFINITY;

  candidates.forEach((candidateId, index) => {
    const candidate = records[candidateId];
    const sameWinsPenalty = Math.abs(source.wins - candidate.wins) * 100;
    const sameLossesPenalty = Math.abs(source.losses - candidate.losses) * 10;
    const rematchPenalty = source.opponents.includes(candidateId) ? 1000 : 0;
    const seedPenalty = Math.abs(getSeed(teamId, teams) - getSeed(candidateId, teams));
    const score = sameWinsPenalty + sameLossesPenalty + rematchPenalty + seedPenalty;

    if (score < bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  });

  return bestIndex;
}

function compareTeamOrder(
  left: TeamId,
  right: TeamId,
  records: Record<TeamId, SwissRecord>,
  teams: Team[],
) {
  const leftRecord = records[left];
  const rightRecord = records[right];
  if (rightRecord.wins !== leftRecord.wins) {
    return rightRecord.wins - leftRecord.wins;
  }
  if (leftRecord.losses !== rightRecord.losses) {
    return leftRecord.losses - rightRecord.losses;
  }

  const leftSeed = teams.find((team) => team.id === left)?.seed ?? 999;
  const rightSeed = teams.find((team) => team.id === right)?.seed ?? 999;
  return leftSeed - rightSeed;
}

function getSeed(teamId: TeamId, teams: Team[]) {
  return teams.find((team) => team.id === teamId)?.seed ?? 999;
}

function getTeamsByStatus(records: Record<TeamId, SwissRecord>, status: SwissRecord["status"]) {
  return Object.values(records)
    .filter((record) => record.status === status)
    .sort((left, right) => {
      if (right.wins !== left.wins) {
        return right.wins - left.wins;
      }
      if (left.losses !== right.losses) {
        return left.losses - right.losses;
      }
      return left.teamId.localeCompare(right.teamId);
    })
    .map((record) => record.teamId);
}

function finalizeSwissState(
  rounds: SwissRound[],
  records: Record<TeamId, SwissRecord>,
): SwissComputation {
  const qualifiedTeamIds = getTeamsByStatus(records, "qualified");

  if (qualifiedTeamIds.length >= 8) {
    for (const record of Object.values(records)) {
      if (record.status !== "qualified") {
        record.status = "eliminated";
      }
    }
  }

  const eliminatedTeamIds = getTeamsByStatus(records, "eliminated");

  return {
    rounds,
    records,
    qualifiedTeamIds,
    eliminatedTeamIds,
    completed: qualifiedTeamIds.length >= 8 || rounds.length >= MAX_SWISS_ROUNDS,
    activeRound: rounds.length,
  };
}
