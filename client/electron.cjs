const { app, BrowserWindow } = require('electron');
const path = require('path');
const { fork } = require('child_process'); // ¡Importante para iniciar el backend!

// Mantenemos una referencia global al proceso del backend para poder cerrarlo
let backendProcess;

// --- Detección de Modo ---
// app.isPackaged es 'true' cuando se ejecuta desde el .exe
const isDev = !app.isPackaged;

function createBackend() {
  // Ruta al backend compilado
  // __dirname apunta a la raíz de 'client'
  // En producción, 'server' estará empaquetado DENTRO de los recursos de la app
  const serverPath = isDev
    ? path.join(__dirname, '../server/dist/index.js') // Modo Desarrollo (apunta a la carpeta original)
    : path.join(process.resourcesPath, 'server/dist/index.js'); // Modo Producción (apunta a los recursos empaquetados)

  console.log(`[Electron] Iniciando backend en: ${serverPath}`);

  backendProcess = fork(serverPath, {
    // Silencioso para que no herede los logs de Electron
    silent: false,
    // Pasamos variables de entorno (¡MUY IMPORTANTE para Prisma!)
    // Le decimos a Prisma dónde encontrar la base de datos dentro del .exe
    env: {
      ...process.env,
      DATABASE_URL: isDev
        ? 'file:../server/dev.db'
        : `file:${path.join(process.resourcesPath, 'server/dev.db')}`,
    },
  });

  backendProcess.on('message', (msg) => console.log('[Backend]', msg));
  backendProcess.on('error', (err) => console.error('[Backend Error]', err));
  backendProcess.on('exit', (code) => console.log(`[Backend] Salió con código ${code}`));
}

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
    },
  });

  if (isDev) {
    // --- Modo Desarrollo ---
    // Carga el servidor de Vite (el que usamos antes)
    console.log('[Electron] Cargando URL de desarrollo: http://localhost:5173');
    mainWindow.loadURL('http://localhost:5173');
    // mainWindow.webContents.openDevTools(); // Abrir F12
  } else {
    // --- Modo Producción ---
    // Carga el archivo HTML estático compilado
    const indexPath = path.join(__dirname, 'dist/index.html');
    console.log(`[Electron] Cargando archivo de producción: ${indexPath}`);
    mainWindow.loadFile(indexPath);
  }
}

app.whenReady().then(() => {
  // ¡MUY IMPORTANTE!
  // Inicia el backend ANTES de crear la ventana
  // (Solo en producción, porque en desarrollo ya lo hacemos con concurrently)
  if (!isDev) {
    createBackend();
  }
  
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Al salir, nos aseguramos de "matar" el proceso del backend
app.on('before-quit', () => {
  console.log('[Electron] Cerrando backend...');
  if (backendProcess) {
    backendProcess.kill();
  }
});