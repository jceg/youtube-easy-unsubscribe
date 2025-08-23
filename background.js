// Resume functionality removed - using tab close warning instead

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
    // Queue functionality removed - no longer using resume feature
    if (message.action === 'updateProgress') {
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

// Track which tabs are currently unsubscribing
let unsubscribingTabs = new Set();

// Listen for tab close attempts during unsubscription
chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
    if (unsubscribingTabs.has(tabId)) {
        console.log('Tab closed during unsubscription process');
        unsubscribingTabs.delete(tabId);
    }
});

// Handle unsubscription start/stop tracking
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'startUnsubscribing' && sender.tab) {
        unsubscribingTabs.add(sender.tab.id);
        console.log('Started tracking unsubscription for tab:', sender.tab.id);
    } else if (message.action === 'stopUnsubscribing' && sender.tab) {
        unsubscribingTabs.delete(sender.tab.id);
        console.log('Stopped tracking unsubscription for tab:', sender.tab.id);
    }
});

// Queue storage removed - no longer using resume functionality

// Handle tab updates
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url?.includes('youtube.com')) {
        chrome.tabs.sendMessage(tabId, {
            action: 'tabUpdated',
            url: tab.url
        });
    }
});