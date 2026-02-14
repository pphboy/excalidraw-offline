package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

type App struct {
	ctx context.Context
}

func NewApp() *App {
	return &App{}
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
}

func (a *App) ShowOpenFileDialog() (string, error) {
	filePath, err := runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "Open Excalidraw File",
		Filters: []runtime.FileFilter{
			{
				DisplayName: "Excalidraw Files (*.excalidraw)",
				Pattern:     "*.excalidraw",
			},
		},
	})
	if err != nil {
		return "", err
	}
	if filePath == "" {
		return "", fmt.Errorf("no file selected")
	}
	return filePath, nil
}

func (a *App) ShowSaveFileDialog(defaultName string) (string, error) {
	filePath, err := runtime.SaveFileDialog(a.ctx, runtime.SaveDialogOptions{
		Title:           "Save Excalidraw File",
		DefaultFilename: defaultName,
		Filters: []runtime.FileFilter{
			{
				DisplayName: "Excalidraw Files (*.excalidraw)",
				Pattern:     "*.excalidraw",
			},
		},
	})
	if err != nil {
		return "", err
	}
	if filePath == "" {
		return "", fmt.Errorf("no file selected")
	}
	return filePath, nil
}

func (a *App) OpenFile(filePath string) (string, error) {
	data, err := os.ReadFile(filePath)
	if err != nil {
		runtime.MessageDialog(a.ctx, runtime.MessageDialogOptions{
			Type:    runtime.ErrorDialog,
			Title:   "Error",
			Message: fmt.Sprintf("Failed to read file: %v", err),
		})
		return "", err
	}

	if !json.Valid(data) {
		runtime.MessageDialog(a.ctx, runtime.MessageDialogOptions{
			Type:    runtime.ErrorDialog,
			Title:   "Invalid JSON",
			Message: "The file does not contain valid JSON",
		})
		return "", fmt.Errorf("invalid JSON")
	}

	var jsonData map[string]interface{}
	if err := json.Unmarshal(data, &jsonData); err != nil {
		runtime.MessageDialog(a.ctx, runtime.MessageDialogOptions{
			Type:    runtime.ErrorDialog,
			Title:   "Invalid JSON",
			Message: fmt.Sprintf("Failed to parse JSON: %v", err),
		})
		return "", err
	}

	return string(data), nil
}

func (a *App) SaveFile(filePath string, content string) error {
	err := os.WriteFile(filePath, []byte(content), 0644)
	if err != nil {
		runtime.MessageDialog(a.ctx, runtime.MessageDialogOptions{
			Type:    runtime.ErrorDialog,
			Title:   "Error",
			Message: fmt.Sprintf("Failed to save file: %v", err),
		})
		return err
	}
	return nil
}
