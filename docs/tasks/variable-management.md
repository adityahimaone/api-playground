# Variable Management — Feature Status

## Phase 1 (Completed)

| Feature | Status | Notes |
|---|---|---|
| VariableEntity type | ✅ | key, initialValue, currentValue, enabled, secret, scope, scopeId |
| VariableScope (5 levels) | ✅ | global, collection, environment, local, runtime |
| Dexie variables table | ✅ | Indexed by scope, scopeId, key |
| variable.repository.ts | ✅ | Full CRUD + getByScope, getByScopeId, deleteByScopeId |
| Variable resolver engine | ✅ | Postman priority: local → env → collection → global → dynamic |
| Dynamic variables | ✅ | $timestamp, $guid, $randomInt, $isoTimestamp |
| Missing variable detection | ✅ | getMissingVariables() reports unresolved vars |
| Realtime URL preview | ✅ | 300ms debounce, shows resolved URL or missing warning |
| Variable change refresh | ✅ | CustomEvent 'variables:changed' triggers preview re-resolve |
| Environment switching | ✅ | Sidebar env tab syncs to useUIStore.activeEnvId |
| Global + Environment CRUD | ✅ | Add/edit/delete via variableRepository |

## Phase 2 (Completed)

| Feature | Status | Notes |
|---|---|---|
| Secret masking | ✅ | 🔒/🔓 toggle per variable, 👁 show/hide eye icon, '********' display |
| Initial vs Current value | ✅ | Two columns in variable table, both editable |
| Collection-level variables | ✅ | Scope 'collection' with scopeId=collectionNodeId, UI in Variables tab |
| Tab-level local variables | ✅ | Collapsible section below URL bar, scope 'local', scopeId=tabId |
| Autocomplete `{{` | ✅ | Dropdown on '{{' with all-scope suggestions, keyboard navigation |

## Phase 3 (Remaining)

| Feature | Status | Notes |
|---|---|---|
| Bulk import/export | ❌ | Postman env JSON format support |
| Variable hover preview | ❌ | Hover {{var}} in URL to show resolved value |
| Colorized variable highlight | ❌ | {{var}} syntax highlighting in URL input |
| Collection-level auth inheritance | ⚠️ | Auth entity has 'inherit' type, but no UI to set collection auth |
| Undo/redo for variable changes | ❌ | — |
