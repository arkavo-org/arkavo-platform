const synapseBaseUrl = import.meta.env.VITE_SYNAPSE_BASE_URL;

const initiateSSOLogin = async () => {
    const redirectUrl = `${window.location.origin}`;
    window.location.href = `https://${synapseBaseUrl}/_matrix/client/r0/login/sso/redirect?redirectUrl=${encodeURIComponent(redirectUrl)}`;
};

const exchangeLoginTokenForAccessToken = async (loginToken: string): Promise<string> => {
    const response = await fetch(`https://${synapseBaseUrl}/_matrix/client/r0/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            type: 'm.login.token',
            token: loginToken,
        }),
    });

    if (!response.ok) throw new Error('Failed to exchange login token');
    const data = await response.json();
    return data.access_token;
};

export const handleLogin = async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const loginToken = urlParams.get('loginToken');

    if (loginToken) {
        const accessToken = await exchangeLoginTokenForAccessToken(loginToken);
        localStorage.setItem('matrixAccessToken', accessToken); // Persist access token
    } else {
        await initiateSSOLogin();
    }
};