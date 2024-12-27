function createRipple(event) {
    const button = event.currentTarget;
    const ripple = document.createElement('span');
    const rect = button.getBoundingClientRect();
    
    const diameter = Math.max(button.clientWidth, button.clientHeight);
    const radius = diameter / 2;
    
    ripple.style.width = ripple.style.height = `${diameter}px`;
    ripple.style.left = `${event.clientX - rect.left - radius}px`;
    ripple.style.top = `${event.clientY - rect.top - radius}px`;
    ripple.className = 'button-ripple';
    
    button.appendChild(ripple);
    
    ripple.addEventListener('animationend', () => {
      ripple.remove();
    });
  }
  
  document.getElementById('toggleMode').addEventListener('click', async (e) => {
    createRipple(e);
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    chrome.tabs.sendMessage(tab.id, { action: 'toggleMode' });
  });
  
  document.getElementById('unsubscribe').addEventListener('click', async (e) => {
    createRipple(e);
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    chrome.tabs.sendMessage(tab.id, { action: 'unsubscribeSelected' });
  });
  
  // Update selected count
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.tabs.sendMessage(tabs[0].id, { action: 'getSelectedCount' }, (response) => {
      if (response && response.count !== undefined) {
        document.getElementById('selectedCount').textContent = response.count;
      }
    });
  });


  // Add to your existing popup.js
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'updateProgress') {
      const progressContainer = document.querySelector('.progress-container');
      const progressFill = document.querySelector('.progress-fill');
      const progressCount = document.getElementById('progress-count');
      const totalCount = document.getElementById('total-count');
      
      if (message.data.show) {
        progressContainer.style.display = 'block';
      }
      
      progressCount.textContent = message.data.current;
      totalCount.textContent = message.data.total;
      progressFill.style.width = `${(message.data.current / message.data.total) * 100}%`;
    } else if (message.action === 'showCompletion') {
      document.querySelector('.progress-container').style.display = 'none';
      document.querySelector('.completion-message').style.display = 'block';
      
      // Hide completion message after 3 seconds
      setTimeout(() => {
        document.querySelector('.completion-message').style.display = 'none';
      }, 3000);
    }
  });