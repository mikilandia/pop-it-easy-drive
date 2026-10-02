/**
 * POP IT EASY DRIVE - CLIENT APPLICATION LOGIC
 * Real-time office whiteboard, 24h change glow, shift parking lot, GIF avatars & sound
 */

// Application State
const state = {
  socket: null,
  currentUser: null,
  boards: [],
  popits: [],
  gifs: [],
  parkedUsers: [],
  networkAddresses: [],
  activeColorFilter: 'all',
  activeGlowFilter: false,
  searchQuery: '',
  selectedPopitForDetail: null,
  editingPopitId: null,
  selectedGifForProfile: null
};

// Initialize Application
document.addEventListener('DOMContentLoaded', async () => {
  initSocket();
  setupEventListeners();
  loadSavedUser();
  await fetchInitialData();
  startGlowTicker();
  detectCurrentShift();
});

// 1. Socket.IO Setup
function initSocket() {
  state.socket = io();

  // Connected to server
  state.socket.on('connect', () => {
    // console.log('Socket connected:', state.socket.id);
    if (state.currentUser) {
      announceParkingPresence();
    }
  });

  // When another user connects -> PLAY SOUND & SHOW TOAST
  state.socket.on('user:connected', (data) => {
    window.soundEngine.playUserConnected();
    showToast({
      title: '🚗 Nuevo compañero en el turno',
      message: data.message,
      avatar: data.user.avatarGif,
      type: 'arrival'
    });
  });

  // When a user leaves
  state.socket.on('user:left', (data) => {
    showToast({
      title: 'Salida de Turno',
      message: data.message,
      avatar: data.user ? data.user.avatarGif : null,
      type: 'info'
    });
  });

  // Parking lot update (active users list)
  state.socket.on('parking:update', (users) => {
    state.parkedUsers = users;
    renderParkingLot();
  });

  // Pop It Real-time sync
  state.socket.on('popit:created', (newPopIt) => {
    state.popits.unshift(newPopIt);
    renderBoard();
    window.soundEngine.playPop();
    showToast({
      title: '📌 Nuevo Pop It agregado',
      message: `${newPopIt.title} (${getColorLabel(newPopIt.color)})`,
      avatar: newPopIt.authorAvatar,
      type: 'info'
    });
  });

  state.socket.on('popit:updated', (updatedPopIt) => {
    const idx = state.popits.findIndex(p => p.id === updatedPopIt.id);
    if (idx !== -1) {
      state.popits[idx] = updatedPopIt;
    } else {
      state.popits.unshift(updatedPopIt);
    }
    renderBoard();
    window.soundEngine.playAlert();

    // If modal is open for this popit, re-render modal
    if (state.selectedPopitForDetail && state.selectedPopitForDetail.id === updatedPopIt.id) {
      state.selectedPopitForDetail = updatedPopIt;
      renderPopitDetailModal(updatedPopIt);
    }

    showToast({
      title: '⚡ ¡Pop It Modificado! (Resplandor 24h Activo)',
      message: `"${updatedPopIt.title}" fue modificado. Notificado a todos los turnos.`,
      avatar: updatedPopIt.authorAvatar,
      type: 'alert'
    });
  });

  state.socket.on('popit:deleted', (noteId) => {
    state.popits = state.popits.filter(p => p.id !== noteId);
    renderBoard();
    if (state.selectedPopitForDetail && state.selectedPopitForDetail.id === noteId) {
      closeModal('modal-popit-detail');
    }
  });

  state.socket.on('popit:comment_added', ({ popitId, comment }) => {
    const note = state.popits.find(p => p.id === popitId);
    if (note) {
      if (!note.comments) note.comments = [];
      note.comments.push(comment);
      renderBoard();

      if (state.selectedPopitForDetail && state.selectedPopitForDetail.id === popitId) {
        appendCommentToModal(comment);
      }
    }
  });

  state.socket.on('popit:signed', ({ popitId, signature }) => {
    const note = state.popits.find(p => p.id === popitId);
    if (note) {
      if (!note.signatures) note.signatures = [];
      note.signatures.push(signature);
      renderBoard();

      if (state.selectedPopitForDetail && state.selectedPopitForDetail.id === popitId) {
        renderPopitDetailModal(note);
      }
    }
  });

  state.socket.on('gifs:updated', (gifs) => {
    state.gifs = gifs;
    renderGifPickers();
  });
}

// 2. Fetch Board State from REST API
async function fetchInitialData() {
  try {
    const res = await fetch('/api/board');
    const data = await res.json();
    state.boards = data.boards || [];
    state.popits = data.popits || [];
    state.gifs = data.gifs || [];
    state.parkedUsers = data.activeParking || [];
    state.networkAddresses = data.networkAddresses || [];

    renderBoard();
    renderParkingLot();
    renderGifPickers();
    updateNetworkInviteModal();
  } catch (err) {
    console.error('Error fetching initial board data:', err);
  }
}

// 3. User Authentication & Presence
function loadSavedUser() {
  const saved = localStorage.getItem('popit_user');
  if (saved) {
    try {
      state.currentUser = JSON.parse(saved);
      updateUserNavUI();
      announceParkingPresence();
    } catch (e) {
      localStorage.removeItem('popit_user');
    }
  } else {
    // Show login modal if not logged in
    openModal('modal-auth');
  }
}

function saveUser(user) {
  state.currentUser = user;
  localStorage.setItem('popit_user', JSON.stringify(user));
  updateUserNavUI();
  announceParkingPresence();
}

function announceParkingPresence() {
  if (state.socket && state.currentUser) {
    state.socket.emit('parking:join', state.currentUser);
  }
}

function updateUserNavUI() {
  const userBtn = document.getElementById('user-profile-trigger');
  const adminOnlyBtns = document.querySelectorAll('.admin-only');

  if (state.currentUser) {
    userBtn.innerHTML = `
      <img src="${state.currentUser.avatarGif}" class="user-avatar-mini" alt="${state.currentUser.displayName}">
      <span class="user-name-label">${state.currentUser.displayName}</span>
      <span class="user-role-badge ${state.currentUser.role}">${state.currentUser.role === 'admin' ? 'ADMIN' : state.currentUser.shift}</span>
    `;

    // Show/hide admin specific buttons
    adminOnlyBtns.forEach(btn => {
      btn.style.display = state.currentUser.role === 'admin' ? 'inline-flex' : 'none';
    });
  } else {
    userBtn.innerHTML = `
      <span style="font-size: 1.2rem;">👤</span>
      <span class="user-name-label">Iniciar Sesión</span>
    `;
    adminOnlyBtns.forEach(btn => btn.style.display = 'none');
  }
}

// 4. Render Board Columns and Pop Its
function renderBoard() {
  const container = document.getElementById('columns-container');
  if (!container) return;

  // Filter Pop Its according to active filters
  const filteredPopits = state.popits.filter(p => {
    // Color filter
    if (state.activeColorFilter !== 'all' && p.color !== state.activeColorFilter) {
      return false;
    }
    // 24h Glow filter
    if (state.activeGlowFilter) {
      const isGlowing = isWithin24Hours(p.updatedAt);
      if (!isGlowing) return false;
    }
    // Search query
    if (state.searchQuery) {
      const q = state.searchQuery.toLowerCase();
      const matchTitle = (p.title || '').toLowerCase().includes(q);
      const matchContent = (p.content || '').toLowerCase().includes(q);
      const matchAuthor = (p.author || '').toLowerCase().includes(q);
      if (!matchTitle && !matchContent && !matchAuthor) return false;
    }
    return true;
  });

  // Update 24h glow count in filter button
  const glowingCount = state.popits.filter(p => isWithin24Hours(p.updatedAt)).length;
  const glowBadgeElem = document.getElementById('glow-count-badge');
  if (glowBadgeElem) {
    glowBadgeElem.textContent = glowingCount;
  }

  // Renderizar botones de salto rápido a columnas
  const jumpContainer = document.getElementById('column-jump-pills');
  if (jumpContainer) {
    jumpContainer.innerHTML = state.boards.map(col => {
      const parts = col.title.split(' ');
      const emoji = parts[0] || '📌';
      const label = parts[1] || col.id;
      return `<button class="column-jump-btn" data-target="col-${col.id}" title="Ir a ${col.title}">${emoji} ${label}</button>`;
    }).join('');

    jumpContainer.querySelectorAll('.column-jump-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const target = document.getElementById(btn.dataset.target);
        if (target) {
          target.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
        }
      });
    });
  }

  container.innerHTML = state.boards.map(col => {
    const colPopits = filteredPopits.filter(p => p.category === col.id);

    return `
      <div class="board-column" id="col-${col.id}" data-col-id="${col.id}">
        <div class="column-header">
          <div class="column-title-group">
            <span class="column-title">${col.title}</span>
          </div>
          <span class="column-count-badge">${colPopits.length}</span>
        </div>
        <div class="cards-container">
          ${colPopits.length === 0 ? `
            <div style="text-align: center; color: var(--text-dim); padding: 24px 12px; font-size: 0.8rem;">
              Sin notas en este tablero
            </div>
          ` : colPopits.map(p => renderPopitCard(p)).join('')}
        </div>
      </div>
    `;
  }).join('');

  // Add click listeners to cards
  document.querySelectorAll('.popit-card').forEach(card => {
    card.addEventListener('click', () => {
      const id = card.dataset.id;
      const popit = state.popits.find(p => p.id === id);
      if (popit) {
        window.soundEngine.playPop();
        openPopitDetail(popit);
      }
    });
  });
}

// 5. Render Individual Pop It Card with 24h Glow
function renderPopitCard(p) {
  const glowing = isWithin24Hours(p.updatedAt);
  const remainingTime = glowing ? getRemainingGlowTime(p.updatedAt) : null;
  const commentsCount = p.comments ? p.comments.length : 0;
  const signCount = p.signatures ? p.signatures.length : 0;

  return `
    <div class="popit-card color-${p.color} ${glowing ? 'popit-glowing' : ''}" data-id="${p.id}">
      <div class="popit-pin"></div>
      
      ${glowing ? `
        <div class="glow-badge-banner">
          <span class="glow-icon">⚡ MODIFICADO HOY</span>
          <span class="glow-timer-remaining">${remainingTime}</span>
        </div>
      ` : ''}

      <div class="popit-header">
        <h4 class="popit-title">${escapeHtml(p.title)}</h4>
      </div>

      <p class="popit-body">${escapeHtml(p.content)}</p>

      ${(glowing && p.changeSummary) ? `
        <div class="popit-change-box">
          <span class="change-title">✏️ Novedad de turno:</span>
          <span>${escapeHtml(p.changeSummary)}</span>
        </div>
      ` : ''}

      <div class="popit-footer">
        <div class="popit-author">
          <img src="${p.authorAvatar || 'https://media.giphy.com/media/unQ3IJU2RG7DO/giphy.gif'}" alt="${p.author}">
          <span>${escapeHtml(p.author)}</span>
        </div>
        <div class="popit-interactions">
          ${commentsCount > 0 ? `<span class="badge-comment-count">💬 ${commentsCount}</span>` : ''}
          ${signCount > 0 ? `<span class="badge-sign-count">✅ ${signCount}</span>` : ''}
        </div>
      </div>
    </div>
  `;
}

// 6. Estacionamiento de Turnos (Parking Lot)
function renderParkingLot() {
  const baysContainer = document.getElementById('parking-bays-scroll');
  const countBadge = document.getElementById('parking-online-count');
  if (!baysContainer) return;

  const totalSpots = Math.max(8, state.parkedUsers.length + 3);
  if (countBadge) {
    countBadge.textContent = state.parkedUsers.length;
  }

  let html = '';

  for (let i = 0; i < totalSpots; i++) {
    const spotNum = `P-${String(i + 1).padStart(2, '0')}`;
    const user = state.parkedUsers[i];

    if (user) {
      html += `
        <div class="parking-slot occupied">
          <span class="slot-number">${spotNum}</span>
          <div class="parked-user-card">
            <div class="parked-gif-container">
              <img src="${user.avatarGif || 'https://media.giphy.com/media/unQ3IJU2RG7DO/giphy.gif'}" alt="${user.displayName}">
              <div class="online-pulse-indicator"></div>
            </div>
            <div class="parked-user-info">
              <span class="parked-user-name">${escapeHtml(user.displayName)}</span>
              <span class="parked-user-shift">🕒 ${escapeHtml(user.shift)}</span>
              <span class="parked-user-status">${escapeHtml(user.status || 'Trabajando 📝')}</span>
            </div>
          </div>
        </div>
      `;
    } else {
      html += `
        <div class="parking-slot">
          <span class="slot-number">${spotNum}</span>
          <div class="empty-parking-slot">
            <span style="font-size: 1.1rem;">🅿️</span>
            <span>Espacio Disponible</span>
          </div>
        </div>
      `;
    }
  }

  baysContainer.innerHTML = html;
}

// 7. 24-Hour Resplandor (Glow) Calculations
function isWithin24Hours(dateString) {
  if (!dateString) return false;
  const noteDate = new Date(dateString).getTime();
  const now = Date.now();
  const diffMs = now - noteDate;
  return diffMs >= 0 && diffMs < (24 * 60 * 60 * 1000);
}

function getRemainingGlowTime(dateString) {
  const noteDate = new Date(dateString).getTime();
  const expireDate = noteDate + (24 * 60 * 60 * 1000);
  const remainingMs = expireDate - Date.now();

  if (remainingMs <= 0) return 'Expirado';

  const hours = Math.floor(remainingMs / (1000 * 60 * 60));
  const minutes = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60));

  return `${hours}h ${minutes}m restantes`;
}

function startGlowTicker() {
  // Update glow timers every 60 seconds
  setInterval(() => {
    document.querySelectorAll('.glow-timer-remaining').forEach(elem => {
      const card = elem.closest('.popit-card');
      if (card) {
        const id = card.dataset.id;
        const note = state.popits.find(p => p.id === id);
        if (note && isWithin24Hours(note.updatedAt)) {
          elem.textContent = getRemainingGlowTime(note.updatedAt);
        } else {
          renderBoard();
        }
      }
    });
  }, 60000);
}

// 8. Pop It Detail & Comments Modal
function openPopitDetail(popit) {
  state.selectedPopitForDetail = popit;
  renderPopitDetailModal(popit);
  openModal('modal-popit-detail');
}

function renderPopitDetailModal(p) {
  const container = document.getElementById('popit-detail-content');
  if (!container) return;

  const glowing = isWithin24Hours(p.updatedAt);
  const remainingGlow = glowing ? getRemainingGlowTime(p.updatedAt) : null;
  const isAdmin = state.currentUser && state.currentUser.role === 'admin';
  const hasSigned = state.currentUser && p.signatures && p.signatures.some(s => s.user === state.currentUser.displayName);

  container.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 12px;">
      <div>
        <span class="user-role-badge" style="background: var(--pop-${p.color}-border); color: #fff; margin-bottom: 6px; display: inline-block;">
          ${getColorLabel(p.color)}
        </span>
        <h2 style="font-size: 1.3rem; font-weight: 800; color: #fff;">${escapeHtml(p.title)}</h2>
      </div>
      ${isAdmin ? `
        <div style="display: flex; gap: 8px;">
          <button class="btn btn-secondary btn-sm" id="btn-edit-current-popit" style="padding: 6px 12px;">✏️ Editar</button>
          <button class="btn btn-secondary btn-sm" id="btn-delete-current-popit" style="padding: 6px 12px; color: #ef4444;">🗑️ Borrar</button>
        </div>
      ` : ''}
    </div>

    ${glowing ? `
      <div style="background: linear-gradient(135deg, rgba(245, 158, 11, 0.15), rgba(239, 68, 68, 0.15)); border: 1px solid #f59e0b; padding: 10px 14px; border-radius: 10px; margin-bottom: 16px;">
        <div style="display: flex; justify-content: space-between; align-items: center; font-weight: 700; color: #fbbf24; font-size: 0.85rem;">
          <span>⚡ RESPLANDOR ACTIVO (Turno Informado)</span>
          <span style="font-family: var(--font-mono);">${remainingGlow}</span>
        </div>
        <p style="font-size: 0.8rem; color: #cbd5e1; margin-top: 4px;">
          Modificado por <strong>${escapeHtml(p.lastModifiedBy || p.author)}</strong> (${escapeHtml(p.lastModifiedShift || 'Turno')}).
          ${p.changeSummary ? `<br><em>"${escapeHtml(p.changeSummary)}"</em>` : ''}
        </p>
      </div>
    ` : ''}

    <div style="background: rgba(0,0,0,0.25); padding: 14px; border-radius: 10px; font-size: 0.95rem; line-height: 1.5; color: #f1f5f9; margin-bottom: 16px; white-space: pre-wrap;">
      ${escapeHtml(p.content)}
    </div>

    <!-- Signatures Tray (Visto y Entendido por mi turno) -->
    <div style="margin-bottom: 18px;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
        <span style="font-size: 0.85rem; font-weight: 700; color: var(--text-muted);">
          ✅ Firmas de Relevo (${(p.signatures || []).length}):
        </span>
        ${state.currentUser && !hasSigned ? `
          <button class="btn btn-primary" id="btn-sign-popit" style="padding: 4px 10px; font-size: 0.75rem;">
            ✍️ Marcar Visto por mi Turno
          </button>
        ` : (hasSigned ? `<span style="font-size: 0.75rem; color: #10b981; font-weight: 700;">✓ Firmado por ti</span>` : '')}
      </div>
      <div class="signatures-tray">
        ${(p.signatures && p.signatures.length > 0) ? p.signatures.map(s => `
          <div class="signature-badge">
            <img src="${s.avatar || 'https://media.giphy.com/media/unQ3IJU2RG7DO/giphy.gif'}" alt="${s.user}">
            <span>${escapeHtml(s.user)} (${escapeHtml(s.shift)})</span>
          </div>
        `).join('') : '<span style="font-size: 0.78rem; color: var(--text-dim);">Aún no hay firmas de confirmación</span>'}
      </div>
    </div>

    <!-- Comments Section (Open to all Basic & Admin users) -->
    <div style="border-top: 1px solid var(--border-color); padding-top: 16px;">
      <h4 style="font-size: 0.9rem; font-weight: 700; margin-bottom: 12px; color: var(--text-main);">
        💬 Comentarios de Turnos (${(p.comments || []).length}):
      </h4>

      <div class="comments-list" id="modal-comments-list">
        ${(p.comments && p.comments.length > 0) ? p.comments.map(c => `
          <div class="comment-bubble">
            <img src="${c.avatar || 'https://media.giphy.com/media/unQ3IJU2RG7DO/giphy.gif'}" alt="${c.author}">
            <div style="flex: 1;">
              <div class="comment-meta">
                <span>${escapeHtml(c.author)}</span>
                <span style="font-size: 0.68rem; color: var(--text-dim); font-weight: normal;">• ${escapeHtml(c.shift)}</span>
              </div>
              <p class="comment-body">${escapeHtml(c.text)}</p>
            </div>
          </div>
        `).join('') : '<span style="font-size: 0.8rem; color: var(--text-dim);">No hay comentarios aún. ¡Escribe el primero!</span>'}
      </div>

      <!-- Add Comment Form -->
      <form id="form-add-comment" style="margin-top: 14px; display: flex; gap: 8px;">
        <input type="text" id="input-comment-text" class="form-control" placeholder="Escribe un comentario o consulta para este Pop It..." style="flex: 1;" required>
        <button type="submit" class="btn btn-primary">Enviar</button>
      </form>
    </div>
  `;

  // Attach buttons inside modal
  const editBtn = document.getElementById('btn-edit-current-popit');
  if (editBtn) {
    editBtn.addEventListener('click', () => {
      closeModal('modal-popit-detail');
      openEditPopitModal(p);
    });
  }

  const deleteBtn = document.getElementById('btn-delete-current-popit');
  if (deleteBtn) {
    deleteBtn.addEventListener('click', () => {
      if (confirm(`¿Eliminar definitivamente "${p.title}"?`)) {
        state.socket.emit('popit:delete', p.id);
        closeModal('modal-popit-detail');
      }
    });
  }

  const signBtn = document.getElementById('btn-sign-popit');
  if (signBtn) {
    signBtn.addEventListener('click', () => {
      if (!state.currentUser) {
        openModal('modal-auth');
        return;
      }
      state.socket.emit('popit:sign', {
        popitId: p.id,
        signature: {
          user: state.currentUser.displayName,
          shift: state.currentUser.shift,
          avatar: state.currentUser.avatarGif
        }
      });
      window.soundEngine.playPop();
    });
  }

  const commentForm = document.getElementById('form-add-comment');
  if (commentForm) {
    commentForm.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!state.currentUser) {
        openModal('modal-auth');
        return;
      }
      const textInput = document.getElementById('input-comment-text');
      const text = textInput.value.trim();
      if (!text) return;

      state.socket.emit('popit:add_comment', {
        popitId: p.id,
        comment: {
          author: state.currentUser.displayName,
          shift: state.currentUser.shift,
          avatar: state.currentUser.avatarGif,
          text
        }
      });

      window.soundEngine.playPop();
      textInput.value = '';
    });
  }
}

function appendCommentToModal(comment) {
  const list = document.getElementById('modal-comments-list');
  if (!list) return;

  const bubble = document.createElement('div');
  bubble.className = 'comment-bubble';
  bubble.innerHTML = `
    <img src="${comment.avatar || 'https://media.giphy.com/media/unQ3IJU2RG7DO/giphy.gif'}" alt="${comment.author}">
    <div style="flex: 1;">
      <div class="comment-meta">
        <span>${escapeHtml(comment.author)}</span>
        <span style="font-size: 0.68rem; color: var(--text-dim); font-weight: normal;">• ${escapeHtml(comment.shift)}</span>
      </div>
      <p class="comment-body">${escapeHtml(comment.text)}</p>
    </div>
  `;
  list.appendChild(bubble);
  list.scrollTop = list.scrollHeight;
}

// 9. Admin: Create & Edit Pop It Modals
function openCreatePopitModal() {
  state.editingPopitId = null;
  document.getElementById('modal-popit-form-title').textContent = '➕ Nuevo Pop It';
  document.getElementById('popit-form').reset();
  document.getElementById('popit-change-group').style.display = 'none'; // Only needed on modification

  // Populate category select
  const catSelect = document.getElementById('popit-category');
  catSelect.innerHTML = state.boards.map(b => `<option value="${b.id}">${b.title}</option>`).join('');

  openModal('modal-popit-editor');
}

function openEditPopitModal(popit) {
  state.editingPopitId = popit.id;
  document.getElementById('modal-popit-form-title').textContent = '✏️ Modificar Pop It (Activará Resplandor 24h)';
  
  document.getElementById('popit-title').value = popit.title;
  document.getElementById('popit-content').value = popit.content;
  
  const catSelect = document.getElementById('popit-category');
  catSelect.innerHTML = state.boards.map(b => `
    <option value="${b.id}" ${b.id === popit.category ? 'selected' : ''}>${b.title}</option>
  `).join('');

  // Select color radio
  const colorRadio = document.querySelector(`input[name="popit-color"][value="${popit.color}"]`);
  if (colorRadio) colorRadio.checked = true;

  // Show Change Summary input so the next shift knows what changed!
  const changeGroup = document.getElementById('popit-change-group');
  changeGroup.style.display = 'flex';
  document.getElementById('popit-change-summary').value = '';

  openModal('modal-popit-editor');
}

// 10. GIF Avatar Selector & Management
function renderGifPickers() {
  const containers = [
    document.getElementById('auth-gif-picker'),
    document.getElementById('admin-gif-manager-grid')
  ];

  containers.forEach(grid => {
    if (!grid) return;
    grid.innerHTML = state.gifs.map(g => `
      <div class="gif-option ${state.selectedGifForProfile === g.url ? 'selected' : ''}" data-url="${g.url}" data-id="${g.id}">
        <img src="${g.url}" alt="${g.name}" loading="lazy">
      </div>
    `).join('');

    grid.querySelectorAll('.gif-option').forEach(opt => {
      opt.addEventListener('click', () => {
        grid.querySelectorAll('.gif-option').forEach(o => o.classList.remove('selected'));
        opt.classList.add('selected');
        state.selectedGifForProfile = opt.dataset.url;
      });
    });
  });
}

// 11. Event Listeners Setup
function setupEventListeners() {
  // New Pop It button (Admin)
  const btnNewPopit = document.getElementById('btn-new-popit');
  if (btnNewPopit) {
    btnNewPopit.addEventListener('click', openCreatePopitModal);
  }

  // Manage GIFs button (Admin)
  const btnManageGifs = document.getElementById('btn-manage-gifs');
  if (btnManageGifs) {
    btnManageGifs.addEventListener('click', () => openModal('modal-gif-manager'));
  }

  // User Profile Trigger
  const profileTrigger = document.getElementById('user-profile-trigger');
  if (profileTrigger) {
    profileTrigger.addEventListener('click', () => {
      if (state.currentUser) {
        openModal('modal-user-menu');
      } else {
        openModal('modal-auth');
      }
    });
  }

  // Pop It Editor Form Submit
  const popitForm = document.getElementById('popit-form');
  if (popitForm) {
    popitForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const title = document.getElementById('popit-title').value.trim();
      const content = document.getElementById('popit-content').value.trim();
      const category = document.getElementById('popit-category').value;
      const colorRadio = document.querySelector('input[name="popit-color"]:checked');
      const color = colorRadio ? colorRadio.value : 'green';
      const changeSummary = document.getElementById('popit-change-summary').value.trim();

      if (!state.editingPopitId) {
        // Create new
        state.socket.emit('popit:create', {
          title,
          content,
          category,
          color,
          author: state.currentUser ? state.currentUser.displayName : 'Administrador',
          authorAvatar: state.currentUser ? state.currentUser.avatarGif : null,
          authorShift: state.currentUser ? state.currentUser.shift : 'Turno General',
          changeSummary: 'Nota recién publicada'
        });
      } else {
        // Update existing -> Triggers 24h glow!
        state.socket.emit('popit:update', {
          id: state.editingPopitId,
          title,
          content,
          category,
          color,
          modifierName: state.currentUser ? state.currentUser.displayName : 'Administrador',
          modifierShift: state.currentUser ? state.currentUser.shift : 'Turno',
          changeSummary: changeSummary || 'Contenido actualizado'
        });
      }

      closeModal('modal-popit-editor');
    });
  }

  // Color Filter Pills
  document.querySelectorAll('.color-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('.color-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      state.activeColorFilter = pill.dataset.color;
      renderBoard();
    });
  });

  // 24h Glow Filter Button
  const glowFilterBtn = document.getElementById('btn-glow-filter');
  if (glowFilterBtn) {
    glowFilterBtn.addEventListener('click', () => {
      state.activeGlowFilter = !state.activeGlowFilter;
      glowFilterBtn.classList.toggle('active', state.activeGlowFilter);
      renderBoard();
    });
  }

  // Search input
  const searchInput = document.getElementById('board-search-input');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      state.searchQuery = e.target.value.trim();
      renderBoard();
    });
  }

  // Mute Sound Toggle
  const muteBtn = document.getElementById('btn-toggle-sound');
  if (muteBtn) {
    updateMuteIcon(muteBtn);
    muteBtn.addEventListener('click', () => {
      const isMuted = window.soundEngine.toggleMute();
      updateMuteIcon(muteBtn);
      showToast({
        title: isMuted ? 'Silencio Activado' : 'Sonido Activado',
        message: isMuted ? 'Notificaciones sonoras en silencio' : 'Campana y avisos habilitados 🔔',
        type: 'info'
      });
    });
  }

  // Invite / Online LAN Modal
  const inviteBtn = document.getElementById('btn-invite-colleagues');
  if (inviteBtn) {
    inviteBtn.addEventListener('click', () => openModal('modal-invite'));
  }

  // Login Form Submit
  const formLogin = document.getElementById('form-login');
  if (formLogin) {
    formLogin.addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = document.getElementById('login-username').value.trim();
      const pin = document.getElementById('login-pin').value.trim();
      const errorMsg = document.getElementById('login-error-msg');

      try {
        const res = await fetch('/api/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, pin })
        });
        const data = await res.json();
        if (!res.ok) {
          errorMsg.textContent = data.error || 'Credenciales inválidas';
          errorMsg.style.display = 'block';
          return;
        }

        errorMsg.style.display = 'none';
        saveUser(data.user);
        closeModal('modal-auth');
        window.soundEngine.playUserConnected();
      } catch (err) {
        errorMsg.textContent = 'Error al conectar con el servidor';
        errorMsg.style.display = 'block';
      }
    });
  }

  // =========================================================================
  // GESTIÓN DE USUARIOS (SOLO ADMINISTRADOR)
  // =========================================================================
  const btnManageUsers = document.getElementById('btn-manage-users');
  if (btnManageUsers) {
    btnManageUsers.addEventListener('click', () => {
      openModal('modal-manage-users');
      renderAdminUserGifPicker();
      loadAdminUsersList();
    });
  }

  const tabAdminCreate = document.getElementById('tab-admin-create-user');
  const tabAdminList = document.getElementById('tab-admin-list-users');
  const viewAdminCreate = document.getElementById('view-admin-create-user');
  const viewAdminList = document.getElementById('view-admin-list-users');

  if (tabAdminCreate && tabAdminList) {
    tabAdminCreate.addEventListener('click', () => {
      tabAdminCreate.style.borderBottom = '2px solid var(--brand-primary)';
      tabAdminCreate.style.color = 'var(--text-main)';
      tabAdminList.style.borderBottom = 'none';
      tabAdminList.style.color = 'var(--text-muted)';
      viewAdminCreate.style.display = 'block';
      viewAdminList.style.display = 'none';
    });

    tabAdminList.addEventListener('click', () => {
      tabAdminList.style.borderBottom = '2px solid var(--brand-primary)';
      tabAdminList.style.color = 'var(--text-main)';
      tabAdminCreate.style.borderBottom = 'none';
      tabAdminCreate.style.color = 'var(--text-muted)';
      viewAdminList.style.display = 'block';
      viewAdminCreate.style.display = 'none';
      loadAdminUsersList();
    });
  }

  // Formulario de creación de cuenta por el Admin
  const formAdminCreateUser = document.getElementById('form-admin-create-user');
  if (formAdminCreateUser) {
    formAdminCreateUser.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!state.currentUser || state.currentUser.role !== 'admin') {
        alert('Solo el Administrador puede crear cuentas.');
        return;
      }

      const username = document.getElementById('admin-new-username').value.trim();
      const displayName = document.getElementById('admin-new-displayname').value.trim();
      const role = document.getElementById('admin-new-role').value;
      const shift = document.getElementById('admin-new-shift').value;
      const pin = document.getElementById('admin-new-pin').value.trim();
      const errorMsg = document.getElementById('admin-user-error-msg');

      try {
        const res = await fetch('/api/admin/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            adminUsername: state.currentUser.username,
            username,
            displayName,
            role,
            shift,
            pin,
            avatarGif: selectedAdminUserGif || (state.gifs[0] ? state.gifs[0].url : 'https://media.giphy.com/media/unQ3IJU2RG7DO/giphy.gif')
          })
        });

        const data = await res.json();
        if (!res.ok) {
          errorMsg.textContent = data.error || 'Error al crear usuario';
          errorMsg.style.display = 'block';
          return;
        }

        errorMsg.style.display = 'none';
        formAdminCreateUser.reset();
        showToast({
          title: '✅ Usuario creado',
          message: `Cuenta para "${data.user.displayName}" habilitada en ${data.user.shift}`,
          avatar: data.user.avatarGif
        });

        // Ir a la pestaña de lista de usuarios
        if (tabAdminList) tabAdminList.click();
      } catch (err) {
        errorMsg.textContent = 'Error de conexión con el servidor';
        errorMsg.style.display = 'block';
      }
    });
  }

  // Admin Upload GIF File
  const formUploadGif = document.getElementById('form-upload-gif');
  if (formUploadGif) {
    formUploadGif.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fileInput = document.getElementById('input-gif-file');
      const nameInput = document.getElementById('input-gif-name');
      if (!fileInput.files[0]) return;

      const formData = new FormData();
      formData.append('gifFile', fileInput.files[0]);
      formData.append('name', nameInput.value.trim() || fileInput.files[0].name);

      try {
        const res = await fetch('/api/gifs/upload', {
          method: 'POST',
          body: formData
        });
        const data = await res.json();
        if (res.ok) {
          fileInput.value = '';
          nameInput.value = '';
          showToast({ title: '✅ GIF Subido', message: 'Nuevo GIF agregado a la galería de perfiles', type: 'info' });
        }
      } catch (err) {
        alert('Error al subir archivo');
      }
    });
  }

  // Admin Add GIF by URL
  const formAddGifUrl = document.getElementById('form-add-gif-url');
  if (formAddGifUrl) {
    formAddGifUrl.addEventListener('submit', async (e) => {
      e.preventDefault();
      const urlInput = document.getElementById('input-gif-url');
      const nameInput = document.getElementById('input-gif-url-name');
      const url = urlInput.value.trim();
      const name = nameInput.value.trim();

      try {
        const res = await fetch('/api/gifs/add-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url, name })
        });
        if (res.ok) {
          urlInput.value = '';
          nameInput.value = '';
          showToast({ title: '✅ GIF Enlazado', message: 'Se agregó el GIF web a la galería', type: 'info' });
        }
      } catch (err) {
        alert('Error al registrar GIF');
      }
    });
  }

  // Change status in parking lot (e.g., "En pausa café ☕")
  const statusSelect = document.getElementById('select-my-status');
  if (statusSelect) {
    statusSelect.addEventListener('change', () => {
      if (state.socket) {
        state.socket.emit('parking:status', statusSelect.value);
      }
    });
  }

  // Logout button
  const logoutBtn = document.getElementById('btn-logout');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      localStorage.removeItem('popit_user');
      state.currentUser = null;
      window.location.reload();
    });
  }

  // Parking Sidebar Toggle & Re-open Handler
  const parkingToggle = document.getElementById('parking-toggle-btn');
  const parkingSidebar = document.getElementById('parking-sidebar');
  if (parkingToggle && parkingSidebar) {
    function updateParkingToggleUI() {
      const isCollapsed = parkingSidebar.classList.contains('collapsed');
      parkingToggle.innerHTML = isCollapsed ? '◀<span style="font-size: 10px;">🚗</span>' : '▶';
      parkingToggle.title = isCollapsed ? 'Expandir Estacionamiento' : 'Contraer Estacionamiento';
    }

    parkingToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      parkingSidebar.classList.toggle('collapsed');
      updateParkingToggleUI();
    });

    // Si hacen clic en el borde visible del estacionamiento colapsado, abrirlo
    parkingSidebar.addEventListener('click', (e) => {
      if (parkingSidebar.classList.contains('collapsed') && e.target !== parkingToggle) {
        parkingSidebar.classList.remove('collapsed');
        updateParkingToggleUI();
      }
    });

    updateParkingToggleUI();
  }

  // =========================================================================
  // NAVEGACIÓN Y DESPLAZAMIENTO HORIZONTAL DEL TABLERO
  // =========================================================================
  const boardViewport = document.getElementById('board-viewport');
  const btnScrollLeft = document.getElementById('btn-board-scroll-left');
  const btnScrollRight = document.getElementById('btn-board-scroll-right');

  if (btnScrollLeft && boardViewport) {
    btnScrollLeft.addEventListener('click', () => {
      boardViewport.scrollBy({ left: -360, behavior: 'smooth' });
    });
  }

  if (btnScrollRight && boardViewport) {
    btnScrollRight.addEventListener('click', () => {
      boardViewport.scrollBy({ left: 360, behavior: 'smooth' });
    });
  }

  if (boardViewport) {
    // Desplazamiento horizontal con la rueda del ratón
    boardViewport.addEventListener('wheel', (e) => {
      const cardsCont = e.target.closest('.cards-container');
      if (cardsCont && cardsCont.scrollHeight > cardsCont.clientHeight) {
        const atBottom = e.deltaY > 0 && cardsCont.scrollTop + cardsCont.clientHeight >= cardsCont.scrollHeight - 2;
        const atTop = e.deltaY < 0 && cardsCont.scrollTop <= 2;
        if (!atBottom && !atTop) {
          return; // Permitir scroll vertical normal dentro de la columna
        }
      }
      if (e.deltaY !== 0) {
        boardViewport.scrollLeft += e.deltaY * 1.5;
      }
    }, { passive: true });

    // Arrastrar con el ratón (pan drag)
    let isDown = false;
    let startX = 0;
    let initialScrollLeft = 0;

    boardViewport.addEventListener('mousedown', (e) => {
      if (e.target.closest('.popit-card') || e.target.closest('button') || e.target.closest('input') || e.target.closest('select')) return;
      isDown = true;
      boardViewport.style.cursor = 'grabbing';
      startX = e.pageX - boardViewport.offsetLeft;
      initialScrollLeft = boardViewport.scrollLeft;
    });

    window.addEventListener('mouseup', () => {
      isDown = false;
      if (boardViewport) boardViewport.style.cursor = 'default';
    });

    boardViewport.addEventListener('mousemove', (e) => {
      if (!isDown) return;
      e.preventDefault();
      const x = e.pageX - boardViewport.offsetLeft;
      const walk = (x - startX) * 1.6;
      boardViewport.scrollLeft = initialScrollLeft - walk;
    });
  }

  // Theme switch (Cork / Dark Carbon)
  const themeToggle = document.getElementById('btn-toggle-theme');
  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      document.body.classList.toggle('theme-cork');
      const isCork = document.body.classList.contains('theme-cork');
      localStorage.setItem('popit_theme', isCork ? 'cork' : 'carbon');
      themeToggle.textContent = isCork ? '🪵' : '🏁';
    });
    if (localStorage.getItem('popit_theme') === 'cork') {
      document.body.classList.add('theme-cork');
      themeToggle.textContent = '🪵';
    }
  }

  // Generic Modal Close listeners
  document.querySelectorAll('.modal-close-btn, .modal-backdrop').forEach(elem => {
    elem.addEventListener('click', (e) => {
      if (e.target === elem) {
        const modal = elem.closest('.modal-backdrop') || elem;
        modal.classList.remove('open');
      }
    });
  });
}

// 12. Modal Utility Helpers
function openModal(id) {
  const modal = document.getElementById(id);
  if (modal) {
    modal.classList.add('open');
  }
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (modal) {
    modal.classList.remove('open');
  }
}

// 13. Toast Notification Helper
function showToast({ title, message, avatar, type }) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type || 'info'}`;
  toast.innerHTML = `
    ${avatar ? `<img src="${avatar}" alt="avatar">` : '<span style="font-size: 1.5rem;">🔔</span>'}
    <div class="toast-text">
      <strong style="display: block; font-size: 0.82rem; color: #fff;">${escapeHtml(title)}</strong>
      <span style="color: #cbd5e1; font-size: 0.78rem;">${escapeHtml(message)}</span>
    </div>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(50px)';
    setTimeout(() => toast.remove(), 300);
  }, 4500);
}

// 14. Network Addresses for Online Team Connections
function updateNetworkInviteModal() {
  const listElem = document.getElementById('network-addresses-list');
  if (!listElem) return;

  if (state.networkAddresses && state.networkAddresses.length > 0) {
    listElem.innerHTML = state.networkAddresses.map(addr => `
      <div style="display: flex; align-items: center; justify-content: space-between; background: var(--bg-dark); padding: 10px 14px; border-radius: 8px; border: 1px solid var(--border-color);">
        <code style="font-family: var(--font-mono); color: var(--brand-primary); font-size: 0.9rem;">${addr}</code>
        <button class="btn btn-secondary btn-sm" onclick="navigator.clipboard.writeText('${addr}'); showToast({title: 'Copiado', message: 'Enlace copiado al portapapeles', type: 'info'});">
          📋 Copiar
        </button>
      </div>
    `).join('');
  } else {
    listElem.innerHTML = `<span style="font-size: 0.85rem; color: var(--text-dim);">http://localhost:3000</span>`;
  }
}

// 15. Helper: Current Shift Detection based on local time
function detectCurrentShift() {
  const hour = new Date().getHours();
  let shiftName = 'Turno Mañana';
  if (hour >= 14 && hour < 22) {
    shiftName = 'Turno Tarde';
  } else if (hour >= 22 || hour < 6) {
    shiftName = 'Turno Noche';
  }

  const badge = document.getElementById('current-shift-name');
  if (badge) {
    badge.textContent = `${shiftName} en Curso`;
  }
}

// 16. Utility Helpers
function getColorLabel(color) {
  const map = {
    green: '🟢 Informativo',
    red: '🚨 Urgente / Alerta',
    yellow: '⚠️ Precaución / Pendiente',
    blue: '🔍 Procedimiento / Calidad',
    purple: '🌙 Relevo de Turno',
    orange: '🟠 Mantenimiento'
  };
  return map[color] || 'Nota';
}

function updateMuteIcon(btn) {
  const isMuted = window.soundEngine.isMuted();
  btn.innerHTML = isMuted ? '🔇' : '🔔';
  btn.title = isMuted ? 'Activar sonido de turno' : 'Silenciar sonidos';
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// 17. Funciones para Administración de Usuarios
let selectedAdminUserGif = null;

function renderAdminUserGifPicker() {
  const container = document.getElementById('admin-user-gif-picker');
  if (!container) return;
  if (!selectedAdminUserGif && state.gifs.length > 0) {
    selectedAdminUserGif = state.gifs[0].url;
  }
  container.innerHTML = state.gifs.map(g => `
    <div class="gif-picker-item ${selectedAdminUserGif === g.url ? 'selected' : ''}" data-url="${g.url}">
      <img src="${g.url}" alt="${g.title}">
    </div>
  `).join('');

  container.querySelectorAll('.gif-picker-item').forEach(item => {
    item.addEventListener('click', () => {
      container.querySelectorAll('.gif-picker-item').forEach(i => i.classList.remove('selected'));
      item.classList.add('selected');
      selectedAdminUserGif = item.dataset.url;
    });
  });
}

async function loadAdminUsersList() {
  const container = document.getElementById('admin-users-list-container');
  const countBadge = document.getElementById('admin-users-count');
  if (!container) return;

  try {
    const res = await fetch('/api/admin/users');
    const users = await res.json();
    if (countBadge) countBadge.textContent = users.length;

    container.innerHTML = users.map(u => `
      <div class="admin-user-card">
        <div class="admin-user-left">
          <img src="${u.avatarGif}" class="admin-user-avatar" alt="${u.displayName}">
          <div class="admin-user-info">
            <span class="admin-user-name">${escapeHtml(u.displayName)}</span>
            <span class="admin-user-username">@${escapeHtml(u.username)}</span>
            <div class="admin-user-tags">
              <span class="role-badge ${u.role}">${u.role === 'admin' ? 'ADMINISTRADOR' : 'OPERADOR'}</span>
              <span class="shift-tag">${escapeHtml(u.shift)}</span>
            </div>
          </div>
        </div>
        <div class="admin-user-actions">
          <span class="admin-pin-badge" title="PIN o contraseña">🔑 PIN: ${escapeHtml(u.pin || '1234')}</span>
          ${u.username !== 'admin' ? `
            <button class="btn-delete-user" data-user-id="${u.id}" data-username="${u.username}">
              🗑️ Eliminar
            </button>
          ` : `
            <span style="font-size: 0.72rem; color: #f59e0b; padding: 4px 8px; font-weight: 700;">★ Principal</span>
          `}
        </div>
      </div>
    `).join('');

    // Eventos para eliminar usuario
    container.querySelectorAll('.btn-delete-user').forEach(btn => {
      btn.addEventListener('click', async () => {
        const uId = btn.dataset.userId;
        const uName = btn.dataset.username;
        if (!confirm(`¿Eliminar al usuario "@${uName}"? No podrá volver a ingresar.`)) return;

        try {
          const res = await fetch(`/api/admin/users/${uId}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ adminUsername: state.currentUser ? state.currentUser.username : 'admin' })
          });
          const resData = await res.json();
          if (res.ok) {
            showToast({
              title: '🗑️ Usuario eliminado',
              message: `El usuario @${uName} fue removido del sistema.`
            });
            loadAdminUsersList();
          } else {
            alert(resData.error || 'Error al eliminar usuario');
          }
        } catch (e) {
          alert('Error de conexión al eliminar usuario');
        }
      });
    });
  } catch (err) {
    container.innerHTML = '<div style="color: #ef4444; padding: 16px;">Error al cargar la lista de usuarios.</div>';
  }
}
