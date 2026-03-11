# 数据结构与规则引擎接口定义

## 1. 目标

本文件用于定义第一版项目的核心数据结构、状态边界和规则引擎接口，确保后续实现时前端 UI、状态管理和赛事推导逻辑之间职责清晰。

设计原则：

- 规则引擎只处理纯数据，不依赖 UI
- 组件层不直接推导赛果，只消费结果
- 任意上游变更都通过统一事件入口触发重算
- 瑞士轮和双败赛逻辑分离，但共享统一赛事状态

## 2. 类型定义

### 2.1 基础 ID 类型

```ts
export type TeamId = string;
export type MatchId = string;
export type StageId = "swiss" | "playoffs";
```

### 2.2 队伍模型

```ts
export type Team = {
  id: TeamId;
  name: string;
  shortName: string;
  seed: number;
  logoUrl?: string;
  themeColor?: string;
};
```

约束：

- `seed` 在 1 到 16 之间且唯一
- `id` 全局唯一，后续所有推导仅依赖 `id`

### 2.3 瑞士轮记录

```ts
export type SwissStatus = "active" | "qualified" | "eliminated";

export type SwissRecord = {
  teamId: TeamId;
  wins: number;
  losses: number;
  opponents: TeamId[];
  buchholz?: number;
  status: SwissStatus;
};
```

说明：

- 第一版 `buchholz` 可先保留字段，不强制参与排序
- `opponents` 用于避免重复对阵和后续扩展规则

### 2.4 比赛来源槽位

```ts
export type MatchSource =
  | { type: "team"; teamId: TeamId }
  | { type: "match_winner"; matchId: MatchId }
  | { type: "match_loser"; matchId: MatchId }
  | { type: "pending" };
```

说明：

- 瑞士轮首轮通常为 `team`
- 双败赛大部分节点来源是 `match_winner` 或 `match_loser`
- 未决来源统一使用 `pending`

### 2.5 比赛槽位

```ts
export type MatchSlotKey = "A" | "B";

export type MatchSlot = {
  key: MatchSlotKey;
  source: MatchSource;
  teamId?: TeamId;
  locked: boolean;
};
```

说明：

- `teamId` 是当前经过推导后落入该槽位的队伍
- `locked` 表示该槽位是否已由上游稳定决定

### 2.6 比赛状态

```ts
export type MatchStage =
  | "swiss"
  | "upper_bracket"
  | "lower_bracket"
  | "grand_final";

export type MatchStatus =
  | "empty"
  | "pending"
  | "ready"
  | "predicted"
  | "invalidated";

export type Match = {
  id: MatchId;
  stage: MatchStage;
  round: number;
  index: number;
  slotA: MatchSlot;
  slotB: MatchSlot;
  winnerId?: TeamId;
  loserId?: TeamId;
  status: MatchStatus;
  label: string;
};
```

状态定义：

- `empty`：比赛节点已创建，但双方均未确定
- `pending`：已有部分来源，仍待补全
- `ready`：双方确定，可预测
- `predicted`：用户已选择胜者
- `invalidated`：上游变更导致当前结果失效，待重算或待用户重新确认

### 2.7 双败赛流转定义

```ts
export type MatchLink = {
  fromMatchId: MatchId;
  result: "winner" | "loser";
  toMatchId: MatchId;
  toSlot: MatchSlotKey;
};
```

说明：

- 双败赛结构由 `Match[] + MatchLink[]` 描述
- 不在组件中硬编码胜败去向

### 2.8 瑞士轮轮次

```ts
export type SwissRound = {
  round: number;
  matches: Match[];
  completed: boolean;
};
```

### 2.9 双败赛结构

```ts
export type PlayoffBracket = {
  matches: Match[];
  links: MatchLink[];
  seedMap: TeamId[];
  championId?: TeamId;
  runnerUpId?: TeamId;
};
```

说明：

- `seedMap` 表示 8 强队伍进入双败赛时的种子顺序

### 2.10 全局赛事状态

```ts
export type CompetitionState = {
  teams: Team[];
  swiss: {
    rounds: SwissRound[];
    records: Record<TeamId, SwissRecord>;
    qualifiedTeamIds: TeamId[];
    eliminatedTeamIds: TeamId[];
    activeRound: number;
    completed: boolean;
  };
  playoffs: {
    bracket?: PlayoffBracket;
    ready: boolean;
  };
  prediction: {
    selectedMatchId?: MatchId;
    lastMutation?: PredictionMutation;
    dirty: boolean;
  };
};
```

## 3. 用户操作事件

所有会改变预测状态的动作统一抽象为 mutation。

```ts
export type PredictionMutation =
  | {
      type: "set_match_winner";
      matchId: MatchId;
      winnerId: TeamId;
    }
  | {
      type: "clear_match_prediction";
      matchId: MatchId;
    }
  | {
      type: "reset_after_round";
      round: number;
    }
  | {
      type: "reset_swiss";
    }
  | {
      type: "reset_playoffs";
    }
  | {
      type: "reset_all";
    }
  | {
      type: "reseed_teams";
      orderedTeamIds: TeamId[];
    };
```

约束：

- UI 层只派发 mutation，不自行写比赛状态
- 所有 mutation 都通过统一 reducer/engine 入口执行

## 4. 规则引擎接口

### 4.1 SwissEngine

```ts
export interface SwissEngine {
  createInitialState(teams: Team[]): CompetitionState["swiss"];
  createRoundPairings(
    records: Record<TeamId, SwissRecord>,
    round: number
  ): SwissRound;
  applyMatchResult(
    swissState: CompetitionState["swiss"],
    matchId: MatchId,
    winnerId: TeamId
  ): CompetitionState["swiss"];
  recomputeFromRound(
    swissState: CompetitionState["swiss"],
    fromRound: number
  ): CompetitionState["swiss"];
  getQualifiedTeams(
    swissState: CompetitionState["swiss"]
  ): TeamId[];
}
```

职责：

- 初始化瑞士轮记录
- 生成首轮和后续轮配对
- 根据单场结果更新队伍记录
- 从指定轮次开始重算后续内容
- 输出 8 强晋级名单

默认实现规则：

- 首轮按种子高低配对
- 后续轮按相同战绩组优先配对
- 尽量避免重复交手
- 一旦修改某轮结果，该轮之后轮次全部失效并重建

### 4.2 DoubleEliminationEngine

```ts
export interface DoubleEliminationEngine {
  createBracket(seedTeamIds: TeamId[]): PlayoffBracket;
  applyMatchResult(
    bracket: PlayoffBracket,
    matchId: MatchId,
    winnerId: TeamId
  ): PlayoffBracket;
  clearDescendants(
    bracket: PlayoffBracket,
    matchId: MatchId
  ): PlayoffBracket;
  recomputeBracket(bracket: PlayoffBracket): PlayoffBracket;
  getFinalStandings(bracket: PlayoffBracket): {
    championId?: TeamId;
    runnerUpId?: TeamId;
  };
}
```

职责：

- 基于 8 强名单生成固定双败模板
- 写入任意场胜者后沿链路推导后续槽位
- 清除受影响的后继节点
- 输出冠军和亚军

默认实现规则：

- 第一版总决赛只打一场
- 双败模板固定，不动态增删节点
- 某场结果修改后，所有后继节点先清空再重算

### 4.3 PredictionEngine

统一处理全局 mutation。

```ts
export interface PredictionEngine {
  initialize(teams: Team[]): CompetitionState;
  dispatch(
    state: CompetitionState,
    mutation: PredictionMutation
  ): CompetitionState;
}
```

职责：

- 作为唯一状态写入口
- 自动判断 mutation 影响的是瑞士轮还是双败赛
- 当瑞士轮晋级名单变化时，自动全量重建双败赛
- 保证全局状态始终一致

## 5. 关键派生函数

这些函数不直接修改状态，只返回 UI 需要的派生视图。

```ts
export type StandingsRow = {
  teamId: TeamId;
  wins: number;
  losses: number;
  status: SwissStatus;
};

export interface CompetitionSelectors {
  getSwissStandings(state: CompetitionState): StandingsRow[];
  getSwissRound(state: CompetitionState, round: number): SwissRound | undefined;
  getUpcomingSwissMatches(state: CompetitionState): Match[];
  getPlayoffColumns(state: CompetitionState): {
    upper: Match[][];
    lower: Match[][];
    finals: Match[];
  };
  getPredictionSummary(state: CompetitionState): {
    qualifiedTeamIds: TeamId[];
    championId?: TeamId;
    runnerUpId?: TeamId;
  };
}
```

原则：

- 组件优先依赖 selector，而不是自己过滤原始状态
- selector 可缓存，但不要求在第一版引入复杂 memo 化

## 6. 状态变化约定

### 6.1 设置比赛胜者

输入：

- `matchId`
- `winnerId`

处理顺序：

1. 校验 `winnerId` 是否属于该场已确定的两支队伍之一
2. 更新当前比赛的 `winnerId`、`loserId`、`status`
3. 清理所有受影响后继节点
4. 重新沿路径注入队伍来源
5. 更新派生状态，如晋级名单或冠军

### 6.2 清除单场预测

处理顺序：

1. 清空当前比赛胜负结果
2. 递归清空所有后继依赖节点
3. 将受影响节点标记为 `invalidated` 或 `pending`

### 6.3 瑞士轮上游变更

处理顺序：

1. 当前轮结果变更
2. 删除后续轮结果
3. 重新计算记录与配对
4. 重新生成晋级名单
5. 若晋级名单变化，则重建双败赛

## 7. 文件组织建议

建议后续落地为以下文件：

```txt
src/
  types/
    competition.ts
    mutations.ts
  engines/
    swiss/
      swiss-engine.ts
      swiss-pairing.ts
      swiss-records.ts
    double-elimination/
      bracket-template.ts
      double-elimination-engine.ts
    prediction/
      prediction-engine.ts
  selectors/
    competition-selectors.ts
```

## 8. 第一版明确默认值

- 16 支队伍固定
- 瑞士轮晋级 8 支、淘汰 8 支
- 瑞士轮先采用基础可解释配对规则，不实现复杂裁决策略
- 双败赛为严格 8 强双败
- 总决赛默认单场定冠军
- 预测修改后，后续受影响节点允许自动清空，不做保守保留

## 9. 实现验收点

- 类型系统足以表达瑞士轮和双败赛全链路
- 所有用户操作都能映射到统一 mutation
- 规则引擎接口清晰，不依赖具体 UI 组件
- 修改上游结果后，后续节点能被稳定清理并重算
- UI 可直接基于 selector 渲染比赛卡片、战绩榜和双败赛对阵图
