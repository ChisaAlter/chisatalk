# ChisaTalk

ChisaTalk 是一个独立的 Expo / React Native 移动端 App。

当前功能：

- 默认连接 `http://38.76.185.154:8789`
- 可通过 `EXPO_PUBLIC_CHISATALK_API_BASE_URL` 覆盖服务端地址
- 使用账号密码登录
- 使用 SecureStore 保存本机登录令牌，并迁移清理旧 AsyncStorage 登录态
- 登录后获取并展示模型列表
- 支持会话列表、新建会话、归档删除会话
- 支持 Hermes Agent 流式回复、停止生成、工具进度展示和安全审批按钮
- 支持 OpenAI-compatible 模型由服务端代理调用，移动端不接收 provider key
- 支持图片附件压缩上传、人设设置、Markdown/表格/图片消息渲染
- 支持编辑最后一条用户消息并重新生成回复

> 当前默认地址使用 HTTP。Android release 通过 `network_security_config` 只对 `38.76.185.154` 放开明文流量；如果线上改为 HTTPS，需要同步更新 `EXPO_PUBLIC_CHISATALK_API_BASE_URL`、README 和 Android network security 配置。

## 开发命令

```bash
npm install
npm run start
```

## Android

```bash
npm run android:development
```

Android 包名：`com.chisatalk.app`

Release 包不会使用 debug keystore 签名。打正式包前设置：

```bash
CHISATALK_UPLOAD_STORE_FILE=/path/to/upload.keystore
CHISATALK_UPLOAD_STORE_PASSWORD=...
CHISATALK_UPLOAD_KEY_ALIAS=...
CHISATALK_UPLOAD_KEY_PASSWORD=...
```

直接生成 release APK：

```bash
cd android
./gradlew.bat :app:assembleRelease --no-daemon --console=plain
```

产物路径：

```text
android/app/build/outputs/apk/release/app-release.apk
```

如果未设置 `CHISATALK_UPLOAD_*`，Gradle 只会生成：

```text
android/app/build/outputs/apk/release/app-release-unsigned.apk
```

这个文件不能直接安装，也不能作为正式发布包。需要本地实机验收但暂时没有正式 keystore 时，可以把 unsigned APK 另签成明确标注的 local acceptance 包；该包只用于测试，不用于发布。

## 验证

```bash
npm run typecheck
npm run test
npm run lint
cd server && npm test
```

涉及测试、验收、发布时，必须补充 Android 实机安装/截图验收，并对截图确认登录、会话、发送、停止、Hermes 流式、审批、人设、图片、删除和重新生成等关键路径没有 UI 遮挡或假功能。
