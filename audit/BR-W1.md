# BR-W1 工作者 · bridge 0.9.0 安全能力审计（C0）

- Status: REVIEW
- Verdict: PARTIAL（审计证据完整；安全能力不完整）
- Mode: M-USE 只读审计；未改源码、未 build/test、未 install/upgrade、未联网、未调用 find/send/read 等 live session 工具。
- Parent: C0 总协调·gate
- ParentSessionId: session-391da69e-7fcc-4e5d-b643-706bfc732b06
- Workspace: C:/cursor/dsh-session-bridge

## 0. 标题锁定记录

**未锁定。** 本客户端只暴露 run_code（内部 bash/编辑器）工具，没有 session_rename 工具；因此无法执行“第一条工具调用 session_rename”的要求。第一条实际调用是只读目录/文件清点。这是工具面限制，不是审计结论，也不影响源码证据。

## 1. 结论先行

**0.9.0 不是“安全版本”，而是“功能更完整、兼容性更好的传输/监控版本”。**

明确回答：

1. **0.9.0 没有 self-send 拒绝，也没有针对 send 的 self/loop guard。** 它有一个 loop guard，但只检测被监控会话的思维链/文本内容循环，不检查“发送者是否就是目标会话”，也不检查 A→B→A 的消息往返。
2. **0.9.0 没有 sender provenance。** 入站消息仍是普通 user 消息：只有 id/role/content/source={kind:'user'}；没有 fromSessionId、fromTitle、toSessionId、messageId 返回、authority。
3. **入站是 user，不是 peer/system。** sendLiveMessage 和 session_bridge_send 都调用 userMessage；DSH core 已有 agent-message 这种可携带 senderSessionId 的 source 形状，但 bridge 没有使用。
4. **没有 whoami / 当前 sessionId 工具。** bridge 的 create 已经能通过 exec.agent 拿到调用者，所以新增 whoami 是插件可修；但当前 C0 无法直接从 0.9.0 取得 --self-session-id。
5. **archived 会话在 find/send 中默认不排除。** 0.9.0 的 find 不读 archivedSessionIds；send 也不检查归档集合（只要求 live）。auto-archive/favorites 只影响“是否归档/是否跳过自动归档”，不改变 find/send 的可见性。
6. **没有 send 审计日志、没有返回 messageId、没有权限等级。** 只有 monitor 的文本日志；messageId 在内部 userMessage 里生成但不返回；authority 参数/校验不存在。
7. **0.9.0 已覆盖的能力：** 16 个工具（0.3.1 为 14 个）、跨工作区 find、live/offline read、wait/segments、monitor/cancel、archive/unarchive、favorites、auto-archive、内容循环检测与任务转移、segments 分页修复、peer floor 兼容声明。
8. **建议升级到 0.9.0，再打最小安全 patch；不建议只把安全 patch cherry-pick 到 0.3.1。** 0.3.1 的 peer 范围只覆盖 0.1.x，按 manifest 当前 DSH 0.2.2-rc.5 不满足其 peer（运行中若已安装，必然走了豁免/旧闸门路径）；0.9.0 已改为纯下限，且包含 0.3.1 之后的修复与测试。升级本身不会补齐安全能力，仍需插件 patch。

## 2. 证据路径约定

- R = 本仓库 0.9.0：C:/cursor/dsh-session-bridge
- I = 已安装 0.3.1：C:/Users/Administrator/.dsh/profiles/web/node_modules/dsh-session-bridge
- C = 运行中的 DSH core 0.2.2-rc.5：C:/Users/Administrator/AppData/Local/Author Software/nvm/installs/v24.21.0/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai

版本证据：R:package.json:3 = 0.9.0；I:package.json:3 = 0.3.1；C:@deepseek-ai/dsh-tools/package.json = 0.2.2-rc.5。

## 3. 能力矩阵

| # | 需求 | 0.3.1 | 0.9.0 | 结论 | 证据（文件:行） |
|---|---|---|---|---|---|
| 1 | self-send 拒绝（目标 == 调用者） | 无 | 无 | **缺失；插件可修** | 0.3.1: I:src/tools.ts:292-311；0.9.0: R:src/tools.ts:247-268（只校验 sessionId/message/live，没有 exec.agent 比较） |
| 2 | self/loop guard 覆盖 send（A→B→A、hop 上限） | 无 | 无；只有内容循环检测 | **缺失；插件可修** | R:src/loop-guard.ts:1-18（明确用途是思维链内容重复）；R:src/monitor.ts:603-607（只在 monitor tick 调用 detectLoop）；R:src/tools.ts:962-992（monitor_start 不检查 self） |
| 3 | sender provenance：fromSessionId/fromTitle/toSessionId/messageId/authority | 无 | 无 | **缺失；插件可修（core 已有 source 原语）** | R:src/core.ts:137-144（只有 id/role/content/source kind user）；R:src/tools.ts:268（返回值只有 accepted/sessionId/sinceSeq/reply）；I:src/core.ts:120-126 相同 |
| 4 | 入站消息是 user 还是 peer/system | user | user | **0.9.0 仍是 user；peer 可插件修，system 需 core** | R:src/core.ts:733-739；R:src/tools.ts:255-256；R:src/core.ts:196-201（fold 只显示 source.kind=user） |
| 5 | 可注入 metadata 的 API | 无（bridge） | 无（bridge）；DSH core 的 UserMessage.source 可扩展 | **缺失；插件可修** | C:@deepseek-ai/dsh-llm/lib/types/message.d.ts:94-108（merge-extensible，user message 可带任意 producer kind）；R:src/core.ts:137-144 未使用 |
| 6 | whoami / 当前 sessionId 查询 | 无 | 无 | **缺失；插件可修** | R:src/tools.ts:146-1264 的 16 个工具中没有 whoami；R:src/tools.ts:180 证明 create 已能读 exec.agent；C:@deepseek-ai/dsh-tools/lib/types/contracts.d.ts:175-176（agent 由 agent loop 设置） |
| 7 | archived 会话在 find 中默认排除 | 否 | 否 | **缺失；插件可修** | R:src/tools.ts:633（遍历 live）、654（遍历 persistence）、702-735（过滤/输出均无 archivedSessionIds）；I:src/tools.ts:673/694/742-775 相同 |
| 8 | archived 会话在 send 中默认排除 | 否 | 否 | **缺失；插件可修** | R:src/tools.ts:247-268（只检查 live，不读归档集合）；I:src/tools.ts:292-311 相同 |
| 9 | 审计日志 / messageId / 权限等级 | 无 | 无 | **send 审计/messageId 插件可修；可信 authority 需 core** | R:src/monitor.ts:216-218、877-881（只有 monitor 日志）；R:src/core.ts:139（内部生成 id，但 R:src/tools.ts:268 不返回）；R:src/tools.ts:226-232（参数无 authority） |
| 10 | auto-archive / favorites 是否改变 archived 可见性 | 无此功能 | 有 auto-archive/favorites，但不改变 | **0.9.0 有功能；不解决 find/send** | R:src/auto-archive.ts:203-209（archived/favorite 仅作为自动归档跳过条件）、358（只调用 archiveSession）；R:src/tools.ts:633/654/702-735 不读这些集合 |
| 11 | 内容循环检测 / 任务转移 | 无 | 有（仅 monitor） | **0.9.0 已有，但不可替代 self/loop guard** | R:src/loop-guard.ts:1-18；R:src/monitor.ts:603-607；R:CHANGELOG.md:141-147 |
| 12 | 传输/监控/归档/查找的基本能力 | 14 工具 | 16 工具 | **0.9.0 覆盖更完整** | I:README.md:229-244（14 工具）；R:src/tools.ts:146/224/282/364/427/511/602/774/918/997/1017/1087/1140/1204/1238/1264（16 工具） |

## 4. 逐项回答

### 4.1 0.9.0 是否已有 self-send 拒绝或 self/loop guard？覆盖到 session_bridge_send 吗？

**没有 self-send 拒绝；没有覆盖 send 的 self/loop guard。**

- session_bridge_send 的 execute 只校验三件事：sessionId 非空、message 非空、目标 live；然后直接 agent.steer/followup。没有把 args.sessionId 与调用者比较。R:src/tools.ts:247-268。
- sendLiveMessage 也是无条件发送：getLiveAgent 成功就 steer/followup。R:src/core.ts:733-739。
- 0.9.0 的 loop-guard.ts 明确写的是“思维链循环检测”，只处理同一段内容反复输出；它不读取“发送者/接收者”关系。R:src/loop-guard.ts:1-18。
- monitor_start 只校验 sessionId 非空并构造配置，不检查目标是否为调用者。R:src/tools.ts:962-992。
- 因此：monitor 能发现“某会话内容循环”，但发现不了“A 给 B 发、B 又给 A 发”的消息往返；send 本身更不会触发 loop guard。

补充：0.3.1 也没有；其 send 与 0.9.0 几乎相同，I:src/tools.ts:292-311。另一个对照是 DSH core 自己的 send_message：它在 sender.id === targetId 时明确拒绝（C:@deepseek-ai/dsh-subagent/lib/types/manager.js:475-476），说明 core 已有“禁止 self-send”的先例，但 bridge 没有复用这条规则。

### 4.2 0.9.0 是否已有 sender provenance？还是只有标题/文本？

**只有标题/文本和 session 元数据；没有消息级 sender provenance。**

- userMessage 只有：id、role=user、content、source={kind:'user'}。没有 fromSessionId/fromTitle/toSessionId/authority。R:src/core.ts:137-144。
- send 返回值只有 accepted、sessionId、sinceSeq 或 reply；没有 messageId、from、to、authority。R:src/tools.ts:268。
- find 能返回 title/cwd/workspaceId/live/running/parentSession/origin 等 session 级信息，但这不是“这条消息是谁发的”。R:src/tools.ts:720-735。
- 0.3.1 相同：I:src/core.ts:120-126、I:src/tools.ts:311。

**关键正面发现：DSH core 已有可复用的 source 原语，但不是 bridge 当前行为。**

- DSH 的 MessageSourceMap 是 merge-extensible；user message 可以携带任意 producer 的 kind。C:@deepseek-ai/dsh-llm/lib/types/message.d.ts:94-108。
- DSH 已有 agent-message source：kind='agent-message'、form='relay'、senderSessionId。C:@deepseek-ai/dsh-subagent/lib/types/continuation-messages.d.ts:11-18。
- 构造方式就是 createUserMessage({ content, source: { kind:'agent-message', form:'relay', senderSessionId } })。C:@deepseek-ai/dsh-subagent/lib/types/continuation-messages.js:8-29。
- 注意版本边界：以上是运行中的 DSH 0.2.2-rc.5；0.9.0 声称兼容 >=0.1.7-0，未验证 0.1.7 是否已有 agent-message。若要在旧 harness 上复用，需运行时探测/自有 source kind + fallback，不能假设一定存在。
- agent.followup/steer 只是把传入的 UserMessage 放进 inbox，不重写 source。C:@deepseek-ai/dsh-agent-loop/lib/index.js:573-584。
- 所以“senderSessionId”这一层不需要改 core；bridge 只要在 userMessage 里带上 source 即可。但 fromTitle/toSessionId/messageId/authority 中的前三个需要 bridge 自己补；authority 若要可信，仍要 core/审批。

### 4.3 入站消息是 user 还是 peer/system？sendLiveMessage 是否仍调用 userMessage？有没有可注入 metadata 的 API？

**入站是 user，不是 peer/system。**

- session_bridge_send 自己直接调用 agent.steer(userMessage(...)) / agent.followup(userMessage(...))。R:src/tools.ts:255-256。
- create 的首条 prompt 也走 userMessage：R:src/session-create.ts:207；因此入站消息有三条 user 来源（send、create、monitor steer），不是两条。
- monitor 的 steer 走 sendLiveMessage，而 sendLiveMessage 仍然调用 userMessage。R:src/core.ts:733-739。
- foldMessages 只把 source.kind === 'user' 的 user/message 显示为 user 行；其他 source kind 会被跳过。R:src/core.ts:196-201。
- 因此目标会话看到的是“用户消息”，不是 peer 消息，也不是 system 消息。0.3.1 完全相同：I:src/core.ts:174-184、I:src/tools.ts:300-301。

**bridge 当前没有 metadata 注入 API。** 但 DSH core 的 source 是 merge-extensible，存在可注入点；如果直接改成 agent-message，必须同时改 foldMessages/titleOf，否则 bridge 自己 read 会看不到这些消息（R:src/core.ts:196-201、R:src/core.ts:397-400）。这是一个最小 patch 的隐藏耦合点。

### 4.4 有没有 whoami / 当前 sessionId 查询工具？C0 能否给 dsh-gate 传 --self-session-id？

**没有 whoami 工具。** 0.9.0 的 16 个工具名单里没有 self/whoami：R:src/tools.ts:146/224/282/364/427/511/602/774/918/997/1017/1087/1140/1204/1238/1264。

**但插件能拿到调用者 id。** create 已经用 exec.agent 作为 caller 继承模型/工作目录：R:src/tools.ts:180-185。DSH core 的 ToolExecutionInput.agent 由 agent loop 设置，见 C:@deepseek-ai/dsh-tools/lib/types/contracts.d.ts:175-176。因此新增 session_bridge_whoami 只要返回 exec.agent.id 即可，不需要 core 改动。

**C0 目前不能可靠地给 dsh-gate 传 --self-session-id：**

- 没有 whoami 工具；
- find(title) 靠标题猜 self 不可靠（标题非唯一、archived 仍可见、离线标题可能缺失）；
- 当前 runtime context 虽然知道父 session id，但这不是 bridge 工具返回值；
- 可行路径只有：先加 whoami，或由 C0 外部把 self id 注入到 gate 调用。若 gate 是纯 shell 进程、不能调用 agent 工具，则必须由外部注入；这不是插件能凭空的。

### 4.5 archived 会话在 find/send 中是否默认排除？0.9.0 的 auto-archive/favorites 是否改变这一点？

**不排除。**

- find 遍历 liveAgents，再遍历 persistence.list，然后按 query/title/ws/cwd 过滤；全程不读 workspaceRegistry.archivedSessionIds。R:src/tools.ts:633、654、702-735。
- send 只要求目标 live；不读归档集合。R:src/tools.ts:247-268。
- 0.9.0 的 archived 集合只在 archive/unarchive/archived 工具里读：R:src/tools.ts:1232、1284；find/send 没有引用。
- 0.3.1 同样：I:src/tools.ts:673/694/742-775，send 在 I:src/tools.ts:292-311。

**auto-archive/favorites 不改变这一点。**

- auto-archive 的候选过滤会把 archived/favorite 作为“跳过”条件，然后只调用 archiveSession；它不会修改 find/send 的查询路径。R:src/auto-archive.ts:203-209、358。
- favorites 只做两件事：显示 ★、跳过自动归档；没有进入 find/send。R:README.md:265-283。
- 所以“归档”仍只是 UI grouping 的隐藏；bridge 的 find 仍能发现归档会话，send 仍能对 live 的归档会话发送（离线归档会话要先 resume）。

### 4.6 是否有审计日志 / messageId / 权限等级？

**没有 send/receive 审计，没有返回 messageId，没有权限等级。**

- 唯一的日志是 monitor 日志：~/.dsh/super-injector/dsh-session-bridge-monitor.log，写 LOOP-/STALL/COT 等事件。R:src/monitor.ts:216-218、877-881。
- session_bridge_send 不写审计：R:src/tools.ts:247-268；返回值没有 messageId。
- userMessage 内部确实生成 id=randomUUID()，但只作为消息 id 使用，不返回给调用方。R:src/core.ts:139。
- 参数表没有 authority/permission 字段：R:src/tools.ts:226-232。
- registry 是会话登记表（title/cwd/workspace/model），不是消息审计：R:src/registry.ts:1-4、79-98。
- HTTP 设置/收藏路由有 Origin/cookie 或 loopback 检查（R:src/routes.ts:10-13、58-70），但这是浏览器路由的边界，不是 16 个 MCP 工具的 per-target 权限。MCP 工具本身没有等价 gate。

### 4.7 0.9.0 哪些功能其实已经覆盖我们的需求，哪些必须改 DSH core 而不是插件？

**已经被 0.9.0 覆盖的（可直接复用）：**

- 跨工作区 find / live+offline read / wait / segments / create / resume / cancel / monitor / archive / unarchive：R:src/tools.ts 的 16 个工具；R:README.md:21-99。
- 归档集合的读写：R:src/tools.ts:1204-1295（archive/unarchive/archived）。
- 内容循环检测与任务转移：R:src/loop-guard.ts、R:src/monitor.ts:603-607、R:CHANGELOG.md:141-147。
- auto-archive/favorites 的运营能力：R:src/auto-archive.ts、R:src/favorites.ts；默认 autoArchive=false，不会升级后自动隐藏历史。R:src/config.ts:131-151。
- 兼容性：0.9.0 的 peer 全是纯下限 >=0.1.7-0，engines.dsh 一致，适合当前 0.2.x；R:package.json:36-39、77-88。0.3.1 仍是 ^0.1.x 组合，当前 DSH 需要豁免：I:package.json:55-63。

**必须改 DSH core 而不是插件的（如果要“强保证”）：**

1. **可信 authority/principal**：exec.agent.id 只能证明“哪个 agent 在调用”，不能证明“它被授予了什么权限”。如果 authority 必须不可伪造、要绑定用户审批/principal，core 必须提供；插件自加的 authority 参数只是调用方自述，不是安全边界。
2. **真正的 system/developer 角色入站**：bridge 走 agent.followup/steer，类型是 UserMessage；要发 system/developer 消息需要 core 的 system-prompt/append 路径，插件不能仅靠 source 改 role。
3. **全局跨插件跨会话消息策略**：如果要求所有插件（不只 bridge）都不能 self-send/循环，或所有跨会话消息都必须带可信 provenance，这属于 core 的 tool/message policy；bridge 只能约束自己。
4. **exec.agent 缺失时的调用者身份保证**：core 的 agent 字段是可选的（C:@deepseek-ai/dsh-tools/lib/types/contracts.d.ts:175-176）。如果某些 dispatch 模式没有 agent，插件只能 fail-closed 或要求 core 提供身份。
5. **UI 对新 provenance 字段的一等展示**：如果要在 DSH 会话 UI 中显示“来自哪个 session/authority”，需要 core/客户端 schema 与渲染支持；仅写进 source 可能被 UI 当未知来源。

**不需要 core 的（插件就能做）：**

- self-send 拒绝（直接比较 exec.agent.id）；
- whoami；
- bridge 自己发送消息的 senderSessionId/source；
- find/send 的 archived 过滤；
- messageId 返回；
- bridge 自己的 JSONL 审计日志；
- 基于 source 的 hop/chain 检查（只约束 bridge 发出的消息）。

### 4.8 0.3.1 与 0.9.0 的差异；升级还是 cherry-pick？

**差异（源码/文档证据）：**

- 0.3.1：14 个工具；无 loop-guard.ts、handoff.ts、session-create.ts、auto-archive.ts、favorites.ts、config.ts、commands.ts、routes.ts；无 unarchive/favorite。I:README.md:229-244；I:src/index.ts:1-30。
- 0.9.0：16 个工具；新增 loop guard + 任务转移、handoff、共享 session-create、auto-archive、favorites、settings/routes、unarchive、favorite；segments limit 修复（0.9.0 修了 limit 不生效和 nextCursor 翻不动）。R:CHANGELOG.md:1-80、82-118；R:src/tools.ts:427-497。
- 兼容性：0.3.1 peer 只覆盖 0.1.x，当前 DSH 0.2.2-rc.5 需要 exact-version 豁免；0.9.0 peer 为 >=0.1.7-0 且 engines.dsh 一致。I:package.json:55-63；R:package.json:36-39、77-88。
- 0.9.0 的 autoArchive 默认 false；升级不会自动归档任何会话。R:src/config.ts:131-135；R:CHANGELOG.md:51-60。

**建议：升级到 0.9.0（或更高），再打安全 patch；不建议只 cherry-pick 到 0.3.1。**

理由：

- 0.3.1 的兼容性声明已是旧的；即使 cherry-pick 安全代码，仍要单独修 manifest/重打包，且没有 0.9.0 的回归测试基础。
- 0.9.0 已包含 0.3.1 之后的修复（segments 分页、archived lossless JSON、archive stopActivity、unarchive 等），减少重复 backport。
- 0.9.0 的安全缺口是“增量 patch”，不是“换版本就解决”；升级后仍需 self-send/provenance/whoami/archived/audit 五项。
- 若必须冻在 0.3.1：只把 self-send、whoami、archived 过滤、messageId 四项作为临时 patch；provenance 需要改 userMessage + foldMessages 两处；authority 不要用自述字段冒充安全。

## 5. 最小修改点（不写代码，仅定位）

以下均为“插件可修”的最小落点；不涉及本次实际修改。

1. **self-send 拒绝**
   - R:src/tools.ts:247 的 execute 已有 exec 参数；在发送前比较 exec.agent?.id 与 args.sessionId，相等则拒绝。
   - 若要覆盖 monitor/self-target，R:src/tools.ts:962 的 monitor_start 也需要 exec 参数并做同样检查。
   - 若 exec.agent 缺失：fail-closed（拒绝）或返回 unknown；不要静默放行。

2. **sender provenance + messageId**
   - R:src/core.ts:137 的 userMessage 增加可选 source/provenance 参数；source 可复用 core 的 agent-message 形状：kind='agent-message'、form='relay'、senderSessionId=exec.agent.id。
   - R:src/core.ts:733 的 sendLiveMessage 返回 messageId（或返回完整结果），R:src/tools.ts:255-256 的直接发送路径也要走同一函数；R:src/session-create.ts:207 的 create 首条 prompt 也要走同一 provenance builder，避免三条 user 路径行为不一致。
   - R:src/tools.ts:268 的返回值加 messageId/fromSessionId/toSessionId；R:src/core.ts:33-41 的 BridgeMessageRow 增加 sender 字段。
   - R:src/core.ts:196-201 的 foldMessages 不能继续丢弃非 user source；至少要接受 agent-message 并暴露 fromSessionId，否则 bridge 自己 read 看不到自己发的 peer 消息。
   - authority：若要“可信”，不要只加一个 authority 字符串参数；应走 core 的 principal/审批，或明确标注为调用方自述。

3. **whoami**
   - 新增第 17 个工具 session_bridge_whoami，返回 exec.agent.id、title、cwd；R:src/tools.ts:833 的 registerBridgeTools 是注册点。
   - C0 先调用 whoami，再把 id 传给 dsh-gate；若 gate 不能调工具，则外部注入。

4. **archived 过滤**
   - R:src/tools.ts:629 的 registerFind 读取一次 env.ctx.workspaceRegistry.archivedSessionIds，在 filtered 之前过滤；增加 includeArchived（默认 false）。
   - R:src/tools.ts:247 的 send 读取同一集合，默认拒绝 archived（或增加 allowArchived）；注意 live 归档会话与离线归档会话的 resume 路径要写清楚。
   - 输出中增加 archived 标志，避免调用方靠猜。

5. **审计**
   - 在 send（以及 monitor 的 steer）成功/失败处追加 JSONL：time、fromSessionId、toSessionId、messageId、mode、waitForReply、outcome；不要记录完整消息正文，避免二次泄漏。
   - 与 monitor 日志分开文件，或至少分 event type；R:src/monitor.ts:877-881 的 log 是现有的可参考实现。

6. **测试**
   - 新增：self-send 拒绝、exec.agent 缺失 fail-closed、whoami 返回、provenance 往返（send → read 能看到 fromSessionId）、archived 默认不出现/显式 includeArchived 出现、send archived 默认拒绝、messageId 返回、审计行写入。
   - 当前测试完全没有这些词：scripts/ 下 grep selfSend/fromSessionId/senderSessionId/messageId/authority/whoami 均无命中；test-bridge-core 只测 wait/fold/archivedEntries（scripts/test-bridge-core.mjs:43-169）。

## 6. 对 C0 的直接建议

1. **先升级到 0.9.0**，不要继续在 0.3.1 上叠安全逻辑；0.3.1 的 peer 声明与当前 DSH 不匹配。
2. **升级后再加 5 项最小安全 patch**：self-send 拒绝、whoami、sender provenance（agent-message source）、archived 默认过滤、messageId + send 审计。
3. **authority 不要自欺**：如果只是加一个 authority 参数，任何能调用工具的 agent 都能自填；要让 C0 的 gate 真正有权限等级，必须由 DSH core/审批绑定 principal，或在 bridge 外做不可绕过的策略。
4. **不要把 loop guard 当 self-loop guard**：它只处理内容重复，不处理消息往返；两者要分别测。
5. **dsh-gate 的 --self-session-id 目前没有现成来源**：先加 whoami，或由 C0 外部注入；不要用标题匹配猜 self。

## 7. Checks / Evidence / Blockers

### Checks

- [x] 读 AGENTS.md、README.md、CHANGELOG.md。
- [x] 读 R:src/tools.ts、core.ts、loop-guard.ts、handoff.ts、monitor.ts、index.ts、registry.ts、auto-archive.ts、favorites.ts、config.ts、routes.ts。
- [x] 读 scripts/ 下与本次相关的测试：test-bridge-core、test-monitor-loop、test-loop-guard、test-handoff、test-tools-archived、test-auto-archive、test-favorites、test-settings-route、test-tools-create、test-tools-segments。
- [x] 读 I: 0.3.1 的 package.json、src/tools.ts、src/core.ts、src/monitor.ts、src/index.ts、README.md。
- [x] 对比 0.3.1 / 0.9.0 工具数、manifest、send/find/archive 实现。
- [x] 检查 DSH core 的 caller identity、MessageSource、agent-message、UserMessage.id、send_message 返回 messageId。
- [x] 确认未调用 live session 的 find/send/read/status/cancel/archive。
- [x] 确认未 build/test/install/upgrade/联网。
- [ ] 未做运行时验证（M-USE 禁止；本报告全部为静态证据）。
- [ ] 标题锁定未执行（客户端无 session_rename）。

### Evidence 索引

- self-send / send 路径：R:src/tools.ts:247-268；R:src/core.ts:733-739；I:src/tools.ts:292-311；I:src/core.ts:645-651。
- userMessage / provenance：R:src/core.ts:137-144；I:src/core.ts:120-126；R:src/tools.ts:268；I:src/tools.ts:311。
- fold 非 user 过滤：R:src/core.ts:196-201；I:src/core.ts:174-184。
- whoami 缺失：R:src/tools.ts:146-1264 的 16 个 name；R:src/tools.ts:180 的 exec.agent 先例。
- archived find/send：R:src/tools.ts:633/654/702-735、247-268；I:src/tools.ts:673/694/742-775、292-311。
- auto-archive/favorites：R:src/auto-archive.ts:203-209、358；R:README.md:265-283。
- loop guard：R:src/loop-guard.ts:1-18；R:src/monitor.ts:603-607；R:CHANGELOG.md:141-147。
- 审计/日志：R:src/monitor.ts:216-218、877-881；R:src/registry.ts:1-4、79-98。
- DSH core 可复用原语：C:@deepseek-ai/dsh-llm/lib/types/message.d.ts:94-108；C:@deepseek-ai/dsh-subagent/lib/types/continuation-messages.d.ts:11-18；C:@deepseek-ai/dsh-subagent/lib/types/continuation-messages.js:8-29；C:@deepseek-ai/dsh-agent-loop/lib/index.js:573-584；C:@deepseek-ai/dsh-tools/lib/types/contracts.d.ts:175-176；C:@deepseek-ai/dsh-tool-subagent-control/lib/index.js:236-258；C:@deepseek-ai/dsh-subagent/lib/types/manager.js:472-488。
- 0.3.1 兼容性：I:package.json:55-63；0.9.0：R:package.json:36-39、77-88。

### Blockers

- 审计层面无阻塞：要求的源码/测试/安装版均已读。
- 产品层面有 5 个阻塞项：self-send 拒绝、whoami、可信 sender provenance、archived 默认排除、send 审计/authority。
- 若 C0 要求“authority 不可伪造”或“system 角色入站”，则不是插件单独能完成的，必须改 DSH core 或走 core 审批。
- 若 C0 要求“dsh-gate 在纯 shell 中自报 session id”，当前 0.9.0 没有该能力；需要 whoami 工具或外部注入。

## 8. 判定

- Status: **REVIEW**
- Verdict: **PARTIAL**
- 解释：审计问题已全部回答，证据可复核；但 0.9.0 的安全能力矩阵不完整，不能据此宣称“已具备安全防护”。升级 0.9.0 是必要的基础，不是充分条件。
