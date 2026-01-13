// Listen for auto-fill command
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'autofill') {
    const profile = request.profile;
    
    // Common form field patterns
    const fieldMappings = {
      name: ['name', 'full_name', 'fullname', 'applicant_name'],
      email: ['email', 'e-mail', 'email_address'],
      phone: ['phone', 'telephone', 'mobile', 'phone_number'],
      linkedin: ['linkedin', 'linkedin_url', 'linkedin_profile'],
      portfolio: ['portfolio', 'website', 'personal_website'],
      github: ['github', 'github_url', 'github_profile'],
      resume: ['resume', 'cv', 'resume_upload', 'cv_upload']
    };
    
    // Fill text inputs
    for (const [key, patterns] of Object.entries(fieldMappings)) {
      for (const pattern of patterns) {
        const inputs = document.querySelectorAll(
          `input[name*="${pattern}"], input[id*="${pattern}"], textarea[name*="${pattern}"]`
        );
        
        inputs.forEach(input => {
          if (profile[key]) {
            input.value = profile[key];
            input.dispatchEvent(new Event('input', { bubbles: true }));
          }
        });
      }
    }
    
    // Check checkboxes for work authorization
    if (profile.eligibleToWorkInUS) {
      const authCheckboxes = document.querySelectorAll('input[type="checkbox"][name*="authorized"], input[type="checkbox"][name*="eligible"]');
      authCheckboxes.forEach(cb => {
        cb.checked = true;
        cb.dispatchEvent(new Event('change', { bubbles: true }));
      });
    }
    
    sendResponse({ success: true });
  }
});