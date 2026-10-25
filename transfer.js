const storageKey = "loca5notes.notes.v1";
const backupFormat = "loca5notes-backup";
const backupVersion = 1;
const maxImageBytes = 500 * 1024;
const maxBackupBytes = 25 * 1024 * 1024;
const allowedColors = new Set(["cream", "sage", "rose", "sky", "lavender"]);

const elements = {
  exportButton: document.querySelector("#exportButton"),
  chooseBackupButton: document.querySelector("#chooseBackupButton"),
  backupFile: document.querySelector("#backupFile"),
  importPreview: document.querySelector("#importPreview"),
  importFileName: document.querySelector("#importFileName"),
  importDetails: document.querySelector("#importDetails"),
  importButton: document.querySelector("#importButton"),
  noteSummary: document.querySelector("#noteSummary"),
  notice: document.querySelector("#transferNotice")
};

let currentNotes = [];
let pendingBackup = null;
const isTauri = "__TAURI_INTERNALS__" in window;
let desktopModulesPromise;

function getDesktopModules() {
  desktopModulesPromise ??= Promise.all([
    import("@tauri-apps/plugin-dialog"),
    import("@tauri-apps/plugin-fs")
  ]).then(([dialog, fs]) => ({ dialog, fs }));
  return desktopModulesPromise;
}

function readNotes() {
  const stored = window.localStorage.getItem(storageKey);
  if (!stored) return [];
  const parsed = JSON.parse(stored);
  if (!Array.isArray(parsed)) throw new Error("Saved notes are not in a readable format.");
  return parsed;
}

function showNotice(message, kind = "success") {
  elements.notice.textContent = message;
  elements.notice.dataset.kind = kind;
  elements.notice.hidden = false;
}

function hideNotice() {
  elements.notice.textContent = "";
  elements.notice.hidden = true;
}

function getImageCount(notes) {
  return notes.reduce((count, note) => count + (Array.isArray(note.images) ? note.images.length : 0), 0);
}

function renderSummary() {
  const imageCount = getImageCount(currentNotes);
  const noteLabel = `${currentNotes.length} ${currentNotes.length === 1 ? "note" : "notes"}`;
  const imageLabel = `${imageCount} ${imageCount === 1 ? "image" : "images"}`;
  elements.noteSummary.textContent = `${noteLabel} saved on this device · ${imageLabel} included`;
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} bytes`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

async function downloadBackup() {
  hideNotice();
  try {
    currentNotes = readNotes();
    renderSummary();
    const backup = {
      format: backupFormat,
      version: backupVersion,
      exportedAt: new Date().toISOString(),
      notes: currentNotes
    };
    const date = new Date().toISOString().slice(0, 10);
    const filename = `loca5notes-backup-${date}.json`;
    const contents = JSON.stringify(backup, null, 2);
    if (isTauri) {
      const { dialog, fs } = await getDesktopModules();
      const path = await dialog.save({
        defaultPath: filename,
        filters: [{ name: "Loca5 Notes backup", extensions: ["json"] }]
      });
      if (!path) return;
      await fs.writeTextFile(path, contents);
    } else {
      const blob = new Blob([contents], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    showNotice(`Backup downloaded with ${currentNotes.length} ${currentNotes.length === 1 ? "note" : "notes"} and ${getImageCount(currentNotes)} ${getImageCount(currentNotes) === 1 ? "image" : "images"}.`);
  } catch (error) {
    showNotice(`Could not create a backup. ${error.message}`, "error");
  }
}

function estimateDataUrlBytes(dataUrl) {
  const match = /^data:image\/(?:webp|png|jpeg|gif);base64,([A-Za-z0-9+/]*={0,2})$/i.exec(dataUrl);
  if (!match) throw new Error("An image attachment is not a supported base64 image.");
  const base64 = match[1];
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.floor(base64.length * 3 / 4) - padding;
}

function validateNote(note, index) {
  if (!note || typeof note !== "object" || Array.isArray(note)) {
    throw new Error(`Note ${index + 1} is not a valid note.`);
  }
  if (typeof note.id !== "string" || !note.id.trim() ||
      typeof note.title !== "string" || typeof note.content !== "string" ||
      typeof note.updatedAt !== "string" || Number.isNaN(Date.parse(note.updatedAt))) {
    throw new Error(`Note ${index + 1} is missing required note data.`);
  }

  const images = note.images ?? [];
  if (!Array.isArray(images)) throw new Error(`Images on note ${index + 1} are not valid.`);
  const validatedImages = images.map((image, imageIndex) => {
    if (!image || typeof image !== "object" || typeof image.dataUrl !== "string") {
      throw new Error(`Image ${imageIndex + 1} on note ${index + 1} is not valid.`);
    }
    const size = estimateDataUrlBytes(image.dataUrl);
    if (size > maxImageBytes) {
      throw new Error(`Image ${imageIndex + 1} on note ${index + 1} exceeds the 500 KB image limit.`);
    }
    return {
      id: typeof image.id === "string" ? image.id : `${note.id}-image-${imageIndex + 1}`,
      name: typeof image.name === "string" ? image.name : "Note image",
      dataUrl: image.dataUrl,
      size
    };
  });

  return {
    ...note,
    id: note.id,
    title: note.title,
    content: note.content,
    label: typeof note.label === "string" ? note.label : "",
    color: allowedColors.has(note.color) ? note.color : "cream",
    pinned: note.pinned === true,
    order: Number.isFinite(note.order) ? note.order : index,
    createdAt: typeof note.createdAt === "string" ? note.createdAt : note.updatedAt,
    updatedAt: note.updatedAt,
    images: validatedImages
  };
}

async function parseBackup(file) {
  if (file.size > maxBackupBytes) {
    throw new Error("This backup is larger than the 25 MB import limit.");
  }
  let backup;
  try {
    backup = JSON.parse(await file.text());
  } catch {
    throw new Error("This file is not valid JSON. Choose a Loca5 Notes backup file.");
  }
  if (!backup || backup.format !== backupFormat || backup.version !== backupVersion || !Array.isArray(backup.notes)) {
    throw new Error("This backup format is not supported. Choose a backup exported from Loca5 Notes.");
  }

  const ids = new Set();
  const notes = backup.notes.map((note, index) => {
    const validated = validateNote(note, index);
    if (ids.has(validated.id)) throw new Error("This backup contains duplicate note IDs.");
    ids.add(validated.id);
    return validated;
  });
  return { notes, exportedAt: backup.exportedAt };
}

function resetPendingBackup() {
  pendingBackup = null;
  elements.backupFile.value = "";
  elements.importPreview.hidden = true;
}

async function prepareBackup(file) {
  hideNotice();
  resetPendingBackup();
  if (!file) return;
  elements.importFileName.textContent = file.name;
  elements.importDetails.textContent = "Checking backup…";
  elements.importPreview.hidden = false;
  elements.importButton.disabled = true;
  try {
    pendingBackup = await parseBackup(file);
    const images = getImageCount(pendingBackup.notes);
    elements.importDetails.textContent = `${pendingBackup.notes.length} ${pendingBackup.notes.length === 1 ? "note" : "notes"} · ${images} ${images === 1 ? "image" : "images"} · ${formatBytes(file.size)}`;
    elements.importButton.disabled = false;
  } catch (error) {
    resetPendingBackup();
    showNotice(error.message, "error");
  }
}

async function chooseBackup() {
  hideNotice();
  if (!isTauri) {
    elements.backupFile.click();
    return;
  }
  try {
    const { dialog, fs } = await getDesktopModules();
    const path = await dialog.open({
      multiple: false,
      directory: false,
      filters: [{ name: "Loca5 Notes backup", extensions: ["json"] }]
    });
    if (typeof path !== "string") return;
    const contents = await fs.readTextFile(path);
    const size = new TextEncoder().encode(contents).byteLength;
    const name = path.split(/[\\/]/).pop() || "Loca5 Notes backup.json";
    await prepareBackup({
      name,
      size,
      text: async () => contents
    });
  } catch (error) {
    showNotice(`Could not open this backup. ${error.message}`, "error");
  }
}

function applyImport() {
  if (!pendingBackup) return;
  hideNotice();
  const mode = document.querySelector('input[name="importMode"]:checked')?.value ?? "merge";
  let nextNotes;
  if (mode === "replace") {
    const confirmed = window.confirm("Replace all notes on this device with the notes in this backup? This cannot be undone.");
    if (!confirmed) return;
    nextNotes = pendingBackup.notes;
  } else {
    const merged = new Map(currentNotes.map((note) => [note.id, note]));
    pendingBackup.notes.forEach((note) => merged.set(note.id, note));
    nextNotes = [...merged.values()];
  }

  try {
    window.localStorage.setItem(storageKey, JSON.stringify(nextNotes));
    const importedCount = pendingBackup.notes.length;
    const importedImages = getImageCount(pendingBackup.notes);
    currentNotes = nextNotes;
    renderSummary();
    resetPendingBackup();
    showNotice(`${mode === "replace" ? "Replaced notes with" : "Imported"} ${importedCount} ${importedCount === 1 ? "note" : "notes"} and ${importedImages} ${importedImages === 1 ? "image" : "images"}.`);
  } catch (error) {
    const message = error?.name === "QuotaExceededError"
      ? "There is not enough browser storage for these notes. Try merging fewer notes or removing large images."
      : error.message;
    showNotice(`Could not import this backup. ${message}`, "error");
  }
}

elements.exportButton.addEventListener("click", downloadBackup);
elements.chooseBackupButton.addEventListener("click", chooseBackup);
elements.backupFile.addEventListener("change", () => prepareBackup(elements.backupFile.files[0]));
elements.importButton.addEventListener("click", applyImport);

try {
  currentNotes = readNotes();
  renderSummary();
} catch (error) {
  elements.noteSummary.textContent = "Could not read notes saved on this device.";
  showNotice(error.message, "error");
}
