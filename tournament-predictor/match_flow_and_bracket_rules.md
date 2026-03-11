# 比赛流转与对阵规则实现规格

## 1. 目标

本文件补充第一版的细化实现规则，重点明确三部分：

- 用户如何操作比赛 UI
- 瑞士轮如何生成、推进和重算
- 8 强双败模板如何映射和流转

本规格优先服务实现，不追求覆盖现实赛事的全部特殊裁决。

## 2. 标准交互流程

这是第一版默认且优先实现的操作路径。

### 2.1 初始操作

- 用户先在左侧或顶部队伍池中看到全部 16 支队伍
- 用户将队伍卡片拖入首批可编辑的比赛卡槽
- 一场比赛的两个槽位都填满后，该比赛进入可判定状态

### 2.2 判定胜负

- 当某场比赛已有两个队伍时，用户通过鼠标双击某个队伍卡片来声明该队获胜
- 被双击的队伍视为 `winner`
- 另一支队伍自动视为 `loser`
- 该场比赛状态从 `ready` 变为 `predicted`

### 2.3 自动生成后续比赛

- 某场比赛产生胜负后，系统立即将 `winner` 和 `loser` 按规则写入后继比赛槽位
- 当后继比赛的两个槽位都具备队伍后，该比赛自动变成可操作状态
- 用户继续对后继比赛重复相同操作，直到赛事结束

### 2.4 修改预测

- 用户可对已预测比赛再次双击另一方，表示改判胜者
- 系统必须先清空所有依赖该比赛结果的后继节点
- 再依据新结果重新生成后续对阵

### 2.5 交互优先级

第一版交互优先级固定为：

1. 拖拽队伍进入比赛槽位
2. 双击队伍判定比赛胜者
3. 自动生成后续对阵

点击单击可用于选中、查看详情或高亮路径，但不作为第一版主要胜负判定动作。

## 3. 比赛 UI 状态机

每场比赛遵循统一状态机：

### 3.1 状态定义

- `empty`：两个槽位都为空
- `partial`：仅一个槽位有队伍
- `ready`：两个槽位都有队伍，可双击判定
- `predicted`：已产生胜者和败者
- `invalidated`：上游修改导致当前结果失效

### 3.2 状态流转

```txt
empty -> partial -> ready -> predicted
predicted -> invalidated -> ready
predicted -> ready
```

说明：

- `predicted -> ready` 发生在用户直接改判当前比赛时
- `predicted -> invalidated` 发生在上游来源变化时

## 4. 瑞士轮实现规则

### 4.1 第一版边界

第一版将瑞士轮做成“用户参与首轮建局 + 系统自动推进后续轮”的模式。

默认规则：

- 用户将 16 支队伍拖入第 1 轮比赛卡中
- 第 1 轮共 8 场比赛，每场 2 支队伍
- 第 1 轮全部结束后，系统自动生成第 2 轮
- 后续每一轮对阵由系统根据当前战绩自动生成

### 4.2 瑞士轮轮次数量

第一版默认采用“晋级 3 胜、淘汰 3 负”的经典 16 队瑞士轮模型。

因此：

- 某队达到 `3 胜` 时晋级 8 强
- 某队达到 `3 负` 时淘汰
- 理论上最多进行 5 轮

### 4.3 第 1 轮建局

第 1 轮采用用户手动拖拽建局：

- 系统预先创建 8 个空比赛卡
- 所有队伍初始位于队伍池
- 用户将队伍拖入每场比赛的 `slotA` 或 `slotB`
- 同一队伍不能进入多个槽位
- 16 个槽位全部填满后，第 1 轮进入可判定状态

校验规则：

- 任一比赛不允许同一队伍占据两个槽位
- 整个第 1 轮中每支队伍只允许出现一次
- 若第 1 轮未填满，不允许开始后续轮生成

### 4.4 后续轮配对逻辑

从第 2 轮开始，系统自动配对。

配对步骤：

1. 从 `active` 队伍中剔除已晋级和已淘汰队伍
2. 按当前战绩分组，例如 `1-0`、`0-1`、`2-1`
3. 优先在同战绩组内配对
4. 配对时尽量避免重复交手
5. 若某组人数异常无法完全配平，则允许最小范围跨组补位
6. 生成下一轮空比赛，并自动填入两侧队伍

### 4.5 战绩更新

每场比赛确定结果后：

- `winner.wins += 1`
- `loser.losses += 1`
- 双方互相加入 `opponents`

然后更新状态：

- `wins >= 3` => `qualified`
- `losses >= 3` => `eliminated`
- 其他 => `active`

### 4.6 瑞士轮结束条件

满足以下条件即结束瑞士轮：

- `qualified` 队伍达到 8 支

处理动作：

- 锁定最终 8 强名单
- 剩余所有尚未达到 3 胜的队伍直接标记为淘汰
- 按瑞士轮最终记录生成 8 强种子顺序
- 自动创建双败赛对阵模板

### 4.7 瑞士轮重算规则

若用户修改第 N 轮某场结果：

1. 保留第 1 到 N-1 轮有效结果
2. 将第 N 轮中该场结果重置并应用新结果
3. 删除第 N+1 轮及之后全部轮次
4. 从第 N 轮结束后的全局记录重新生成后续轮
5. 若 8 强名单变化，则双败赛全量清空并重建

## 5. 瑞士轮排序规则

当需要得到 8 强顺序用于进入双败赛时，第一版排序优先级如下：

1. 胜场高者优先
2. 负场少者优先
3. Buchholz 高者优先
4. 初始种子高者优先

说明：

- 若第一版暂不实现 Buchholz 实际计算，则先退化为初始种子排序
- 但字段和接口应预留

## 6. 8 强双败模板

### 6.1 种子位

瑞士轮结束后生成 `seed1` 到 `seed8`。

默认首轮映射：

- `M1`: seed1 vs seed8
- `M2`: seed4 vs seed5
- `M3`: seed2 vs seed7
- `M4`: seed3 vs seed6

这些比赛属于胜者组第一轮。

### 6.2 胜者组结构

- `U1`: seed1 vs seed8
- `U2`: seed4 vs seed5
- `U3`: seed2 vs seed7
- `U4`: seed3 vs seed6
- `U5`: winner(U1) vs winner(U2)
- `U6`: winner(U3) vs winner(U4)
- `U7`: winner(U5) vs winner(U6)

### 6.3 败者组结构

- `L1`: loser(U1) vs loser(U2)
- `L2`: loser(U3) vs loser(U4)
- `L3`: winner(L1) vs loser(U6)
- `L4`: winner(L2) vs loser(U5)
- `L5`: winner(L3) vs winner(L4)
- `L6`: winner(L5) vs loser(U7)

### 6.4 总决赛

- `GF`: winner(U7) vs winner(L6)

第一版默认：

- 总决赛单场决胜
- 不做败者组冠军打穿后的 bracket reset

## 7. 双败赛流转映射

### 7.1 完整流转

```txt
U1 winner -> U5 slotA
U1 loser  -> L1 slotA

U2 winner -> U5 slotB
U2 loser  -> L1 slotB

U3 winner -> U6 slotA
U3 loser  -> L2 slotA

U4 winner -> U6 slotB
U4 loser  -> L2 slotB

U5 winner -> U7 slotA
U5 loser  -> L4 slotB

U6 winner -> U7 slotB
U6 loser  -> L3 slotB

L1 winner -> L3 slotA
L2 winner -> L4 slotA

L3 winner -> L5 slotA
L4 winner -> L5 slotB

L5 winner -> L6 slotA
U7 loser  -> L6 slotB

U7 winner -> GF slotA
L6 winner -> GF slotB
```

### 7.2 实现要求

- 这些映射必须写成数据模板，不允许散落在 UI 组件内部
- UI 只读取节点和 link 进行渲染

## 8. 双败赛交互规则

### 8.1 进入双败赛

- 双败赛开始时，用户不再从队伍池手动拖 8 强到各比赛
- 系统根据瑞士轮结果自动填入种子位
- 用户从第一场可判定比赛开始继续双击胜者

### 8.2 每场比赛操作

- 当某场的两队都确定后，该场进入 `ready`
- 用户双击其中一支队伍，立即产生胜负
- 系统按 link 自动写入后续槽位

### 8.3 修改双败赛结果

若用户改判某一场：

1. 清空所有后继比赛中的来源队伍
2. 清空这些比赛的胜负记录
3. 将这些比赛状态置为 `invalidated` 或 `pending`
4. 按新结果重新向后流转
5. 对重新具备双方的比赛恢复 `ready`

## 9. 组件行为约束

### 9.1 队伍池

- 只在瑞士轮第 1 轮使用
- 已放入比赛槽的队伍从队伍池中标记为已使用
- 不允许再次拖出第二份副本

### 9.2 比赛卡

比赛卡需要具备以下行为：

- 接收拖拽进入槽位
- 展示两侧队伍信息
- 双击某一队判定胜者
- 高亮已获胜队伍
- 展示当前比赛状态
- 能显示该比赛会影响的后续路径

### 9.3 结果失效提示

如果某次改判导致后续比赛被清空：

- 页面需要出现明确提示
- 至少提示“后续相关比赛已自动重算”

## 10. 推荐的引擎补充接口

在已有 `SwissEngine`、`DoubleEliminationEngine`、`PredictionEngine` 基础上，建议增加以下辅助接口。

### 10.1 瑞士轮建局接口

```ts
export interface SwissSetupEngine {
  assignTeamToRoundOneMatch(
    state: CompetitionState,
    matchId: MatchId,
    slot: "A" | "B",
    teamId: TeamId
  ): CompetitionState;
  removeTeamFromRoundOneMatch(
    state: CompetitionState,
    matchId: MatchId,
    slot: "A" | "B"
  ): CompetitionState;
  canStartSwissRoundOne(state: CompetitionState): boolean;
}
```

### 10.2 对阵流转辅助接口

```ts
export interface BracketPropagationEngine {
  propagateMatchResult(
    matches: Match[],
    links: MatchLink[],
    matchId: MatchId
  ): Match[];
  invalidateDescendants(
    matches: Match[],
    links: MatchLink[],
    matchId: MatchId
  ): Match[];
}
```

## 11. 第一版默认实现结论

- 瑞士轮第 1 轮由用户拖拽队伍建局
- 一场比赛双方齐全后，用户通过双击某支队伍判定胜者
- 从第 2 轮开始，瑞士轮对阵由系统自动配对
- 瑞士轮会持续推进，直到出现 8 支三胜队伍
- 第 8 支三胜队伍出现时，其余未晋级队伍直接判定淘汰
- 8 强双败赛由系统根据种子位自动生成完整模板
- 双败赛所有比赛同样采用“双击胜者，自动流转”的交互
- 任意上游修改都必须清空并重建受影响后续路径
