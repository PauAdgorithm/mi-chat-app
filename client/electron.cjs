const { app, BrowserWindow } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    title: "Chatgorithm CRM",
    // Asegúrate de que el icono está en client/public/logo.ico
    // __dirname apunta a client/dist_desktop/win-unpacked/resources/app... al instalarse
    // En desarrollo apunta a client/
    icon: path.join(__dirname, 'public/logo.ico'), 
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    autoHideMenuBar: true // Oculta la barra de menú nativa (File, Edit...)
  });

  // ⚠️ AQUÍ ESTÁ EL CAMBIO IMPORTANTE ⚠️
  // Pega aquí la URL de tu FRONTEND (la que se ve bonita en el navegador), NO la del backend.
  win.loadURL('https://chatgorithm-front-end.onrender.com'); 
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});