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
    });
    selectedChannels.clear();
    chrome.runtime.sendMessage({
        action: 'updateCount',
        count: 0
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
    } else if (message.action === 'unsubscribeFromUrl') {
        unsubscribeFromUrl().then(success => {
            sendResponse({ success });
        });
        return true;
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

window.addEventListener('unload', saveChannelsForLater);

addCheckboxesToSubscribeButtons();