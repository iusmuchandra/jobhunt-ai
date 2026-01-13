// Check if profile exists on load
async function checkProfile() {
  const result = await chrome.storage.local.get('profile');
  const statusDiv = document.getElementById('status');
  const fillBtn = document.getElementById('fillBtn');
  
  if (result.profile) {
    statusDiv.className = 'status success';
    statusDiv.innerHTML = `
      <strong>✅ Profile Ready</strong>
      <p style="font-size: 11px; margin-top: 5px;">
        ${result.profile.name || 'Profile'} - ${result.profile.email || 'No email'}
      </p>
    `;
    fillBtn.disabled = false;
  } else {
    statusDiv.className = 'status warning';
    statusDiv.innerHTML = `
      <strong>⚠️ No profile loaded</strong>
      <p style="font-size: 11px; margin-top: 5px;">Import your profile to get started</p>
    `;
    fillBtn.disabled = true;
  }
}

// Fill button handler
document.getElementById('fillBtn').addEventListener('click', async () => {
  const { profile } = await chrome.storage.local.get('profile');
  
  if (!profile) {
    alert('❌ Please import your profile first');
    return;
  }
  
  // Get active tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  
  // Inject and execute content script
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      function: autoFillForm,
      args: [profile]
    });
    
    // Show success message
    const statusDiv = document.getElementById('status');
    statusDiv.className = 'status success';
    statusDiv.innerHTML = '<strong>✅ Form filled successfully!</strong>';
    
    setTimeout(() => {
      checkProfile();
    }, 2000);
  } catch (error) {
    console.error('Error:', error);
    alert('❌ Failed to fill form. Make sure you\'re on a job application page.');
  }
});

// Settings button handler
document.getElementById('settingsBtn').addEventListener('click', () => {
  // Replace with your actual deployed URL
  chrome.tabs.create({ url: 'https://your-app.vercel.app/settings/auto-apply' });
});

// File import handler
document.getElementById('fileInput').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  
  try {
    const text = await file.text();
    const profile = JSON.parse(text);
    
    // Save to storage
    await chrome.storage.local.set({ profile });
    
    alert('✅ Profile imported successfully!');
    checkProfile();
  } catch (error) {
    alert('❌ Invalid profile file. Please export again from settings.');
    console.error(error);
  }
});

// Initialize
checkProfile();

// Auto-fill function (injected into page)
function autoFillForm(profile) {
  console.log('🚀 JobHunt AI: Auto-filling form...');
  
  // Field mappings
  const fieldMappings = {
    name: {
      value: profile.name,
      patterns: ['name', 'full_name', 'fullname', 'full-name', 'applicant_name', 'your_name', 'firstname', 'first_name']
    },
    email: {
      value: profile.email,
      patterns: ['email', 'e-mail', 'email_address', 'e_mail', 'mail']
    },
    phone: {
      value: profile.phone,
      patterns: ['phone', 'telephone', 'mobile', 'phone_number', 'tel', 'cell']
    },
    location: {
      value: profile.location,
      patterns: ['location', 'city', 'address', 'current_location', 'where_located']
    },
    linkedin: {
      value: profile.linkedin,
      patterns: ['linkedin', 'linkedin_url', 'linkedin_profile', 'linkedin-url']
    },
    portfolio: {
      value: profile.portfolio,
      patterns: ['portfolio', 'website', 'personal_website', 'url', 'personal-site']
    },
    github: {
      value: profile.github,
      patterns: ['github', 'github_url', 'github_profile', 'github-url']
    }
  };
  
  let filledCount = 0;
  
  // Fill text inputs and textareas
  for (const [key, config] of Object.entries(fieldMappings)) {
    if (!config.value) continue;
    
    for (const pattern of config.patterns) {
      // Find by name, id, placeholder, or aria-label
      const selectors = [
        `input[name*="${pattern}" i]`,
        `input[id*="${pattern}" i]`,
        `input[placeholder*="${pattern}" i]`,
        `input[aria-label*="${pattern}" i]`,
        `textarea[name*="${pattern}" i]`,
        `textarea[id*="${pattern}" i]`,
        `textarea[placeholder*="${pattern}" i]`
      ];
      
      const elements = document.querySelectorAll(selectors.join(', '));
      
      elements.forEach(element => {
        if (element.value || element.disabled || element.readOnly) return;
        
        element.value = config.value;
        
        // Trigger events for React/Vue/Angular
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
        element.dispatchEvent(new Event('blur', { bubbles: true }));
        
        // Visual feedback
        element.style.backgroundColor = '#d1fae5';
        setTimeout(() => {
          element.style.backgroundColor = '';
        }, 1000);
        
        filledCount++;
      });
    }
  }
  
  // Handle work authorization checkboxes
  if (profile.eligibleToWorkInUS) {
    const authPatterns = ['authorized', 'eligible', 'legally_authorized', 'work_authorization'];
    
    authPatterns.forEach(pattern => {
      const checkboxes = document.querySelectorAll(
        `input[type="checkbox"][name*="${pattern}" i], input[type="checkbox"][id*="${pattern}" i]`
      );
      
      checkboxes.forEach(cb => {
        if (!cb.checked) {
          cb.checked = true;
          cb.dispatchEvent(new Event('change', { bubbles: true }));
          filledCount++;
        }
      });
    });
  }
  
  // Handle sponsorship checkboxes
  if (profile.requiresSponsorship !== undefined) {
    const sponsorPatterns = ['sponsor', 'sponsorship', 'visa'];
    
    sponsorPatterns.forEach(pattern => {
      const checkboxes = document.querySelectorAll(
        `input[type="checkbox"][name*="${pattern}" i], input[type="checkbox"][id*="${pattern}" i]`
      );
      
      checkboxes.forEach(cb => {
        if (cb.checked !== profile.requiresSponsorship) {
          cb.checked = profile.requiresSponsorship;
          cb.dispatchEvent(new Event('change', { bubbles: true }));
          filledCount++;
        }
      });
    });
  }
  
  // Show notification
  if (filledCount > 0) {
    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 16px 24px;
      border-radius: 12px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.3);
      z-index: 999999;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 14px;
      font-weight: 600;
      animation: slideIn 0.3s ease-out;
    `;
    notification.innerHTML = `✅ Filled ${filledCount} field${filledCount > 1 ? 's' : ''}!`;
    
    // Add animation
    const style = document.createElement('style');
    style.textContent = `
      @keyframes slideIn {
        from { transform: translateX(400px); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
    `;
    document.head.appendChild(style);
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
      notification.style.transition = 'opacity 0.3s';
      notification.style.opacity = '0';
      setTimeout(() => notification.remove(), 300);
    }, 3000);
    
    console.log(`✅ JobHunt AI: Filled ${filledCount} fields`);
  } else {
    alert('⚠️ No fillable fields found on this page. Make sure you\'re on a job application form.');
  }
}