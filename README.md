# photoalbum

**photoalbum** is a calm, self-hosted photo album for your home network. Take a
photo with your phone, add an optional caption, and it settles into a soft,
Pinterest-style pinboard. The album refreshes on its own, so a photo taken on
your phone shows up on the laptop or tablet a moment later, and **Live** turns
it into a slow, full-screen slideshow — like a digital photo frame.

It is one static Go binary (Fiber, SQLite/MariaDB, Valkey, vanilla JS UI
embedded with `go:embed`) and listens on port **8092**.

### Features

- 📷 **Take a photo** — in-app camera with front/back switch (on HTTPS or
  `localhost`); elsewhere the phone's own camera opens. Or pick from the gallery.
- ✎ Optional caption before adding; edit it or delete the photo later
- 🗂 Masonry pinboard, newest first, with gentle arrival animations
- ⟳ Live sync: the album reloads every 15 s and whenever the tab comes back into view
- ▶ **Live** slideshow: cross-fading photos with a slow drift, caption and date
- Photos are resized in the browser (longest side 2048 px, JPEG) before upload, with EXIF rotation applied
- 🎨 Themes: Blush, Sage, Oat milk, Dusk, Mocha or follow the system light/dark setting
- 🌐 English, Russian and Spanish UI (follows the device language)
- Private per-user albums with a storage quota
- The model in use is shown on the album home screen (`PHOTOALBUM_MODEL`)

Tip: add the page to the home screen (Share → Add to Home Screen) for a
full-screen app.

### Quick start

#### Option A — `make run` (Go 1.23+)

    make run

This builds `bin/photoalbum` and starts the server in the foreground on
`:8092`. The SQLite database is kept outside the repository in
`~/.local/share/photoalbum` (override with `make run DATA_DIR=/some/path`).
Open http://<ip-of-this-machine>:8092, click **Create account** and take your
first photo.

#### Option B — Docker

    cp .env.example .env        # optional: restrict sign-up to your LAN, etc.
    docker compose up -d --build

Data lives in the `photoalbum-data` volume (a single SQLite file).

#### Option C — systemd service

    make build
    sudo ./scripts/install.sh   # binary -> /usr/local/bin, data -> /var/lib/photoalbum

Find your machine's LAN address with `ip addr` (Linux), `ipconfig` (Windows)
or `ipconfig getifaddr en0` (macOS) and allow TCP 8092 in its firewall.

**About the camera:** browsers only allow the in-page camera on HTTPS or
`localhost`. Over plain HTTP on your LAN, **Take a photo** opens the phone's
camera app instead, which works just as well. Put the app behind an HTTPS
reverse proxy and set `PHOTOALBUM_COOKIE_SECURE=true` to get the in-app camera
everywhere.

### Updating

Your data is kept across updates and database migrations run automatically on
start. Back up the SQLite file first if you want to be safe, e.g.
`cp ~/.local/share/photoalbum/photoalbum.db ~/photoalbum.db.bak`.

- **make run** — stop the server (Ctrl+C) and run `make run` again
- **Docker** — `docker compose up -d --build`
- **Scaled-out stack** — `docker compose -f compose.scale.yaml up -d --build`
- **systemd** — `make build && sudo install -m 0755 bin/photoalbum /usr/local/bin/photoalbum && sudo systemctl restart photoalbum`
- **Kubernetes** — push a new image and `kubectl rollout restart deployment/photoalbum`

Check the running version with `./bin/photoalbum version` or
`http://<server>:8092/healthz`.

### Deployment options

| Target | How | Storage / cache |
|---|---|---|
| Laptop, home lab | `make run` or `docker compose up -d --build` | SQLite file + in-process cache |
| Any Linux VM / bare metal | `sudo ./scripts/install.sh` (systemd) | SQLite file + in-process cache |
| MicroVM (Firecracker, Cloud Hypervisor) | `make rootfs` → `dist/photoalbum-rootfs.ext4`, see `deploy/microvm/` | SQLite inside the rootfs (or MariaDB) |
| Scaled-out containers | `docker compose -f compose.scale.yaml up -d --build` | MariaDB + Valkey, nginx load balancer, 3 replicas |
| Kubernetes / cloud | `deploy/k8s/photoalbum.yaml` | Managed MariaDB/MySQL + Valkey/Redis |

The container image is built `FROM scratch`: only the binary and CA
certificates, running as a non-root user with a built-in `HEALTHCHECK`.

### Configuration

Everything is configured through environment variables; all are optional for
a single node. Keep real values (e.g. database passwords) in `.env` or
`/etc/photoalbum/photoalbum.env`, never in the repository.

| Variable | Default | Description |
|---|---|---|
| `PHOTOALBUM_ADDR` | `:8092` | Listen address (all interfaces → reachable from the LAN) |
| `PHOTOALBUM_DATA_DIR` | `./data` (`make run`: `~/.local/share/photoalbum`, container: `/data`) | Directory for the SQLite database |
| `PHOTOALBUM_DB_DRIVER` | `sqlite` | `sqlite` or `mariadb` (alias `mysql`) |
| `PHOTOALBUM_DB_DSN` | `file:<data dir>/photoalbum.db` | e.g. `user:pass@tcp(host:3306)/photoalbum?charset=utf8mb4` for MariaDB |
| `PHOTOALBUM_CACHE_URL` | `memory` | `memory` or `redis://host:6379/0` (Valkey or Redis) |
| `PHOTOALBUM_ALLOW_SIGNUP` | `true` | Allow self-service account creation |
| `PHOTOALBUM_SIGNUP_CIDRS` | *(empty = anyone)* | Comma-separated networks allowed to sign up |
| `PHOTOALBUM_SESSION_TTL` | `720h` | Login session lifetime |
| `PHOTOALBUM_COOKIE_SECURE` | `false` | Set `true` when served over HTTPS |
| `PHOTOALBUM_PROXY_HEADER` | *(empty)* | Client-IP header behind a trusted reverse proxy, e.g. `X-Forwarded-For` |
| `PHOTOALBUM_LOG_REQUESTS` | `true` | Access log on stdout |
| `PHOTOALBUM_MAX_FILE_MB` | `15` | Largest photo upload (1–1024) |
| `PHOTOALBUM_QUOTA_MB` | `2048` | Album size per user (`0` = unlimited) |
| `PHOTOALBUM_MODEL` | `Claude Sonnet 5.5 by Anthropic` | Model name shown on the album home screen |

With MariaDB, `max_allowed_packet` must be larger than `PHOTOALBUM_MAX_FILE_MB`
(`compose.scale.yaml` sets 256M). Behind nginx, keep `client_max_body_size`
above it (`deploy/nginx/nginx.conf` uses 32m).

### Commands

    photoalbum serve        # default: migrate the database and start the server
    photoalbum migrate      # only apply database migrations, then exit
    photoalbum reset --yes  # erase ALL users, sessions and photos (keeps the schema)
    photoalbum healthcheck  # exit 0 if the local server answers /healthz
    photoalbum version

Run `reset` with the server stopped and the same environment the server uses,
e.g. `PHOTOALBUM_DATA_DIR=~/.local/share/photoalbum ./bin/photoalbum reset --yes`.

### Development

    make run      # build and start on :8092
    make test     # unit tests

The web UI is plain HTML/CSS/JavaScript in `web/static/` (no build step) and
is embedded into the binary. Rebuild after editing it. See
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the design and the API.

### License

MIT — see [LICENSE](LICENSE).
