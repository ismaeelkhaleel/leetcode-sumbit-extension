document.addEventListener('DOMContentLoaded', () => {
    const githubTokenInput = document.getElementById('githubToken');
    const githubUsernameInput = document.getElementById('githubUsername');
    const githubRepoInput = document.getElementById('githubRepo');
    const groqApiKeyInput = document.getElementById('groqApiKey');
    const saveBtn = document.getElementById('saveBtn');
    const statusDiv = document.getElementById('status');

    // Load saved settings
    chrome.storage.local.get(['githubToken', 'githubUsername', 'githubRepo', 'groqApiKey'], (result) => {
        if (result.githubToken) githubTokenInput.value = result.githubToken;
        if (result.githubUsername) githubUsernameInput.value = result.githubUsername;
        if (result.githubRepo) githubRepoInput.value = result.githubRepo;
        if (result.groqApiKey) groqApiKeyInput.value = result.groqApiKey;
    });

    // Save settings
    saveBtn.addEventListener('click', () => {
        const githubToken = githubTokenInput.value.trim();
        const githubUsername = githubUsernameInput.value.trim();
        const githubRepo = githubRepoInput.value.trim();
        const groqApiKey = groqApiKeyInput.value.trim();

        chrome.storage.local.set({
            githubToken,
            githubUsername,
            githubRepo,
            groqApiKey
        }, () => {
            statusDiv.textContent = 'Settings saved successfully!';
            setTimeout(() => {
                statusDiv.textContent = '';
            }, 3000);
        });
    });
});
