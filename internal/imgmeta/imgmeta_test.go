package imgmeta

import (
	"bytes"
	"image"
	"image/color"
	"image/jpeg"
	"image/png"
	"strings"
	"testing"
)

func encode(t *testing.T, format string, w, h int) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, w, h))
	img.Set(0, 0, color.RGBA{200, 120, 140, 255})
	var buf bytes.Buffer
	var err error
	if format == "png" {
		err = png.Encode(&buf, img)
	} else {
		err = jpeg.Encode(&buf, img, nil)
	}
	if err != nil {
		t.Fatal(err)
	}
	return buf.Bytes()
}

func TestInspect(t *testing.T) {
	for _, tc := range []struct {
		format, mime string
	}{{"jpeg", "image/jpeg"}, {"png", "image/png"}} {
		info, err := Inspect(encode(t, tc.format, 30, 20))
		if err != nil {
			t.Fatalf("%s: %v", tc.format, err)
		}
		if info.Mime != tc.mime || info.Width != 30 || info.Height != 20 {
			t.Errorf("%s: got %+v", tc.format, info)
		}
	}
}

func TestInspectRejects(t *testing.T) {
	for _, b := range [][]byte{nil, []byte("hello"), []byte("%PDF-1.7\n%%EOF")} {
		if _, err := Inspect(b); err != ErrNotImage {
			t.Errorf("Inspect(%q) = %v, want ErrNotImage", b, err)
		}
	}
}

func TestCleanCaption(t *testing.T) {
	cases := map[string]string{
		"":                     "",
		"  sunny   morning  ":  "sunny morning",
		"line1\nline2\tend":    "line1 line2 end",
		"bell\x07 sound":       "bell sound",
		"кофе и круассан ☕":    "кофе и круассан ☕",
	}
	for in, want := range cases {
		if got := CleanCaption(in); got != want {
			t.Errorf("CleanCaption(%q) = %q, want %q", in, got, want)
		}
	}
	if got := CleanCaption(strings.Repeat("я", 600)); len([]rune(got)) != MaxCaptionRunes {
		t.Errorf("long caption: %d runes", len([]rune(got)))
	}
}
