import type { RouteMappingBinding, UserApiKey } from '../types';
import { suggestProductRouteMappings } from './productModelCatalog';

function routeTargetKey(mapping: RouteMappingBinding) {
  return JSON.stringify(mapping.target);
}

/**
 * Makes a newly connected service immediately usable without taking ownership
 * away from mappings the user already chose in Settings.
 */
export function mergeSuggestedProductRouteMappings(key: UserApiKey): UserApiKey {
  const existing = key.routeMappings || [];
  const existingTargets = new Set(existing.map(routeTargetKey));
  const suggestions = suggestProductRouteMappings(key).filter(mapping => !existingTargets.has(routeTargetKey(mapping)));
  return suggestions.length ? { ...key, routeMappings: [...existing, ...suggestions] } : key;
}
