# API Playground — Task Tracker

## Architecture
- **Normalized tree**: flat treeNodes + separate request/response entities
- **Dexie (IndexedDB)**: persistent storage
- **Zustand stores**: collection, request, ui, history
- **Variable resolver**: Postman-like scope priority

---

## Completed

### Phase 1 — Core (MVP)
- [x] Postman v2.1.0 collection import (recursive, normalized)
- [x] Postman v2.1.0 collection export
- [x] Tree-based collections (nested folders, unlimited depth)
- [x] Request builder (method, URL, params, headers, body, auth)
- [x] Response viewer (status, body, headers, meta)
- [x] Saved responses (response[] from Postman import)
- [x] History (last 200 requests)
- [x] IndexedDB persistence (Dexie)

### Phase 2 — Postman Workflow
- [x] Multi-tab open requests
- [x] Right-click context menu (Add Folder/Request, Rename, Duplicate, Delete)
- [x] Search requests by name/URL
- [x] Keyboard shortcuts (Ctrl+Enter, Ctrl+S, Ctrl+W)
- [x] Auth tab (Bearer, Basic, API Key, Inherit)
- [x] Path variables (:param)
- [x] Environment dropdown in topbar
- [x] Variables panel (Global, Environment, Collection scopes)
- [x] Variable resolver with scope priority
- [x] Dynamic variables ($timestamp, $guid, $randomInt)
- [x] Missing variable detection + warnings

### Phase 3 — Variable System
- [x] VariableEntity: initialValue + currentValue + secret + scope
- [x] Dexie v2 migration (variables table)
- [x] variable.repository.ts (full CRUD)
- [x] Collection-level variables (scope: 'collection')
- [x] Tab-level local variables (scope: 'local')
- [x] Secret masking (🔒/🔓 toggle, 👁 show/hide)
- [x] Initial vs Current value columns
- [x] Autocomplete when typing {{
- [x] Realtime URL variable preview (resolved/missing)
- [x] Variable change event system (auto-refresh preview)

---

## Remaining

### Phase 4 — Polish
- [ ] Bulk variable import/export (Postman env JSON format)
- [ ] Variable hover preview in URL
- [ ] Colorized {{variable}} syntax highlighting
- [ ] Collection-level auth inheritance (set auth on collection, inherit to children)
- [ ] Undo/redo for variable changes
- [ ] Drag & drop reorder in collection tree (@dnd-kit)
- [ ] Virtualized sidebar (@tanstack/react-virtual for 1000+ items)

### Phase 5 — Advanced
- [ ] Pre-request scripts (JS sandbox)
- [ ] Test scripts (assertions)
- [ ] Collection runner (batch execute)
- [ ] WebSocket/SSE support
- [ ] GraphQL request builder
- [ ] Dark/light theme toggle
