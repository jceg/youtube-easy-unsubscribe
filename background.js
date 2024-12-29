let unsubscribeQueue = [];
let isProcessing = false;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'saveForLater') {
        unsubscribeQueue = message.channels;
        chrome.storage.local.set({unsubscribeQueue});
        sendResponse({success: true});
    } else if (message.action === 'getQueue') {
        sendResponse({queue: unsubscribeQueue});
    }
    return true;
});

// Restore queue from storage on startup
chrome.storage.local.get(['unsubscribeQueue'], (result) => {
    if (result.unsubscribeQueue) {
        unsubscribeQueue = result.unsubscribeQueue;
    }
});