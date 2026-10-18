# GPU 资源调度：客户端与 AI Agent 调用指导书

## 1. 适用范围

本指导书用于 AID Studio、Hermes、千川、抖音剪辑、自动化 Agent 和其它需要共享 GPU 的应用。所有 GPU 工作都必须提交给 GPU Resource Manager；业务客户端不得直接 SSH 到 GPU 主机、访问 `/dev/nvidia*`、调用 Docker socket、启停 ComfyUI，或连接节点私有推理端口。

统一入口管理以下节点：

| 节点 | GPU | 当前模式 | 当前结论 |
|---|---|---|---|
| `gpu-222` / `10.190.0.222` | 2 × RTX 3090 24GB | `enforce` | 调度器唯一允许的执行入口；仅可使用 `/v1/profiles` 返回的已启用 profile |
| `gpu-203` / `10.190.0.203` | RTX 4080 SUPER 16GB | `observe` | 已登记并上报状态，但暂不领取生产任务；完成固定适配器、节点能力绑定与验收后才能改为 `enforce` |

客户端不传主机 IP 或 `nodeId`，也不能指定某张实体 GPU。客户端只选择业务 profile；调度器根据节点能力、显存、空闲状态和热驻留状态分配资源。这样增加或替换 GPU 节点时，业务代码不需要改地址。

> 状态会变化。每次调用前必须以 `/v1/profiles` 和 `/v1/snapshot` 的实时结果为准，不能把上表当作永久配置。

截至 2026-10-18，`gpu-222` 已完成 H3 768P 多参考图运行时 A/B 验收，
但生产仍使用 torch 2.8/cu128；torch 2.9.1/cu130 候选需管理员明确确认后
才会切换。`gpu-203` 仍为 `observe`，不得由客户端直接指定或绕过调度器
调用。A/B 完成后的调度任务 57 已验证 GPU1 FastH3 并恢复 6 小时热驻留。
详细证据见 [H3 768P runtime A/B](benchmarks/h3-runtime-ab-3090-2026-10-18.md)。

## 2. 调用架构

```text
业务服务 / AI Agent
  └─ HTTPS + 项目专属 API Key
       └─ GPU Resource Manager
            ├─ 队列、优先级、幂等、ETA、热驻留与租约
            ├─ gpu-222 Node Agent ── 固定适配器 ── GPU0/GPU1
            └─ gpu-203 Node Agent ── 固定适配器 ── GPU0（验收后启用）
```

业务请求中的 `payload` 只能包含任务参数和数据引用，不能包含 Shell 命令。节点上的固定适配器负责校验参数、启动模型、保存结果和释放资源。

## 3. 管理员需要提供的配置

每个项目使用独立 API Key。密钥必须通过 Secret 文件或密钥管理系统注入，禁止写入代码、镜像、日志、聊天消息或命令行历史。

```text
AID_GPU_MANAGER_URL=https://gpu-manager.internal
AID_GPU_MANAGER_API_KEY_FILE=/run/secrets/gpu_manager_api_key
AID_GPU_MANAGER_CA_FILE=/etc/aid-gpu/ca.crt
```

在生产开放前，管理员还必须完成：

1. 为 Manager 配置 HTTPS、内部 CA、来源 CIDR 白名单和主机防火墙。
2. 为每个项目签发不同的普通客户端密钥；普通客户端不得持有 Agent 或管理员密钥。
3. 为每个业务 profile 安装固定节点适配器，并完成输入校验、结果回传、取消边界和释放测试。
4. 将 profile 绑定到明确允许的节点能力。当前 222 profile 使用了本机 GPU 索引约束，不能未经验证直接让 203 领取。
5. 203 完成影子任务、失败恢复和越权检测验收后，才可从 `observe` 切换为 `enforce`。

当前 Manager 若仍只监听 `127.0.0.1:18120`，外部客户端不得尝试直连；应等待管理员发布受 TLS 保护的统一地址。

## 4. AI Agent 的强制行为规则

将以下规则加入需要 GPU 的 AI Agent 系统说明：

```text
所有 GPU 工作必须通过 AID GPU Resource Manager。
1. 从环境读取 AID_GPU_MANAGER_URL、AID_GPU_MANAGER_API_KEY_FILE 和 AID_GPU_MANAGER_CA_FILE。
2. 提交前先读取 GET /v1/profiles 和 GET /v1/snapshot。
3. 只能选择 /v1/profiles 返回的 profile；禁止猜测 profile、主机或 GPU 编号。
4. 使用稳定 idempotencyKey 提交 POST /v1/jobs；网络超时后必须复用相同 key。
5. 202 只表示进入队列，不代表任务已经运行。
6. 轮询任务状态并向用户报告 queuePosition、ETA、冷启动代价、分配节点和终态。
7. 只允许降低尚未开始任务的优先级；运行中任务只能请求安全取消。
8. 调度器不可用或 profile 禁用时停止并告警；禁止回退到 SSH、私有端口、Docker 或直接 CUDA。
9. 禁止输出 API Key，禁止使用 Agent/Admin 接口，禁止自行杀 GPU 进程。
```

Codex 环境应安装并遵循 `gpu-resource-scheduler` Skill。该 Skill 是行为约束；真正的鉴权和任务状态仍以 Manager API 为准。

## 5. 标准调用顺序

### 5.1 获取允许的 profile 与资源快照

```bash
curl -sS --cacert "$AID_GPU_MANAGER_CA_FILE" \
  "$AID_GPU_MANAGER_URL/v1/profiles" \
  -H "Authorization: Bearer $AID_GPU_MANAGER_API_KEY"

curl -sS --cacert "$AID_GPU_MANAGER_CA_FILE" \
  "$AID_GPU_MANAGER_URL/v1/snapshot" \
  -H "Authorization: Bearer $AID_GPU_MANAGER_API_KEY"
```

API Key 更推荐使用 `_FILE` 形式。上面的环境变量形式只适合已经由运行环境安全注入且不会进入日志的进程。

### 5.2 幂等提交

```bash
curl -sS --cacert "$AID_GPU_MANAGER_CA_FILE" \
  -X POST "$AID_GPU_MANAGER_URL/v1/jobs" \
  -H "Authorization: Bearer $AID_GPU_MANAGER_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{
    "profile": "h3-single-fast",
    "idempotencyKey": "project-26-shot-18-preview-v1",
    "payload": {
      "projectId": 26,
      "shotId": 18,
      "requestRef": "aid://video/981"
    }
  }'
```

幂等键必须由稳定业务身份组成，例如“项目 + 镜头 + 生成档位 + 版本”。不要使用当前时间或随机数。网络超时后复用同一个键，避免重复扣费和重复生成。

普通客户端通常省略 `priority`，使用管理员默认值。若允许调整，只能在 profile 的客户端范围内降低排队优先级。

### 5.3 查询状态

```bash
curl -sS --cacert "$AID_GPU_MANAGER_CA_FILE" \
  "$AID_GPU_MANAGER_URL/v1/jobs/42" \
  -H "Authorization: Bearer $AID_GPU_MANAGER_API_KEY"
```

建议每 5 秒轮询一次；长任务可逐步退避。必须保存调度任务 ID，不要依赖浏览器内存。

| 状态 | 客户端处理 |
|---|---|
| `QUEUED` | 显示队列位置、预计开始时间和冷启动代价 |
| `RUNNING` | 显示已分配节点/GPU，禁止重复提交 |
| `SUCCEEDED` | 读取 `result` 中的持久化媒体或业务引用 |
| `FAILED` | 显示结构化错误；按业务规则决定是否用原幂等身份的新版本重试 |
| `CANCELLED` | 停止轮询；运行中取消会等到安全边界 |
| `LOST` | 停止自动重试并通知管理员；租约丢失不等于 GPU 进程已停止 |

### 5.4 取消

```bash
curl -sS --cacert "$AID_GPU_MANAGER_CA_FILE" \
  -X POST "$AID_GPU_MANAGER_URL/v1/jobs/42/cancel" \
  -H "Authorization: Bearer $AID_GPU_MANAGER_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{}'
```

排队任务立即取消。不可抢占的运行任务只记录取消请求，由固定适配器在安全边界停止；客户端不得杀进程。

## 6. Python 客户端

项目优先复用 [`gpu_scheduler_client.py`](../deploy/local/integration/gpu_scheduler_client.py)：

```python
from gpu_scheduler_client import GpuSchedulerClient

client = GpuSchedulerClient.from_environment()
profiles = client.profiles()
snapshot = client.snapshot()

profile = "h3-single-fast"
if profile not in profiles:
    raise RuntimeError(f"管理员尚未开放 {profile}")

job = client.submit(
    profile=profile,
    idempotency_key="project-26-shot-18-preview-v1",
    payload={
        "projectId": 26,
        "shotId": 18,
        "requestRef": "aid://video/981",
    },
)

result = client.wait(job["id"], timeout_seconds=3600, poll_interval_seconds=5)
if result["status"] != "SUCCEEDED":
    raise RuntimeError(result.get("error_message") or result["status"])
```

Web/Celery 服务不应占用一个进程同步等待几十分钟。保存 `job["id"]` 后退出当前请求，通过延迟任务、事件桥或后台轮询更新业务状态。

## 7. 前端必须显示的信息

- profile 显示名与生成档位。
- `QUEUED`、`RUNNING`、终态，不把 `202` 显示成“正在生成”。
- 队列位置、预计开始时间、预计冷启动时间。
- 实际分配的节点和 GPU；这是结果信息，不是用户选择项。
- H3 热驻留释放警告：降低其后续优先级或切换其它模型可能增加约 10 分钟加载时间。
- 取消请求已接收但尚未到安全边界时，显示“正在安全停止”，不能显示“已停止”。

## 8. 203 节点启用条件

`gpu-203` 当前在线但为观察模式。其它客户端现在不能把任务“指定到 203”，也不应直接调用 203 上的 TTS、ComfyUI 或其它 GPU 服务。启用流程如下：

1. 清点 203 的 GPU 服务、模型、端口、显存和启动/卸载成本。
2. 每项能力建立独立固定 profile 和 Node Agent 适配器。
3. 在 Manager 中增加并验证明确的 profile-to-node 能力约束，避免 222 专用任务被 203 误领，反之亦然。
4. 保持 `observe`，验证状态上报、越权告警和无副作用影子任务。
5. 在维护窗口切换为 `enforce`，只开放一个低风险 profile。
6. 验证排队、执行、终态结果、取消、Agent 重启和节点掉线隔离。
7. 管理员验收后逐项开放；业务客户端无需修改代码，只会在 `/v1/profiles` 中看到新增能力。

在第 3 步完成前，不得简单把 203 Agent 切换为 `enforce`。当前全局 profile 主要按 222 的 GPU 索引编写，仅凭相同的 `GPU0` 编号不能证明模型或适配器兼容。

## 9. 故障处理

| 错误 | 正确动作 |
|---|---|
| `SCHEDULER_UNAVAILABLE` | 保持业务任务待提交并告警；禁止直连回退 |
| `SOURCE_NOT_ALLOWED` | 由管理员核对 CIDR 与防火墙；应用不得扩大白名单 |
| `PROFILE_NOT_ALLOWED` | 刷新 `/v1/profiles`，不要猜名称 |
| `PROFILE_DISABLED` | 等待适配器验收和管理员启用 |
| `PRIORITY_NOT_ALLOWED` | 省略优先级或降到允许范围 |
| `JOB_FORBIDDEN` | 使用任务所属项目的密钥 |
| `JOB_ALREADY_STARTED` | 不再改优先级；取消只能等待安全边界 |
| `LOST` / `QUARANTINED` | 通知管理员核对真实进程，客户端不自动重提 |

## 10. 上线验收清单

- 客户端无 GPU device、Docker socket、SSH key 和私有推理端口权限。
- 每个项目使用独立普通客户端密钥，CA 校验开启。
- `/v1/profiles`、`/v1/snapshot`、提交、查询、取消均通过。
- 同一个幂等键重复提交只产生一个任务。
- 前端正确显示队列、冷启动、热驻留和安全取消状态。
- 固定适配器返回持久化 `resultRef`，不把媒体二进制放进 JSON。
- 节点掉线后 GPU 进入隔离，不被其它任务误用。
- 越权进程能在管理员界面提供进程、用户、显存、命令和节点证据。
- 203 仍为 `observe`，或已完成本文件第 8 节全部验收后才进入 `enforce`。
- H3 runtime A/B 测试 profile 保持禁用；客户端只能使用实时
  `/v1/profiles` 返回的生产 profile。

更细的端点与容器改造说明见：

- [GPU 资源管理 API 调用说明](gpu-scheduler-api-calling-guide.md)
- [GPU 调度器容器接入指导书](gpu-scheduler-container-integration-guide.md)
- [GPU 资源管理与运维说明](gpu-resource-manager.md)
