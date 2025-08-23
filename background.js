let unsubscribeQueue = [];
let isProcessing = false;

// Enable the side panel to open when the action icon is clicked
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((error) => {
    console.log('Side panel not supported, error:', error);
});

// Listen for tab activation events
chrome.tabs.onActivated.addListener(async (activeInfo) => {
    try {
        const { tabId } = activeInfo;
        // Enable the side panel only for the active tab
        await chrome.sidePanel.setOptions({
            tabId: tabId,
            path: 'popup.html',
            enabled: true
        });
    } catch (error) {
        console.log('Side panel setOptions error:', error);
    }
});

// Listen for tab update events to handle navigation within the same tab
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    try {
        if (changeInfo.status === 'complete' && tab.active) {
            // Re-enable the side panel for the active tab after navigation
            await chrome.sidePanel.setOptions({
                tabId: tabId,
                path: 'popup.html',
                enabled: true
            });
        }
    } catch (error) {
        console.log('Side panel onUpdated error:', error);
    }
});

async function sendMessageToPopup(message) {
    try {
        // Try to send message to any open popup windows
        await chrome.runtime.sendMessage(message);
    } catch (error) {
        // If no popup is listening, store completion state for later
        if (message.action === 'showCompletion') {
            chrome.storage.local.set({ 
                completionPending: true,
                completionTimestamp: Date.now()
            });
        }
        console.log('No popup listening, message stored if needed:', error);
    }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'saveForLater') {
        unsubscribeQueue = message.channels;
        chrome.storage.local.set({unsubscribeQueue});
        sendResponse({success: true});
    } else if (message.action === 'getQueue') {
        sendResponse({queue: unsubscribeQueue});
    } else if (message.action === 'processSaved') {
        processQueue();
        sendResponse({success: true});
    } else if (message.action === 'clearQueue') {
        unsubscribeQueue = [];
        chrome.storage.local.remove(['unsubscribeQueue']);
        sendResponse({success: true});
    } else if (message.action === 'updateProgress') {
        // Forward progress updates to popup
        sendMessageToPopup(message);
        sendResponse({success: true});
    } else if (message.action === 'showCompletion') {
        // Forward completion message to popup
        sendMessageToPopup(message);
        sendResponse({success: true});
    }
    return true;
});

async function processQueue() {
    if (isProcessing || unsubscribeQueue.length === 0) return;
    
    isProcessing = true;
    
    // Find the subscriptions tab or create one
    const tabs = await chrome.tabs.query({ url: '*://www.youtube.com/feed/channels*' });
    let subscriptionsTab;
    
    if (tabs.length > 0) {
        subscriptionsTab = tabs[0];
        await chrome.tabs.update(subscriptionsTab.id, { active: true });
    } else {
        subscriptionsTab = await chrome.tabs.create({ 
            url: 'https://www.youtube.com/feed/channels',
            active: true 
        });
        // Wait for page load
        await new Promise(resolve => setTimeout(resolve, 3000));
    }
    
    try {
        // Send the saved channels to the content script to process
        await chrome.tabs.sendMessage(subscriptionsTab.id, {
            action: 'processSavedChannels',
            channels: unsubscribeQueue
        });
        
        // Clear the queue since we've handed it off to content script
        unsubscribeQueue = [];
        chrome.storage.local.remove(['unsubscribeQueue']);
        
    } catch (error) {
        console.error('Error processing saved channels:', error);
        await sendMessageToPopup({
            action: 'showCompletion'
        });
    }
    
    isProcessing = false;
}

// Restore queue from storage on startup
chrome.storage.local.get(['unsubscribeQueue'], (result) => {
    if (result.unsubscribeQueue) {
        unsubscribeQueue = result.unsubscribeQueue;
    }
});

// Handle tab updates
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url?.includes('youtube.com')) {
        chrome.tabs.sendMessage(tabId, {
            action: 'tabUpdated',
            url: tab.url
        });
    }
});