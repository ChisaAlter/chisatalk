# ChisaTalk

ChisaTalk 是一个独立的 Expo / React Native 移动端 App。

当前功能：

- 默认连接 `https://38.76.185.154:8789`
- 可通过 `EXPO_PUBLIC_CHISATALK_API_BASE_URL` 覆盖服务端地址
- 使用账号密码登录
- 保存本机登录令牌
- 登录后获取并展示模型列表
- 支持刷新模型列表和退出登录

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

## 验证

```bash
npm run typecheck
npm run test
```
