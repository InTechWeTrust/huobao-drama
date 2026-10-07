# Local studios installation

Original checkouts: `D:\Other-projects\huobao-drama` (chatfire-AI/huobao-drama)
and `D:\Other-projects\vlo` (PxTicks/vlo). Changes extend each original app.
The small MCP/brain adapter lives inside Huobao; there is no third editor.

## Start and stop

```powershell
& D:\Other-projects\huobao-drama\scripts\local-suite.ps1 -Open
& D:\Other-projects\huobao-drama\scripts\local-stop.ps1
```

Desktop shortcuts `Huobao Drama` and `VLO` open their respective app. Recreate
them with `scripts/install-shortcuts.ps1`. Both use the shared launcher; VLO's
brain adapter requires the Huobao backend. `-Open -App huobao` or `-App vlo`
opens only the selected user interface.

Huobao: http://127.0.0.1:5679. VLO: http://127.0.0.1:6332.
MCP HTTP: http://127.0.0.1:5678/mcp. Services bind loopback only.
VLO's browser editor must remain open for native commands. Queued commands
are not success: inspect `vlo_result` until succeeded/failed and check the native
generation/export run separately. Stop affects only PID-verified suite processes.
Ruby/ComfyUI are existing services; the suite does not start/stop them.
Both apps depend on Ruby's backend for the current Library/preset contracts;
the Ruby user interface does not need to be open. VLO additionally reuses the
installed original Ruby card builder without booting Ruby's application or runner.

## Shared storage and dependencies

| Content | Owner/path |
| --- | --- |
| Projects, uploaded assets, exports | `E:\Media\Huobao\Project`, `E:\Media\VLO\Project` |
| Shared references | `E:\Media\Rubyapp\KeyAsset`, `E:\Media\ComfyUI\Input` |
| Ruby/ComfyUI renders | Native Ruby project mapping must point to the corresponding app Project root |
| Temporary media | `E:\Media\Huobao\Temp`, `E:\Media\VLO\Temp`; Comfy's managed temporary handoff stays with Comfy |
| Database/settings/workflow receipts/logs | Each app's `.state`; suite PID/logs under `E:\Media\Huobao\.state\suite` |
| Installation/runtime scratch | Each app's `Temp\runtime`; brain scratch in Huobao `Temp\brain` |
| Ruby Library | `E:\rubyapp\Library`, through Ruby catalogue/use API |
| Model weights | Existing `D:\ComfyUI\models`; no copied weights |

VLO's isolated Python environment shares installed ComfyUI libraries using
`backend/.venv/Lib/site-packages/shared_comfyui.pth`. Lightweight missing app
dependencies and MCP 2.3.0 are installed in that environment. Reuse couples VLO
to future ComfyUI library upgrades; run checks before upgrading either runtime.
No optional SAM/Whisper/etc model downloads were performed. Local mode refuses
automatic downloads. Missing optional tools must report their dependency error.
Huobao's editable original agent templates are seeded once into
`E:\Media\Huobao\.state\workspace`; this does not copy the shared Ruby Library.

Use these launchers rather than upstream dev launchers: the latter retain upstream
storage defaults. Huobao serves the generated Nuxt static build. Its backend
production dependency audit is clean. Nuxt build dependencies currently include
unpatched high advisories for braces/node-forge; do not expose Nuxt dev/preview.

## Brain and generation

Settings select `local:qwen3.8-27b@ninfer-ruby`, `claude-opus-5-5` (Opus 5.5),
or `gpt-6.1-sol` (Sol 6.1). Subscription models use existing CLI login,
with API-key variables removed from child processes. No cloud inference API
key is configured. `claude auth login` renews the Claude subscription login.
The CLI's displayed list-price cost estimate does not establish API billing.
Huobao's Episode Text/Effort controls persist only for that episode; app Settings
remain the default for episodes without a saved selection. MCP `huobao_brain`
accepts `episode_id` for the same scope.

Effort: Local low/medium/high/xhigh (high maps to Ruby's xhigh); Opus
low/medium/high/xhigh/max; Sol low/medium/high/xhigh/max/ultra.
Unsupported choices fail explicitly. CLI models return decisions; the original
app executes its tools and supplies tool results back. Built-in shell/MCP tools
are disabled in brain subprocesses. A subscription request occupies one seat
at a time. Streaming is buffered until the CLI completion finishes.

Only MiniMax H3 video and Qwen-Image 2.1 image workflows are enabled.
Huobao uses Ruby's native shot preview/binder, Library consultation receipt,
job submission/polling and existing ComfyUI. VLO imports Active Ruby preset
graphs with consultation receipts, loads them into the original workflow panel
and uses its original generation engine. Future models require an explicit
registry/allowlist update, not copying model folders.

Preset choices, fields and duration constraints are read from the Active Ruby
catalogue, native schema and shot capabilities. Refresh after Library edits.
New jobs revalidate; queued jobs retain their captured card/graph version.
VLO imports must be reimported when their source hash or revision changes.
H3 Extend binds the original clip through native Ruby preview and builder rules.
Both apps expose optional additional speech/audio tracks. The default preserves
the project policy; explicitly disabling additional tracks bypasses its separate
speech-provider request. Native H3/source sound remains governed by the original
card. Blocked preview notes prevent queueing; no global sound policy is changed.
Generated-window and new-portion duration are different per-card contracts.
Long films assemble multiple shots/continuations; a 15-second card is not a
15-second final-film limit. No one-minute quality render was executed here.

Generation resolution and delivery resolution are separate. Current H3 cards
may render at 720p even when requesting 1080p/2K; silent downgrade is refused.
Request SeedVR2 upscaling separately, and RIFE frame interpolation separately.
Do not automatically add these passes or overwrite the source clip.
Qwen-Image 2.1's current graph uses ComfyUI `QwenImage21Cache`/`UNETLoader`;
the installed NInfer brain backend is a different text-model route.

The checkout is based on upstream v4.0.7 (`f2b4d86`). Launchers report the
desktop package release version rather than backend's unchanged 1.0.0 placeholder.
The native Skill and Style Preset menus remain app-local features. Updates need
a reviewed merge with this adaptation; no Watchtower updater is configured.

## Five clients

Registered MCP name: `local-studios`. Ten tools expose both native apps,
brain selection and Ruby Library consultation. stdio command:
`D:\Other-projects\vlo\backend\.venv\Scripts\python.exe`, argument:
`D:\Other-projects\huobao-drama\scripts\mcp-stdio.py`.

ChatGPT desktop local Work and Codex use the shared Codex MCP registration.
Claude Desktop, Claude Code and Hermes have their own registration. Reload
the clients/start a new session to discover added tools; existing running
conversations do not automatically gain them. Actual read-only `studio_status`
calls passed through Sol 6.1 Codex CLI and Opus 5.5 Claude Code; Hermes discovery
passed with all ten tools enabled. The two desktop clients still need a fresh
session/reload check; the running Claude coding session was preserved.
Web/cloud ChatGPT requires a separate hosted
connection and does not read local configuration.
[Official desktop MCP setup](https://learn.chatgpt.com/docs/extend/mcp).

Example: ask a client to call `studio_status`, inspect `studio_capabilities`,
then operate either app. For VLO commands poll the returned ID using `vlo_result`.
`library_catalogue` searches Active entries; `library_consult` opens and reads a
real Ruby use session. It does not create an independent Library.
`huobao_media` reads live presets/schema and sets native media controls.
Use `shot-controls` with `storyboard_id` to save one shot's continuation controls,
and `preview` to inspect native binding without queueing generation.
`vlo_library_workflow` imports a preset through VLO's native receipt gate;
load its returned `workflow_id` using `vlo_command` with `generation.load` and
`args: {workflow: <workflow_id>}`. Loading does not start a GPU job.

## Pending native project-path apply

The suite's databases, native VLO projects, scratch and logs already use the
separate E media roots above. Ruby's `huobao` and `vlo` project registrations
have staged revision-1 mappings to `E:\Media\Huobao\Project` and
`E:\Media\VLO\Project`. The running backend still uses its previous mappings
until Ruby's original `app.paths_apply` controller applies them with an offline
service barrier. Huobao refuses media queueing while its root mapping differs.
Do not edit Ruby's database directly or bypass the maintenance/writer barrier.
Coordinate a quiet window with the active Claude Ruby task before applying.

Focused adaptation checks pass; the upstream VLO backend broad suite previously
reported 42 failures (Windows/FastAPI compatibility) and 12 skips. This is not a
claim that every upstream optional feature or final media output is qualified.

## Rollback

Stop the suite first. Revert each installation commit inside its own source
checkout. Remove only `local-studios` from each client's MCP configuration
(`codex mcp remove local-studios`, `claude mcp remove --scope user local-studios`,
`hermes mcp remove local-studios`, and the Claude Desktop MCP entry).
Keep E project/state directories unless their data is explicitly disposable.
No existing Ruby/ComfyUI source or weight files were modified.
