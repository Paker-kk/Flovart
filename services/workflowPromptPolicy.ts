import type { GenerationMode, UserApiKey } from '../types';
import { resolveProductModelRoute } from './productModelCatalog';

/** Workflow PromptBar 只消费这个策略结果，不自行理解 Provider route。 */
export function resolveWorkflowDefaultModel(input: {
  mode: GenerationMode;
  localOperation?: boolean;
  modelIds: readonly string[];
  userApiKeys: UserApiKey[];
}) {
  if (input.mode === 'text' || input.localOperation) return undefined;
  const productMode = input.mode === 'video' ? 'text-to-video' : 'text-to-image';
  return input.modelIds.find(modelId => Boolean(resolveProductModelRoute(modelId, productMode, input.userApiKeys)));
}
