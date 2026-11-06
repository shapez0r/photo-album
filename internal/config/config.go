// Package config loads photoalbum runtime configuration from environment
// variables. Every setting has a sane default so the binary runs with zero
// configuration on a laptop or home-lab machine.
package config

import (
	"fmt"
	"net"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"
)

// DefaultAddr is the listen address when PHOTOALBUM_ADDR is not set.
const DefaultAddr = ":8092"

// DefaultModel is the model name shown on the album home screen when
// PHOTOALBUM_MODEL is not set.
const DefaultModel = "Claude Sonnet 5.5"

type Config struct {
	// Addr is the listen address, e.g. ":8092" (all interfaces, reachable from the LAN).
	Addr string
	// DataDir holds the SQLite database when the sqlite driver is used.
	DataDir string
	// DBDriver is "sqlite" (default, single node) or "mysql"/"mariadb" (shared, multi-node).
	DBDriver string
	// DBDSN is the driver-specific data source name.
	DBDSN string
	// CacheURL is "memory" (in-process) or a redis:// / rediss:// URL pointing at Valkey or Redis.
	CacheURL string
	// SessionTTL is how long a login session stays valid.
	SessionTTL time.Duration
	// CookieSecure marks the session cookie Secure. Enable when serving over HTTPS.
	CookieSecure bool
	// AllowSignup enables self-service account creation.
	AllowSignup bool
	// SignupCIDRs optionally restricts sign-up to clients from these networks
	// (e.g. your home LAN). Empty means any address may sign up.
	SignupCIDRs []*net.IPNet
	// ProxyHeader is the header carrying the real client IP when running
	// behind a trusted reverse proxy (e.g. "X-Forwarded-For"). Empty = use the socket address.
	ProxyHeader string
	// LogRequests enables per-request access logging.
	LogRequests bool
	// MaxFileBytes is the largest photo that can be uploaded.
	MaxFileBytes int64
	// QuotaBytes is the total size of the album per user (0 = unlimited).
	QuotaBytes int64
	// Model is the model name shown on the album home screen.
	Model string
}

func Load() (*Config, error) {
	c := &Config{
		Addr:        env("PHOTOALBUM_ADDR", DefaultAddr),
		DataDir:     env("PHOTOALBUM_DATA_DIR", "./data"),
		DBDriver:    strings.ToLower(env("PHOTOALBUM_DB_DRIVER", "sqlite")),
		CacheURL:    env("PHOTOALBUM_CACHE_URL", "memory"),
		ProxyHeader: env("PHOTOALBUM_PROXY_HEADER", ""),
		Model:       env("PHOTOALBUM_MODEL", DefaultModel),
	}
	var err error
	if c.SessionTTL, err = time.ParseDuration(env("PHOTOALBUM_SESSION_TTL", "720h")); err != nil {
		return nil, fmt.Errorf("PHOTOALBUM_SESSION_TTL: %w", err)
	}
	if c.CookieSecure, err = envBool("PHOTOALBUM_COOKIE_SECURE", false); err != nil {
		return nil, err
	}
	if c.AllowSignup, err = envBool("PHOTOALBUM_ALLOW_SIGNUP", true); err != nil {
		return nil, err
	}
	if c.LogRequests, err = envBool("PHOTOALBUM_LOG_REQUESTS", true); err != nil {
		return nil, err
	}
	maxMB, err := envInt("PHOTOALBUM_MAX_FILE_MB", 15)
	if err != nil {
		return nil, err
	}
	if maxMB < 1 || maxMB > 1024 {
		return nil, fmt.Errorf("PHOTOALBUM_MAX_FILE_MB must be between 1 and 1024")
	}
	c.MaxFileBytes = int64(maxMB) << 20
	quotaMB, err := envInt("PHOTOALBUM_QUOTA_MB", 2048)
	if err != nil {
		return nil, err
	}
	if quotaMB < 0 {
		return nil, fmt.Errorf("PHOTOALBUM_QUOTA_MB must not be negative")
	}
	c.QuotaBytes = int64(quotaMB) << 20
	for _, raw := range strings.Split(env("PHOTOALBUM_SIGNUP_CIDRS", ""), ",") {
		raw = strings.TrimSpace(raw)
		if raw == "" {
			continue
		}
		_, n, err := net.ParseCIDR(raw)
		if err != nil {
			return nil, fmt.Errorf("PHOTOALBUM_SIGNUP_CIDRS: %w", err)
		}
		c.SignupCIDRs = append(c.SignupCIDRs, n)
	}

	c.DBDSN = env("PHOTOALBUM_DB_DSN", "")
	switch c.DBDriver {
	case "sqlite", "sqlite3":
		c.DBDriver = "sqlite"
		if c.DBDSN == "" {
			c.DBDSN = "file:" + filepath.Join(c.DataDir, "photoalbum.db")
		}
	case "mysql", "mariadb":
		c.DBDriver = "mysql"
		if c.DBDSN == "" {
			return nil, fmt.Errorf("PHOTOALBUM_DB_DSN is required for the %s driver", c.DBDriver)
		}
	default:
		return nil, fmt.Errorf("PHOTOALBUM_DB_DRIVER: unsupported driver %q (use sqlite or mariadb)", c.DBDriver)
	}
	if utf8.RuneCountInString(c.Model) > 100 {
		return nil, fmt.Errorf("PHOTOALBUM_MODEL must be at most 100 characters")
	}
	if c.SessionTTL < time.Hour {
		return nil, fmt.Errorf("PHOTOALBUM_SESSION_TTL must be at least 1h")
	}
	return c, nil
}

// SignupAllowedFrom reports whether a client IP may create an account.
func (c *Config) SignupAllowedFrom(ip string) bool {
	if !c.AllowSignup {
		return false
	}
	if len(c.SignupCIDRs) == 0 {
		return true
	}
	parsed := net.ParseIP(strings.TrimSpace(ip))
	if parsed == nil {
		return false
	}
	for _, n := range c.SignupCIDRs {
		if n.Contains(parsed) {
			return true
		}
	}
	return false
}

func env(key, def string) string {
	if v, ok := os.LookupEnv(key); ok && strings.TrimSpace(v) != "" {
		return strings.TrimSpace(v)
	}
	return def
}

func envBool(key string, def bool) (bool, error) {
	v := env(key, "")
	if v == "" {
		return def, nil
	}
	b, err := strconv.ParseBool(v)
	if err != nil {
		return false, fmt.Errorf("%s: %w", key, err)
	}
	return b, nil
}

func envInt(key string, def int) (int, error) {
	v := env(key, "")
	if v == "" {
		return def, nil
	}
	n, err := strconv.Atoi(v)
	if err != nil {
		return 0, fmt.Errorf("%s: %w", key, err)
	}
	return n, nil
}
