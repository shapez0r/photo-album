// Package store is the data-access layer. All SQL lives here and is written
// to run unchanged on both SQLite and MariaDB/MySQL.
package store

import (
	"context"
	"database/sql"
	"errors"
	"strings"
	"time"

	"photoalbum/internal/db"
)

var (
	ErrNotFound = errors.New("not found")
	ErrConflict = errors.New("already exists")
)

type User struct {
	ID           string `json:"id"`
	Email        string `json:"email"`
	DisplayName  string `json:"display_name"`
	PasswordHash string `json:"-"`
	CreatedAt    int64  `json:"created_at"`
}

// Photo is one picture in a user's album (metadata only; the bytes are read
// separately so that listing never loads image contents).
type Photo struct {
	ID        string `json:"id"`
	Caption   string `json:"caption"`
	Mime      string `json:"mime"`
	Width     int    `json:"width"`
	Height    int    `json:"height"`
	Size      int64  `json:"size"`
	SHA256    string `json:"sha256"`
	CreatedAt int64  `json:"created_at"`
	UpdatedAt int64  `json:"updated_at"`
}

type Store struct {
	db *db.DB
}

func New(d *db.DB) *Store { return &Store{db: d} }

func isDuplicate(err error) bool {
	if err == nil {
		return false
	}
	msg := err.Error()
	return strings.Contains(msg, "UNIQUE constraint failed") || // SQLite
		strings.Contains(msg, "Duplicate entry") || // MariaDB / MySQL (1062)
		strings.Contains(msg, "constraint failed: PRIMARY KEY")
}

func nullable(s string) sql.NullString {
	return sql.NullString{String: s, Valid: s != ""}
}

// ---------- users ----------

func (s *Store) CreateUser(ctx context.Context, u *User) error {
	_, err := s.db.ExecContext(ctx,
		`INSERT INTO users (id, email, display_name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)`,
		u.ID, u.Email, u.DisplayName, nullable(u.PasswordHash), u.CreatedAt)
	if isDuplicate(err) {
		return ErrConflict
	}
	return err
}

func (s *Store) scanUser(row *sql.Row) (*User, error) {
	var u User
	var pw sql.NullString
	err := row.Scan(&u.ID, &u.Email, &u.DisplayName, &pw, &u.CreatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	u.PasswordHash = pw.String
	return &u, nil
}

func (s *Store) UserByEmail(ctx context.Context, email string) (*User, error) {
	return s.scanUser(s.db.QueryRowContext(ctx,
		`SELECT id, email, display_name, password_hash, created_at FROM users WHERE email = ?`, email))
}

func (s *Store) UserByID(ctx context.Context, id string) (*User, error) {
	return s.scanUser(s.db.QueryRowContext(ctx,
		`SELECT id, email, display_name, password_hash, created_at FROM users WHERE id = ?`, id))
}

// ResetAll erases every account together with its sessions, linked
// identities and photos. The schema itself is kept.
func (s *Store) ResetAll(ctx context.Context) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	for _, table := range []string{"photos", "sessions", "auth_identities", "users"} {
		if _, err := tx.ExecContext(ctx, `DELETE FROM `+table); err != nil {
			return err
		}
	}
	return tx.Commit()
}

// ---------- sessions ----------

func (s *Store) CreateSession(ctx context.Context, tokenHash, userID string, expires time.Time) error {
	_, err := s.db.ExecContext(ctx,
		`INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)`,
		tokenHash, userID, expires.Unix(), time.Now().Unix())
	return err
}

// SessionUser returns the user that owns a valid (non-expired) session and the expiry time.
func (s *Store) SessionUser(ctx context.Context, tokenHash string) (*User, time.Time, error) {
	var u User
	var pw sql.NullString
	var exp int64
	err := s.db.QueryRowContext(ctx,
		`SELECT u.id, u.email, u.display_name, u.password_hash, u.created_at, s.expires_at
		   FROM sessions s JOIN users u ON u.id = s.user_id
		  WHERE s.token_hash = ? AND s.expires_at > ?`, tokenHash, time.Now().Unix()).
		Scan(&u.ID, &u.Email, &u.DisplayName, &pw, &u.CreatedAt, &exp)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, time.Time{}, ErrNotFound
	}
	if err != nil {
		return nil, time.Time{}, err
	}
	u.PasswordHash = pw.String
	return &u, time.Unix(exp, 0), nil
}

func (s *Store) DeleteSession(ctx context.Context, tokenHash string) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM sessions WHERE token_hash = ?`, tokenHash)
	return err
}

func (s *Store) DeleteExpiredSessions(ctx context.Context) (int64, error) {
	res, err := s.db.ExecContext(ctx, `DELETE FROM sessions WHERE expires_at <= ?`, time.Now().Unix())
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}

// ---------- photos ----------

const photoCols = `id, caption, mime, width, height, size, sha256, created_at, updated_at`

func scanPhoto(sc interface{ Scan(...any) error }) (*Photo, error) {
	var p Photo
	if err := sc.Scan(&p.ID, &p.Caption, &p.Mime, &p.Width, &p.Height, &p.Size, &p.SHA256, &p.CreatedAt, &p.UpdatedAt); err != nil {
		return nil, err
	}
	return &p, nil
}

// ListPhotos returns the user's photos, newest first.
func (s *Store) ListPhotos(ctx context.Context, ownerID string) ([]Photo, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT `+photoCols+` FROM photos WHERE owner_id = ? ORDER BY created_at DESC, id`, ownerID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Photo{}
	for rows.Next() {
		p, err := scanPhoto(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *p)
	}
	return out, rows.Err()
}

// Photo returns the metadata of one of the user's photos.
func (s *Store) Photo(ctx context.Context, ownerID, id string) (*Photo, error) {
	p, err := scanPhoto(s.db.QueryRowContext(ctx,
		`SELECT `+photoCols+` FROM photos WHERE id = ? AND owner_id = ?`, id, ownerID))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	return p, err
}

// PhotoContent returns the metadata and the image bytes of one of the user's photos.
func (s *Store) PhotoContent(ctx context.Context, ownerID, id string) (*Photo, []byte, error) {
	var p Photo
	var content []byte
	err := s.db.QueryRowContext(ctx,
		`SELECT `+photoCols+`, content FROM photos WHERE id = ? AND owner_id = ?`, id, ownerID).
		Scan(&p.ID, &p.Caption, &p.Mime, &p.Width, &p.Height, &p.Size, &p.SHA256, &p.CreatedAt, &p.UpdatedAt, &content)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil, ErrNotFound
	}
	if err != nil {
		return nil, nil, err
	}
	return &p, content, nil
}

// UsedBytes is the total size of the user's photos.
func (s *Store) UsedBytes(ctx context.Context, ownerID string) (int64, error) {
	var used sql.NullInt64
	err := s.db.QueryRowContext(ctx,
		`SELECT SUM(size) FROM photos WHERE owner_id = ?`, ownerID).Scan(&used)
	return used.Int64, err
}

func (s *Store) CreatePhoto(ctx context.Context, ownerID string, p *Photo, content []byte) error {
	_, err := s.db.ExecContext(ctx,
		`INSERT INTO photos (id, owner_id, caption, mime, width, height, size, sha256, content, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		p.ID, ownerID, p.Caption, p.Mime, p.Width, p.Height, p.Size, p.SHA256, content, p.CreatedAt, p.UpdatedAt)
	if isDuplicate(err) {
		return ErrConflict
	}
	return err
}

func (s *Store) SetCaption(ctx context.Context, ownerID, id, caption string, updatedAt int64) error {
	res, err := s.db.ExecContext(ctx,
		`UPDATE photos SET caption = ?, updated_at = ? WHERE id = ? AND owner_id = ?`,
		caption, updatedAt, id, ownerID)
	if err != nil {
		return err
	}
	return s.mustExist(ctx, res, ownerID, id)
}

func (s *Store) DeletePhoto(ctx context.Context, ownerID, id string) error {
	res, err := s.db.ExecContext(ctx, `DELETE FROM photos WHERE id = ? AND owner_id = ?`, id, ownerID)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}

// mustExist turns "0 rows affected" into ErrNotFound. MariaDB reports 0
// affected rows when nothing changed, so existence is double-checked.
func (s *Store) mustExist(ctx context.Context, res sql.Result, ownerID, id string) error {
	if n, _ := res.RowsAffected(); n > 0 {
		return nil
	}
	var c int
	if err := s.db.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM photos WHERE id = ? AND owner_id = ?`, id, ownerID).Scan(&c); err != nil {
		return err
	}
	if c == 0 {
		return ErrNotFound
	}
	return nil
}
