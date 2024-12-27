let selectionMode = false;
let selectedChannels = new Set();

function addCheckboxesToSubscribeButtons() {
    // Target the channel renderer containers more specifically
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
        });
        
        // Insert before the avatar section
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
}

async function unsubscribeFromChannel(channelElement) {
    const subscribeButton = channelElement.querySelector('ytd-subscribe-button-renderer button');
    if (subscribeButton) {
      subscribeButton.click();
      
      // Increased wait time for dialog
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // More specific selector for the confirm button
      const unsubConfirmButton = document.querySelector('yt-confirm-dialog-renderer #confirm-button button');
      if (unsubConfirmButton) {
        unsubConfirmButton.click();
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
  }

async function unsubscribeSelected() {
  for (const channelElement of selectedChannels) {
    await unsubscribeFromChannel(channelElement);
    await new Promise(resolve => setTimeout(resolve, 1000)); // Wait between unsubscribes
  }
  selectedChannels.clear();
  toggleSelectionMode();
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'toggleMode') {
    toggleSelectionMode();
  } else if (message.action === 'unsubscribeSelected') {
    unsubscribeSelected();
  }
});

// Add checkboxes when new content is loaded
const observer = new MutationObserver(() => {
  addCheckboxesToSubscribeButtons();
});

observer.observe(document.body, {
  childList: true,
  subtree: true
});