const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const multer = require('multer');
const os = require('os');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const UPLOAD_DIR = path.join(__dirname, 'public', 'uploads', 'gifs');

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(__dirname));

// Asegurar carga de index.html en la raíz
app.get('/', (req, res) => {
  const publicIndex = path.join(__dirname, 'public', 'index.html');
  const rootIndex = path.join(__dirname, 'index.html');
  if (fs.existsSync(publicIndex)) {
    return res.sendFile(publicIndex);
  } else if (fs.existsSync(rootIndex)) {
    return res.sendFile(rootIndex);
  }
  res.status(404).send('No se encontró index.html');
});

// Configure Multer for GIF uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (!fs.existsSync(UPLOAD_DIR)) {
      fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    }
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.gif';
    const uniqueName = `gif_${Date.now()}_${Math.random().toString(36).substring(2, 8)}${ext}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB limit
  fileFilter: (req, file, cb) => {
    const allowed = /\.(gif|webp|png|jpe?g)$/i;
    if (!file.originalname.match(allowed)) {
      return cb(new Error('Solo se permiten archivos GIF, WebP o imágenes'));
    }
    cb(null, true);
  }
});

// JSON File Helpers
function readJson(filename, defaultValue = []) {
  try {
    const filepath = path.join(DATA_DIR, filename);
    if (!fs.existsSync(filepath)) {
      fs.writeFileSync(filepath, JSON.stringify(defaultValue, null, 2), 'utf-8');
      return defaultValue;
    }
    const data = fs.readFileSync(filepath, 'utf-8');
    return JSON.parse(data || '[]');
  } catch (err) {
    console.error(`Error reading ${filename}:`, err);
    return defaultValue;
  }
}

function writeJson(filename, data) {
  try {
    const filepath = path.join(DATA_DIR, filename);
    fs.writeFileSync(filepath, JSON.stringify(data, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.error(`Error writing ${filename}:`, err);
    return false;
  }
}

// Get Local Network IPs for easy colleague connections
function getNetworkAddresses() {
  const interfaces = os.networkInterfaces();
  const addresses = [];
  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        addresses.push(`http://${net.address}:${PORT}`);
      }
    }
  }
  return addresses;
}

// Active Connected Users (Parking Lot)
// socketId -> { socketId, userId, username, displayName, role, shift, avatarGif, connectedAt, status }
const connectedUsers = new Map();

// REST API ROUTES

// 1. Initial State (Protegido: exige sesión activa para proteger los datos)
app.get('/api/board', (req, res) => {
  const userId = req.headers['x-user-id'] || req.query.userId;
  const users = readJson('users.json', []);
  const validUser = users.find(u => u.id === userId);

  if (!validUser) {
    return res.status(401).json({
      error: 'Acceso no autorizado: debes iniciar sesión con tu cuenta para ver el tablero.',
      requiresLogin: true
    });
  }

  const boards = readJson('boards.json', []);
  const popits = readJson('popits.json', []);
  const gifs = readJson('gifs.json', []);
  const safeUsers = users.map(u => ({
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    role: u.role,
    shift: u.shift,
    avatarGif: u.avatarGif
  }));

  res.json({
    boards,
    popits,
    gifs,
    users: safeUsers,
    activeParking: Array.from(connectedUsers.values()),
    networkAddresses: getNetworkAddresses()
  });
});

// 2. Login
app.post('/api/login', (req, res) => {
  const { username, pin } = req.body;
  if (!username) {
    return res.status(400).json({ error: 'Nombre de usuario requerido' });
  }

  const users = readJson('users.json', []);
  const user = users.find(u => u.username.toLowerCase() === username.trim().toLowerCase());

  if (!user) {
    return res.status(404).json({ error: 'Usuario no encontrado' });
  }

  // Check pin if user has one
  if (user.pin && user.pin !== (pin || '').trim()) {
    return res.status(401).json({ error: 'PIN o contraseña incorrecta' });
  }

  res.json({
    success: true,
    user: {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      role: user.role,
      shift: user.shift,
      avatarGif: user.avatarGif
    }
  });
});

// 3. Admin User Management (Solo el Administrador puede crear y gestionar cuentas)
app.get('/api/admin/users', (req, res) => {
  const users = readJson('users.json', []);
  // Devolver usuarios sin exponer contraseñas innecesariamente, pero permitiendo al admin ver los operadores
  res.json(users);
});

app.post('/api/admin/users', (req, res) => {
  const { adminUsername, username, displayName, role, shift, avatarGif, pin } = req.body;
  const users = readJson('users.json', []);

  // Verificar que el solicitante sea Administrador
  const admin = users.find(u => u.username.toLowerCase() === (adminUsername || '').toLowerCase() && u.role === 'admin');
  if (!admin) {
    return res.status(403).json({ error: 'Acceso denegado: Solo el Administrador puede crear cuentas de usuario.' });
  }

  if (!username || !displayName) {
    return res.status(400).json({ error: 'Nombre de usuario y Nombre completo son obligatorios.' });
  }

  const cleanUsername = username.trim().toLowerCase();
  const existing = users.find(u => u.username.toLowerCase() === cleanUsername);
  if (existing) {
    return res.status(409).json({ error: `El usuario "${cleanUsername}" ya existe en el sistema.` });
  }

  const newUser = {
    id: `usr-${Date.now()}`,
    username: cleanUsername,
    displayName: displayName.trim(),
    role: role === 'admin' ? 'admin' : 'basic',
    pin: pin ? pin.trim() : '1234',
    shift: shift || 'Turno Mañana',
    avatarGif: avatarGif || 'https://media.giphy.com/media/unQ3IJU2RG7DO/giphy.gif',
    createdAt: new Date().toISOString()
  };

  users.push(newUser);
  writeJson('users.json', users);

  res.status(201).json({
    success: true,
    user: newUser
  });
});

app.delete('/api/admin/users/:id', (req, res) => {
  const { id } = req.params;
  const { adminUsername } = req.body;
  const users = readJson('users.json', []);

  // Verificar admin
  const admin = users.find(u => u.username.toLowerCase() === (adminUsername || '').toLowerCase() && u.role === 'admin');
  if (!admin) {
    return res.status(403).json({ error: 'Acceso denegado: Solo el Administrador puede eliminar usuarios.' });
  }

  const userToDelete = users.find(u => u.id === id);
  if (!userToDelete) {
    return res.status(404).json({ error: 'Usuario no encontrado.' });
  }

  if (userToDelete.username === 'admin') {
    return res.status(400).json({ error: 'No es posible eliminar al Administrador Principal.' });
  }

  const updatedUsers = users.filter(u => u.id !== id);
  writeJson('users.json', updatedUsers);

  res.json({ success: true, message: `Usuario ${userToDelete.username} eliminado correctamente.` });
});

// Desactivar registro público
app.post('/api/register', (req, res) => {
  res.status(403).json({ error: 'El registro público está desactivado. Solo el administrador puede crear nuevas cuentas.' });
});

// 4. Update Profile (Permite a cualquier usuario cambiar su nombre, username, PIN, turno y GIF)
app.post('/api/users/profile', (req, res) => {
  const { userId, username, pin, shift, avatarGif, displayName } = req.body;
  const users = readJson('users.json', []);
  const user = users.find(u => u.id === userId);

  if (!user) {
    return res.status(404).json({ error: 'Usuario no encontrado' });
  }

  // Si desea cambiar su username, verificar que no esté ocupado por otra persona
  if (username && username.trim().toLowerCase() !== user.username) {
    const cleanUsername = username.trim().toLowerCase();
    const isTaken = users.some(u => u.id !== userId && u.username.toLowerCase() === cleanUsername);
    if (isTaken) {
      return res.status(409).json({ error: `El nombre de usuario "${cleanUsername}" ya está en uso por otro operador.` });
    }
    user.username = cleanUsername;
  }

  if (displayName && displayName.trim()) {
    user.displayName = displayName.trim();
  }

  if (pin && pin.trim()) {
    user.pin = pin.trim();
  }

  if (shift) user.shift = shift;
  if (avatarGif) user.avatarGif = avatarGif;

  writeJson('users.json', users);

  // Actualizar en vivo en el estacionamiento de turnos
  for (const [sId, connected] of connectedUsers.entries()) {
    if (connected.userId === userId) {
      connected.shift = user.shift;
      connected.avatarGif = user.avatarGif;
      connected.displayName = user.displayName;
      connected.username = user.username;
    }
  }
  io.emit('parking:update', Array.from(connectedUsers.values()));

  res.json({
    success: true,
    message: 'Perfil y credenciales actualizadas con éxito.',
    user: {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      role: user.role,
      shift: user.shift,
      avatarGif: user.avatarGif,
      pin: user.pin
    }
  });
});

// 5. Admin: Upload GIF
app.post('/api/gifs/upload', upload.single('gifFile'), (req, res) => {
  const { name, category } = req.body;
  if (!req.file) {
    return res.status(400).json({ error: 'No se subió ningún archivo' });
  }

  const fileUrl = `/uploads/gifs/${req.file.filename}`;
  const gifs = readJson('gifs.json', []);

  const newGif = {
    id: `gif-${Date.now()}`,
    name: name ? name.trim() : req.file.originalname,
    url: fileUrl,
    category: category || 'personalizado',
    tags: ['subido', 'admin']
  };

  gifs.unshift(newGif);
  writeJson('gifs.json', gifs);

  io.emit('gifs:updated', gifs);

  res.status(201).json({
    success: true,
    gif: newGif,
    gifs
  });
});

// 6. Admin: Add GIF via URL
app.post('/api/gifs/add-url', (req, res) => {
  const { name, url, category } = req.body;
  if (!url || !url.startsWith('http')) {
    return res.status(400).json({ error: 'URL de GIF inválida' });
  }

  const gifs = readJson('gifs.json', []);
  const newGif = {
    id: `gif-${Date.now()}`,
    name: name ? name.trim() : 'GIF de Internet',
    url: url.trim(),
    category: category || 'web',
    tags: ['enlace', 'admin']
  };

  gifs.unshift(newGif);
  writeJson('gifs.json', gifs);

  io.emit('gifs:updated', gifs);

  res.status(201).json({
    success: true,
    gif: newGif,
    gifs
  });
});

// 7. Admin: Delete GIF
app.delete('/api/gifs/:id', (req, res) => {
  const { id } = req.params;
  let gifs = readJson('gifs.json', []);
  gifs = gifs.filter(g => g.id !== id);
  writeJson('gifs.json', gifs);
  io.emit('gifs:updated', gifs);
  res.json({ success: true, gifs });
});

// 8. Network addresses for quick share
app.get('/api/network', (req, res) => {
  res.json({
    addresses: getNetworkAddresses(),
    port: PORT
  });
});

// SOCKET.IO REAL-TIME LOGIC
io.on('connection', (socket) => {
  // console.log(`Socket conectado: ${socket.id}`);

  // User enters shift parking lot
  socket.on('parking:join', (userData) => {
    if (!userData || !userData.username) return;

    const userObj = {
      socketId: socket.id,
      userId: userData.id || `usr-${Date.now()}`,
      username: userData.username,
      displayName: userData.displayName || userData.username,
      role: userData.role || 'basic',
      shift: userData.shift || 'Turno Mañana',
      avatarGif: userData.avatarGif || 'https://media.giphy.com/media/unQ3IJU2RG7DO/giphy.gif',
      connectedAt: new Date().toISOString(),
      status: 'Trabajando en el tablero 📝'
    };

    connectedUsers.set(socket.id, userObj);

    // Broadcast sound and entrance notification to all other clients
    socket.broadcast.emit('user:connected', {
      user: userObj,
      message: `🔔 ¡${userObj.displayName} se ha estacionado en el turno (${userObj.shift})!`
    });

    // Broadcast current parking lot state to everyone
    io.emit('parking:update', Array.from(connectedUsers.values()));
  });

  // User updates status (e.g. "En pausa café ☕")
  socket.on('parking:status', (statusText) => {
    if (connectedUsers.has(socket.id)) {
      const user = connectedUsers.get(socket.id);
      user.status = statusText;
      io.emit('parking:update', Array.from(connectedUsers.values()));
    }
  });

  // Admin creates Pop It
  socket.on('popit:create', (noteData) => {
    const popits = readJson('popits.json', []);
    const nowIso = new Date().toISOString();

    const newPopIt = {
      id: `pop-${Date.now()}`,
      title: noteData.title || 'Nota sin título',
      content: noteData.content || '',
      color: noteData.color || 'green',
      category: noteData.category || 'col-general',
      author: noteData.author || 'Administrador',
      authorAvatar: noteData.authorAvatar || 'https://media.giphy.com/media/krewXUB6LBja/giphy.gif',
      authorRole: noteData.authorRole || 'admin',
      priority: noteData.priority || 'normal',
      createdAt: nowIso,
      updatedAt: nowIso, // Initial creation starts the 24h glow!
      lastModifiedBy: noteData.author || 'Administrador',
      lastModifiedShift: noteData.authorShift || 'Turno General',
      changeSummary: noteData.changeSummary || 'Creado inicialmente',
      pinned: !!noteData.pinned,
      signatures: [],
      comments: []
    };

    popits.unshift(newPopIt);
    writeJson('popits.json', popits);

    io.emit('popit:created', newPopIt);
  });

  // Admin modifies Pop It (Starts the 24h Glow!)
  socket.on('popit:update', (updatedData) => {
    const popits = readJson('popits.json', []);
    const index = popits.findIndex(p => p.id === updatedData.id);

    if (index !== -1) {
      const nowIso = new Date().toISOString();
      const existing = popits[index];

      popits[index] = {
        ...existing,
        ...updatedData,
        updatedAt: nowIso, // Exact moment of change -> activates 24h glow!
        lastModifiedBy: updatedData.modifierName || existing.author,
        lastModifiedShift: updatedData.modifierShift || 'Turno General',
        changeSummary: updatedData.changeSummary || 'Contenido modificado'
      };

      writeJson('popits.json', popits);

      // Notify everyone of the modified Pop It with glow
      io.emit('popit:updated', popits[index]);
    }
  });

  // Admin deletes Pop It
  socket.on('popit:delete', (noteId) => {
    let popits = readJson('popits.json', []);
    popits = popits.filter(p => p.id !== noteId);
    writeJson('popits.json', popits);

    io.emit('popit:deleted', noteId);
  });

  // Any user adds a comment to a Pop It
  socket.on('popit:add_comment', (data) => {
    const { popitId, comment } = data;
    const popits = readJson('popits.json', []);
    const note = popits.find(p => p.id === popitId);

    if (note) {
      if (!note.comments) note.comments = [];
      const newComment = {
        id: `c-${Date.now()}`,
        author: comment.author || 'Compañero',
        shift: comment.shift || 'Turno',
        avatar: comment.avatar || 'https://media.giphy.com/media/unQ3IJU2RG7DO/giphy.gif',
        text: comment.text,
        createdAt: new Date().toISOString()
      };

      note.comments.push(newComment);
      writeJson('popits.json', popits);

      io.emit('popit:comment_added', { popitId, comment: newComment });
    }
  });

  // Any user signs / acknowledges a Pop It ("Leído y Entendido por mi turno")
  socket.on('popit:sign', (data) => {
    const { popitId, signature } = data;
    const popits = readJson('popits.json', []);
    const note = popits.find(p => p.id === popitId);

    if (note) {
      if (!note.signatures) note.signatures = [];
      // Check if user already signed
      const alreadySigned = note.signatures.some(s => s.user === signature.user);
      if (!alreadySigned) {
        const signEntry = {
          user: signature.user,
          shift: signature.shift,
          time: new Date().toISOString(),
          avatar: signature.avatar
        };
        note.signatures.push(signEntry);
        writeJson('popits.json', popits);

        io.emit('popit:signed', { popitId, signature: signEntry });
      }
    }
  });

  // Handle Disconnect
  socket.on('disconnect', () => {
    if (connectedUsers.has(socket.id)) {
      const leavingUser = connectedUsers.get(socket.id);
      connectedUsers.delete(socket.id);

      io.emit('user:left', {
        user: leavingUser,
        message: `🚗 ${leavingUser.displayName} salió del estacionamiento.`
      });

      io.emit('parking:update', Array.from(connectedUsers.values()));
    }
  });
});

// Start Server
server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n======================================================`);
  console.log(`🚗 TABLERO POP IT EASY DRIVE INICIADO`);
  console.log(`======================================================`);
  console.log(`📡 Local:            http://localhost:${PORT}`);
  const addresses = getNetworkAddresses();
  if (addresses.length > 0) {
    console.log(`🌐 En tu Red Local (para tus compañeros):`);
    addresses.forEach(addr => console.log(`   👉 ${addr}`));
  }
  console.log(`⚡ Resplandor de 24 horas: ACTIVO`);
  console.log(`🅿️  Estacionamiento en vivo: ACTIVO`);
  console.log(`======================================================\n`);
});
