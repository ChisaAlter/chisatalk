export function readRuntimeConfig(env = process.env) {
  const databasePath = env.CHISATALK_DATABASE_PATH;
  const modelsPath = env.CHISATALK_MODELS_PATH;
  const sessionSecret = env.CHISATALK_SESSION_SECRET;
  const adminUsername = env.CHISATALK_ADMIN_USERNAME;
  const adminPassword = env.CHISATALK_ADMIN_PASSWORD;
  const adminDisplayName = env.CHISATALK_ADMIN_DISPLAY_NAME;
  const usersJson = env.CHISATALK_USERS_JSON;
  const hermesApiBaseUrl = env.CHISATALK_HERMES_API_BASE_URL;
  const hermesApiKey = env.CHISATALK_HERMES_API_KEY;
  const hermesPresetPath = env.CHISATALK_HERMES_PRESET_PATH;

  if (!databasePath || !modelsPath || !sessionSecret) {
    throw new Error("缺少 CHISATALK_DATABASE_PATH、CHISATALK_MODELS_PATH 或 CHISATALK_SESSION_SECRET");
  }

  let users = [];
  if (usersJson) {
    try {
      users = JSON.parse(usersJson);
    } catch (error) {
      throw new Error(
        `CHISATALK_USERS_JSON 不是合法 JSON：${error instanceof Error ? error.message : "unknown error"}`,
      );
    }
    if (!Array.isArray(users)) {
      throw new Error("CHISATALK_USERS_JSON 必须是用户数组");
    }
  }

  return {
    databasePath,
    modelsPath,
    sessionSecret,
    adminUsername,
    adminPassword,
    adminDisplayName,
    users,
    hermesApiBaseUrl,
    hermesApiKey,
    hermesPresetPath,
  };
}
