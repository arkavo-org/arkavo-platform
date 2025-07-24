document.addEventListener('DOMContentLoaded', async () => {
  const apiBase = location.hostname === 'localhost' ? '/users' : 'https://users.app.codecollective.us';

  const waitForKeycloak = () =>
    new Promise(resolve => {
      if (keycloak.authenticated && keycloak.tokenParsed) return resolve();
      const interval = setInterval(() => {
        if (keycloak.authenticated && keycloak.tokenParsed) {
          clearInterval(interval);
          resolve();
        }
      }, 100);
    });

  const getUsername = () =>
    keycloak.tokenParsed?.preferred_username ||
    keycloak.tokenParsed?.email?.split('@')[0] ||
    'anonymous';

  const updateUI = (profile) => {
    const defaults = {
      'profile-name': 'Anonymous',
      'profile-email': '',
      'username': '',
      'name': '',
      'display-name': '',
      'bio': 'No bio provided',
      'street': '',
      'city': '',
      'state': '',
      'zip': '',
      'country': ''
    };

    Object.keys(defaults).forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      const value = profile[id.replace(/-/g, '_')] || defaults[id];
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
        el.value = value;
      } else {
        el.textContent = value;
      }
    });

    const pic = document.getElementById('profile-pic');
    if (pic) {
      pic.src = profile.picture || 'https://codecollective.us/images/default-profile.png';
      pic.onerror = () => {
        pic.src = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI+PHBhdGggZD0iTTEyLDJBMTAsMTAgMCAwLDAgMiwxMkExMCwxMCAwIDAsMCAxMiwyMkExMCwxMCAwIDAsMCAyMiwxMkExMCwxMCAwIDAsMCAxMiwyTTEyLDRBNyw3IDAgMCwxIDE5LDExQTcsNyAwIDAsMSAxMiwxOEE3LDcgMCAwLDEgNSwxMUE3LDcgMCAwLDEgMTIsNE0xMiw2QTUsNSAwIDAsMCA3LDExQTUsNSAwIDAsMCAxMiwxNkE1LDUgMCAwLDAgMTcsMTFBNSw1IDAgMCwwIDEyLDZNNiwxMkE2LDYgMCAwLDAgMTIsNjhBNiw2IDAgMCwwIDE4LDEyQTUsNSAwIDAsMSAxMiwxN0E1LDUgMCAwLDEgNiwxMloiLz48L3N2Zz4=';
      };
    }
  };

  const createProfile = async (profile) => {
    await fetch(`${apiBase}/users/`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${keycloak.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(profile)
    });
  };

  const loadProfile = async () => {
    const username = getUsername();
    try {
      const res = await fetch(`${apiBase}/users/${encodeURIComponent(username)}`, {
        headers: { 'Authorization': `Bearer ${keycloak.token}` }
      });
      if (res.status === 404) throw new Error('not_found');
      if (!res.ok) throw new Error('fetch_failed');
      const profile = await res.json();
      updateUI(profile);
    } catch (err) {
      if (err.message === 'not_found') {
        const defaultProfile = {
          username,
          email: keycloak.tokenParsed.email || '',
          name: keycloak.tokenParsed.name || 'Anonymous',
          bio: 'No bio provided'
        };
        updateUI(defaultProfile);
        try {
          await createProfile(defaultProfile);
          console.log('Created new profile');
        } catch (e) {
          console.error('Error creating profile:', e);
        }
      } else {
        console.error('Error loading profile:', err);
        document.getElementById('profile-name').textContent = 'Error loading profile';
      }
    }
  };

  const setupProfilePictureUpload = () => {
    const profilePic = document.getElementById('profile-pic');
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.style.display = 'none';
    document.body.appendChild(fileInput);

    profilePic.addEventListener('click', () => {
      if (keycloak.authenticated) {
        fileInput.click();
      }
    });

    fileInput.addEventListener('change', async () => {
      if (fileInput.files.length > 0) {
        const file = fileInput.files[0];
        const username = getUsername();
        
        console.log('Uploading file:', file.name, file.type, file.size);
        
        // 1. Upload the image file
        const formData = new FormData();
        formData.append('picture', file, file.name);
        
        const uploadResponse = await fetch(`${apiBase}/users/picture`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${keycloak.token}`,
            'Accept': 'application/json'
          },
          body: formData
        });

        if (!uploadResponse.ok) {
          throw new Error('Failed to upload picture');
        }

        const { pictureUrl } = await uploadResponse.json();
        
        // 3. Update UI with new picture
        profilePic.src = pictureUrl;
        alert('Profile picture updated successfully!');
      }
    });
  };

  const setupSaveButton = () => {
    document.getElementById('save-btn').addEventListener('click', async () => {
      if (!keycloak.authenticated) {
        return window.location.href = './index.html';
      }
      
      const getValue = id => document.getElementById(id)?.value || '';
      const username = getUsername();
      const profileData = {
        username,
        email: keycloak.tokenParsed.email || '',
        name: getValue('name') || keycloak.tokenParsed.name || '',
        display_name: getValue('display-name') || username,
        bio: getValue('bio') || 'No bio provided',
        street: getValue('street'),
        city: getValue('city'),
        state: getValue('state'),
        zip_code: getValue('zip'),
        country: getValue('country')
      };

      try {
        const res = await fetch(`${apiBase}/users/${encodeURIComponent(username)}`, {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${keycloak.token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(profileData)
        });
        if (!res.ok) throw new Error('save_failed');
        alert('Profile saved successfully!');
      } catch (err) {
        console.error('Error saving profile:', err);
        alert('Error saving profile');
      }
    });
  };

  const setupLogoutButton = () => {
    document.getElementById('logout-btn').addEventListener('click', () => {
      keycloak.logout();
    });
  };

  await waitForKeycloak();
  await loadProfile();
  setupProfilePictureUpload();
  setupSaveButton();
  setupLogoutButton();
});
