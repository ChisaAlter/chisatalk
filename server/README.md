# ChisaTalk Server

ChisaTalk Android client uses this server for login, server-side model listing, and SSE chat streaming.

## Required Environment

Create `.env` next to `server.mjs`:

```dotenv
CHISATALK_HOST=0.0.0.0
CHISATALK_PORT=8789
CHISATALK_TOKEN_TTL_SECONDS=604800
CHISATALK_JWT_SECRET=change-this-secret
CHISATALK_USERS_JSON=[{"id":"admin","username":"admin","password":"change-this-password","displayName":"Admin"}]
CHISATALK_MODELS_FILE=/opt/chisatalk-server/config/models.json
```

## Model Config

Create `config/models.json`:

```json
{
  "models": [
    {
      "id": "hermes",
      "displayName": "Hermes",
      "description": "Hermes model managed by ChisaTalk server",
      "capabilities": ["text", "tools"],
      "enabled": true,
      "provider": {
        "type": "openai-compatible",
        "chatCompletionsUrl": "https://example.com/v1/chat/completions",
        "apiKeyEnv": "HERMES_API_KEY",
        "model": "hermes"
      }
    }
  ]
}
```

The client only receives `id`, `displayName`, `description`, `capabilities`, and `enabled`.
