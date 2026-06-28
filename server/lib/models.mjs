import { readFile } from "node:fs/promises";

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function loadModels(modelsPath) {
  const text = await readFile(modelsPath, "utf8");
  const parsed = JSON.parse(text);
  if (!isRecord(parsed) || !Array.isArray(parsed.models) || typeof parsed.updatedAt !== "string") {
    throw new Error("models.json 格式不正确");
  }
  return parsed;
}

export async function getModelConfig(modelsPath, modelId) {
  const config = await loadModels(modelsPath);
  const found = config.models.find((model) => {
    return isRecord(model) && model.id === modelId;
  });
  if (!found) {
    throw Object.assign(new Error("模型不存在"), {
      status: 422,
      code: "validation_failed",
    });
  }
  return found;
}

export async function assertModelExists(modelsPath, modelId) {
  await getModelConfig(modelsPath, modelId);
}

export function sanitizeModel(model) {
  if (!isRecord(model)) {
    return model;
  }

  const { apiKey, chatCompletionsUrl, ...visibleModel } = model;
  return visibleModel;
}

export function sanitizeModelsConfig(config) {
  return {
    ...config,
    models: Array.isArray(config.models) ? config.models.map(sanitizeModel) : [],
  };
}

export async function loadVisibleModels(modelsPath) {
  return sanitizeModelsConfig(await loadModels(modelsPath));
}
