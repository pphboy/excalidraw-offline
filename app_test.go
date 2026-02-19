package main

import (
	"archive/zip"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestAddBackup(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "backup_test")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	app := &App{}

	testFile := filepath.Join(tmpDir, "test.excalidraw")
	testData := `{"test": "data"}`
	if err := os.WriteFile(testFile, []byte(testData), 0644); err != nil {
		t.Fatalf("Failed to create test file: %v", err)
	}

	if err := app.addBackup(testFile, []byte(testData)); err != nil {
		t.Fatalf("addBackup failed: %v", err)
	}

	backupZipPath := filepath.Join(tmpDir, "test.bak.zip")
	if _, err := os.Stat(backupZipPath); os.IsNotExist(err) {
		t.Fatal("Backup zip file was not created")
	}

	zipReader, err := zip.OpenReader(backupZipPath)
	if err != nil {
		t.Fatalf("Failed to open zip: %v", err)
	}
	defer zipReader.Close()

	if len(zipReader.File) != 1 {
		t.Errorf("Expected 1 file in zip, got %d", len(zipReader.File))
	}

	if !strings.HasSuffix(zipReader.File[0].Name, ".excalidraw.bak") {
		t.Errorf("Backup file name should end with .excalidraw.bak, got %s", zipReader.File[0].Name)
	}

	rc, err := zipReader.File[0].Open()
	if err != nil {
		t.Fatalf("Failed to open backup file: %v", err)
	}
	defer rc.Close()

	content, err := io.ReadAll(rc)
	if err != nil {
		t.Fatalf("Failed to read backup content: %v", err)
	}

	if string(content) != testData {
		t.Errorf("Backup content mismatch: expected %s, got %s", testData, string(content))
	}
}

func TestAddBackupMultipleTimes(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "backup_test")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	app := &App{}

	testFile := filepath.Join(tmpDir, "test.excalidraw")
	testData := `{"test": "data"}`

	backupZipPath := filepath.Join(tmpDir, "test.bak.zip")

	for i := 0; i < 15; i++ {
		data := []byte(testData + string(rune(i+'0')))
		if err := app.addBackup(testFile, data); err != nil {
			t.Fatalf("addBackup %d failed: %v", i, err)
		}
		time.Sleep(10 * time.Millisecond)
	}

	zipReader, err := zip.OpenReader(backupZipPath)
	if err != nil {
		t.Fatalf("Failed to open zip: %v", err)
	}
	defer zipReader.Close()

	if len(zipReader.File) != 10 {
		t.Errorf("Expected 10 files in zip (should keep only 10), got %d", len(zipReader.File))
	}
}

func TestAddBackupDifferentFiles(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "backup_test")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	app := &App{}

	testFile1 := filepath.Join(tmpDir, "test1.excalidraw")
	testFile2 := filepath.Join(tmpDir, "test2.excalidraw")

	testData1 := `{"file": "test1"}`
	testData2 := `{"file": "test2"}`

	if err := app.addBackup(testFile1, []byte(testData1)); err != nil {
		t.Fatalf("addBackup for test1 failed: %v", err)
	}

	if err := app.addBackup(testFile2, []byte(testData2)); err != nil {
		t.Fatalf("addBackup for test2 failed: %v", err)
	}

	backupZip1 := filepath.Join(tmpDir, "test1.bak.zip")
	backupZip2 := filepath.Join(tmpDir, "test2.bak.zip")

	if _, err := os.Stat(backupZip1); os.IsNotExist(err) {
		t.Fatal("Backup zip for test1 was not created")
	}

	if _, err := os.Stat(backupZip2); os.IsNotExist(err) {
		t.Fatal("Backup zip for test2 was not created")
	}

	zipReader1, err := zip.OpenReader(backupZip1)
	if err != nil {
		t.Fatalf("Failed to open zip1: %v", err)
	}
	defer zipReader1.Close()

	if len(zipReader1.File) != 1 {
		t.Errorf("Expected 1 file in zip1, got %d", len(zipReader1.File))
	}

	zipReader2, err := zip.OpenReader(backupZip2)
	if err != nil {
		t.Fatalf("Failed to open zip2: %v", err)
	}
	defer zipReader2.Close()

	if len(zipReader2.File) != 1 {
		t.Errorf("Expected 1 file in zip2, got %d", len(zipReader2.File))
	}
}

func TestAddBackupPreservesContent(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "backup_test")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	app := &App{}

	testFile := filepath.Join(tmpDir, "test.excalidraw")

	backupZipPath := filepath.Join(tmpDir, "test.bak.zip")

	data1 := `{"version": 1}`
	data2 := `{"version": 2}`
	data3 := `{"version": 3}`

	if err := app.addBackup(testFile, []byte(data1)); err != nil {
		t.Fatalf("addBackup 1 failed: %v", err)
	}
	time.Sleep(10 * time.Millisecond)

	if err := app.addBackup(testFile, []byte(data2)); err != nil {
		t.Fatalf("addBackup 2 failed: %v", err)
	}
	time.Sleep(10 * time.Millisecond)

	if err := app.addBackup(testFile, []byte(data3)); err != nil {
		t.Fatalf("addBackup 3 failed: %v", err)
	}

	zipReader, err := zip.OpenReader(backupZipPath)
	if err != nil {
		t.Fatalf("Failed to open zip: %v", err)
	}
	defer zipReader.Close()

	if len(zipReader.File) != 3 {
		t.Errorf("Expected 3 files in zip, got %d", len(zipReader.File))
	}

	found := make(map[string]bool)
	for _, f := range zipReader.File {
		rc, err := f.Open()
		if err != nil {
			t.Fatalf("Failed to open %s: %v", f.Name, err)
		}
		content, _ := io.ReadAll(rc)
		rc.Close()

		found[string(content)] = true

		if string(content) != data1 && string(content) != data2 && string(content) != data3 {
			t.Errorf("Unexpected content: %s", string(content))
		}
	}

	if !found[data3] {
		t.Error("Latest backup (data3) should exist")
	}
}
