VERSION ?= $(shell git describe --tags --always 2>/dev/null || echo dev)
LDFLAGS := -s -w -X main.version=$(VERSION)
# Runtime data (SQLite database) lives outside the repository.
DATA_DIR ?= $(HOME)/.local/share/photoalbum

.PHONY: build run test tidy docker up scale down rootfs clean

tidy:
	go mod tidy

build: tidy
	CGO_ENABLED=0 go build -trimpath -ldflags="$(LDFLAGS)" -o bin/photoalbum ./cmd/photoalbum

run: build
	PHOTOALBUM_DATA_DIR="$(DATA_DIR)" ./bin/photoalbum serve

test: tidy
	go test ./...

docker:
	docker build --build-arg VERSION=$(VERSION) -t photoalbum:$(VERSION) -t photoalbum:latest .

up:
	docker compose up -d --build

scale:
	docker compose -f compose.scale.yaml up -d --build

down:
	docker compose down; docker compose -f compose.scale.yaml down

rootfs: build
	./deploy/microvm/build-rootfs.sh bin/photoalbum dist/photoalbum-rootfs.ext4

clean:
	rm -rf bin dist
