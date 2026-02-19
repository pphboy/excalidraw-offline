package main

import (
	"archive/zip"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

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

	if err := a.addBackup(filePath, data); err != nil {
		fmt.Printf("Backup warning: %v\n", err)
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

func (a *App) addBackup(filePath string, data []byte) error {
	dir := filepath.Dir(filePath)
	filename := filepath.Base(filePath)
	ext := filepath.Ext(filename)
	baseName := strings.TrimSuffix(filename, ext)

	backupZipPath := filepath.Join(dir, baseName+".bak.zip")

	timestamp := time.Now().Format("2006-01-02_15-04-05")
	backupFileName := fmt.Sprintf("%s.%s.excalidraw.bak", baseName, timestamp)

	if _, err := os.Stat(backupZipPath); err == nil {
		existingFile, err := os.Open(backupZipPath)
		if err != nil {
			return err
		}

		fileInfo, err := existingFile.Stat()
		if err != nil {
			existingFile.Close()
			return err
		}

		zipReader, err := zip.NewReader(existingFile, fileInfo.Size())
		if err != nil {
			existingFile.Close()
			return err
		}

		entries := make([]string, 0, len(zipReader.File)+1)
		for _, f := range zipReader.File {
			entries = append(entries, f.Name)
		}
		existingFile.Close()

		sort.Strings(entries)

		if len(entries) >= 10 {
			entries = entries[len(entries)-9:]
		}

		reOpenFile, err := os.Open(backupZipPath)
		if err != nil {
			return err
		}

		zipReader2, err := zip.NewReader(reOpenFile, fileInfo.Size())
		if err != nil {
			reOpenFile.Close()
			return err
		}

		existingFilesMap := make(map[string][]byte)
		for _, f := range zipReader2.File {
			rc, err := f.Open()
			if err != nil {
				reOpenFile.Close()
				return err
			}
			content, err := io.ReadAll(rc)
			rc.Close()
			if err != nil {
				reOpenFile.Close()
				return err
			}
			existingFilesMap[f.Name] = content
		}
		reOpenFile.Close()

		zipFile, err := os.Create(backupZipPath)
		if err != nil {
			return err
		}
		defer zipFile.Close()

		zipWriter := zip.NewWriter(zipFile)
		defer zipWriter.Close()

		for _, name := range entries {
			if content, ok := existingFilesMap[name]; ok {
				w, err := zipWriter.Create(name)
				if err != nil {
					return err
				}
				if _, err := w.Write(content); err != nil {
					return err
				}
			}
		}

		w, err := zipWriter.Create(backupFileName)
		if err != nil {
			return err
		}
		if _, err := w.Write(data); err != nil {
			return err
		}

		if err := zipWriter.Close(); err != nil {
			return err
		}
	} else {
		zipFile, err := os.Create(backupZipPath)
		if err != nil {
			return err
		}
		defer zipFile.Close()

		zipWriter := zip.NewWriter(zipFile)
		defer zipWriter.Close()

		w, err := zipWriter.Create(backupFileName)
		if err != nil {
			return err
		}
		if _, err := w.Write(data); err != nil {
			return err
		}
	}

	return nil
}
