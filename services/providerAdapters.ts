import { providerAdapterRegistry } from './providerAdapter';
import { seedanceProviderAdapter } from './seedanceProviderAdapter';

providerAdapterRegistry.register(seedanceProviderAdapter);

export { providerAdapterRegistry };
export { seedanceProviderAdapter };
export {
  officialProviderAdapter,
  providerGenerationExtensionRegistry,
  registerUserScriptProvider,
  unregisterUserScriptProvider,
  getUserScriptProvider,
  listUserScriptProviders,
  resolveProviderGenerationExtension,
} from './userScriptProviderAdapter';
