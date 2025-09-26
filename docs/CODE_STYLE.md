# Code Style Guide

This document defines how we write and organize code in the **Social Coffee** project.  
The goal is **consistency, readability, and maintainability** — so that any developer can read and extend code easily.

---

## 1. Formatting

- Use **Prettier** (`npm run format`) for all files.
- **Indentation**: 2 spaces (no tabs).
- **Encoding**: UTF-8.
- **Semicolons**: always.
- **Quotes**: single `'` in TypeScript/JavaScript, double `"` in JSON.
- **Trailing commas**: required where valid (arrays, objects, params).
- **Max line length**: 100 characters (wrap long code).
- **Whitespace**:
  - One blank line between top-level functions/classes.
  - No trailing spaces.
  - One final newline at end of file.

---

## 2. Naming

- **Files & folders**: `kebab-case`  
  Example: `user-profile.service.ts`
- **Classes & Enums**: `PascalCase`  
  Example: `UserService`, `SessionStatus`
- **Variables & functions**: `camelCase`  
  Example: `userId`, `getSessionById`
- **Constants**: `SCREAMING_SNAKE_CASE`  
  Example: `DEFAULT_SESSION_TTL`
- **Database**:
  - Tables: `snake_case` plural (e.g., `sessions`, `cafes`)
  - Columns: `snake_case` (e.g., `user_id`, `started_at`)

---

## 3. Imports

- **Order of groups** (with a blank line between):
  1. Node.js built-ins (`fs`, `path`)
  2. External libraries (`@nestjs/...`, `react`, `zod`)
  3. Internal modules (`src/modules/...`, `src/utils/...`)
- Use **absolute imports** from `src/*` instead of long relative paths.
- Keep imports sorted alphabetically inside each group.

---

## 4. Comments

- Use comments to explain **why**, not **what**:

  ```ts
  // Good: Explain intention
  // Timer ensures session auto-expires in case WS disconnect is missed
  setTimeout(() => this.end(sessionId), 10 * 60_000);

  // Bad: Redundant
  // Set timeout to 10 minutes
  setTimeout(...);
  ```
