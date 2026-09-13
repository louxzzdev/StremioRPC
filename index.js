const { app, BrowserWindow, Menu, Tray, ipcMain, nativeImage, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');
const { addonBuilder, serveHTTP } = require("stremio-addon-sdk");
const RPC = require('discord-rpc');
const { resolveMediaTitle } = require('./metadata');

// App state
let mainWindow = null;
let tray = null;
let rpcClient = null;
let isRpcConnected = false;
let rpcStatusMessage = 'Disconnected';
let currentNowPlaying = null;
let lastConnectedClientId = '';
let addonServer = null;
let rpcRetryTimer = null;
let rpcRetryClientId = '';

// Playback monitoring state
let playbackMonitorInterval = null;
let lastActivityTimestamp = null;
let stremioNotFoundCount = 0;
const ACTIVITY_TIMEOUT_MS = 4 * 60 * 60 * 1000; // 4 hour safety net
const MONITOR_POLL_MS = 15 * 1000; // check every 15 seconds

// Determine hidden startup
let startHidden = process.argv.includes('--hidden') || process.argv.includes('-h');

// Path for config file
const configPath = path.join(app.getPath('userData'), 'config.json');

// --- Helper Functions ---

function loadConfig() {
    try {
        if (fs.existsSync(configPath)) {
            const data = fs.readFileSync(configPath, 'utf8');
            return JSON.parse(data);
        }
    } catch (e) {
        console.error('Failed to load config:', e);
    }
    return {
        discordClientId: '',
        omdbApiKey: '',
        runOnBoot: false,
        minimizeToTray: true
    };
}

function saveConfig(config) {
    try {
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
        return true;
    } catch (e) {
        console.error('Failed to save config:', e);
        return false;
    }
}

// Autostart configuration
function setAutostart(enabled) {
    if (process.platform === 'win32') {
        try {
            app.setLoginItemSettings({
                openAtLogin: enabled,
                path: process.execPath
            });
        } catch (err) {
            console.error('Failed to set login item settings (Windows):', err);
        }
    } else if (process.platform === 'darwin') {
        try {
            app.setLoginItemSettings({
                openAtLogin: enabled,
                openAsHidden: enabled,
                path: process.execPath,
                args: ['--hidden']
            });
        } catch (err) {
            console.error('Failed to set login item settings (macOS):', err);
        }
    } else if (process.platform === 'linux') {
        const autostartDir = path.join(os.homedir(), '.config', 'autostart');
        const desktopFilePath = path.join(autostartDir, 'stremio-rpc.desktop');

        if (!enabled) {
            if (fs.existsSync(desktopFilePath)) {
                try {
                    fs.unlinkSync(desktopFilePath);
                } catch (err) {
                    console.error('Failed to delete desktop autostart file (Linux):', err);
                }
            }
            return;
        }

        try {
            if (!fs.existsSync(autostartDir)) {
                fs.mkdirSync(autostartDir, { recursive: true });
            }

            const execPath = process.env.APPIMAGE || process.execPath;
            const desktopContent = `[Desktop Entry]
Type=Application
Version=1.0
Name=StremioRPC
Comment=Stremio Discord RPC Integration
Exec="${execPath}" --hidden
StartupNotify=false
Terminal=false
`;
            fs.writeFileSync(desktopFilePath, desktopContent, 'utf8');
        } catch (err) {
            console.error('Failed to create desktop autostart file (Linux):', err);
        }
    }
}

function createApplicationMenu() {
    if (process.platform !== 'darwin') {
        Menu.setApplicationMenu(null);
        return;
    }

    const menu = Menu.buildFromTemplate([
        {
            label: app.name,
            submenu: [
                { role: 'about' },
                { type: 'separator' },
                { role: 'services' },
                { type: 'separator' },
                { role: 'hide' },
                { role: 'hideOthers' },
                { role: 'unhide' },
                { type: 'separator' },
                { role: 'quit' }
            ]
        },
        { role: 'editMenu' },
        { role: 'windowMenu' }
    ]);

    Menu.setApplicationMenu(menu);
}

// Media title helper
async function getTitleFromIMDB(id, type = 'movie') {
    const config = loadConfig();
    return resolveMediaTitle(id, type, config);
}

// Send updates to the UI
function broadcastStatus() {
    if (mainWindow && !mainWindow.webContents.isDestroyed()) {
        const status = {
            addonRunning: !!addonServer,
            addonPort: 7000,
            discordConnected: isRpcConnected,
            discordStatusMessage: rpcStatusMessage,
            nowPlaying: currentNowPlaying
        };
        mainWindow.webContents.send('status-change', status);
    }
}

// Playback monitoring (detect when Stremio closes)
function isStremioRunning() {
    return new Promise((resolve) => {
        const req = http.get('http://localhost:11470', (res) => {
            resolve(true);
            res.resume();
        });
        req.on('error', () => {
            resolve(false);
        });
        req.setTimeout(2000, () => {
            req.destroy();
            resolve(false);
        });
    });
}

async function clearActivity() {
    if (rpcClient && isRpcConnected) {
        try {
            await rpcClient.clearActivity();
            console.log('Discord activity cleared');
        } catch (err) {
            console.error('Failed to clear Discord activity:', err);
        }
    }
    currentNowPlaying = null;
    lastActivityTimestamp = null;
    broadcastStatus();
}

function startPlaybackMonitor() {
    if (playbackMonitorInterval) return;

    playbackMonitorInterval = setInterval(async () => {
        if (!currentNowPlaying) return;

        const stremioRunning = await isStremioRunning();
        if (!stremioRunning) {
            stremioNotFoundCount++;
            if (stremioNotFoundCount >= 4) {
                console.log('Stremio is no longer running, clearing Discord activity');
                stremioNotFoundCount = 0;
                await clearActivity();
            }
            return;
        }
        stremioNotFoundCount = 0;

        if (lastActivityTimestamp && (Date.now() - lastActivityTimestamp > ACTIVITY_TIMEOUT_MS)) {
            console.log('Activity timed out, clearing Discord activity');
            await clearActivity();
        }
    }, MONITOR_POLL_MS);
}

function stopPlaybackMonitor() {
    if (playbackMonitorInterval) {
        clearInterval(playbackMonitorInterval);
        playbackMonitorInterval = null;
    }
}

// Discord RPC methods
function scheduleRPCReconnect(clientId) {
    if (!clientId) return;

    rpcRetryClientId = clientId;

    if (rpcRetryTimer) {
        clearTimeout(rpcRetryTimer);
    }

    rpcRetryTimer = setTimeout(() => {
        rpcRetryTimer = null;
        if (!isRpcConnected && rpcRetryClientId) {
            connectRPC(rpcRetryClientId);
        }
    }, 5000);
}

async function connectRPC(clientId) {
    await disconnectRPC();

    if (!clientId) {
        rpcStatusMessage = 'Client ID not set';
        broadcastStatus();
        return;
    }

    if (rpcRetryTimer) {
        clearTimeout(rpcRetryTimer);
        rpcRetryTimer = null;
    }

    try {
        RPC.register(clientId);
        rpcClient = new RPC.Client({ transport: 'ipc' });

        rpcClient.on('ready', () => {
            isRpcConnected = true;
            rpcStatusMessage = 'Connected';
            rpcRetryClientId = '';
            console.log('Discord RPC connected successfully!');
            broadcastStatus();
        });

        rpcClient.on('disconnected', () => {
            isRpcConnected = false;
            rpcStatusMessage = 'Disconnected';
            scheduleRPCReconnect(clientId);
            console.log('Discord RPC disconnected');
            broadcastStatus();
        });

        rpcStatusMessage = 'Connecting...';
        broadcastStatus();

        await rpcClient.login({ clientId });
    } catch (err) {
        console.error('Discord RPC login failed:', err);
        isRpcConnected = false;
        rpcStatusMessage = 'Connection failed';
        scheduleRPCReconnect(clientId);
        broadcastStatus();
    }
}

async function disconnectRPC() {
    if (rpcClient) {
        try {
            await rpcClient.destroy();
        } catch (e) {
            // ignore
        }
        rpcClient = null;
    }
    isRpcConnected = false;
    rpcStatusMessage = 'Disconnected';

    if (rpcRetryTimer) {
        clearTimeout(rpcRetryTimer);
        rpcRetryTimer = null;
    }
    rpcRetryClientId = '';
}

async function updateRPC(data) {
    console.log("Received stream handler event:", data);

    const parts = data.id.split(':');
    const imdb = parts[0];
    const season = parts[1];
    const episode = parts[2];

    const title = await getTitleFromIMDB(imdb, data.type || 'movie');

    const activity = {
        details: `Watching: ${title}`,
        largeImageKey: "stremio",
        largeImageText: "Stremio",
        startTimestamp: Math.floor(data.timestamp / 1000)
    };

    if (season && episode) {
        activity.state = `Season ${season} • Episode ${episode}`;
    } else {
        activity.state = `Movie`;
    }

    currentNowPlaying = {
        title,
        season,
        episode,
        type: data.type
    };

    // Track when activity was last set (for timeout detection)
    lastActivityTimestamp = Date.now();

    if (rpcClient && isRpcConnected) {
        try {
            await rpcClient.setActivity(activity);
            console.log("Discord activity updated successfully");
        } catch (err) {
            console.error("Failed to update activity on Discord:", err);
        }
    }

    broadcastStatus();
}

function installAddonInStremio() {
    shell.openExternal('stremio://localhost:7000/manifest.json');
}

// Addon server setup
function startAddonServer() {
    try {
        const builder = new addonBuilder({
            id: "org.bryan.discordrpc",
            version: "1.0.0",
            name: "StremioRPC",
            description: "Sends Stremio information to Discord RPC.",
            catalogs: [],
            resources: ["stream", "subtitles"],
            types: ["movie", "series"],
            idPrefixes: ["tt"]
        });

        builder.defineStreamHandler(async (args) => {
            const info = {
                id: args.id,
                type: args.type,
                timestamp: Date.now()
            };
            
            // Trigger update in RPC
            updateRPC(info);

            return Promise.resolve({ streams: [], cacheMaxAge: 0 });
        });

        builder.defineSubtitlesHandler(async (args) => {
            const info = {
                id: args.id,
                type: args.type,
                timestamp: Date.now()
            };

            updateRPC(info);
            return Promise.resolve({ subtitles: [], cacheMaxAge: 0 });
        });

        const addonInterface = builder.getInterface();
        addonServer = serveHTTP(addonInterface, { port: 7000 });
        console.log("Stremio Addon server running: http://localhost:7000/manifest.json");
    } catch (err) {
        console.error("Failed to start Stremio addon server:", err);
    }
}

// Window & Tray creation
function createWindow() {
    if (mainWindow) {
        mainWindow.show();
        mainWindow.focus();
        return;
    }
    mainWindow = new BrowserWindow({
        width: 580,
        height: 700,
        resizable: false,
        maximizable: false,
        title: 'StremioRPC Dashboard',
        icon: path.join(__dirname, 'Assets', 'DiscordRPCStremio.png'),
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        },
        backgroundColor: '#09090b',
        show: false
    });

    mainWindow.loadFile('index.html');

    mainWindow.once('ready-to-show', () => {
        if (!startHidden) {
            mainWindow.show();
        }
        startHidden = false;
    });

    mainWindow.on('close', (event) => {
        const config = loadConfig();
        if (config.minimizeToTray !== false && !app.isQuitting) {
            event.preventDefault();
            mainWindow.hide();
        }
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

function getTrayIcon() {
    const iconPath = path.join(__dirname, 'Assets', 'DiscordRPCStremio.png');
    const icon = nativeImage.createFromPath(iconPath);

    if (process.platform === 'darwin' && !icon.isEmpty()) {
        const templateIcon = icon.resize({ width: 18, height: 18 });
        templateIcon.setTemplateImage(true);
        return templateIcon;
    }

    return icon;
}

function createTray() {
    const iconPath = path.join(__dirname, 'Assets', 'DiscordRPCStremio.png');
    if (!fs.existsSync(iconPath)) {
        console.warn("Icon path does not exist, tray fallback to default logic");
    }

    tray = new Tray(getTrayIcon());
    const contextMenu = Menu.buildFromTemplate([
        { 
            label: 'Show Dashboard', 
            click: () => {
                createWindow();
            } 
        },
        { 
            label: 'Install Addon on Stremio', 
            click: () => {
                installAddonInStremio();
            } 
        },
        { type: 'separator' },
        { 
            label: 'Quit', 
            click: () => {
                app.isQuitting = true;
                app.quit();
            } 
        }
    ]);

    tray.setToolTip('StremioRPC');
    tray.setContextMenu(contextMenu);

    tray.on('click', () => {
        if (mainWindow && mainWindow.isVisible()) {
            mainWindow.hide();
        } else {
            createWindow();
        }
    });
}

// Single Instance lock
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
    app.quit();
} else {
    app.on('second-instance', () => {
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.show();
            mainWindow.focus();
        } else {
            createWindow();
        }
    });

    app.on('ready', () => {
        createApplicationMenu();

        // Load configuration
        const config = loadConfig();

        // Establish autostart settings state
        setAutostart(config.runOnBoot);

        // Connect to Discord RPC if Client ID exists
        lastConnectedClientId = config.discordClientId;
        connectRPC(config.discordClientId);

        // Start addon server
        startAddonServer();

        // Start playback monitor (detects when Stremio closes)
        startPlaybackMonitor();

        // Create UI and system tray
        createTray();
        createWindow();
    });
}

app.on('before-quit', async () => {
    stopPlaybackMonitor();
    await clearActivity();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        const config = loadConfig();
        if (config.minimizeToTray === false) {
            app.quit();
        }
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    } else if (mainWindow) {
        mainWindow.show();
        mainWindow.focus();
    }
});

// IPC Handler registration

ipcMain.handle('get-config', () => {
    return loadConfig();
});

ipcMain.handle('save-config', async (event, config) => {
    const success = saveConfig(config);
    if (success) {
        setAutostart(config.runOnBoot);

        if (config.discordClientId !== lastConnectedClientId) {
            lastConnectedClientId = config.discordClientId;
            // Async login to new client ID
            connectRPC(config.discordClientId);
        }

        broadcastStatus();
        return { success: true };
    }
    return { success: false, error: 'Failed to save config file' };
});

ipcMain.handle('get-status', () => {
    return {
        addonRunning: !!addonServer,
        addonPort: 7000,
        discordConnected: isRpcConnected,
        discordStatusMessage: rpcStatusMessage,
        nowPlaying: currentNowPlaying
    };
});

ipcMain.on('install-addon', () => {
    installAddonInStremio();
});
