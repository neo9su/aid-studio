# GPU Resource Manager：其它客户端与 AI Agent 执行手册

更新时间：2026-10-18

## 1. 当前结论

所有客户端和 AI Agent 只能调用 GPU Resource Manager，不能直接连接 GPU
主机、ComfyUI 私有端口、Docker socket 或 `/dev/nvidia*`。

| 节点 | 状态 | 客户端现在能否使用 | 使用方式 |
|---|---|---|---|
| `gpu-222` / `10.190.0.222` | `enforce` | 可以 | 从 `/v1/profiles` 选择已启用 profile，经 Manager 排队 |
| `gpu-203` / `10.190.0.203` | `observe` | 不可以执行任务 | 等管理员安装固定适配器、绑定专用 profile 并验收后开放 |

客户端永远不提交 IP、`nodeId` 或 GPU 编号。需要使用 203 时，管理员为
203 开放一个经过验收的业务 profile；客户端刷新 `/v1/profiles` 后选择该
profile。Agent 不得自行猜测 profile 名称，也不得在 203 尚为 `observe` 时
回退到 SSH 或私有 API。

当前已验证的 222 profile：

| profile | 用途 | 约束 |
|---|---|---|
| `h3-single-fast` | FastH3 快速预览 | GPU1；480P；4–5 秒；仅文生视频；不支持参考图 |
| `h3-standard-quality` | H3 标准/Turbo/参考图 | GPU0；480P 或 768P；768P 最长 5 秒；支持多参考图和音频 |
| `douyin-edit` | 抖音剪辑任务 | 仅在调用方已取得该 profile 的 payload 契约时使用 |

profile 的实时返回结果优先于本文。profile 不在 `/v1/profiles` 中就不能
调用。

## 2. 管理员必须交付给调用方的内容

每个项目使用独立的普通客户端密钥。管理员通过 Secret 文件或密钥管理
系统提供以下环境变量：

```text
AID_GPU_MANAGER_URL=https://gpu-manager.internal
AID_GPU_MANAGER_API_KEY_FILE=/run/secrets/gpu_manager_api_key
AID_GPU_MANAGER_CA_FILE=/etc/aid-gpu/ca.crt
```

- 不把 API Key 写入代码、提示词、镜像、日志或命令行参数。
- 本机开发环境若由管理员提供 loopback 隧道，可使用管理员给出的本机
  URL；容器中的 `127.0.0.1` 指向容器自身，不能照抄宿主机地址。
- 其它主机必须使用管理员发布的 HTTPS 地址、CA 文件和 CIDR 白名单。
- 普通客户端不得持有 Agent 密钥或管理员密钥。

## 3. 可直接交给 AI Agent 的系统指令

```text
所有 GPU 工作必须通过 AID GPU Resource Manager。

1. 从环境读取 AID_GPU_MANAGER_URL、AID_GPU_MANAGER_API_KEY_FILE 和
   AID_GPU_MANAGER_CA_FILE；禁止显示或记录密钥内容。
2. 每次提交前先读取 GET /v1/profiles 和 GET /v1/snapshot。
3. 只能选择 /v1/profiles 实时返回的 profile。禁止提交主机 IP、nodeId、
   GPU 编号或 Shell 命令。
4. 使用由“项目 + 业务任务 + 档位 + 版本”组成的稳定 idempotencyKey；
   网络超时后必须复用同一个 key。
5. POST /v1/jobs 返回 202 只表示已排队。只有状态变为 RUNNING 才能报告
   已开始执行。
6. 轮询 GET /v1/jobs/{id}，向用户报告 queuePosition、ETA、冷启动代价、
   分配节点和终态。建议间隔 5 秒并逐步退避。
7. 只允许降低 QUEUED 任务优先级。运行中任务只能通过 cancel API 请求
   在安全边界取消，禁止杀进程。
8. 调度器不可用、profile 禁用、节点 observe/offline 时停止并告警；禁止
   回退到 SSH、Docker、ComfyUI 私有端口或直接 CUDA。
9. gpu-203 当前为 observe，不能执行任务。只有管理员开放专用 profile 后
   才能通过该 profile 使用 203；Agent 不得自行切换节点模式。
10. 成功后读取 result.resultRef；不得把媒体二进制塞进调度 JSON。
```

建议同时为 Codex/兼容 Agent 安装并启用
`gpu-resource-scheduler` Skill。

## 4. 标准调用流程

### 4.1 读取 profile 与资源状态

以下 curl 示例假定密钥由运行环境安全注入到
`AID_GPU_MANAGER_API_KEY`。若只提供 `_FILE`，优先使用第 5 节 Python
客户端在进程内读取，避免把密钥打印或写入命令历史。

```bash
curl -sS --cacert "$AID_GPU_MANAGER_CA_FILE" \
  "$AID_GPU_MANAGER_URL/v1/profiles" \
  -H "Authorization: Bearer $AID_GPU_MANAGER_API_KEY"

curl -sS --cacert "$AID_GPU_MANAGER_CA_FILE" \
  "$AID_GPU_MANAGER_URL/v1/snapshot" \
  -H "Authorization: Bearer $AID_GPU_MANAGER_API_KEY"
```

若部署环境只提供 `_FILE`，应用应在进程内读取文件，不能把密钥拼进将被
日志记录的命令。

### 4.2 FastH3 480P 文生视频

```json
{
  "profile": "h3-single-fast",
  "idempotencyKey": "project-26-shot-18-fast-v1",
  "payload": {
    "videoRequest": {
      "model": "MiniMax-H3",
      "duration": 5,
      "resolution": "480P",
      "ratio": "16:9",
      "acceleration": "fast_vsa",
      "content": [
        {
          "type": "text",
          "text": "A cinematic rural courtyard at sunrise, gentle camera movement"
        }
      ]
    }
  }
}
```

此 profile 不接受图片、视频或音频参考。需要参考图时必须改用
`h3-standard-quality`。

### 4.3 H3 768P 双参考图

```json
{
  "profile": "h3-standard-quality",
  "idempotencyKey": "project-26-shot-18-standard-v1",
  "payload": {
    "videoRequest": {
      "model": "MiniMax-H3",
      "duration": 5,
      "resolution": "768P",
      "ratio": "16:9",
      "acceleration": "stable",
      "content": [
        {
          "type": "text",
          "text": "Picture1 is the man and Picture2 is the woman. Preserve both identities and clothing."
        },
        {
          "type": "image_url",
          "role": "reference_image",
          "image_url": {
            "url": "https://object-storage.internal/project-26/man.png?signature=..."
          }
        },
        {
          "type": "image_url",
          "role": "reference_image",
          "image_url": {
            "url": "https://object-storage.internal/project-26/woman.png?signature=..."
          }
        }
      ]
    }
  }
}
```

参考媒体 URL 必须能被节点适配器访问。不要把 `127.0.0.1`、本机文件路径
或浏览器临时 Blob URL 作为跨主机参考图。生产系统应使用短期签名对象
存储 URL，并由结果服务把节点私有 `resultRef` 镜像为项目可访问的持久
URL。

`acceleration` 可使用 `stable` 或 `turbo`。768P 最长 5 秒；更长镜头由
业务层预先拆分为多段，不能绕过限制。

### 4.4 提交、查询与取消

```bash
curl -sS --cacert "$AID_GPU_MANAGER_CA_FILE" \
  -X POST "$AID_GPU_MANAGER_URL/v1/jobs" \
  -H "Authorization: Bearer $AID_GPU_MANAGER_API_KEY" \
  -H 'Content-Type: application/json' \
  --data-binary @job.json

curl -sS --cacert "$AID_GPU_MANAGER_CA_FILE" \
  "$AID_GPU_MANAGER_URL/v1/jobs/58" \
  -H "Authorization: Bearer $AID_GPU_MANAGER_API_KEY"

curl -sS --cacert "$AID_GPU_MANAGER_CA_FILE" \
  -X POST "$AID_GPU_MANAGER_URL/v1/jobs/58/cancel" \
  -H "Authorization: Bearer $AID_GPU_MANAGER_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{}'
```

任务 ID `58` 只是示例，调用方必须持久化提交响应中的真实 ID。

## 5. Python 客户端

项目优先复用
[`deploy/local/integration/gpu_scheduler_client.py`](../deploy/local/integration/gpu_scheduler_client.py)：

```python
from gpu_scheduler_client import GpuSchedulerClient

client = GpuSchedulerClient.from_environment()
profiles = client.profiles()
snapshot = client.snapshot()

profile = "h3-single-fast"
if profile not in profiles:
    raise RuntimeError(f"profile 未开放：{profile}")

job = client.submit(
    profile=profile,
    idempotency_key="project-26-shot-18-fast-v1",
    payload={
        "videoRequest": {
            "model": "MiniMax-H3",
            "duration": 5,
            "resolution": "480P",
            "ratio": "16:9",
            "acceleration": "fast_vsa",
            "content": [{"type": "text", "text": "A cinematic sunrise"}],
        }
    },
)

result = client.wait(job["id"], timeout_seconds=3600, poll_interval_seconds=5)
if result["status"] != "SUCCEEDED":
    raise RuntimeError(result.get("error_message") or result["status"])
print(result["result"]["resultRef"])
```

Web 服务不要让 HTTP 请求同步等待几十分钟。保存任务 ID 后返回 202，由
后台轮询或事件桥更新业务状态。

## 6. 如何正式开放 gpu-203

203 当前只能上报监控数据，不能领取生产任务。开放某项能力时由管理员执行：

1. 明确业务能力，例如 TTS、ASR、图像生成或视频处理；不要开放任意命令。
2. 在 203 安装固定 worker/适配器，并定义严格 payload schema、超时、结果
   存储、取消边界、显存上限和健康检查。
3. 为该能力创建专用 profile，并把节点能力约束绑定到 `gpu-203`；不能仅凭
   `GPU0` 索引判断兼容。
4. 保持 `observe` 完成影子验证：成功、失败、幂等、取消、节点掉线、越权
   进程告警和恢复均需通过。
5. 在维护窗口切换为 `enforce`，先只启用一个低风险 profile。
6. 管理员验收后，该 profile 才会出现在授权客户端的 `/v1/profiles` 中。

开放后，客户端仍使用第 4 节完全相同的 API，不填写 203 IP。若业务必须
固定到 203，管理员应提供“仅绑定 203”的专用 profile，而不是让客户端
传入节点参数。

## 7. 状态与错误处理

| 状态/错误 | Agent 动作 |
|---|---|
| `QUEUED` | 显示队列位置、ETA 和冷启动代价 |
| `RUNNING` | 显示分配结果；禁止重复提交 |
| `SUCCEEDED` | 保存 `result` 和媒体引用 |
| `FAILED` | 显示结构化错误；更正原因后用新的业务版本重试 |
| `CANCELLED` | 停止轮询 |
| `LOST` / `QUARANTINED` | 通知管理员；禁止自动重提或杀进程 |
| `PROFILE_DISABLED` | 等管理员完成适配器验收 |
| `PROFILE_NOT_ALLOWED` | 刷新 profiles；不得猜名称 |
| `SCHEDULER_UNAVAILABLE` | 保留业务任务并告警；禁止直连回退 |
| `SOURCE_NOT_ALLOWED` | 由管理员检查 CIDR；应用不得扩大白名单 |

## 8. 当前限制

- 203 尚未开放执行 profile，因此现在不能通过 API 使用它的 GPU。
- 外部客户端必须先取得管理员发布的 HTTPS Manager 地址、项目密钥、CA
  和来源网段授权；不能直接使用 AID 本机的 loopback 地址。
- 当前 H3 `resultRef` 可能是 GPU 节点私网 URL。跨网客户端上线前应接入
  结果镜像/对象存储，不能把节点私有端口暴露到公网。
- profile payload 是固定契约。除本文件给出的 H3 契约外，其它 profile
  必须由管理员提供对应 schema 后才能调用。

更完整的 API、容器改造和运维说明：

- [GPU 资源调度：客户端与 AI Agent 调用指导书](gpu-resource-agent-client-guide.md)
- [GPU 资源管理 API 调用说明](gpu-scheduler-api-calling-guide.md)
- [GPU 调度器容器接入指导书](gpu-scheduler-container-integration-guide.md)
- [GPU 资源管理与运维说明](gpu-resource-manager.md)
