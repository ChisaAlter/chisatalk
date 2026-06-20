import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import type { ChisaTalkImageAttachment } from "./chisatalk-client";

const MAX_IMAGE_DATA_URL_LENGTH = 760_000;

interface CompressionAttempt {
  width: number;
  compress: number;
}

const COMPRESSION_ATTEMPTS: CompressionAttempt[] = [
  { width: 1024, compress: 0.72 },
  { width: 768, compress: 0.55 },
];

function dataUrlFromBase64(base64: string): string {
  return `data:image/jpeg;base64,${base64}`;
}

async function compressImage(uri: string, attempt: CompressionAttempt): Promise<ImageManipulator.ImageResult> {
  return ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: attempt.width } }],
    {
      base64: true,
      compress: attempt.compress,
      format: ImageManipulator.SaveFormat.JPEG,
    },
  );
}

export async function pickChatImageAttachment(): Promise<ChisaTalkImageAttachment | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new Error("需要相册权限才能上传图片");
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    allowsEditing: false,
    allowsMultipleSelection: false,
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    quality: 1,
  });

  if (result.canceled || result.assets.length === 0) {
    return null;
  }

  const asset = result.assets[0];
  for (const attempt of COMPRESSION_ATTEMPTS) {
    const compressed = await compressImage(asset.uri, attempt);
    if (!compressed.base64) {
      continue;
    }

    const dataUrl = dataUrlFromBase64(compressed.base64);
    if (dataUrl.length <= MAX_IMAGE_DATA_URL_LENGTH) {
      return {
        type: "image",
        mimeType: "image/jpeg",
        dataUrl,
        width: compressed.width,
        height: compressed.height,
        name: asset.fileName ?? null,
      };
    }
  }

  throw new Error("图片过大，请选择更小的图片");
}
