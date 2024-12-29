let unsubscribeQueue = [];
let isProcessing = false;

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
    } else if (message.action === 'updateProgress') {
        // Forward progress updates to popup
        chrome.runtime.sendMessage(message);
        sendResponse({success: true});
    } else if (message.action === 'showCompletion') {
        // Forward completion message to popup
        chrome.runtime.sendMessage(message);
        sendResponse({success: true});
    }
    return true;
});

async function processQueue() {
    if (isProcessing || unsubscribeQueue.length === 0) return;
    
    isProcessing = true;
    const totalCount = unsubscribeQueue.length;
    let progress = 0;

    chrome.runtime.sendMessage({
        action: 'updateProgress',
        data: { current: progress, total: totalCount, show: true }
    });

    for (const channel of unsubscribeQueue) {
        try {
            // Open channel in new tab
            const tab = await chrome.tabs.create({ 
                url: channel.url, 
                active: false 
            });
            
            // Wait for page load
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            // Unsubscribe
            await chrome.tabs.sendMessage(tab.id, { 
                action: 'unsubscribeFromUrl' 
            });
            
            // Wait for unsubscribe action
            await new Promise(resolve => setTimeout(resolve, 3500));
            
            // Close tab
            await chrome.tabs.remove(tab.id);
            
            progress++;
            chrome.runtime.sendMessage({
                action: 'updateProgress',
                data: { current: progress, total: totalCount }
            });
            
            // Wait before next channel
            await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (error) {
            console.error('Error processing channel:', error);
        }
    }

    unsubscribeQueue = [];
    chrome.storage.local.set({ unsubscribeQueue });
    chrome.runtime.sendMessage({ action: 'showCompletion' });
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