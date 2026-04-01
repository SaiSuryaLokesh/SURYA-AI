document.addEventListener('DOMContentLoaded', () => {
    const geminiInput = document.getElementById('gemini-input');
    const suggestionChips = document.querySelectorAll('.suggestion-chip');
    const newChatBtn = document.getElementById('new-chat-btn');
    const sessionBtns = document.querySelectorAll('.session-btn');
    
    const heroSection = document.getElementById('hero-section');
    const suggestionsRow = document.querySelector('.suggestions-row');
    const chatContainer = document.getElementById('chat-container');
    const pdfUpload = document.getElementById('pdf-upload');

    let currentSessionId = "1";

    // Focus input on page load
    geminiInput.focus();

    // Suggestion chip click handler
    suggestionChips.forEach(chip => {
        chip.addEventListener('click', () => {
            const topic = chip.textContent.trim();
            sendMessage(topic);
            
            // Visual feedback
            chip.style.transform = 'scale(0.95)';
            setTimeout(() => {
                chip.style.transform = 'scale(1)';
            }, 100);
        });
    });

    // New Chat (clear UI, we stay on same session id but it's technically a new state for the UI, 
    // though the backend history persists unless cleared. To truly create a new one, we'd need more logic. 
    // Here we just clear the UI and go back to hero section).
    newChatBtn.addEventListener('click', () => {
        resetUIToHero();
        // Brief animation
        newChatBtn.style.transform = 'rotate(90deg)';
        setTimeout(() => {
            newChatBtn.style.transform = 'rotate(0deg)';
        }, 300);
    });

    // Session Switch Handler
    sessionBtns.forEach(btn => {
        btn.addEventListener('click', async () => {
            const newSessionId = btn.getAttribute('data-id');
            if (newSessionId === currentSessionId) return;

            // Update UI State
            sessionBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentSessionId = newSessionId;

            // Fetch History for the selected session
            await loadSessionHistory(currentSessionId);
        });
    });

    // PDF Upload Handler
    pdfUpload.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        showChatView();
        appendUserMessage(`Uploaded Document: ${file.name}`);
        const loadingId = appendLoading();

        const formData = new FormData();
        formData.append('file', file);
        formData.append('session_id', currentSessionId);

        try {
            const response = await fetch('http://localhost:5000/api/upload', {
                method: 'POST',
                body: formData
            });

            const data = await response.json();
            removeLoading(loadingId);

            if (!response.ok) {
                appendAIMessage("Error uploading PDF: " + (data.error || "Unknown error"));
            } else {
                appendAIMessage(`Successfully read **${file.name}**. I've extracted the text and committed it to memory using RAG. The context is now active for this session. Ask me anything about it!`);
            }
        } catch (error) {
            console.error("Upload error:", error);
            removeLoading(loadingId);
            appendAIMessage("Error: Could not connect to the backend server to process PDF.");
        }
        
        pdfUpload.value = '';
    });

    // Handle input Enter key
    geminiInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && geminiInput.value.trim() !== '') {
            sendMessage(geminiInput.value.trim());
        }
    });

    function resetUIToHero() {
        geminiInput.value = '';
        chatContainer.innerHTML = '';
        chatContainer.style.display = 'none';
        heroSection.style.display = 'block';
        suggestionsRow.style.display = 'flex';
        geminiInput.focus();
    }

    function showChatView() {
        if(heroSection.style.display !== 'none') {
            heroSection.style.display = 'none';
            suggestionsRow.style.display = 'none';
            chatContainer.style.display = 'flex';
        }
    }

    async function loadSessionHistory(sessionId) {
        // Clear current content and show a skeleton or nothing
        chatContainer.innerHTML = '';
        geminiInput.disabled = true;

        try {
            const response = await fetch(`http://localhost:5000/api/history/${sessionId}`);
            const data = await response.json();

            geminiInput.disabled = false;
            geminiInput.focus();

            if (!response.ok) {
                console.error("Failed to load history:", data.error);
                resetUIToHero();
                return;
            }

            const history = data.history;
            if (history && history.length > 0) {
                showChatView();
                history.forEach(msg => {
                    if (msg.role === 'user') {
                        appendUserMessage(msg.content);
                    } else {
                        appendAIMessage(msg.content);
                    }
                });
            } else {
                // If history is empty, show the hero section
                resetUIToHero();
            }

        } catch (error) {
            console.error("Error connecting to backend for history:", error);
            geminiInput.disabled = false;
            resetUIToHero();
        }
    }

    async function sendMessage(text) {
        // Clear input
        geminiInput.value = '';

        // Switch view
        showChatView();

        // Add user message to UI
        appendUserMessage(text);
        
        // Add loading state
        const loadingId = appendLoading();

        try {
            const response = await fetch(`http://localhost:5000/api/chat/${currentSessionId}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ message: text })
            });

            const data = await response.json();

            removeLoading(loadingId);

            if (!response.ok) {
                appendAIMessage("Error: " + (data.error || "Failed to generate content"));
            } else {
                appendAIMessage(data.reply);
            }

        } catch (error) {
            console.error("Error connecting to backend:", error);
            removeLoading(loadingId);
            appendAIMessage("Error: Could not connect to the backend server. Make sure it's running.");
        }
    }

    function appendUserMessage(text) {
        const msgDiv = document.createElement('div');
        msgDiv.className = 'chat-message user-message';
        msgDiv.textContent = text;
        chatContainer.appendChild(msgDiv);
        scrollToBottom();
    }

    function appendAIMessage(text) {
        const msgDiv = document.createElement('div');
        msgDiv.className = 'chat-message ai-message';

        const iconDiv = document.createElement('div');
        iconDiv.className = 'ai-icon';
        iconDiv.innerHTML = '<span class="material-symbols-rounded">sparkles</span>';

        const formatText = text.replace(/\n/g, '<br>');

        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';
        contentDiv.innerHTML = formatText;

        msgDiv.appendChild(iconDiv);
        msgDiv.appendChild(contentDiv);
        
        chatContainer.appendChild(msgDiv);
        scrollToBottom();
    }

    function appendLoading() {
        const id = 'loading-' + Date.now();
        const msgDiv = document.createElement('div');
        msgDiv.className = 'chat-message ai-message';
        msgDiv.id = id;

        const iconDiv = document.createElement('div');
        iconDiv.className = 'ai-icon';
        iconDiv.innerHTML = '<span class="material-symbols-rounded">sparkles</span>';

        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content loading-indicator';
        contentDiv.innerHTML = `
            <div class="loading-dot"></div>
            <div class="loading-dot"></div>
            <div class="loading-dot"></div>
        `;

        msgDiv.appendChild(iconDiv);
        msgDiv.appendChild(contentDiv);
        
        chatContainer.appendChild(msgDiv);
        scrollToBottom();
        return id;
    }

    function removeLoading(id) {
        const loadingDiv = document.getElementById(id);
        if (loadingDiv) {
            loadingDiv.remove();
        }
    }

    function scrollToBottom() {
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }

    // Upgrade button interaction
    const upgradeBtn = document.querySelector('.upgrade-btn');
    upgradeBtn.addEventListener('click', () => {
        alert('Upgrade to Google AI Plus! (Mockup)');
    });
});
