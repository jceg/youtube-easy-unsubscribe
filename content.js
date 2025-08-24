let selectionMode = false;
let selectedChannels = new Set();
let isUnsubscribing = false;
let currentProgress = 0;

// Safe message sending with error handling
function safeSendMessage(message, callback = null) {
    try {
        if (chrome.runtime && chrome.runtime.sendMessage) {
            chrome.runtime.sendMessage(message, (response) => {
                if (chrome.runtime.lastError) {
                    // Extension context invalidated or connection lost
                    console.log('Extension context lost:', chrome.runtime.lastError.message);
                    return;
                }
                if (callback) callback(response);
            });
        }
    } catch (error) {
        console.log('Failed to send message:', error.message);
    }
}

// Safe storage operations with error handling
function safeStorageSet(data, callback = null) {
    try {
        if (chrome.storage && chrome.storage.local) {
            chrome.storage.local.set(data, () => {
                if (chrome.runtime.lastError) {
                    console.log('Storage error:', chrome.runtime.lastError.message);
                    return;
                }
                if (callback) callback();
            });
        }
    } catch (error) {
        console.log('Failed to set storage:', error.message);
    }
}

function safeStorageGet(keys, callback) {
    try {
        if (chrome.storage && chrome.storage.local) {
            chrome.storage.local.get(keys, (result) => {
                if (chrome.runtime.lastError) {
                    console.log('Storage error:', chrome.runtime.lastError.message);
                    callback({});
                    return;
                }
                callback(result);
            });
        } else {
            callback({});
        }
    } catch (error) {
        console.log('Failed to get storage:', error.message);
        callback({});
    }
}
let totalChannels = 0;

function addCheckboxesToSubscribeButtons() {
    const channelItems = document.querySelectorAll('#content-section.style-scope.ytd-channel-renderer');
    
    channelItems.forEach(channel => {
        if (!channel.querySelector('.easy-unsub-checkbox')) {
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.className = 'easy-unsub-checkbox';
            checkbox.style.display = selectionMode ? 'block' : 'none';
            
            checkbox.addEventListener('change', (e) => {
                const channelElement = e.target.closest('#content-section');
                if (e.target.checked) {
                    selectedChannels.add(channelElement);
                } else {
                    selectedChannels.delete(channelElement);
                }
                // Send updated count
                safeSendMessage({
                    action: 'updateCount',
                    count: selectedChannels.size
                });
            });
            
            const avatarSection = channel.querySelector('#avatar-section');
            if (avatarSection) {
                channel.insertBefore(checkbox, avatarSection);
            }
        }
    });
}

function toggleSelectionMode() {
    selectionMode = !selectionMode;
    document.querySelectorAll('.easy-unsub-checkbox').forEach(checkbox => {
        checkbox.style.display = selectionMode ? 'block' : 'none';
        if (!selectionMode) {
            checkbox.checked = false;
        }
    });
    selectedChannels.clear();
    chrome.runtime.sendMessage({
        action: 'updateCount',
        count: 0
    });
    chrome.runtime.sendMessage({
        action: 'toggleSelectionMode',
        selectionMode: selectionMode
    });
}

async function unsubscribeFromChannel(channelElement) {
    const subscribeButton = channelElement.querySelector('ytd-subscribe-button-renderer button');
    if (subscribeButton) {
        subscribeButton.click();
        await new Promise(resolve => setTimeout(resolve, 200 + Math.random() * 100));
        
        // Try multiple selectors for better resilience
        const confirmSelectors = [
            'yt-confirm-dialog-renderer #confirm-button button',
            'button[aria-label="Unsubscribe"]',
            '#confirm-button button',
            'paper-button[aria-label="Unsubscribe"]',
            'yt-button-renderer[is-paper-button] button'
        ];
        
        let unsubConfirmButton = null;
        for (const selector of confirmSelectors) {
            unsubConfirmButton = document.querySelector(selector);
            if (unsubConfirmButton) break;
        }
        
        if (unsubConfirmButton) {
            unsubConfirmButton.click();
            await new Promise(resolve => setTimeout(resolve, 150 + Math.random() * 100));
        }
    }
}

function createBlockingOverlay() {
    const overlay = document.createElement('div');
    overlay.id = 'easy-unsub-blocking-overlay';
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        background: rgba(0, 0, 0, 0.8);
        backdrop-filter: blur(2px);
        z-index: 9999;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        color: white;
        font-family: 'YouTube Sans', 'Roboto', sans-serif;
        cursor: not-allowed;
    `;
    
    const content = document.createElement('div');
    content.style.cssText = `
        background: #ffffff;
        padding: 30px;
        border-radius: 8px;
        text-align: center;
        max-width: 400px;
        border: 1px solid #e0e0e0;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    `;
    
    const title = document.createElement('h2');
    title.textContent = '⏳ Unsubscription in Progress';
    title.style.cssText = 'margin: 0 0 12px 0; color: #065fd4; font-size: 18px; font-weight: 600;';
    
    const message = document.createElement('p');
    message.textContent = 'Please wait while we process your channels.';
    message.style.cssText = 'margin: 0 0 16px 0; line-height: 1.4; color: #606060; font-size: 14px;';
    
    const progressInfo = document.createElement('div');
    progressInfo.id = 'overlay-progress-info';
    progressInfo.style.cssText = 'font-size: 18px; color: #065fd4; font-weight: 600;';
    progressInfo.textContent = 'Preparing...';
    
    content.appendChild(title);
    content.appendChild(message);
    content.appendChild(progressInfo);
    overlay.appendChild(content);
    
    // Prevent all interactions
    overlay.addEventListener('click', (e) => e.stopPropagation());
    overlay.addEventListener('keydown', (e) => e.preventDefault());
    
    return overlay;
}

function updateOverlayProgress(current, total) {
    const progressInfo = document.getElementById('overlay-progress-info');
    if (progressInfo) {
        const percentage = Math.round((current / total) * 100);
        progressInfo.textContent = `Unsubscribing... ${current}/${total} (${percentage}%)`;
    }
}

function removeBlockingOverlay() {
    const overlay = document.getElementById('easy-unsub-blocking-overlay');
    if (overlay) {
        overlay.remove();
    }
}

async function unsubscribeSelected() {
    isUnsubscribing = true;
    notifyUnsubscriptionStart();
    totalChannels = selectedChannels.size;
    currentProgress = 0;
    
    // Create blocking overlay
    const overlay = createBlockingOverlay();
    document.body.appendChild(overlay);
    
    safeStorageSet({
        unsubscribeState: {
            isUnsubscribing,
            current: currentProgress,
            total: totalChannels
        }
    });

    chrome.runtime.sendMessage({
        action: 'updateProgress',
        data: { current: currentProgress, total: totalChannels, show: true }
    });

    for (const channelElement of selectedChannels) {
        await unsubscribeFromChannel(channelElement);
        currentProgress++;
        
        chrome.storage.local.set({
            unsubscribeState: {
                isUnsubscribing,
                current: currentProgress,
                total: totalChannels
            }
        });
        
        safeSendMessage({
            action: 'updateProgress',
            data: { current: currentProgress, total: totalChannels }
        });
        
        // Update blocking overlay progress
        updateOverlayProgress(currentProgress, totalChannels);
        
        await new Promise(resolve => setTimeout(resolve, 300 + Math.random() * 200));
    }
    
    isUnsubscribing = false;
    notifyUnsubscriptionStop();
    
    // Remove blocking overlay
    removeBlockingOverlay();
    
    chrome.storage.local.set({
        unsubscribeState: {
            isUnsubscribing: false,
            current: 0,
            total: 0
        }
    });
    
    safeSendMessage({ action: 'showCompletion' });
    selectedChannels.clear();
    toggleSelectionMode();
}

async function unsubscribeFromUrl() {
    try {
        const subscribeButton = document.querySelector('ytd-subscribe-button-renderer button');
        if (subscribeButton) {
            subscribeButton.click();
            await new Promise(resolve => setTimeout(resolve, 200 + Math.random() * 100));
            
            // Try multiple selectors for better resilience
            const confirmSelectors = [
                'yt-confirm-dialog-renderer #confirm-button button',
                'button[aria-label="Unsubscribe"]',
                '#confirm-button button',
                'paper-button[aria-label="Unsubscribe"]',
                'yt-button-renderer[is-paper-button] button'
            ];
            
            let unsubConfirmButton = null;
            for (const selector of confirmSelectors) {
                unsubConfirmButton = document.querySelector(selector);
                if (unsubConfirmButton) break;
            }
            
            if (unsubConfirmButton) {
                unsubConfirmButton.click();
                return true;
            }
        }
    } catch (error) {
        console.error('Error unsubscribing:', error);
        return false;
    }
}

function selectAllChannels(selectAll) {
    const checkboxes = document.querySelectorAll('.easy-unsub-checkbox');
    selectedChannels.clear();
    
    // If selecting all, add all channels to selectedChannels immediately
    if (selectAll) {
        checkboxes.forEach(checkbox => {
            const channelElement = checkbox.closest('#content-section');
            if (channelElement) {
                selectedChannels.add(channelElement);
            }
        });
    }
    
    // Update count immediately
    chrome.runtime.sendMessage({
        action: 'updateCount',
        count: selectedChannels.size
    });
    
    checkboxes.forEach((checkbox, index) => {
        // Add staggered animation for visual feedback
        setTimeout(() => {
            checkbox.checked = selectAll;
            if (selectAll) {
                checkbox.classList.add('bulk-selected');
                // Remove animation class after animation completes
                setTimeout(() => {
                    checkbox.classList.remove('bulk-selected');
                }, 300);
            }
        }, index * 50); // Stagger by 50ms per checkbox
    });
}

function saveChannelsForLater() {
    if (selectedChannels.size > 0) {
        const channelsToSave = Array.from(selectedChannels).map(channel => ({
            name: channel.querySelector('#channel-title').textContent,
            url: channel.querySelector('#channel-title').href
        }));
        
        chrome.runtime.sendMessage({
            action: 'saveForLater',
            channels: channelsToSave
        });
    }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'toggleMode') {
        toggleSelectionMode();
        sendResponse({ success: true });
    } else if (message.action === 'unsubscribeSelected') {
        unsubscribeSelected();
        sendResponse({ success: true });
    } else if (message.action === 'getSelectedCount') {
        sendResponse({ count: selectedChannels.size });
    } else if (message.action === 'selectAll') {
        selectAllChannels(message.selectAll);
        sendResponse({ success: true });
    } else if (message.action === 'unsubscribeFromUrl') {
        unsubscribeFromUrl().then(success => {
            sendResponse({ success });
        });
        return true;
    // Resume functionality removed - replaced with tab close warning
    } else if (message.action === 'getProgress') {
            safeStorageGet(['unsubscribeState'], (result) => {
        if (result.unsubscribeState) {
            sendResponse(result.unsubscribeState);
        } else {
            sendResponse({
                isUnsubscribing: false,
                current: 0,
                total: 0
            });
        }
    });
        return true;
    } else if (message.action === 'tabUpdated') {
        addCheckboxesToSubscribeButtons();
        sendResponse({ success: true });
    } else if (message.action === 'clearStuckState') {
        // Clear any stuck overlays and reset state
        removeBlockingOverlay();
        isUnsubscribing = false;
        currentProgress = 0;
        totalChannels = 0;
        selectedChannels.clear();
        
        safeStorageSet({
            unsubscribeState: {
                isUnsubscribing: false,
                current: 0,
                total: 0
            }
        });
        
        sendResponse({ success: true });
    }
    return true;
});

const observer = new MutationObserver(() => {
    addCheckboxesToSubscribeButtons();
});

observer.observe(document.body, {
    childList: true,
    subtree: true
});

// Use visibilitychange instead of unload to comply with permissions policy
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
        saveChannelsForLater();
    }
});

// Also add periodic auto-save for reliability
setInterval(saveChannelsForLater, 30000); // Save every 30 seconds

// Add warning when user tries to close tab during unsubscription
function setupTabCloseWarning() {
    window.addEventListener('beforeunload', (event) => {
        if (isUnsubscribing) {
            const message = 'Unsubscription is still in progress. Are you sure you want to leave?';
            event.preventDefault();
            event.returnValue = message;
            return message;
        }
    });
}

// Track unsubscription state for background script
function notifyUnsubscriptionStart() {
    safeSendMessage({ action: 'startUnsubscribing' });
}

function notifyUnsubscriptionStop() {
    safeSendMessage({ action: 'stopUnsubscribing' });
}

// Clean up any stuck state on page load
function cleanupStuckState() {
    safeStorageGet(['unsubscribeState'], (result) => {
        if (result.unsubscribeState && result.unsubscribeState.isUnsubscribing) {
            // Check if we're actually unsubscribing by looking for the overlay
            const overlay = document.getElementById('easy-unsub-blocking-overlay');
            if (!overlay && !isUnsubscribing) {
                // No overlay and not actually unsubscribing - clear stuck state
                console.log('Cleaning up stuck unsubscribe state');
                safeStorageSet({
                    unsubscribeState: {
                        isUnsubscribing: false,
                        current: 0,
                        total: 0
                    }
                });
                safeSendMessage({ action: 'showCompletion' });
            }
        }
    });
}

// Initialize tab close warning
setupTabCloseWarning();

// Clean up stuck states on page load
setTimeout(cleanupStuckState, 2000); // Wait 2 seconds for page to fully load

addCheckboxesToSubscribeButtons();