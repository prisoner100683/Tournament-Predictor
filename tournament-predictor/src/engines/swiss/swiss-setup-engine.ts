import type { Match, MatchSlotKey, Team, TeamId } from "../../types/competition";

export function createRoundOneMatches(): Match[] {
  return Array.from({ length: 8 }, (_, index) => ({
    id: `swiss-r1-m${index + 1}`,
    stage: "swiss",
    round: 1,
    index,
    label: `R1 - Match ${index + 1}`,
    slotA: { key: "A", source: { type: "pending" } },
    slotB: { key: "B", source: { type: "pending" } },
    status: "empty",
  }));
}

export function assignTeamToRoundOneMatch(
  matches: Match[],
  teams: Team[],
  matchId: string,
  slot: MatchSlotKey,
  teamId: TeamId,
): Match[] {
  if (!teams.some((team) => team.id === teamId)) {
    return matches;
  }

  const alreadyUsed = matches.some(
    (match) =>
      match.id !== matchId &&
      (match.slotA.teamId === teamId || match.slotB.teamId === teamId),
  );

  if (alreadyUsed) {
    return matches;
  }

  return matches.map((match) => {
    if (match.id !== matchId) {
      return match;
    }

    const nextMatch = {
      ...match,
      slotA: { ...match.slotA },
      slotB: { ...match.slotB },
      winnerId: undefined,
      loserId: undefined,
    };

    nextMatch[slot === "A" ? "slotA" : "slotB"] = {
      key: slot,
      source: { type: "team", teamId },
      teamId,
    };

    return updateMatchStatus(nextMatch);
  });
}

export function setMatchWinner(matches: Match[], matchId: string, winnerId: TeamId): Match[] {
  return matches.map((match) => {
    if (match.id !== matchId) {
      return match;
    }

    const slotA = match.slotA.teamId;
    const slotB = match.slotB.teamId;
    if (!slotA || !slotB) {
      return match;
    }

    if (winnerId !== slotA && winnerId !== slotB) {
      return match;
    }

    return {
      ...match,
      winnerId,
      loserId: winnerId === slotA ? slotB : slotA,
      status: "predicted",
    };
  });
}

export function getAvailableTeams(teams: Team[], matches: Match[]): Team[] {
  const used = new Set(
    matches.flatMap((match) => [match.slotA.teamId, match.slotB.teamId]).filter(Boolean),
  );

  return teams.filter((team) => !used.has(team.id));
}

export function updateMatchStatus(match: Match): Match {
  const hasA = Boolean(match.slotA.teamId);
  const hasB = Boolean(match.slotB.teamId);

  if (hasA && hasB) {
    return { ...match, status: "ready" };
  }

  if (hasA || hasB) {
    return { ...match, status: "partial" };
  }

  return { ...match, status: "empty" };
}
