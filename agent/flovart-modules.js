// Resolve the shared CLI modules from both the repository layout and the
// published flovart-cli layout. The agent code remains one implementation;
// only the package boundary changes the relative location.
export async function importFlovartModule(name) {
  const moduleName = String(name || '').trim();
  if (!/^[a-zA-Z0-9._-]+$/.test(moduleName)) throw new Error('Invalid Flovart module name.');
  try {
    return await import(`../tools/flovart/${moduleName}.js`);
  } catch {
    return import(`../${moduleName}.js`);
  }
}
