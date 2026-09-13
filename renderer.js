// UI Elements
const discordClientIdInput = document.getElementById('discord-client-id');
const omdbApiKeyInput = document.getElementById('omdb-api-key');
const runOnBootToggle = document.getElementById('run-on-boot');
const minimizeToTrayToggle = document.getElementById('minimize-to-tray');
const btnSave = document.getElementById('btn-save');
const btnInstall = document.getElementById('btn-install');

const addonStatusDot = document.getElementById('addon-status-dot');
const addonStatusText = document.getElementById('addon-status-text');
const discordStatusDot = document.getElementById('discord-status-dot');
const discordStatusText = document.getElementById('discord-status-text');

const nowPlayingCard = document.getElementById('now-playing-card');
const nowPlayingTitle = document.getElementById('now-playing-title');
const nowPlayingState = document.getElementById('now-playing-state');

const toast = document.getElementById('toast');

// Load Config on Startup
async function init() {
    try {
        const config = await window.api.getConfig();
        discordClientIdInput.value = config.discordClientId || '';
        omdbApiKeyInput.value = config.omdbApiKey || '';
        runOnBootToggle.checked = !!config.runOnBoot;
        minimizeToTrayToggle.checked = config.minimizeToTray !== false; // default true

        // Initial status update
        const status = await window.api.getStatus();
        updateUIStatus(status);
    } catch (err) {
        console.error('Failed to load settings:', err);
    }
}

// Show Toast message
function showToast(message) {
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// Update Status indicators
function updateUIStatus(status) {
    // Addon server status
    if (status.addonRunning) {
        addonStatusDot.className = 'status-dot active';
        addonStatusText.textContent = `Running (Port ${status.addonPort})`;
    } else {
        addonStatusDot.className = 'status-dot inactive';
        addonStatusText.textContent = 'Offline';
    }

    // Discord status
    if (status.discordConnected) {
        discordStatusDot.className = 'status-dot active';
        discordStatusText.textContent = 'Connected';
    } else {
        discordStatusDot.className = 'status-dot inactive';
        discordStatusText.textContent = status.discordStatusMessage || 'Offline';
    }

    // Now Playing status
    if (status.nowPlaying && status.nowPlaying.title) {
        nowPlayingCard.style.display = 'flex';
        nowPlayingTitle.textContent = `Watching: ${status.nowPlaying.title}`;
        if (status.nowPlaying.season && status.nowPlaying.episode) {
            nowPlayingState.style.display = 'block';
            nowPlayingState.textContent = `Season ${status.nowPlaying.season} • Episode ${status.nowPlaying.episode}`;
        } else {
            nowPlayingState.style.display = 'none';
        }
    } else {
        nowPlayingCard.style.display = 'none';
    }
}

// Event Listeners
btnSave.addEventListener('click', async () => {
    const config = {
        discordClientId: discordClientIdInput.value.trim(),
        omdbApiKey: omdbApiKeyInput.value.trim(),
        runOnBoot: runOnBootToggle.checked,
        minimizeToTray: minimizeToTrayToggle.checked
    };

    try {
        const result = await window.api.saveConfig(config);
        if (result.success) {
            showToast('Settings saved successfully!');
        } else {
            showToast('Error saving settings: ' + result.error);
        }
    } catch (err) {
        showToast('Failed to save settings.');
    }
});

btnInstall.addEventListener('click', () => {
    window.api.installAddon();
    showToast('Sent install request to Stremio!');
});

// Watch for status changes from main process
window.api.onStatusChange((status) => {
    updateUIStatus(status);
});

// Start initialization
init();
