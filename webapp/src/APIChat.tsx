import React, { useState, useEffect, useRef, KeyboardEvent } from 'react';
import './css/Chat.css';

interface Message {
    sender: string;
    body: string | JSX.Element;
    avatarUrl?: string;
}

const APIChat: React.FC = () => {
    const [conversations, setConversations] = useState<Message[]>([]);
    const [prompt, setPrompt] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [apiUrl, setApiUrl] = useState('http://localhost:8000/generate_images');
    const [showDropdown, setShowDropdown] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement | null>(null);
    const apiUrlInputRef = useRef<HTMLInputElement | null>(null);

    // Load URL history from localStorage
    const [urlHistory, setUrlHistory] = useState<string[]>(() => {
        const savedHistory = localStorage.getItem('urlHistory');
        return savedHistory ? JSON.parse(savedHistory) : [];
    });

    useEffect(() => {
        localStorage.setItem('urlHistory', JSON.stringify(urlHistory));
    }, [urlHistory]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [conversations]);

    const handleDropdownToggle = () => {
        setShowDropdown((prev) => !prev);
    };

    // Select a URL from history, set it, and submit it
    const handleHistorySelect = (selectedUrl: string) => {
        setApiUrl(selectedUrl);
        handleSetUrl(selectedUrl);
        setShowDropdown(false);
    };

    // Remove a URL from history
    const handleDeleteUrl = (urlToDelete: string) => {
        setUrlHistory((prev) => prev.filter((url) => url !== urlToDelete));
    };

    // Save and log the API URL
    const handleSetUrl = (url?: string) => {
        const finalUrl = url || apiUrl.trim();
        if (!finalUrl) return;

        if (!urlHistory.includes(finalUrl)) {
            setUrlHistory((prev) => [...prev, finalUrl]);
        }

        setConversations((prev) => [
            ...prev,
            {
                sender: 'System',
                body: (
                    <span>
                        API URL set to: <a href={finalUrl} target="_blank" rel="noopener noreferrer">{finalUrl}</a>
                    </span>
                ),
                avatarUrl: '/favicon.svg',
            }
        ]);
    };

    const handleSubmit = async () => {
        if (!prompt.trim()) return;

        setLoading(true);
        setError(null);

        setConversations((prev) => [
            ...prev,
            { sender: 'You', body: prompt, avatarUrl: '/user_3626098.png' },
        ]);

        try {
            const params = new URLSearchParams();
            params.set('prompt', prompt);
            params.set('seed', Math.floor(Math.random() * 1000000).toString()); // Random seed between 0 and 999999
            params.set('guidance', '5');

            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: params.toString(),
            });

            if (!response.ok) {
                throw new Error(`Failed to generate image. Status: ${response.status}`);
            }
            //console.log(response);
            const blob = await response.blob();
            const reader = new FileReader();
            reader.readAsDataURL(blob);
            reader.onloadend = () => {
                const base64data = reader.result as string;

                setConversations((prev) => [
                    ...prev,
                    {
                        sender: 'AI',
                        body: <img src={base64data} alt="Generated" style={{ maxWidth: '100%', borderRadius: '8px' }} />,
                        avatarUrl: '/favicon.svg',
                    },
                ]);
            };
        } catch (err) {
            setError(`Error generating image: ${(err as Error).message}`);
        } finally {
            setLoading(false);
            setPrompt('');
        }
    };

    const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
        }
    };

    return (
        <main className="chat-container">
            <div className="chat-box">
                <div className="input-container">
                    <div className="combined-input">
                        <input
                            ref={apiUrlInputRef}
                            className="chat-input"
                            type="text"
                            value={apiUrl}
                            onChange={(e) => setApiUrl(e.target.value)}
                            onFocus={() => setShowDropdown(false)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSetUrl()}
                            placeholder="Enter API URL"
                        />

                        <button className="dropdown-button" onClick={handleDropdownToggle}>▼</button>

                        {showDropdown && (
                            <div className="dropdown-menu">
                                {urlHistory.length === 0 ? (
                                    <div className="dropdown-item">No history</div>
                                ) : (
                                    urlHistory.map((url, index) => (
                                        <div
                                            key={index}
                                            className="dropdown-item"
                                            onClick={(e) => {
                                                // Prevent deleting when clicking inside but not on the delete button
                                                if (!(e.target as HTMLElement).classList.contains('delete-button')) {
                                                    handleHistorySelect(url);
                                                }
                                            }}
                                        >
                                            <span>{url}</span>
                                            <button
                                                className="delete-button"
                                                onClick={(e) => {
                                                    e.stopPropagation(); // Prevent triggering onClick for dropdown-item
                                                    handleDeleteUrl(url);
                                                }}
                                            >
                                                🗑️
                                            </button>
                                        </div>
                                    ))
                                )}
                            </div>
                        )}

                    </div>
                </div>

                <div className="responses-container">
                    {conversations.map((message, index) => (
                        <div key={index} className="chat-message">
                            <div className="message-avatar">
                                {message.avatarUrl ? <img src={message.avatarUrl} alt="Avatar" /> : <div className="default-avatar">{message.sender[0]}</div>}
                            </div>
                            <div className="message-content">
                                <div className="message-sender">{message.sender}</div>
                                <div className="message-body">
                                    {typeof message.body === 'string' ? message.body : message.body}
                                </div>
                            </div>
                        </div>
                    ))}
                    <div ref={messagesEndRef} />
                </div>

                <div className="input-container">
                    <textarea
                        className="chat-input"
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Enter your prompt for image generation"
                        rows={3}
                    />
                    <button className="send-button" onClick={handleSubmit} disabled={loading}>
                        {loading ? 'Generating...' : 'Send'}
                    </button>
                </div>
                {error && <div className="error-message">{error}</div>}
            </div>
        </main>
    );
};

export default APIChat;