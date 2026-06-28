# Android Release Verification

ChisaTalk 的发布验收不能只停在自动化测试或 `BUILD SUCCESSFUL`。任何涉及测试、验收、发布的变更都必须包含真实 Android 设备截图，并对截图做结论分析。

## 自动化闸门

```powershell
npm run typecheck
npm test
npm run lint
Push-Location server; npm test; Pop-Location
```

## Release 构建

```powershell
Push-Location android
.\gradlew.bat :app:assembleRelease --no-daemon --console=plain
Pop-Location
```

APK:

```text
android/app/build/outputs/apk/release/app-release.apk
```

如果未设置 `CHISATALK_UPLOAD_STORE_FILE`、`CHISATALK_UPLOAD_STORE_PASSWORD`、`CHISATALK_UPLOAD_KEY_ALIAS`、`CHISATALK_UPLOAD_KEY_PASSWORD`，Gradle 会输出 `android/app/build/outputs/apk/release/app-release-unsigned.apk`。它不是可发布 APK，不能跳过签名验证。

签名验证使用本机 Android SDK 的 `apksigner.bat verify --verbose --print-certs`，并确认 v2/v3 签名状态符合 release 要求。没有正式 keystore 时，只能另签本地验收包，例如：

```powershell
New-Item -ItemType Directory -Force -Path dist | Out-Null
& "$env:LOCALAPPDATA\Android\Sdk\build-tools\36.0.0\apksigner.bat" sign `
  --ks android\app\debug.keystore `
  --ks-key-alias androiddebugkey `
  --ks-pass pass:android `
  --key-pass pass:android `
  --out dist\ChisaTalk-1.0.0-local-acceptance.apk `
  android\app\build\outputs\apk\release\app-release-unsigned.apk
```

本地验收包必须在文件名和记录中标注 `local-acceptance`，不能当作正式发布产物。

## 实机截图验收

使用真实 Android 设备安装并截图，至少覆盖：

- 登录页：默认服务地址显示为 `http://38.76.185.154:8789` 或当前环境覆盖地址。
- 登录后首页：会话标题、模型副标题、刷新按钮、侧边栏入口无遮挡。
- 会话列表：新建、选择、长按删除确认、删除后列表更新。
- 发送消息：发送按钮进入停止态，结束后不残留忙碌态。
- Hermes 流式：工具进度、流式正文、最终 assistant 消息均可见。
- 审批路径：需要审批时显示“批准/拒绝”，点击后继续或拒绝结果明确。
- 图片路径：选择图片后有预览，发送后消息中图片可见。
- 人设设置：字段可编辑、保存后侧边栏返回正常。
- 重新生成：最后一条用户消息可编辑并触发新回复。

每张截图需要人工或自动分析：是否符合预期、是否存在遮挡、按钮状态是否正确、消息是否完整、是否出现假功能入口。
