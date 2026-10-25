const storageKey = "loca5notes.notes.v1";
const maxImageBytes = 500 * 1024;
const maxImageDimension = 1800;
const colors = ["cream", "sage", "rose", "sky", "lavender"];
const escapeSvg = (markup) => `<svg viewBox="0 0 24 24" aria-hidden="true">${markup}</svg>`;

const icons = {
  pin: escapeSvg('<path d="m16 3 5 5-4 1-4 4-1 5-2-2-5 5-2-2 5-5-2-2 5-1 4-4z"/>'),
  edit: escapeSvg('<path d="m14 5 5 5M4 20l4.2-.8L19 8.4a2.1 2.1 0 0 0-3-3L5.2 16.2 4 20z"/>'),
  trash: escapeSvg('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>')
};

const elements = {
  allCount: document.querySelector("#allCount"),
  breadcrumbTitle: document.querySelector("#breadcrumbTitle"),
  confirmDelete: document.querySelector("#confirmDelete"),
  confirmDialog: document.querySelector("#confirmDialog"),
  createNote: document.querySelector("#createNote"),
  createNoteTop: document.querySelector("#createNoteTop"),
  deleteNote: document.querySelector("#deleteNote"),
  dialogEyebrow: document.querySelector("#dialogEyebrow"),
  dialogTitle: document.querySelector("#dialogTitle"),
  emptyCreate: document.querySelector("#emptyCreate"),
  emptyButtonText: document.querySelector("#emptyButtonText"),
  emptyMessage: document.querySelector("#emptyMessage"),
  emptyState: document.querySelector("#emptyState"),
  emptyTitle: document.querySelector("#emptyTitle"),
  footerCount: document.querySelector("#footerCount"),
  labelsNav: document.querySelector("#labelsNav"),
  labelsOptions: document.querySelector("#labelOptions"),
  listFooter: document.querySelector("#listFooter"),
  noteColor: document.querySelector("#noteColor"),
  noteContent: document.querySelector("#noteContent"),
  noteDialog: document.querySelector("#noteDialog"),
  noteForm: document.querySelector("#noteForm"),
  imageInput: document.querySelector("#imageInput"),
  imagePreviews: document.querySelector("#imagePreviews"),
  imageStatus: document.querySelector("#imageStatus"),
  noteLabel: document.querySelector("#noteLabel"),
  noteTitle: document.querySelector("#noteTitle"),
  notesGrid: document.querySelector("#notesGrid"),
  notesSummary: document.querySelector("#notesSummary"),
  notice: document.querySelector("#notice"),
  pageEyebrow: document.querySelector("#pageEyebrow"),
  pageTitle: document.querySelector("#pageTitle"),
  pinnedCount: document.querySelector("#pinnedCount"),
  searchInput: document.querySelector("#searchInput"),
  storageStatus: document.querySelector("#storageStatus")
};

let notes = [];
let activeView = "all";
let activeLabel = "";
let editingId = null;
let deleteTargetId = null;
let dragSourceId = null;
let draftImages = [];

function readLocalNotes() {
  const stored = window.localStorage.getItem(storageKey);
  return stored ? JSON.parse(stored) : [];
}

function initializeStorage() {
  notes = readLocalNotes();
  if (!Array.isArray(notes)) throw new Error("Saved notes are not in a readable format.");
  notes = notes.filter(isValidNote);
}

function isValidNote(note) {
  return note && typeof note.id === "string" && typeof note.title === "string" &&
    typeof note.content === "string" && typeof note.updatedAt === "string";
}

function getNoteImages(note) {
  return Array.isArray(note.images)
    ? note.images.filter((image) => image && typeof image.dataUrl === "string" && image.dataUrl.startsWith("data:image/"))
    : [];
}

function saveNotes(nextNotes) {
  window.localStorage.setItem(storageKey, JSON.stringify(nextNotes));
}

function showNotice(message) {
  elements.notice.textContent = message;
  elements.notice.hidden = false;
}

function hideNotice() {
  elements.notice.textContent = "";
  elements.notice.hidden = true;
}

function formatBytes(bytes) {
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function createDownloadLink(image) {
  const link = document.createElement("a");
  const filename = (image.name || "note-image").replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_");
  link.className = "image-download";
  link.href = image.dataUrl;
  link.download = `${filename.replace(/\.[^.]+$/, "") || "note-image"}.webp`;
  link.setAttribute("aria-label", `Download ${image.name || "image"}`);
  link.title = "Download image";
  link.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m-5-5 5 5 5-5M5 17v3h14v-3"/></svg>';
  return link;
}

function setImageStatus(message = "") {
  elements.imageStatus.textContent = message;
  elements.imageStatus.hidden = !message;
}

function renderImagePreviews() {
  elements.imagePreviews.replaceChildren();
  draftImages.forEach((image) => {
    const preview = document.createElement("div");
    preview.className = "image-preview";
    const thumbnail = document.createElement("div");
    thumbnail.className = "image-thumbnail";
    const img = document.createElement("img");
    img.src = image.dataUrl;
    img.alt = image.name || "Attached image";
    thumbnail.append(img, createDownloadLink(image));
    const size = document.createElement("span");
    size.textContent = formatBytes(image.size);
    const remove = document.createElement("button");
    remove.className = "image-remove";
    remove.type = "button";
    remove.dataset.imageId = image.id;
    remove.setAttribute("aria-label", `Remove ${image.name || "image"}`);
    remove.textContent = "×";
    preview.append(thumbnail, size, remove);
    elements.imagePreviews.append(preview);
  });
}

function canvasToBlob(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Your browser could not compress this image."));
    }, "image/webp", quality);
  });
}

async function compressImage(file) {
  if (!file.type.startsWith("image/")) throw new Error(`${file.name} is not an image.`);
  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxImageDimension / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    let width = Math.max(1, Math.round(bitmap.width * scale));
    let height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Image compression is not supported in this browser.");

    for (let attempt = 0; attempt < 12; attempt += 1) {
      canvas.width = width;
      canvas.height = height;
      context.drawImage(bitmap, 0, 0, width, height);
      for (const quality of [0.82, 0.68, 0.54, 0.4, 0.28]) {
        const blob = await canvasToBlob(canvas, quality);
        if (blob.size <= maxImageBytes) {
          const dataUrl = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(reader.error || new Error("Could not read the compressed image."));
            reader.readAsDataURL(blob);
          });
          return { id: makeId(), name: file.name, dataUrl, size: blob.size };
        }
      }
      width = Math.max(1, Math.floor(width * 0.8));
      height = Math.max(1, Math.floor(height * 0.8));
    }
    throw new Error(`${file.name} could not be compressed below 500 KB.`);
  } catch (error) {
    throw new Error(`Could not add ${file.name}: ${error.message}`);
  } finally {
    bitmap?.close();
  }
}

function getVisibleNotes() {
  const query = elements.searchInput.value.trim().toLocaleLowerCase();
  return notes
    .filter((note) => activeView !== "pinned" || note.pinned)
    .filter((note) => !activeLabel || note.label.toLocaleLowerCase() === activeLabel.toLocaleLowerCase())
    .filter((note) => !query || `${note.title} ${note.content} ${note.label}`.toLocaleLowerCase().includes(query))
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || (a.order ?? 0) - (b.order ?? 0));
}

function formatDate(dateValue) {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return "Recently";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date);
}

function formatModified(dateValue) {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return "Recently";
  const daysAgo = Math.floor((Date.now() - date.getTime()) / 86400000);
  if (daysAgo <= 0) return "Today";
  if (daysAgo === 1) return "Yesterday";
  if (daysAgo < 7) return `${daysAgo} days ago`;
  return formatDate(dateValue);
}

function createActionButton(action, noteId, label, svg, isActive = false) {
  const button = document.createElement("button");
  button.className = `card-action${isActive ? " is-pinned" : ""}`;
  button.type = "button";
  button.dataset.action = action;
  button.dataset.id = noteId;
  button.setAttribute("aria-label", label);
  button.setAttribute("title", label);
  button.innerHTML = svg;
  return button;
}

function createNoteCard(note) {
  const card = document.createElement("article");
  card.className = "note-card";
  card.dataset.id = note.id;
  card.dataset.color = colors.includes(note.color) ? note.color : "cream";
  card.draggable = true;
  card.tabIndex = 0;
  card.setAttribute("aria-label", `${note.title || "Untitled note"}, last updated ${formatDate(note.updatedAt)}`);

  const top = document.createElement("div");
  top.className = "card-topline";
  const date = document.createElement("span");
  date.className = "note-date";
  date.textContent = formatDate(note.updatedAt);
  const actions = document.createElement("div");
  actions.className = "card-actions";
  actions.append(
    createActionButton("pin", note.id, note.pinned ? "Unpin note" : "Pin note", icons.pin, note.pinned),
    createActionButton("edit", note.id, "Edit note", icons.edit),
    createActionButton("delete", note.id, "Delete note", icons.trash)
  );
  top.append(date, actions);

  const title = document.createElement("h2");
  title.textContent = note.title || "Untitled note";
  const preview = document.createElement("p");
  preview.className = "note-preview";
  preview.textContent = note.content || "No extra details yet.";
  const images = getNoteImages(note);
  let imageStrip;
  if (images.length) {
    imageStrip = document.createElement("div");
    imageStrip.className = "note-image-strip";
    imageStrip.setAttribute("aria-label", `${images.length} attached ${images.length === 1 ? "image" : "images"}`);
    images.forEach((image) => {
      const thumbnail = document.createElement("div");
      thumbnail.className = "image-thumbnail";
      const img = document.createElement("img");
      img.src = image.dataUrl;
      img.alt = image.name || "Note attachment";
      img.loading = "lazy";
      thumbnail.append(img, createDownloadLink(image));
      imageStrip.append(thumbnail);
    });
  }
  const footer = document.createElement("div");
  footer.className = "card-footer";
  if (note.label) {
    const label = document.createElement("span");
    label.className = "note-label";
    label.textContent = note.label;
    footer.append(label);
  } else {
    const spacer = document.createElement("span");
    footer.append(spacer);
  }
  const modified = document.createElement("span");
  modified.className = "note-modified";
  modified.textContent = `Edited ${formatModified(note.updatedAt).toLocaleLowerCase()}`;
  footer.append(modified);
  card.append(top, title, preview);
  if (imageStrip) card.append(imageStrip);
  card.append(footer);
  return card;
}

function renderLabels() {
  const labels = [...new Set(notes.map((note) => note.label.trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));
  elements.labelsNav.replaceChildren();
  elements.labelsOptions.replaceChildren();
  labels.forEach((label) => {
    const button = document.createElement("button");
    button.className = `nav-item${activeLabel === label ? " is-active" : ""}`;
    button.type = "button";
    button.dataset.label = label;
    const dot = document.createElement("span");
    dot.className = "label-dot";
    const text = document.createElement("span");
    text.textContent = label;
    const count = document.createElement("span");
    count.className = "nav-count";
    count.textContent = notes.filter((note) => note.label === label).length;
    button.append(dot, text, count);
    elements.labelsNav.append(button);

    const option = document.createElement("option");
    option.value = label;
    elements.labelsOptions.append(option);
  });
}

function renderNotes() {
  const visibleNotes = getVisibleNotes();
  const viewTitle = activeLabel || (activeView === "pinned" ? "Pinned notes" : "All notes");
  elements.pageTitle.textContent = viewTitle;
  elements.breadcrumbTitle.textContent = viewTitle;
  elements.pageEyebrow.textContent = activeLabel ? "YOUR COLLECTION" : activeView === "pinned" ? "SAVED FOR LATER" : "YOUR THINKING SPACE";
  elements.notesSummary.textContent = activeLabel
    ? `Notes filed under ${activeLabel}.`
    : activeView === "pinned"
      ? "The thoughts you wanted to keep close."
      : "Everything you want to remember, all in one place.";
  elements.allCount.textContent = notes.length;
  elements.pinnedCount.textContent = notes.filter((note) => note.pinned).length;
  elements.footerCount.textContent = `${visibleNotes.length} ${visibleNotes.length === 1 ? "note" : "notes"}`;
  elements.notesGrid.replaceChildren(...visibleNotes.map(createNoteCard));
  elements.notesGrid.hidden = visibleNotes.length === 0;
  elements.emptyState.hidden = visibleNotes.length !== 0;
  elements.listFooter.hidden = visibleNotes.length === 0;
  if (notes.length === 0 && !elements.searchInput.value && activeView === "all") {
    elements.emptyTitle.textContent = "A fresh page";
    elements.emptyMessage.textContent = "Your next great idea has to start somewhere.";
    elements.emptyButtonText.textContent = "Write your first note";
  } else {
    elements.emptyTitle.textContent = elements.searchInput.value ? "Nothing found" : activeView === "pinned" ? "Nothing pinned yet" : activeLabel ? "No notes here yet" : "No matching notes";
    elements.emptyMessage.textContent = elements.searchInput.value
      ? "Try a different search, or start a new note."
      : activeView === "pinned"
        ? "Pin a note to keep it close at hand."
        : "Try another view or create a note for this collection.";
    elements.emptyButtonText.textContent = "Create a note";
  }
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.classList.toggle("is-active", !activeLabel && button.dataset.view === activeView);
  });
  renderLabels();
}

function openEditor(note = null, focusTarget = elements.noteTitle) {
  editingId = note?.id ?? null;
  elements.noteForm.reset();
  elements.dialogTitle.textContent = note ? "Edit your note" : "Capture a thought";
  elements.dialogEyebrow.textContent = note ? "A NOTE OF YOURS" : "A NEW THOUGHT";
  elements.deleteNote.hidden = !note;
  elements.noteTitle.value = note?.title ?? "";
  elements.noteContent.value = note?.content ?? "";
  elements.noteLabel.value = note?.label ?? "";
  elements.noteColor.value = colors.includes(note?.color) ? note.color : "cream";
  draftImages = getNoteImages(note ?? {});
  elements.imageInput.value = "";
  setImageStatus();
  renderImagePreviews();
  elements.noteDialog.showModal();
  requestAnimationFrame(() => focusTarget.focus());
}

function closeEditor() {
  elements.noteDialog.close();
  editingId = null;
}

async function commitNotes(nextNotes) {
  hideNotice();
  try {
    saveNotes(nextNotes);
    notes = nextNotes;
    renderNotes();
    return true;
  } catch (error) {
    const reason = error?.name === "QuotaExceededError"
      ? "Browser storage is full. Remove an image or delete some older notes, then try again."
      : error.message;
    showNotice(`Your change could not be saved. ${reason}`);
    return false;
  }
}

function requestDelete(noteId) {
  deleteTargetId = noteId;
  elements.confirmDialog.showModal();
}

async function deleteNote(noteId) {
  const updated = await commitNotes(notes.filter((note) => note.id !== noteId));
  if (updated) {
    elements.confirmDialog.close();
    if (editingId === noteId) closeEditor();
    deleteTargetId = null;
  }
}

function makeId() {
  return typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

elements.createNote.addEventListener("click", () => openEditor());
elements.createNoteTop.addEventListener("click", () => openEditor());
elements.emptyCreate.addEventListener("click", () => openEditor());
document.querySelector("#addLabel").addEventListener("click", () => {
  openEditor(null, elements.noteLabel);
});
document.querySelector("#closeDialog").addEventListener("click", closeEditor);
elements.noteDialog.addEventListener("click", (event) => {
  if (event.target === elements.noteDialog) closeEditor();
});
elements.noteDialog.addEventListener("close", () => { editingId = null; });
elements.searchInput.addEventListener("input", renderNotes);
elements.imageInput.addEventListener("change", async () => {
  const files = [...elements.imageInput.files];
  elements.imageInput.value = "";
  setImageStatus();
  for (let index = 0; index < files.length; index += 1) {
    setImageStatus(`Compressing image ${index + 1} of ${files.length}…`);
    try {
      const image = await compressImage(files[index]);
      draftImages.push(image);
      renderImagePreviews();
      setImageStatus(`${image.name} added (${formatBytes(image.size)}).`);
    } catch (error) {
      setImageStatus(error.message);
    }
  }
});
elements.imagePreviews.addEventListener("click", (event) => {
  const removeButton = event.target.closest("[data-image-id]");
  if (!removeButton) return;
  draftImages = draftImages.filter((image) => image.id !== removeButton.dataset.imageId);
  renderImagePreviews();
  setImageStatus("Image removed. Save the note to keep this change.");
});
elements.noteForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const title = elements.noteTitle.value.trim();
  const content = elements.noteContent.value.trim();
  if (!title && !content && draftImages.length === 0) {
    elements.noteTitle.focus();
    showNotice("Add a title, note text, or an image before saving.");
    return;
  }

  const existing = notes.find((note) => note.id === editingId);
  const nextNote = {
    id: existing?.id ?? makeId(),
    title,
    content,
    images: draftImages,
    label: elements.noteLabel.value.trim(),
    color: colors.includes(elements.noteColor.value) ? elements.noteColor.value : "cream",
    pinned: existing?.pinned ?? false,
    order: existing?.order ?? notes.reduce((minimum, note) => Math.min(minimum, note.order ?? 0), 0) - 1,
    createdAt: existing?.createdAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  const nextNotes = existing
    ? notes.map((note) => note.id === existing.id ? nextNote : note)
    : [nextNote, ...notes];
  if (await commitNotes(nextNotes)) closeEditor();
});

elements.deleteNote.addEventListener("click", () => {
  if (editingId) requestDelete(editingId);
});
elements.confirmDelete.addEventListener("click", async (event) => {
  event.preventDefault();
  if (deleteTargetId) await deleteNote(deleteTargetId);
});
elements.confirmDialog.addEventListener("close", () => { deleteTargetId = null; });

document.querySelector(".primary-nav").addEventListener("click", (event) => {
  const button = event.target.closest("[data-view]");
  if (!button) return;
  activeView = button.dataset.view;
  activeLabel = "";
  renderNotes();
});
elements.labelsNav.addEventListener("click", (event) => {
  const button = event.target.closest("[data-label]");
  if (!button) return;
  activeLabel = button.dataset.label;
  activeView = "all";
  renderNotes();
});

elements.notesGrid.addEventListener("click", async (event) => {
  const actionButton = event.target.closest("[data-action]");
  const card = event.target.closest(".note-card");
  if (!card) return;
  if (event.target.closest(".image-download")) return;
  const note = notes.find((item) => item.id === card.dataset.id);
  if (!note) return;
  if (!actionButton) {
    openEditor(note);
    return;
  }
  event.stopPropagation();
  if (actionButton.dataset.action === "edit") openEditor(note);
  if (actionButton.dataset.action === "delete") requestDelete(note.id);
  if (actionButton.dataset.action === "pin") {
    await commitNotes(notes.map((item) => item.id === note.id ? { ...item, pinned: !item.pinned } : item));
  }
});

elements.notesGrid.addEventListener("keydown", (event) => {
  if (event.target.closest("[data-action], .image-download")) return;
  if (event.key !== "Enter" && event.key !== " ") return;
  const card = event.target.closest(".note-card");
  if (!card) return;
  event.preventDefault();
  const note = notes.find((item) => item.id === card.dataset.id);
  if (note) openEditor(note);
});

elements.notesGrid.addEventListener("dragstart", (event) => {
  const card = event.target.closest(".note-card");
  if (!card) return;
  dragSourceId = card.dataset.id;
  card.classList.add("is-dragging");
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", dragSourceId);
});
elements.notesGrid.addEventListener("dragend", (event) => {
  event.target.closest(".note-card")?.classList.remove("is-dragging");
  elements.notesGrid.querySelectorAll(".drag-over").forEach((card) => card.classList.remove("drag-over"));
});
elements.notesGrid.addEventListener("dragover", (event) => {
  const target = event.target.closest(".note-card");
  if (!target || target.dataset.id === dragSourceId) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = "move";
  target.classList.add("drag-over");
});
elements.notesGrid.addEventListener("dragleave", (event) => {
  event.target.closest(".note-card")?.classList.remove("drag-over");
});
elements.notesGrid.addEventListener("drop", async (event) => {
  const target = event.target.closest(".note-card");
  if (!target || !dragSourceId || target.dataset.id === dragSourceId) return;
  event.preventDefault();
  target.classList.remove("drag-over");
  const ordered = getVisibleNotes();
  const sourceIndex = ordered.findIndex((note) => note.id === dragSourceId);
  const targetIndex = ordered.findIndex((note) => note.id === target.dataset.id);
  if (sourceIndex < 0 || targetIndex < 0) return;
  const [moved] = ordered.splice(sourceIndex, 1);
  ordered.splice(targetIndex, 0, moved);
  const visibleIds = new Set(ordered.map((note) => note.id));
  const remaining = notes
    .filter((note) => !visibleIds.has(note.id))
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || (a.order ?? 0) - (b.order ?? 0));
  const orderById = new Map([...ordered, ...remaining].map((note, index) => [note.id, index]));
  dragSourceId = null;
  await commitNotes(notes.map((note) => ({
    ...note,
    order: orderById.has(note.id) ? orderById.get(note.id) : (note.order ?? Date.now()) + ordered.length
  })));
});

document.addEventListener("keydown", (event) => {
  const target = event.target;
  const isTyping = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
  if (event.key.toLowerCase() === "n" && !isTyping && !elements.noteDialog.open && !elements.confirmDialog.open) {
    event.preventDefault();
    openEditor();
  }
  if (event.key === "/" && !isTyping && !elements.noteDialog.open && !elements.confirmDialog.open) {
    event.preventDefault();
    elements.searchInput.focus();
  }
  if (event.key === "Escape" && elements.noteDialog.open) closeEditor();
});

async function start() {
  try {
    initializeStorage();
    renderNotes();
  } catch (error) {
    showNotice(`Loca5 Notes could not start. ${error.message}`);
    elements.storageStatus.textContent = "Storage unavailable";
    elements.createNote.disabled = true;
    elements.createNoteTop.disabled = true;
    elements.emptyCreate.disabled = true;
  }
}

start();
