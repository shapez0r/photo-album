// Package imgmeta holds the small, pure helpers the server needs around
// photos: format detection of uploaded bytes and caption clean-up. Resizing
// happens in the browser, so the server never re-encodes images.
package imgmeta

import (
	"bytes"
	"errors"
	"image"
	_ "image/gif" // register decoders for DecodeConfig
	_ "image/jpeg"
	_ "image/png"
	"strings"
	"unicode"
	"unicode/utf8"
)

// ErrNotImage is returned when the bytes are not a supported image.
var ErrNotImage = errors.New("the file is not a JPEG, PNG or GIF image")

// MaxCaptionRunes is the longest stored caption.
const MaxCaptionRunes = 500

// MaxPixels bounds width*height so a tiny file cannot claim a huge canvas.
const MaxPixels = 100_000_000

// Info describes an uploaded image.
type Info struct {
	Mime   string
	Width  int
	Height int
}

// Inspect reads only the image header and returns its type and dimensions.
func Inspect(b []byte) (Info, error) {
	cfg, format, err := image.DecodeConfig(bytes.NewReader(b))
	if err != nil || cfg.Width <= 0 || cfg.Height <= 0 {
		return Info{}, ErrNotImage
	}
	if int64(cfg.Width)*int64(cfg.Height) > MaxPixels {
		return Info{}, ErrNotImage
	}
	return Info{Mime: "image/" + format, Width: cfg.Width, Height: cfg.Height}, nil
}

// CleanCaption drops control characters (newlines become spaces), collapses
// whitespace and limits the caption to MaxCaptionRunes runes.
func CleanCaption(raw string) string {
	var b strings.Builder
	for _, r := range raw {
		switch {
		case r == utf8.RuneError:
			continue
		case unicode.IsSpace(r):
			b.WriteRune(' ')
		case unicode.IsControl(r):
			continue
		default:
			b.WriteRune(r)
		}
	}
	out := strings.Join(strings.Fields(b.String()), " ")
	if r := []rune(out); len(r) > MaxCaptionRunes {
		out = strings.TrimSpace(string(r[:MaxCaptionRunes]))
	}
	return out
}
