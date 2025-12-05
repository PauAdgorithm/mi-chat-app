const { app, BrowserWindow, Tray, Menu, ipcMain } = require('electron');
const path = require('path');
const isDev = require('electron-is-dev');

let mainWindow;
let tray = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false, // Evita parpadeo inicial
    icon: path.join(__dirname, 'logo.ico'),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false, // Permitimos require('electron') en React para simplificar
      enableRemoteModule: true,
    },
  });

  mainWindow.loadURL(
    isDev
      ? 'http://localhost:5173'
      : `file://${path.join(__dirname, '../dist/index.html')}`
  );

  // Evita el parpadeo blanco inicial
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Lógica de cierre: Minimizar a la bandeja en lugar de matar el proceso
  mainWindow.on('close', (event) => {
    if (!app.isQuiting) {
      event.preventDefault();
      mainWindow.hide();
    }
    return false;
  });
}

// Configuración del Tray (Icono junto al reloj)
function createTray() {
  const iconPath = path.join(__dirname, 'logo.ico');
  tray = new Tray(iconPath);
  
  const contextMenu = Menu.buildFromTemplate([
    { 
      label: 'Abrir Chatgorithm', 
      click: () => mainWindow.show() 
    },
    { 
      label: 'Salir', 
      click: () => {
        app.isQuiting = true;
        app.quit();
      } 
    }
  ]);

  tray.setToolTip('Chatgorithm');
  tray.setContextMenu(contextMenu);

  // Doble clic para abrir
  tray.on('double-click', () => {
    mainWindow.show();
  });
}

// Escuchar evento desde React para parpadear la barra de tareas
ipcMain.on('flash-frame', (event) => {
  if (mainWindow) {
    mainWindow.flashFrame(true);
    // El parpadeo para automáticamente cuando el usuario enfoca la ventana
  }
});

app.on('ready', () => {
  createWindow();
  createTray();
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

// Forzar cierre solo si se hace desde el Tray o Cmd+Q
app.on('before-quit', () => {
  app.isQuiting = true;
});