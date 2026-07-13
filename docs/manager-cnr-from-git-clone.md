# 如何把 git clone 的插件转成 Manager 可识别的「正式插件」

依据 ComfyUI Manager 4.x 源码与本机实测整理。

## 一句话

Manager 认的不是「目录里有没有代码」，而是：有没有 **CNR 安装形态**（`pyproject.toml` + `.tracking` + 正确目录名，且没有 `.git` 干扰）。

## 两种安装形态对比

| | Manager 安装（能认） | 普通 git clone（容易认不出） |
|---|---|---|
| 目录名 | 注册表 id，如 `prompt-assistant` | 仓库名，如 `ComfyUI-Prompt-Assistant` |
| `.git` | 无 | 有 |
| `.tracking` | 有（文件清单） | 无 |
| `pyproject.toml` | 有，`name` = 注册表 id | 可能有，也可能没有 |
| Manager 识别路径 | CNR 路径 | Git 路径（`cnr_id` 常为空） |
| 已安装列表 | 显示版本号（如 `2.0.6`） | 常显示未安装 / 对不上 |

## Manager 识别逻辑（简化）

```text
扫描 custom_nodes/某目录
        │
        ▼
   有 .git 吗？
   ┌────┴────┐
  是         否
   │          │
   ▼          ▼
读 remote    必须同时有：
当 git 包     · pyproject.toml
              · .tracking
   │          │
   ▼          ▼
常变成        读 name + version
unknown /     → 正式 CNR 包
对不上已安装  → 出现在「已安装」
```

**关键点：** 只要还在 `.git`，`.tracking` 基本等于白做。

## 转换步骤（推荐流程）

以插件目录在 `ComfyUI/custom_nodes/` 下为例。

### 1. 确认注册表 id

在 Manager 缓存或注册表里查该插件的 id，或看 `pyproject.toml`：

```toml
[project]
name = "prompt-assistant"   # ← 这就是 CNR id
version = "2.0.6"
```

没有 `pyproject.toml` 或没有正确 `name`，Manager 很难按正式包识别。

### 2. 重命名文件夹

```text
custom_nodes/ComfyUI-XXX   →   custom_nodes/<id>
```

示例：

```text
ComfyUI-Prompt-Assistant  →  prompt-assistant
```

目录名应与 `pyproject.toml` 的 `name`、注册表 id 一致（通常小写、带连字符）。

### 3. 生成 `.tracking`

在插件根目录创建 `.tracking`，内容为一行一个相对路径（正斜杠 `/`），列出包内文件，**不要**包含：

- `.git/**`
- `__pycache__/**`、`*.pyc`
- `.tracking` 自身

PowerShell 示例：

```powershell
$dst = "E:/path/to/ComfyUI/custom_nodes/prompt-assistant"
$lines = Get-ChildItem $dst -Recurse -File -Force |
  Where-Object {
    $rel = $_.FullName.Substring($dst.Length + 1) -replace '\\','/'
    -not (
      $rel -like ".git/*" -or
      $rel -like "__pycache__/*" -or
      $rel -like "*/__pycache__/*" -or
      $rel -like "*.pyc" -or
      $rel -eq ".tracking"
    )
  } |
  ForEach-Object { $_.FullName.Substring($dst.Length + 1) -replace '\\','/' } |
  Sort-Object

[System.IO.File]::WriteAllLines((Join-Path $dst ".tracking"), $lines)
```

### 4. 删除 `.git`（最关键）

```powershell
Remove-Item -Recurse -Force "E:/path/to/ComfyUI/custom_nodes/prompt-assistant/.git"
```

删掉后 Manager 才会走 CNR 路径，和用 Manager 装的包一样。

**代价：** 不能再在该目录 `git pull`；更新改走 Manager 的更新/重装。

### 5. 重启 ComfyUI

Manager 在启动/刷新时扫描 `custom_nodes`，改完后必须**完全重启**。

### 6. 验证

- Manager → 筛选 **已安装** → 搜插件名 / id
- 或启动后看日志是否仍有 `Import failed` / 插件启动打印

本地可用逻辑自检（有 `.tracking` + 无 `.git` 时）：

- `read_cnr_info()` → `{ id, version, ... }` 成功
- 有 `.git` 时 → 走 git，`.tracking` 不参与 CNR 识别

## 最终目录应长这样

```text
custom_nodes/
  prompt-assistant/          ← 名 = 注册表 id
    ├── __init__.py
    ├── pyproject.toml       ← name / version / [tool.comfy]
    ├── .tracking            ← 文件清单
    ├── requirements.txt     ← 可选
    └── ...（业务代码）
    └── （没有 .git）
```

对照你机器上已能识别的插件（如 `comfyui-easy-use`）：同样是 **无 `.git` + 有 `.tracking`**。

## 可选 / 不必做

| 项 | 说明 |
|---|---|
| 改 `__init__.py` / 节点代码 | 与 Manager 识别无关 |
| 写 `.git/.cnr-id` | 仅在保留 `.git` 时有用，且仍不如删 `.git` 稳 |
| 补全 `PublisherId` / `DisplayName` | 便于注册表展示；识别已安装主要靠 `name` + tracking |

## 更省事的做法

若网络正常、只想「能在已安装里看到、能更新」：

1. 删掉手 clone 的目录
2. 在 Manager 里搜同名插件 → **Install**

Manager 会自动：正确目录名、写 `.tracking`、不带 `.git`（或按 CNR zip 安装）。

## 检查清单（复制用）

- [ ] 1. 文件夹名 = `pyproject` `name` = 注册表 id
- [ ] 2. 根目录有 `pyproject.toml`（含 `name`、`version`）
- [ ] 3. 根目录有 `.tracking`（文件清单）
- [ ] 4. 已删除 `.git`
- [ ] 5. 完全重启 ComfyUI
- [ ] 6. Manager → 已安装 里能搜到

## 容易踩的坑

1. **只改名、不删 `.git`** → 仍走 git 路径，已安装列表对不上。
2. **只加 `.tracking`、还留着 `.git`** → `.tracking` 被忽略。
3. **目录名仍是仓库名**（`ComfyUI-Foo`）而 id 是 `foo` → 对不上。
4. **没有 `pyproject.toml` 或 `name` 不对** → `read_cnr_info` 失败。
5. **改完不重启** → Manager 仍用启动时缓存的已安装列表。

## 最短口诀

**改名 = id + 写 `.tracking` + 删 `.git` + 重启。**
