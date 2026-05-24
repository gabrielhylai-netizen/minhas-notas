const storageKey = "minhas-notas-state";
let memoryState = null;

const firebaseConfig = {
  apiKey: "AIzaSyApJKAceOqAJpK9xQWo2_R_U6e9KpD-oUM",
  authDomain: "minhas-notas-c7b7a.firebaseapp.com",
  projectId: "minhas-notas-c7b7a",
  storageBucket: "minhas-notas-c7b7a.firebasestorage.app",
  messagingSenderId: "705419886947",
  appId: "1:705419886947:web:842b07acd085361904d356",
};

const firestoreCollection = "sync";
const firestoreDocument = "minhas-notas";
let cloudReady = false;
let initialCloudLoaded = false;
let cloudSaveTimer = null;
let unsubscribeCloudSync = null;

let state = loadState();
let activeBlockId = null;
let activeNoteId = null;
let pendingDelete = null;
let notePressTimer = null;
let blockPressTimer = null;
let miniNotePressTimer = null;
let cardDrag = null;
let activeCardPointerId = null;

const colorLabels = {
  terracotta: "Terracota",
  honey: "Mel",
  rose: "Rosa queimado",
  olive: "Oliva quente",
  cream: "Creme",
};

const CARD_PRESS_DELAY = 120;

const elements = {
  homePage: document.querySelector("#homePage"),
  detailPage: document.querySelector("#detailPage"),
  notePage: document.querySelector("#notePage"),
  blocksGrid: document.querySelector("#blocksGrid"),
  notesGrid: document.querySelector("#notesGrid"),
  blockDialog: document.querySelector("#blockDialog"),
  noteDialog: document.querySelector("#noteDialog"),
  deleteConfirmDialog: document.querySelector("#deleteConfirmDialog"),
  deleteConfirmText: document.querySelector("#deleteConfirmText"),
  blockForm: document.querySelector("#blockForm"),
  noteForm: document.querySelector("#noteForm"),
  miniNoteDialog: document.querySelector("#miniNoteDialog"),
  miniNoteForm: document.querySelector("#miniNoteForm"),
  detailBlockTitle: document.querySelector("#detailBlockTitle"),
  detailNoteTitle: document.querySelector("#detailNoteTitle"),
  detailNoteDescription: document.querySelector("#detailNoteDescription"),
  miniNotesGrid: document.querySelector("#miniNotesGrid"),
  openMiniNoteDialog: document.querySelector("#openMiniNoteDialog"),
  cancelDelete: document.querySelector("#cancelDelete"),
  confirmDelete: document.querySelector("#confirmDelete"),
};

let blockDialogDrag = {
  active: false,
  startY: 0,
  currentY: 0,
  form: null,
  dialog: null,
};

document.querySelector("#openNoteDialog").addEventListener("click", () => {
  elements.noteForm.reset();
  resetDialogDrag(elements.noteForm, elements.noteDialog);
  openDialog(elements.noteDialog);
});

elements.openMiniNoteDialog.addEventListener("click", () => {
  elements.miniNoteForm.reset();
  resetDialogDrag(elements.miniNoteForm, elements.miniNoteDialog);
  openDialog(elements.miniNoteDialog);
});

document.querySelector("#backToHome").addEventListener("click", () => {
  activeBlockId = null;
  activeNoteId = null;
  render();
});

document.querySelector("#backToBlock").addEventListener("click", () => {
  const titleInput = document.querySelector("#detailTitleInput");

  if (titleInput) {
    titleInput.blur();
  }

  activeNoteId = null;
  render();
});

elements.detailBlockTitle.addEventListener("dblclick", startTitleEdit);
elements.detailNoteTitle.addEventListener("dblclick", startTitleEdit);
elements.detailNoteDescription.addEventListener("dblclick", startDescriptionEdit);

document.querySelector("[data-submit-block]").addEventListener("click", (event) => {
  event.preventDefault();

  if (typeof elements.blockForm.requestSubmit === "function") {
    elements.blockForm.requestSubmit();
  } else {
    elements.blockForm.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
  }
});

document.querySelector("[data-submit-note]").addEventListener("click", (event) => {
  event.preventDefault();

  if (typeof elements.noteForm.requestSubmit === "function") {
    elements.noteForm.requestSubmit();
  } else {
    elements.noteForm.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
  }
});

document.querySelector("[data-submit-mini-note]").addEventListener("click", (event) => {
  event.preventDefault();

  if (typeof elements.miniNoteForm.requestSubmit === "function") {
    elements.miniNoteForm.requestSubmit();
  } else {
    elements.miniNoteForm.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
  }
});

document.querySelectorAll("[data-close]").forEach((button) => {
  button.addEventListener("click", () => {
    closeDialog(document.querySelector(`#${button.dataset.close}`));
  });
});

elements.cancelDelete.addEventListener("click", closeDeleteDialog);
elements.confirmDelete.addEventListener("click", deletePendingItem);
document.addEventListener("pointerdown", clearDeleteModeOnOutsidePress);
document.addEventListener("pointermove", moveCardDrag, { passive: false });
document.addEventListener("pointerup", endCardDrag);
document.addEventListener("pointercancel", endCardDrag);

elements.blockForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const formData = new FormData(elements.blockForm);

  state.blocks.unshift({
    id: createId(),
    title: clean(formData.get("title")),
    description: "",
    color: "terracotta",
    notes_count: 0,
  });

  saveState();
  closeDialog(elements.blockDialog);
  activeBlockId = state.blocks[0].id;
  render();
});

elements.noteForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const formData = new FormData(elements.noteForm);
  const title = clean(formData.get("title"));

  state.notes.unshift({
    id: createId(),
    title,
    content: clean(formData.get("description")),
    block_id: activeBlockId,
    color: "cream",
    miniNotes: [
      {
        id: createId(),
        title,
        content: "",
        color: "cream",
        fixedLast: true,
      },
    ],
  });

  syncNotesCount();
  saveState();
  closeDialog(elements.noteDialog);
  render();
});

elements.miniNoteForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const activeNote = state.notes.find((note) => note.id === activeNoteId);

  if (!activeNote) {
    return;
  }

  const formData = new FormData(elements.miniNoteForm);

  if (!Array.isArray(activeNote.miniNotes)) {
    activeNote.miniNotes = [];
  }

  activeNote.miniNotes.unshift({
    id: createId(),
    title: clean(formData.get("title")),
    content: clean(formData.get("description")),
    color: "cream",
  });

  saveState();
  closeDialog(elements.miniNoteDialog);
  render();
});

function render() {
  const activeBlock = state.blocks.find((block) => block.id === activeBlockId);
  const activeNote = state.notes.find((note) => note.id === activeNoteId);

  elements.homePage.classList.toggle("hidden", Boolean(activeBlock) || Boolean(activeNote));
  elements.detailPage.classList.toggle("hidden", !activeBlock || Boolean(activeNote));
  elements.notePage.classList.toggle("hidden", !activeNote);

  if (activeNote) {
    elements.detailNoteTitle.textContent = activeNote.title;
    elements.detailNoteDescription.textContent = activeNote.content || "";
    elements.detailNoteDescription.classList.toggle("hidden", !activeNote.content);
    renderMiniNotes(activeNote);
    return;
  }

  if (activeBlock) {
    elements.detailBlockTitle.textContent = activeBlock.title;
    renderNotes();
    return;
  }

  renderBlocks();
}

function startTitleEdit(event) {
  const target = event.currentTarget;
  const entity = getEditableTitleEntity(target.id);

  if (!entity || document.querySelector("#detailTitleInput")) {
    return;
  }

  const input = document.createElement("input");
  input.id = "detailTitleInput";
  input.className = "title-edit-input";
  input.value = entity.item.title;
  input.maxLength = 60;
  input.dataset.titleId = entity.titleId;
  input.dataset.entityType = entity.type;
  input.dataset.entityId = entity.item.id;
  input.dataset.previousTitle = entity.item.title;

  target.replaceWith(input);
  input.focus();
  input.select();

  input.addEventListener("blur", () => finishTitleEdit(input));
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      input.blur();
    }

    if (event.key === "Escape") {
      input.value = input.dataset.previousTitle;
      render();
    }
  });
}

function finishTitleEdit(input) {
  const entity = getEditableTitleEntityFromInput(input);

  if (!entity) {
    render();
    return;
  }

  const nextTitle = clean(input.value);
  entity.item.title = nextTitle || entity.item.title;
  saveState();

  const title = document.createElement("h1");
  title.id = entity.titleId;
  title.title = "Clique duas vezes para editar";
  title.addEventListener("dblclick", startTitleEdit);
  input.replaceWith(title);
  elements[entity.elementKey] = title;
  render();
}

function getEditableTitleEntity(titleId) {
  if (titleId === "detailBlockTitle") {
    const item = state.blocks.find((block) => block.id === activeBlockId);
    return item ? { item, titleId, type: "block", elementKey: "detailBlockTitle" } : null;
  }

  if (titleId === "detailNoteTitle") {
    const item = state.notes.find((note) => note.id === activeNoteId);
    return item ? { item, titleId, type: "note", elementKey: "detailNoteTitle" } : null;
  }

  return null;
}

function getEditableTitleEntityFromInput(input) {
  const collection = input.dataset.entityType === "note" ? state.notes : state.blocks;
  const item = collection.find((entry) => entry.id === input.dataset.entityId);

  if (!item) {
    return null;
  }

  return {
    item,
    titleId: input.dataset.titleId,
    type: input.dataset.entityType,
    elementKey: input.dataset.entityType === "note" ? "detailNoteTitle" : "detailBlockTitle",
  };
}

function startDescriptionEdit() {
  const activeNote = state.notes.find((note) => note.id === activeNoteId);

  if (!activeNote || document.querySelector("#detailDescriptionInput")) {
    return;
  }

  const input = document.createElement("textarea");
  input.id = "detailDescriptionInput";
  input.className = "description-edit-input";
  input.value = activeNote.content || "";
  input.maxLength = 180;
  input.dataset.entityId = activeNote.id;
  input.dataset.previousDescription = activeNote.content || "";

  elements.detailNoteDescription.replaceWith(input);
  input.focus();
  input.select();

  input.addEventListener("blur", () => finishDescriptionEdit(input));
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      input.blur();
    }

    if (event.key === "Escape") {
      input.value = input.dataset.previousDescription;
      render();
    }
  });
}

function finishDescriptionEdit(input) {
  const note = state.notes.find((entry) => entry.id === input.dataset.entityId);

  if (note) {
    note.content = clean(input.value);
    saveState();
  }

  const description = document.createElement("p");
  description.id = "detailNoteDescription";
  description.title = "Clique duas vezes para editar";
  description.addEventListener("dblclick", startDescriptionEdit);
  input.replaceWith(description);
  elements.detailNoteDescription = description;
  render();
}

function renderBlocks() {
  elements.blocksGrid.innerHTML = `${state.blocks.map(blockTemplate).join("")}${createBlockButtonTemplate()}`;

  elements.blocksGrid.querySelectorAll("[data-open-block]").forEach((card) => {
    card.addEventListener("pointerdown", (event) => startBlockPress(event, card));
    card.addEventListener("pointermove", moveCardDrag);
    card.addEventListener("pointerup", cancelBlockPress);
    card.addEventListener("pointerup", endCardDrag);
    card.addEventListener("pointerleave", cancelBlockPress);
    card.addEventListener("pointercancel", cancelBlockPress);
    card.addEventListener("pointercancel", endCardDrag);

    card.addEventListener("click", (event) => {
      if (card.dataset.suppressClick === "true") {
        delete card.dataset.suppressClick;
        return;
      }

      if (event.target.closest("[data-delete-block]") || card.classList.contains("is-delete-ready")) {
        return;
      }

      activeBlockId = card.dataset.openBlock;
      render();
    });
  });

  elements.blocksGrid.querySelectorAll("[data-delete-block]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      openDeleteDialog("block", button.dataset.deleteBlock);
    });
  });

  elements.blocksGrid.querySelector("[data-create-block]").addEventListener("click", openBlockDialog);
}

function renderNotes() {
  const notes = state.notes.filter((note) => note.block_id === activeBlockId);
  elements.notesGrid.innerHTML = notes.map(noteTemplate).join("");

  elements.notesGrid.querySelectorAll("[data-open-note]").forEach((card) => {
    card.addEventListener("pointerdown", (event) => startNotePress(event, card));
    card.addEventListener("pointermove", moveCardDrag);
    card.addEventListener("pointerup", cancelNotePress);
    card.addEventListener("pointerup", endCardDrag);
    card.addEventListener("pointerleave", cancelNotePress);
    card.addEventListener("pointercancel", cancelNotePress);
    card.addEventListener("pointercancel", endCardDrag);

    card.addEventListener("click", (event) => {
      if (card.dataset.suppressClick === "true") {
        delete card.dataset.suppressClick;
        return;
      }

      if (event.target.closest("[data-delete-note]") || card.classList.contains("is-delete-ready")) {
        return;
      }

      activeNoteId = card.dataset.openNote;
      render();
    });
  });

  elements.notesGrid.querySelectorAll("[data-delete-note]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      openDeleteDialog("note", button.dataset.deleteNote);
    });
  });
}

function renderMiniNotes(note) {
  const miniNotes = Array.isArray(note.miniNotes) ? note.miniNotes : [];
  elements.miniNotesGrid.innerHTML = miniNotes.map(miniNoteTemplate).join("");

  elements.miniNotesGrid.querySelectorAll("[data-mini-note]").forEach((card) => {
    card.addEventListener("pointerdown", (event) => startMiniNotePress(event, card));
    card.addEventListener("pointermove", moveCardDrag);
    card.addEventListener("pointerup", cancelMiniNotePress);
    card.addEventListener("pointerup", endCardDrag);
    card.addEventListener("pointerleave", cancelMiniNotePress);
    card.addEventListener("pointercancel", cancelMiniNotePress);
    card.addEventListener("pointercancel", endCardDrag);
  });

  elements.miniNotesGrid.querySelectorAll("[data-delete-mini-note]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      openDeleteDialog("miniNote", button.dataset.deleteMiniNote);
    });
  });
}

function startBlockPress(event, card) {
  if (event.target.closest("[data-delete-block]")) {
    return;
  }

  cancelBlockPress();
  card.setPointerCapture(event.pointerId);
  blockPressTimer = window.setTimeout(() => {
    elements.blocksGrid.querySelectorAll(".block-card.is-delete-ready").forEach((blockCard) => {
      if (blockCard !== card) {
        blockCard.classList.remove("is-delete-ready");
      }
    });
    card.classList.add("is-delete-ready");
    startCardDrag(event, card, "block");
  }, CARD_PRESS_DELAY);
}

function cancelBlockPress() {
  if (blockPressTimer) {
    window.clearTimeout(blockPressTimer);
    blockPressTimer = null;
  }
}

function startNotePress(event, card) {
  if (event.target.closest("[data-delete-note]")) {
    return;
  }

  cancelNotePress();
  card.setPointerCapture(event.pointerId);
  notePressTimer = window.setTimeout(() => {
    elements.notesGrid.querySelectorAll(".note-card.is-delete-ready").forEach((noteCard) => {
      if (noteCard !== card) {
        noteCard.classList.remove("is-delete-ready");
      }
    });
    card.classList.add("is-delete-ready");
    startCardDrag(event, card, "note");
  }, CARD_PRESS_DELAY);
}

function cancelNotePress() {
  if (notePressTimer) {
    window.clearTimeout(notePressTimer);
    notePressTimer = null;
  }
}

function startMiniNotePress(event, card) {
  if (event.target.closest("[data-delete-mini-note]") || card.dataset.fixedLast === "true") {
    return;
  }

  cancelMiniNotePress();
  card.setPointerCapture(event.pointerId);
  miniNotePressTimer = window.setTimeout(() => {
    elements.miniNotesGrid.querySelectorAll(".note-card.is-delete-ready").forEach((miniNoteCard) => {
      if (miniNoteCard !== card) {
        miniNoteCard.classList.remove("is-delete-ready");
      }
    });
    card.classList.add("is-delete-ready");
    startCardDrag(event, card, "miniNote");
  }, CARD_PRESS_DELAY);
}

function cancelMiniNotePress() {
  if (miniNotePressTimer) {
    window.clearTimeout(miniNotePressTimer);
    miniNotePressTimer = null;
  }
}

function clearDeleteModeOnOutsidePress(event) {
  const clickedInsideProtectedArea = event.target.closest(
    ".card, .add-block-card, .dialog-backdrop, .add-inline-button, .ghost-button, .card-delete-button",
  );

  if (clickedInsideProtectedArea) {
    return;
  }

  clearDeleteMode();
}

function clearDeleteMode() {
  document.querySelectorAll(".is-delete-ready").forEach((card) => {
    card.classList.remove("is-delete-ready");
  });
}

function startCardDrag(event, card, type) {
  const rect = card.getBoundingClientRect();
  const placeholder = document.createElement("div");
  placeholder.className = "card-placeholder";
  placeholder.style.width = `${rect.width}px`;
  placeholder.style.height = `${rect.height}px`;

  card.parentNode.insertBefore(placeholder, card);
  card.classList.add("is-card-dragging");
  card.style.width = `${rect.width}px`;
  card.style.height = `${rect.height}px`;
  card.style.left = `${rect.left}px`;
  card.style.top = `${rect.top}px`;

  cardDrag = {
    type,
    card,
    placeholder,
    grid: getCardGrid(type),
    originalOrder: getCardOrder(type),
    offsetX: event.clientX - rect.left,
    offsetY: event.clientY - rect.top,
    moved: false,
    orderChanged: false,
  };
  activeCardPointerId = event.pointerId;
}

function getCardGrid(type) {
  if (type === "block") {
    return elements.blocksGrid;
  }

  if (type === "miniNote") {
    return elements.miniNotesGrid;
  }

  return elements.notesGrid;
}

function moveCardDrag(event) {
  if (!cardDrag) {
    return;
  }

  if (activeCardPointerId !== null && event.pointerId !== activeCardPointerId) {
    return;
  }

  event.preventDefault();

  const nextLeft = event.clientX - cardDrag.offsetX;
  const nextTop = event.clientY - cardDrag.offsetY;
  cardDrag.card.style.left = `${nextLeft}px`;
  cardDrag.card.style.top = `${nextTop}px`;
  cardDrag.moved = true;

  const target = document.elementFromPoint(event.clientX, event.clientY)?.closest(
    cardDrag.type === "block" ? ".block-card" : ".note-card",
  );

  if (!target || target === cardDrag.card || target.parentNode !== cardDrag.grid) {
    return;
  }

  swapPlaceholderWithTarget(target);
}

function getCardOrder(type) {
  if (type === "block") {
    return [...elements.blocksGrid.querySelectorAll("[data-open-block]")].map((card) => card.dataset.openBlock);
  }

  if (type === "miniNote") {
    return [...elements.miniNotesGrid.querySelectorAll("[data-mini-note]")].map((card) => card.dataset.miniNote);
  }

  return [...elements.notesGrid.querySelectorAll("[data-open-note]")].map((card) => card.dataset.openNote);
}

function ordersMatch(firstOrder, secondOrder) {
  return firstOrder.length === secondOrder.length && firstOrder.every((id, index) => id === secondOrder[index]);
}

function swapPlaceholderWithTarget(target) {
  if (target === cardDrag.placeholder) {
    return;
  }

  if (cardDrag.type === "miniNote" && target.dataset.fixedLast === "true") {
    if (cardDrag.placeholder.nextSibling !== target) {
      cardDrag.grid.insertBefore(cardDrag.placeholder, target);
      cardDrag.orderChanged = true;
    }

    return;
  }

  const animatedCards = [...cardDrag.grid.querySelectorAll(".card:not(.is-card-dragging)")];
  const previousRects = new Map(animatedCards.map((card) => [card, card.getBoundingClientRect()]));
  const placeholder = cardDrag.placeholder;
  const placeholderNext = placeholder.nextSibling;
  const targetNext = target.nextSibling;

  if (placeholderNext === target) {
    cardDrag.grid.insertBefore(target, placeholder);
  } else if (targetNext === placeholder) {
    cardDrag.grid.insertBefore(placeholder, target);
  } else {
    cardDrag.grid.insertBefore(target, placeholder);
    cardDrag.grid.insertBefore(placeholder, targetNext);
  }

  cardDrag.orderChanged = true;

  animatedCards.forEach((card) => {
    const previousRect = previousRects.get(card);
    const nextRect = card.getBoundingClientRect();
    const deltaX = previousRect.left - nextRect.left;
    const deltaY = previousRect.top - nextRect.top;

    if (!deltaX && !deltaY) {
      return;
    }

    card.style.transition = "none";
    card.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
    card.getBoundingClientRect();
    card.style.transition = "transform 180ms ease, box-shadow 190ms ease, border-color 190ms ease";
    card.style.transform = "";
  });
}

function endCardDrag() {
  if (!cardDrag) {
    return;
  }

  if (activeCardPointerId !== null && event?.pointerId !== undefined && event.pointerId !== activeCardPointerId) {
    return;
  }

  const { type, card, placeholder, moved, orderChanged, originalOrder } = cardDrag;
  card.style.transition = "none";
  card.style.animation = "none";
  placeholder.replaceWith(card);
  card.classList.remove("is-card-dragging");
  card.style.width = "";
  card.style.height = "";
  card.style.left = "";
  card.style.top = "";

  if (moved) {
    card.dataset.suppressClick = "true";
  }

  if (orderChanged && !ordersMatch(originalOrder, getCardOrder(type))) {
    saveCardOrder(type);
  }

  requestAnimationFrame(() => {
    card.style.transition = "";
    card.style.animation = "";
    card.style.transform = "";
  });

  cardDrag = null;
  activeCardPointerId = null;
}

function saveCardOrder(type) {
  if (type === "block") {
    const orderedIds = getCardOrder(type);
    const blocksById = new Map(state.blocks.map((block) => [block.id, block]));
    state.blocks = orderedIds.map((id) => blocksById.get(id)).filter(Boolean);
  }

  if (type === "note") {
    const orderedIds = getCardOrder(type);
    const notesById = new Map(state.notes.map((note) => [note.id, note]));
    const reorderedNotes = orderedIds.map((id) => notesById.get(id)).filter(Boolean);
    const otherNotes = state.notes.filter((note) => note.block_id !== activeBlockId);
    state.notes = [...reorderedNotes, ...otherNotes];
  }

  if (type === "miniNote") {
    const activeNote = state.notes.find((note) => note.id === activeNoteId);

    if (activeNote && Array.isArray(activeNote.miniNotes)) {
      const orderedIds = getCardOrder(type);
      const miniNotesById = new Map(activeNote.miniNotes.map((miniNote) => [miniNote.id, miniNote]));
      activeNote.miniNotes = keepFixedLastMiniNotes(orderedIds.map((id) => miniNotesById.get(id)).filter(Boolean));
    }
  }

  saveState();
}

function openDeleteDialog(type, id) {
  pendingDelete = { type, id };
  const messages = {
    block: "Excluir este bloco?",
    note: "Excluir esta nota?",
    miniNote: "Excluir esta mininota?",
  };
  elements.deleteConfirmText.textContent = messages[type] || "Excluir?";
  openDialog(elements.deleteConfirmDialog);
}

function closeDeleteDialog() {
  pendingDelete = null;
  closeDialog(elements.deleteConfirmDialog);
}

function deletePendingItem() {
  if (!pendingDelete) {
    closeDeleteDialog();
    return;
  }

  if (pendingDelete.type === "note") {
    state.notes = state.notes.filter((note) => note.id !== pendingDelete.id);
  }

  if (pendingDelete.type === "block") {
    state.blocks = state.blocks.filter((block) => block.id !== pendingDelete.id);
    state.notes = state.notes.filter((note) => note.block_id !== pendingDelete.id);

    if (activeBlockId === pendingDelete.id) {
      activeBlockId = null;
      activeNoteId = null;
    }
  }

  if (pendingDelete.type === "miniNote") {
    const activeNote = state.notes.find((note) => note.id === activeNoteId);

    if (activeNote && Array.isArray(activeNote.miniNotes)) {
      activeNote.miniNotes = activeNote.miniNotes.filter((miniNote) => miniNote.id !== pendingDelete.id);
    }
  }

  syncNotesCount();
  saveState();
  pendingDelete = null;
  closeDialog(elements.deleteConfirmDialog);
  render();
}

function openBlockDialog() {
  elements.blockForm.reset();
  resetDialogDrag(elements.blockForm, elements.blockDialog);
  openDialog(elements.blockDialog);
}

function blockTemplate(block) {
  return `
    <article class="card block-card ${block.color}" data-open-block="${block.id}">
      <h2>${escapeHtml(block.title)}</h2>
      <button class="card-delete-button" type="button" data-delete-block="${block.id}" aria-label="Excluir bloco">x</button>
    </article>
  `;
}

function createBlockButtonTemplate() {
  return `
    <button class="add-block-card" type="button" data-create-block aria-label="Criar bloco">+</button>
  `;
}

function openDialog(dialog) {
  dialog.classList.remove("hidden");
}

function closeDialog(dialog) {
  if (dialog === elements.blockDialog) {
    resetDialogDrag(elements.blockForm, elements.blockDialog);
  }

  if (dialog === elements.noteDialog) {
    resetDialogDrag(elements.noteForm, elements.noteDialog);
  }

  if (dialog === elements.miniNoteDialog) {
    resetDialogDrag(elements.miniNoteForm, elements.miniNoteDialog);
  }

  dialog.classList.add("hidden");
}

document.querySelectorAll(".draggable-dialog").forEach((form) => {
  form.addEventListener("pointerdown", startDialogDrag);
  form.addEventListener("pointermove", moveDialogDrag);
  form.addEventListener("pointerup", finishDialogDrag);
  form.addEventListener("pointercancel", finishDialogDrag);
});

function startDialogDrag(event) {
  if (event.target.closest("input, button, textarea, select")) {
    return;
  }

  const form = event.currentTarget;
  const dialog = form.closest(".dialog-backdrop");

  blockDialogDrag = {
    active: true,
    startY: event.clientY,
    currentY: 0,
    form,
    dialog,
  };

  form.setPointerCapture(event.pointerId);
}

function moveDialogDrag(event) {
  if (!blockDialogDrag.active) {
    return;
  }

  const distance = event.clientY - blockDialogDrag.startY;
  blockDialogDrag.currentY = Math.min(distance, 0);
  const progress = Math.min(Math.abs(blockDialogDrag.currentY) / 180, 1);

  blockDialogDrag.form.style.transition = "none";
  blockDialogDrag.form.style.transform = `translateY(${blockDialogDrag.currentY}px)`;
  blockDialogDrag.dialog.style.transition = "none";
  blockDialogDrag.dialog.style.opacity = String(1 - progress * 0.65);
}

function finishDialogDrag() {
  if (!blockDialogDrag.active) {
    return;
  }

  blockDialogDrag.active = false;

  if (blockDialogDrag.currentY < -110) {
    const { form, dialog } = blockDialogDrag;
    form.style.transition = "transform 180ms ease, opacity 180ms ease";
    dialog.style.transition = "opacity 180ms ease";
    form.style.transform = "translateY(-120%)";
    form.style.opacity = "0";
    dialog.style.opacity = "0";
    window.setTimeout(() => closeDialog(dialog), 180);
    return;
  }

  resetDialogDrag(blockDialogDrag.form, blockDialogDrag.dialog);
}

function resetDialogDrag(form, dialog) {
  form.style.transition = "transform 180ms ease, opacity 180ms ease";
  dialog.style.transition = "opacity 180ms ease";
  form.style.transform = "";
  form.style.opacity = "";
  dialog.style.opacity = "";
}

function noteTemplate(note) {
  return `
    <article class="card note-card ${note.color}" data-open-note="${note.id}">
      <h2>${escapeHtml(note.title)}</h2>
      ${note.content ? `<p>${escapeHtml(note.content)}</p>` : ""}
      <button class="card-delete-button" type="button" data-delete-note="${note.id}" aria-label="Excluir nota">x</button>
    </article>
  `;
}

function miniNoteTemplate(miniNote) {
  return `
    <article class="card note-card ${miniNote.color}" data-mini-note="${miniNote.id}" data-fixed-last="${miniNote.fixedLast ? "true" : "false"}">
      <h2>${escapeHtml(miniNote.title)}</h2>
      ${miniNote.content ? `<p>${escapeHtml(miniNote.content)}</p>` : ""}
      <button class="card-delete-button" type="button" data-delete-mini-note="${miniNote.id}" aria-label="Excluir mininota">x</button>
    </article>
  `;
}

function normalizeMiniNotes(miniNotes) {
  return keepFixedLastMiniNotes(
    miniNotes.map((miniNote) => ({
      id: miniNote.id || createId(),
      title: clean(miniNote.title) || "Sem título",
      content: miniNote.content || "",
      color: miniNote.color || "cream",
      fixedLast: Boolean(miniNote.fixedLast),
    })),
  );
}

function keepFixedLastMiniNotes(miniNotes) {
  return [
    ...miniNotes.filter((miniNote) => !miniNote.fixedLast),
    ...miniNotes.filter((miniNote) => miniNote.fixedLast),
  ];
}

function syncNotesCount() {
  state.blocks = state.blocks.map((block) => ({
    ...block,
    notes_count: state.notes.filter((note) => note.block_id === block.id).length,
  }));
}

function clean(value) {
  return String(value || "").trim();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function loadState() {
  const saved = readSavedState();

  if (saved) {
    try {
      return JSON.parse(saved);
    } catch (error) {
      memoryState = null;
    }
  }

  const firstBlockId = createId();
  return {
    blocks: [
      {
        id: firstBlockId,
        title: "Ideias soltas",
        description: "Um lugar calmo para guardar pensamentos iniciais.",
        color: "terracotta",
        notes_count: 1,
      },
    ],
    notes: [
      {
        id: createId(),
        title: "Primeira nota",
        content: "Escreva algo pequeno, depois refine quando fizer sentido.",
        block_id: firstBlockId,
        color: "cream",
      },
    ],
  };
}

function saveState(options = {}) {
  const { cloud = true } = options;
  const serialized = JSON.stringify(state);
  memoryState = serialized;
  writeWindowState(serialized);

  try {
    localStorage.setItem(storageKey, serialized);
  } catch (error) {
    memoryState = serialized;
  }

  if (cloud && cloudReady && initialCloudLoaded) {
    scheduleCloudSave();
  }
}

function readSavedState() {
  const tabState = readWindowState();

  if (tabState) {
    return tabState;
  }

  try {
    return localStorage.getItem(storageKey) || memoryState;
  } catch (error) {
    return memoryState;
  }
}

function readWindowState() {
  try {
    const data = JSON.parse(window.name || "{}");
    return data[storageKey] || null;
  } catch (error) {
    return null;
  }
}

function writeWindowState(serialized) {
  try {
    const data = JSON.parse(window.name || "{}");
    data[storageKey] = serialized;
    window.name = JSON.stringify(data);
  } catch (error) {
    window.name = JSON.stringify({ [storageKey]: serialized });
  }
}

function createId() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }

  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function initCloudSync() {
  if (!window.firebase || typeof window.firebase.initializeApp !== "function") {
    setSyncStatus("Sync offline");
    return;
  }

  try {
    if (!window.firebase.apps.length) {
      window.firebase.initializeApp(firebaseConfig);
    }

    const db = window.firebase.firestore();
    const docRef = db.collection(firestoreCollection).doc(firestoreDocument);

    setSyncStatus("Conectando...");

    unsubscribeCloudSync = docRef.onSnapshot(
      (snapshot) => {
        cloudReady = true;

        if (snapshot.metadata.hasPendingWrites) {
          return;
        }

        if (!snapshot.exists) {
          initialCloudLoaded = true;
          if (!isDefaultInitialState(state)) {
            saveState();
          } else {
            setSyncStatus("Sync pronto");
          }
          return;
        }

        const remoteState = parseRemoteState(snapshot.data());

        if (!remoteState) {
          initialCloudLoaded = true;
          setSyncStatus("Sync pronto");
          return;
        }

        const previousState = JSON.stringify(state);
        state = normalizeState(remoteState);
        syncNotesCount();
        saveState({ cloud: false });
        initialCloudLoaded = true;

        if (JSON.stringify(state) === previousState) {
          setSyncStatus("Sincronizado");
          return;
        }

        render();
        setSyncStatus("Sincronizado");
      },
      () => {
        cloudReady = false;
        setSyncStatus("Erro no sync");
      },
    );
  } catch (error) {
    cloudReady = false;
    setSyncStatus("Sync offline");
  }
}

function scheduleCloudSave() {
  if (cloudSaveTimer) {
    window.clearTimeout(cloudSaveTimer);
  }

  setSyncStatus("Salvando...");

  cloudSaveTimer = window.setTimeout(pushStateToCloud, 450);
}

async function pushStateToCloud() {
  if (!window.firebase || !window.firebase.apps.length) {
    return;
  }

  try {
    const db = window.firebase.firestore();
    const docRef = db.collection(firestoreCollection).doc(firestoreDocument);
    await docRef.set({
      payload: JSON.stringify(state),
      updatedAt: window.firebase.firestore.FieldValue.serverTimestamp(),
      source: navigator.userAgent || "browser",
    });
    setSyncStatus("Sincronizado");
  } catch (error) {
    setSyncStatus("Erro ao salvar");
  }
}

function parseRemoteState(data) {
  if (!data) {
    return null;
  }

  if (typeof data.payload === "string") {
    try {
      return JSON.parse(data.payload);
    } catch (error) {
      return null;
    }
  }

  if (data.state && typeof data.state === "object") {
    return data.state;
  }

  return null;
}

function normalizeState(nextState) {
  const normalized = {
    blocks: Array.isArray(nextState.blocks) ? nextState.blocks : [],
    notes: Array.isArray(nextState.notes) ? nextState.notes : [],
  };

  normalized.blocks = normalized.blocks.map((block) => ({
    id: block.id || createId(),
    title: clean(block.title) || "Sem título",
    description: block.description || "",
    color: block.color || "terracotta",
    notes_count: Number(block.notes_count) || 0,
  }));

  normalized.notes = normalized.notes.map((note) => ({
    id: note.id || createId(),
    title: clean(note.title) || "Sem título",
    content: note.content || "",
    block_id: note.block_id || "",
    color: note.color || "cream",
    miniNotes: Array.isArray(note.miniNotes) ? normalizeMiniNotes(note.miniNotes) : [],
  }));

  return normalized;
}

function isDefaultInitialState(candidateState) {
  return (
    candidateState &&
    Array.isArray(candidateState.blocks) &&
    Array.isArray(candidateState.notes) &&
    candidateState.blocks.length === 1 &&
    candidateState.notes.length === 1 &&
    candidateState.blocks[0].title === "Ideias soltas" &&
    candidateState.notes[0].title === "Primeira nota"
  );
}

function setSyncStatus(message) {
  document.querySelector("#syncStatus")?.remove();
}

syncNotesCount();
saveState({ cloud: false });
render();
registerServiceWorker();
initCloudSync();

function registerServiceWorker() {
  const canRegister = "serviceWorker" in navigator && ["http:", "https:"].includes(window.location.protocol);

  if (!canRegister) {
    return;
  }

  navigator.serviceWorker.register("./sw.js").catch(() => {});
}
