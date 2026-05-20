declare const chrome: any;

/**
 * Extension Gateway — Web App bridge to Chrome Extension API Gateway
 *
 * When Flovart runs inside a Chrome Extension tab:
 *   - All AI generation requests are routed through extension's service worker
 *   - API keys NEVER enter Web App memory (they stay in extension storage)
 *   - If extension is unavailable, callers should fall back to aiGateway.ts
 *
 * Phase 1A: Zero-Trust Security — Project Phoenix
 */

/** True when running inside a Chrome Extension tab */
export function isExtensionContext(): boolean {
  try {
    return !!((globalThis as any).chrome?.runtime?.id);
  } catch {
    return false;
  }
}

export interface ExtensionGenerateImageRequest {
  provider: string;
  model: string;
  prompt: string;
  count?: number;
  aspectRatio?: string;
  keyId?: string;
}

export interface ExtensionGenerateVideoRequest {
  provider: string;
  model: string;
  prompt: string;
  aspectRatio?: string;
  image?: string;
  keyId?: string;
}

export interface ExtensionGenerateTextRequest {
  provider: string;
  model: string;
  prompt: string;
  systemPrompt?: string;
  keyId?: string;
}

export interface ExtensionImageResult {
  ok: boolean;
  images?: Array<{ base64: string; mimeType: string }>;
  error?: string;
}

export interface ExtensionVideoResult {
  ok: boolean;
  videoBase64?: string;
  mimeType?: string;
  error?: string;
}

export interface ExtensionTextResult {
  ok: boolean;
  text?: string;
  error?: string;
}

function sendExtensionMessage(type: string, payload: any): Promise<any> {
  return new Promise((resolve, reject) => {
    try {
      chrome.runtime.sendMessage({ type, ...payload }, (response: any) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Generate images through extension API Gateway.
 * The extension service worker handles key retrieval, API call, and returns image data.
 */
export async function generateImageViaExtension(
  request: ExtensionGenerateImageRequest,
): Promise<ExtensionImageResult> {
  const result = await sendExtensionMessage('FLOVART_GENERATE_IMAGE', request);
  if (result?.error) throw new Error(result.error);
  return result;
}

/**
 * Generate video through extension API Gateway.
 * Returns base64-encoded video data.
 */
export async function generateVideoViaExtension(
  request: ExtensionGenerateVideoRequest,
): Promise<ExtensionVideoResult> {
  const result = await sendExtensionMessage('FLOVART_GENERATE_VIDEO', request);
  if (result?.error) throw new Error(result.error);
  return result;
}

/**
 * Generate text / enhance prompt through extension API Gateway.
 */
export async function generateTextViaExtension(
  request: ExtensionGenerateTextRequest,
): Promise<ExtensionTextResult> {
  const result = await sendExtensionMessage('FLOVART_GENERATE_TEXT', request);
  if (result?.error) throw new Error(result.error);
  return result;
}

/**
 * Fetch an image URL as Blob through the extension (handles CORS).
 * Extension fetches the URL and returns blob via structured clone.
 */
export async function fetchImageViaExtension(url: string): Promise<Blob> {
  const result = await sendExtensionMessage('FLOVART_FETCH_IMAGE', { url });
  if (result?.error) throw new Error(result.error);
  return result.blob;
}

/**
 * Get pending image info from extension storage.
 * Used when user right-clicked "Add to Flovart Canvas".
 */
export async function getPendingImageFromExtension(): Promise<{
  sourceUrl: string;
  name: string;
  source: string;
} | null> {
  return new Promise((resolve) => {
    if (!isExtensionContext()) { resolve(null); return; }
    chrome.storage.local.get('flovart_pending_image', (result) => {
      const pending = result?.flovart_pending_image;
      if (pending && Date.now() - pending.timestamp < 30_000) {
        chrome.storage.local.remove('flovart_pending_image');
        resolve(pending);
      } else {
        resolve(null);
      }
    });
  });
}
