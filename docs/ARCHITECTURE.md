## photoalbum architecture

One static Go binary contains the HTTP API, the embedded web UI, schema
migrations and background jobs.

### Goals

- **Self-sufficient** — no runtime, interpreter or separate frontend server.
- **Light on the server** — photos are resized and re-encoded in the browser;
  the server only reads the image header and stores the bytes.
- **Scale down** — on a laptop it needs nothing but a writable directory
  (SQLite + in-process cache).
- **Scale up** — the server is stateless; point every replica at the same
  MariaDB and Valkey and put any load balancer in front.
- **Portable** — the same artifact runs as a FROM scratch container, a
  systemd service, a Kubernetes pod or PID 1 inside a microVM.

### Stack

| Concern | Choice |
|---|---|
| Language | Go 1.23 |
| HTTP | Fiber v2 (fasthttp) |
| Database (single node) | SQLite via modernc.org/sqlite (pure Go, `CGO_ENABLED=0`, WAL) |
| Database (multi node) | MariaDB / MySQL |
| Cache | in-process or Valkey/Redis (session lookups) |
| UI | Vanilla HTML/CSS/JS, embedded, no build step, system fonts only |

### Layout

    cmd/photoalbum/        entry point: serve | migrate | reset | healthcheck | version
    internal/config/       environment configuration
    internal/db/           connection handling + embedded, versioned migrations per dialect
    internal/store/        data access (portable SQL for SQLite and MariaDB)
    internal/imgmeta/      pure helpers: image format/size check, caption clean-up (unit tested)
    internal/cache/        Cache interface: memory and Valkey/Redis backends
    internal/auth/         password hashing, session tokens, identity-provider interface
    internal/server/       Fiber app, middleware, HTTP handlers
    web/static/            single-page UI, embedded with go:embed
    deploy/                nginx, systemd, microVM rootfs, Kubernetes

### Browser side

- **Capture** — `getUserMedia` camera in a dialog when the page is a secure
  context; otherwise `<input type="file" accept="image/*" capture>` opens the
  device camera. Gallery images use the same path.
- **Resize** — `createImageBitmap(..., {imageOrientation: "from-image"})`,
  canvas scale to 2048 px on the longest side, JPEG at quality 0.88.
- **Live album** — `/api/photos` is polled every 15 s while the tab is visible
  and on `visibilitychange`; the board is updated in place and new photos
  animate in. Images are fetched from `/api/photos/:id/image` and cached by
  the browser (immutable).
- **Slideshow** — full screen, blurred backdrop plus the photo, 1.8 s
  cross-fade every 7 s.

### Data model

Timestamps are unix seconds and IDs are application-generated UUIDs. The SQL
is identical on SQLite and MariaDB.

- `users`, `auth_identities`, `sessions` — accounts and login sessions
  (only the SHA-256 of a session token is stored)
- `photos` — owner, caption, MIME type, width, height, size, SHA-256, image
  bytes (`BLOB` / `LONGBLOB`), created/updated. Listing never reads the bytes.

Storing photos in the database keeps replicas stateless and makes backups a
single database dump.

### Scaling model

- **Stateless replicas** — sessions and photos live in the database; session
  lookups are cached for 60 s (memory or Valkey).
- **Migrations** run on start-up. On MariaDB a `GET_LOCK` makes concurrent
  replica start-ups safe; on SQLite immediate transactions serialise them.
- **Health** — `/healthz` (process up) and `/readyz` (database and cache reachable).
- **Graceful shutdown** on SIGTERM with a 15 s drain.
- **Rate limiting** of sign-in/sign-up is per replica (in-memory).

### Security

- bcrypt (cost 12) password hashes
- Opaque 256-bit session tokens in HttpOnly, SameSite=Lax cookies
- State-changing requests must be JSON, or `image/*` with an
  `X-Requested-With` header (uploads); both block cross-site form posts
- Uploads are size-limited (`PHOTOALBUM_MAX_FILE_MB`), must decode as JPEG,
  PNG or GIF (header only, at most 100 megapixels) and count against a per-user quota
- Every photo is scoped to its owner in SQL (`WHERE id = ? AND owner_id = ?`)
- Strict Content-Security-Policy (`'self'` only), `X-Frame-Options: DENY`, nosniff
- Optional sign-up restriction to given networks (`PHOTOALBUM_SIGNUP_CIDRS`)
- Container runs as non-root from an empty (scratch) image

### HTTP API

All endpoints are JSON under `/api` unless noted. Errors are `{"error": "message"}`.

| Method | Path | Notes |
|---|---|---|
| GET | `/config` | `{signup_enabled, version, max_file_bytes, quota_bytes}` |
| POST | `/auth/signup` | `{email, password, password_confirm, display_name}` → user + session cookie |
| POST | `/auth/login` | `{email, password}` → user + session cookie |
| POST | `/auth/logout` | |
| GET | `/me` | current user |
| GET | `/photos` | `{photos: [{id, caption, mime, width, height, size, sha256, created_at, updated_at}], used_bytes, quota_bytes, max_file_bytes}`, newest first |
| POST | `/photos?caption=` | raw `image/*` body + `X-Requested-With` → 201 photo |
| GET / PATCH / DELETE | `/photos/:id` | metadata / caption `{caption}` / delete |
| GET | `/photos/:id/image` | the image bytes (cacheable, immutable) |
| GET | `/healthz`, `/readyz` | liveness / readiness (outside `/api`) |
