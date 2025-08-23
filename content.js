let selectionMode = false;
let selectedChannels = new Set();
let isUnsubscribing = false;
let currentProgress = 0;
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
                chrome.runtime.sendMessage({
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
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        const unsubConfirmButton = document.querySelector('yt-confirm-dialog-renderer #confirm-button button');
        if (unsubConfirmButton) {
            unsubConfirmButton.click();
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }
}

async function unsubscribeSelected() {
    isUnsubscribing = true;
    notifyUnsubscriptionStart();
    totalChannels = selectedChannels.size;
    currentProgress = 0;
    
    chrome.storage.local.set({
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
        
        chrome.runtime.sendMessage({
            action: 'updateProgress',
            data: { current: currentProgress, total: totalChannels }
        });
        
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    isUnsubscribing = false;
    notifyUnsubscriptionStop();
    chrome.storage.local.set({
        unsubscribeState: {
            isUnsubscribing: false,
            current: 0,
            total: 0
        }
    });
    
    chrome.runtime.sendMessage({ action: 'showCompletion' });
    selectedChannels.clear();
    toggleSelectionMode();
}

async function unsubscribeFromUrl() {
    try {
        const subscribeButton = document.querySelector('ytd-subscribe-button-renderer button');
        if (subscribeButton) {
            subscribeButton.click();
            await new Promise(resolve => setTimeout(resolve, 1500));
            
            const unsubConfirmButton = document.querySelector('yt-confirm-dialog-renderer #confirm-button button');
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
        chrome.storage.local.get(['unsubscribeState'], (result) => {
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
    chrome.runtime.sendMessage({ action: 'startUnsubscribing' });
}

function notifyUnsubscriptionStop() {
    chrome.runtime.sendMessage({ action: 'stopUnsubscribing' });
}

// Initialize tab close warning
setupTabCloseWarning();

addCheckboxesToSubscribeButtons();