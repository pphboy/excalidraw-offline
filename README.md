# Excalidraw Offline

A desktop application for editing Excalidraw diagrams offline, built with Wails (Go + React + TypeScript).

<img width="600"  alt="image" src="https://github.com/user-attachments/assets/9baa9786-e129-4731-acc1-6bde4977a32d" />

<img width="600" alt="image" src="https://github.com/user-attachments/assets/0dc27452-8f93-4819-9d0a-79914b5b9607" />


## Features

- **Open Files**: Open existing `.excalidraw` files with JSON format validation
- **Create Files**: Create new Excalidraw diagrams with automatic `.excalidraw` extension
- **Tab Interface**: Multi-tab support similar to VSCode for working with multiple files
- **Auto-Save**: Automatically saves changes (enabled by default, 800ms debounce)
- **Manual Save**: Save with Ctrl+S keyboard shortcut
- **Recent Files**: Quick access to recently opened files, stored in localStorage
- **Backup**: Automatically creates backups when opening files, keeps last 10 versions

## Usage

### Buttons

- **Open File**: Open an existing `.excalidraw` file
- **NewFile**: Create a new file (prompts for filename, `.excalidraw` extension is added automatically)
- **Save**: Manual save (or use Ctrl+S)
- **Recents**: View and open recent files
- **AutoSave**: Toggle auto-save on/off

### Keyboard Shortcuts

- `Ctrl+S`: Save current file

### Auto-Save Behavior

- When enabled, changes are automatically saved 800ms after you stop editing
- Tab closing also triggers an auto-save
- Last save time and method (auto/manual) are displayed in the toolbar

## Development

### Prerequisites

- Go
- Node.js
- Wails CLI

### Commands

```bash
# Install dependencies
wails dev

# Build for production
wails build
```

## Tech Stack

- **Frontend**: React + TypeScript + Excalidraw
- **Backend**: Go (Wails)
- **Build**: Wails + Vite

## Backup Feature

When you open an Excalidraw file, the application automatically creates a backup in a zip file located in the same directory as the original file.

### Backup File Details

- **Location**: Same directory as the original file
- **Filename**: `${original_filename}.bak.zip`
- **Backup Entry Format**: `original_filename.YYYY-MM-DD_HH-MM-SS.excalidraw.bak`

### Backup Management

- Each time a file is opened, a new backup entry is added to the zip file
- The zip file keeps only the last 10 backup entries
- Older backups are automatically removed when the limit is exceeded
- Backup failures are logged as warnings and do not prevent file opening
