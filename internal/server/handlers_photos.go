package server

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"time"

	"github.com/gofiber/fiber/v2"

	"photoalbum/internal/auth"
	"photoalbum/internal/imgmeta"
	"photoalbum/internal/store"
)

type photoList struct {
	Photos       []store.Photo `json:"photos"`
	UsedBytes    int64         `json:"used_bytes"`
	QuotaBytes   int64         `json:"quota_bytes"`
	MaxFileBytes int64         `json:"max_file_bytes"`
}

func (s *Server) listPhotos(c *fiber.Ctx) error {
	photos, err := s.store.ListPhotos(c.UserContext(), currentUser(c).ID)
	if err != nil {
		return err
	}
	var used int64
	for _, p := range photos {
		used += p.Size
	}
	return c.JSON(photoList{Photos: photos, UsedBytes: used, QuotaBytes: s.cfg.QuotaBytes, MaxFileBytes: s.cfg.MaxFileBytes})
}

func (s *Server) getPhoto(c *fiber.Ctx) error {
	p, err := s.store.Photo(c.UserContext(), currentUser(c).ID, c.Params("id"))
	if err != nil {
		return err
	}
	return c.JSON(p)
}

// createPhoto adds an uploaded image (raw image/* body) to the album. The
// caption is given as ?caption=.
func (s *Server) createPhoto(c *fiber.Ctx) error {
	user := currentUser(c)
	body := c.Body()
	if int64(len(body)) > s.cfg.MaxFileBytes {
		return fiber.NewError(fiber.StatusRequestEntityTooLarge,
			fmt.Sprintf("the photo is too large (max %d MB)", s.cfg.MaxFileBytes>>20))
	}
	info, err := imgmeta.Inspect(body)
	if err != nil {
		return badRequest(err.Error())
	}
	if s.cfg.QuotaBytes > 0 {
		used, err := s.store.UsedBytes(c.UserContext(), user.ID)
		if err != nil {
			return err
		}
		if used+int64(len(body)) > s.cfg.QuotaBytes {
			return fiber.NewError(fiber.StatusInsufficientStorage,
				fmt.Sprintf("the album is full (limit %d MB)", s.cfg.QuotaBytes>>20))
		}
	}
	// Fiber reuses the request buffer after the handler returns: keep a copy.
	content := make([]byte, len(body))
	copy(content, body)
	sum := sha256.Sum256(content)
	now := time.Now().Unix()
	p := &store.Photo{
		ID:        auth.NewID(),
		Caption:   imgmeta.CleanCaption(c.Query("caption")),
		Mime:      info.Mime,
		Width:     info.Width,
		Height:    info.Height,
		Size:      int64(len(content)),
		SHA256:    hex.EncodeToString(sum[:]),
		CreatedAt: now,
		UpdatedAt: now,
	}
	if err := s.store.CreatePhoto(c.UserContext(), user.ID, p, content); err != nil {
		return err
	}
	return c.Status(fiber.StatusCreated).JSON(p)
}

// photoImage serves the image bytes. Photos never change, so browsers may
// cache them for a long time.
func (s *Server) photoImage(c *fiber.Ctx) error {
	p, content, err := s.store.PhotoContent(c.UserContext(), currentUser(c).ID, c.Params("id"))
	if err != nil {
		return err
	}
	c.Set(fiber.HeaderContentType, p.Mime)
	c.Set(fiber.HeaderCacheControl, "private, max-age=31536000, immutable")
	c.Set(fiber.HeaderETag, `"`+p.SHA256+`"`)
	return c.Send(content)
}

func (s *Server) captionPhoto(c *fiber.Ctx) error {
	var in struct {
		Caption string `json:"caption"`
	}
	if err := c.BodyParser(&in); err != nil {
		return badRequest("invalid JSON body")
	}
	user := currentUser(c)
	if err := s.store.SetCaption(c.UserContext(), user.ID, c.Params("id"), imgmeta.CleanCaption(in.Caption), time.Now().Unix()); err != nil {
		return err
	}
	p, err := s.store.Photo(c.UserContext(), user.ID, c.Params("id"))
	if err != nil {
		return err
	}
	return c.JSON(p)
}

func (s *Server) deletePhoto(c *fiber.Ctx) error {
	if err := s.store.DeletePhoto(c.UserContext(), currentUser(c).ID, c.Params("id")); err != nil {
		return err
	}
	return c.SendStatus(fiber.StatusNoContent)
}
