let selectionMode = false;
let selectedChannels = new Set();

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
  const totalCount = selectedChannels.size;
  let progress = 0;
  
  chrome.runtime.sendMessage({
    action: 'updateProgress',
    data: { current: progress, total: totalCount, show: true }
  });

  for (const channelElement of selectedChannels) {
    await unsubscribeFromChannel(channelElement);
    progress++;
    
    chrome.runtime.sendMessage({
      action: 'updateProgress',
      data: { current: progress, total: totalCount }
    });
    
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  chrome.runtime.sendMessage({ action: 'showCompletion' });
  selectedChannels.clear();
  toggleSelectionMode();
}

// Function to handle unsubscribe from URL (for background processing)
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

// Save channels when tab/window closes
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

// Message listener
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
    return true; // Keep message channel open for async response
  } else if (message.action === 'tabUpdated') {
    // Re-run checkbox addition when tab updates
    addCheckboxesToSubscribeButtons();
    sendResponse({ success: true });
  }
  return true;
});

// Initialize observer
const observer = new MutationObserver(() => {
  addCheckboxesToSubscribeButtons();
});

observer.observe(document.body, {
  childList: true,
  subtree: true
});

// Add window unload listener
window.addEventListener('unload', saveChannelsForLater);

// Initial setup
addCheckboxesToSubscribeButtons();