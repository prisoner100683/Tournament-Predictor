# 比赛预测软件技术方案

## 1. 技术目标

本项目的第一版目标不是做赛事后台，而是做一个高交互、高可视化、可全流程联动重算的前端预测工具。技术方案需要优先满足以下几点：

- 能稳定表达 16 队瑞士轮到 8 强双败的完整赛事结构
- 能支持用户通过拖拽或点击修改任意比赛结果
- 能在上游结果变动后，自动重算所有受影响的后续节点
- 能提供完整、清晰、具备产品感的前端界面
- 逻辑层与展示层解耦，便于后续扩展规则

## 2. 推荐技术栈

### 2.1 前端框架

- `React`
- `TypeScript`
- `Vite`

原因：

- 适合构建高状态交互应用
- TypeScript 便于约束赛事结构和推导逻辑
- Vite 启动与迭代速度快，适合独立前端项目

### 2.2 UI 与样式

- `Tailwind CSS`
- `shadcn/ui` 作为基础组件层
- 自定义赛事风格主题变量

原因：

- Tailwind 适合快速构建复杂页面与响应式布局
- shadcn/ui 适合做可控、可改造的组件，而不是被现成设计系统束缚
- 项目需要较强视觉表现，自定义主题比直接套默认组件库更合适

### 2.3 拖拽方案

- `dnd-kit`

原因：

- 比 HTML5 Drag API 更适合复杂拖拽交互
- 可控性高，适合定义合法落点、高亮状态、拖拽预览
- 更适合 React 生态中的复杂嵌套布局

### 2.4 状态管理

- `Zustand`

原因：

- 比 Redux 更轻，适合中型单页应用
- 可以清晰拆分赛事数据、UI 状态、历史操作等 store
- 对联动重算和局部订阅较友好

### 2.5 数据校验与工具

- `Zod` 用于数据模型校验
- `clsx` / `tailwind-merge` 用于样式组合

## 3. 系统架构

采用前端单页应用架构，拆分为四层：

### 3.1 表现层

负责页面、对阵图、卡片、侧边栏、弹窗、拖拽反馈。

包含模块：

- 队伍录入与排序界面
- 瑞士轮页面
- 双败赛页面
- 总览页面
- 通用交互组件

### 3.2 状态层

负责保存当前预测状态和 UI 状态。

建议拆分为：

- `competitionStore`：赛事核心数据
- `predictionStore`：用户当前预测结果
- `uiStore`：当前页面、缩放、选中节点、提示状态

### 3.3 规则引擎层

负责赛事推导和联动重算，是整个项目的核心。

建议拆分为：

- `swissEngine`：瑞士轮生成与更新
- `doubleElimEngine`：双败赛生成与流转
- `predictionEngine`：统一处理“某场比赛结果变化后如何重算”

### 3.4 数据模型层

负责定义赛事对象、映射关系、节点状态、来源追踪。

## 4. 核心数据结构设计

建议采用“标准化数据 + 衍生视图”的结构，避免界面层直接拼接复杂逻辑。

### 4.1 Team

```ts
type Team = {
  id: string;
  name: string;
  shortName: string;
  seed: number;
  logoUrl?: string;
  themeColor?: string;
};
```

### 4.2 Match

```ts
type MatchStage = "swiss" | "upper" | "lower" | "grand_final";

type MatchSlot = {
  sourceType: "team" | "match_winner" | "match_loser" | "pending";
  sourceId?: string;
  teamId?: string;
};

type Match = {
  id: string;
  stage: MatchStage;
  round: number;
  position: number;
  slotA: MatchSlot;
  slotB: MatchSlot;
  winnerId?: string;
  loserId?: string;
  status: "empty" | "ready" | "predicted" | "invalidated";
  nextWinnerMatchId?: string;
  nextWinnerSlot?: "A" | "B";
  nextLoserMatchId?: string;
  nextLoserSlot?: "A" | "B";
};
```

### 4.3 Swiss Team Record

```ts
type SwissRecord = {
  teamId: string;
  wins: number;
  losses: number;
  opponents: string[];
  status: "active" | "qualified" | "eliminated";
};
```

### 4.4 Competition State

```ts
type CompetitionState = {
  teams: Team[];
  swissRounds: Match[][];
  swissRecords: Record<string, SwissRecord>;
  qualifiedTeams: string[];
  eliminatedTeams: string[];
  bracketMatches: Match[];
  championId?: string;
};
```

## 5. 瑞士轮方案

### 5.1 第一版实现策略

第一版不追求覆盖所有真实赛事中的复杂裁决规则，而是先实现稳定、可解释的基础配对机制。

默认规则建议：

- 初始轮按种子顺序配对
- 后续轮按相同战绩优先分组
- 已交手队伍尽量避免重复对阵
- 达到晋级条件的队伍标记为 `qualified`
- 达到淘汰条件的队伍标记为 `eliminated`
- 每轮只为 `active` 队伍继续生成对阵

### 5.2 瑞士轮推导流程

1. 用户选择某一轮全部比赛结果
2. 更新所有队伍的胜负记录
3. 识别已晋级和已淘汰队伍
4. 对剩余 active 队伍按战绩分组
5. 在组内完成配对，若存在异常再做跨组补位
6. 生成下一轮比赛
7. 若已产生 8 支晋级队伍，则结束瑞士轮并进入双败赛

### 5.3 瑞士轮重算原则

- 修改某一轮某一场结果后，该轮之后的全部瑞士轮结果作废
- 清空后续轮的 `winnerId` / `loserId`
- 从当前轮重新计算战绩与后续轮次
- 若 8 强名单变化，则双败赛全量重建

## 6. 双败赛方案

### 6.1 结构定义

8 强阶段固定生成一套严格双败结构：

- 胜者组第一轮 4 场
- 胜者组第二轮 2 场
- 胜者组决赛 1 场
- 败者组若干轮
- 败者组决赛 1 场
- 总决赛 1 场

第一版默认采用单次总决赛，不做“总决赛打穿后重置一场”的扩展规则，除非后续明确要求。

### 6.2 生成方式

- 8 支晋级队伍确定后，根据瑞士轮最终排序映射到 8 个种子位
- 基于固定 bracket 模板生成全部比赛节点
- 每个节点写明胜者去向和败者去向
- 页面渲染只依赖节点和流转关系，不在组件里硬编码路径

### 6.3 双败赛重算原则

- 修改任意一场比赛结果时：
  - 清除所有后继节点中由该比赛衍生出的队伍结果
  - 按路径重新注入 winner / loser
  - 递归刷新全部后代节点
- 若上游队伍来源变更，则受影响比赛状态改为 `invalidated`

## 7. 前端交互方案

### 7.1 主要交互模式

每场比赛支持两种操作：

- 点击队伍卡片直接选择胜者
- 拖拽队伍到目标晋级槽位完成预测

### 7.2 拖拽交互设计

- 拖动开始时，高亮当前队伍可进入的合法目标
- 非法目标显示禁用态
- 放下后立即写入预测状态
- 若本次操作将导致后续结果失效，界面提示“后续预测已重算”

### 7.3 页面结构建议

#### 主工作台

- 顶部：赛事标题、操作区、重置入口
- 左侧：队伍列表与种子排序
- 中部：阶段导航
- 右侧：当前预测摘要

#### 瑞士轮页面

- 顶部轮次导航
- 中央为该轮比赛卡片网格
- 侧边显示战绩榜、晋级名单、淘汰名单

#### 双败赛页面

- 横向大画布布局
- 左半区为胜者组
- 右半区为败者组
- 最终结果区域独立突出

## 8. 组件拆分建议

建议组件分层如下：

- `TeamCard`
- `MatchCard`
- `SwissRoundBoard`
- `SwissStandingsPanel`
- `DoubleEliminationBracket`
- `BracketColumn`
- `PredictionSummary`
- `ResetControls`
- `StageTabs`

原则：

- 比赛结果逻辑不写在展示组件里
- 组件只接受结构化数据和事件回调
- 所有赛事推进逻辑统一下沉到 engine + store

## 9. 路由与目录建议

### 9.1 路由

- `/` 主工作台
- `/swiss` 瑞士轮预测
- `/playoffs` 双败赛预测

### 9.2 目录结构

```txt
tournament-predictor/
  src/
    app/
    components/
    features/
      teams/
      swiss/
      bracket/
      prediction/
    engines/
      swiss/
      double-elimination/
      prediction/
    stores/
    types/
    utils/
    styles/
```

## 10. 状态管理与重算策略

### 10.1 核心原则

- 原始数据和衍生数据分开存
- 对阵树状态统一由规则引擎生成
- 上游变化优先触发失效标记，再触发重算

### 10.2 推荐处理方式

- 用户操作只提交最小事件，例如 `setMatchWinner(matchId, teamId)`
- store 接收事件后调用 engine
- engine 返回新的比赛结构、队伍记录和派生状态
- 页面只渲染结果，不自行推导

这样可以避免：

- 组件各自维护一份逻辑
- 双败赛路径错乱
- 瑞士轮改动后残留旧结果

## 11. 测试方案

### 11.1 单元测试

优先覆盖规则引擎：

- 瑞士轮首轮生成
- 瑞士轮战绩更新
- 瑞士轮下一轮配对
- 晋级/淘汰状态判断
- 双败赛 bracket 生成
- 双败赛 winner / loser 流转
- 上游修改后的递归重算

### 11.2 组件测试

- 比赛卡片展示正确
- 点击预测正确触发
- 拖拽后状态正确更新
- 非法落点被阻止

### 11.3 端到端测试

- 从录入 16 支队伍到产出冠军的完整流程
- 中途修改瑞士轮结果，验证 8 强和双败赛同步变化
- 中途修改双败赛上游结果，验证后续路径正确刷新

推荐工具：

- `Vitest`
- `Testing Library`
- `Playwright`

## 12. 第一版实施顺序

### 阶段一：基础工程

- 初始化 React + TypeScript + Vite
- 接入 Tailwind、shadcn/ui、dnd-kit、Zustand
- 建立基础目录结构和主题系统

### 阶段二：赛事模型

- 定义 Team、Match、SwissRecord 等类型
- 实现瑞士轮基础推导引擎
- 实现双败赛模板生成引擎

### 阶段三：核心交互

- 完成队伍录入与排序
- 完成瑞士轮预测页
- 完成双败赛预测页
- 接入拖拽与点击预测

### 阶段四：联动与完善

- 实现上游变更后的全链路重算
- 增加状态提示、重置能力、结果总览
- 完成测试和 UI 打磨

## 13. 默认技术决策

- 第一版做纯前端单页应用，不接后端
- 数据保存在前端内存状态中
- 可选增加 `localStorage` 持久化，但不作为首要依赖
- 瑞士轮先实现稳定简化规则，再根据真实比赛规则细化
- 双败赛总决赛默认单场决胜
