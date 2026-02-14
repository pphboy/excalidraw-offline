.PHONY: build

VERSION := 0.0.1

build:
	wails build -platform=linux/amd64 -o "excalidraw-offline-$(VERSION)" -clean
	wails build -platform=windows/amd64 -o "excalidraw-offline-$(VERSION).exe"
