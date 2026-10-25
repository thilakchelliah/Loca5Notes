# Loca5 Notes

A lightweight notes app that runs in a browser or as a native desktop app
powered by [Tauri 2](https://tauri.app/).

## Run in a browser

Open `index.html` in a modern browser. No installation, account, server, or
build step is needed for browser use.

## Run the desktop app

Install [Node.js](https://nodejs.org/) and [Rust](https://www.rust-lang.org/tools/install).
On Windows, also install the
[Microsoft C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)
and [WebView2](https://developer.microsoft.com/microsoft-edge/webview2/).

From the project directory:

```sh
npm install
npm run tauri:dev
```

Build a distributable desktop app with:

```sh
npm run tauri:build
```

Tauri writes platform-specific installers and bundles under
`src-tauri/target/release/bundle/`. Build on each target operating system to
create its native app package.

## Features

- Create, edit, search, pin, delete, and drag to reorder notes.
- Organize notes with labels and choose a note color.
- Attach images. Images are resized and compressed in your browser to WebP,
  with a maximum size of **500 KB per image**.
- Export all notes and attached images to a backup, or import a backup from
  another device. Imports can merge with existing notes or replace them.

## Storage and backups

Notes are saved in the current browser or desktop app's local storage. They
stay on that device and are not automatically synced across browsers or
devices. Browser storage and desktop-app storage are separate. To bring
existing browser notes into the desktop app, export a backup from the browser
and import it in the desktop app. Keep regular backups.

Use **Import & export** in the app to save or restore a JSON backup. In the
Tauri desktop app, backup import and export use native file dialogs. In a
browser, use the standard file picker and download.

To transfer notes using OneDrive, Google Drive, or Dropbox, download a backup,
upload the file to your own cloud account, and import it on the other device.
The app does not connect directly to cloud accounts. Replacing notes cannot
be undone.

## Keyboard shortcuts

- **N** — create a note
- **/** — focus search
