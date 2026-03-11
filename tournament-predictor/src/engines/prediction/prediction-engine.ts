import { seededTeams } from "../../data/seeded-teams";
import type { PredictionMutation } from "../../types/mutations";
import type { PlayoffBracket, SwissRecord, SwissRound, Team, TeamId } from "../../types/competition";
import { createPlayoffBracket, setPlayoffMatchWinner } from "../playoffs/double-elimination-engine";
import { recomputeSwissState } from "../swiss/swiss-engine";
import {
  assignTeamToRoundOneMatch,
  createRoundOneMatches,
  setMatchWinner,
} from "../swiss/swiss-setup-engine";

export type CompetitionState = {
  teams: Team[];
  swissRounds: SwissRound[];
  swissRecords: Record<TeamId, SwissRecord>;
  qualifiedTeamIds: TeamId[];
  eliminatedTeamIds: TeamId[];
  activeRound: number;
  swissCompleted: boolean;
  playoffBracket?: PlayoffBracket;
};

export function createInitialCompetitionState(): CompetitionState {
  const swissRounds = [
    {
      round: 1,
      matches: createRoundOneMatches(),
      completed: false,
    },
  ];
  const swiss = recomputeSwissState(seededTeams, swissRounds);

  return {
    teams: seededTeams,
    swissRounds: swiss.rounds,
    swissRecords: swiss.records,
    qualifiedTeamIds: swiss.qualifiedTeamIds,
    eliminatedTeamIds: swiss.eliminatedTeamIds,
    activeRound: swiss.activeRound,
    swissCompleted: swiss.completed,
    playoffBracket:
      swiss.completed && swiss.qualifiedTeamIds.length === 8
        ? createPlayoffBracket(swiss.qualifiedTeamIds)
        : undefined,
  };
}

export function dispatchCompetitionMutation(
  state: CompetitionState,
  mutation: PredictionMutation,
): CompetitionState {
  switch (mutation.type) {
    case "assign_team_to_round_one_match":
      return recomputeAfterRoundMutation(state, (rounds) => {
        const roundOne = rounds[0];
        return [
          {
            ...roundOne,
            matches: assignTeamToRoundOneMatch(
              roundOne.matches,
              state.teams,
              mutation.matchId,
              mutation.slot,
              mutation.teamId,
            ),
          },
        ];
      });
    case "set_match_winner":
      if (state.playoffBracket?.matches.some((match) => match.id === mutation.matchId)) {
        return {
          ...state,
          playoffBracket: setPlayoffMatchWinner(
            state.playoffBracket,
            mutation.matchId,
            mutation.winnerId,
          ),
        };
      }

      return recomputeAfterRoundMutation(state, (rounds) =>
        rounds.map((round) => ({
          ...round,
          matches: setMatchWinner(round.matches, mutation.matchId, mutation.winnerId),
        })),
      );
    default:
      return state;
  }
}

function recomputeAfterRoundMutation(
  state: CompetitionState,
  mutateRounds: (rounds: SwissRound[]) => SwissRound[],
): CompetitionState {
  const rounds = mutateRounds(
    state.swissRounds.map((round) => ({
      ...round,
      matches: round.matches.map((match) => ({
        ...match,
        slotA: { ...match.slotA, source: { ...match.slotA.source } },
        slotB: { ...match.slotB, source: { ...match.slotB.source } },
      })),
    })),
  );
  const swiss = recomputeSwissState(state.teams, rounds);

  return {
    ...state,
    swissRounds: swiss.rounds,
    swissRecords: swiss.records,
    qualifiedTeamIds: swiss.qualifiedTeamIds,
    eliminatedTeamIds: swiss.eliminatedTeamIds,
    activeRound: swiss.activeRound,
    swissCompleted: swiss.completed,
    playoffBracket:
      swiss.completed && swiss.qualifiedTeamIds.length === 8
        ? createOrRebuildPlayoffBracket(state.playoffBracket, swiss.qualifiedTeamIds)
        : undefined,
  };
}

function createOrRebuildPlayoffBracket(
  existingBracket: PlayoffBracket | undefined,
  qualifiedTeamIds: TeamId[],
) {
  if (!existingBracket || existingBracket.seedMap.join("|") !== qualifiedTeamIds.join("|")) {
    return createPlayoffBracket(qualifiedTeamIds);
  }

  let nextBracket = createPlayoffBracket(qualifiedTeamIds);
  for (const match of existingBracket.matches) {
    if (!match.winnerId) {
      continue;
    }
    nextBracket = setPlayoffMatchWinner(nextBracket, match.id, match.winnerId);
  }
  return nextBracket;
}
