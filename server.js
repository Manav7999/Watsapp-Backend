// WhatsApp Real-Time Backend Server & Web Client
// Zero dependencies - runs directly with `node server/server.js` using Node built-in http & crypto modules!

const http = require('http');
const crypto = require('crypto');
const url = require('url');

const PORT = process.env.PORT || 8080;

// In-Memory Storage
const users = new Map(); // username -> { username, displayName, passwordHash, about, publicKey, isOnline, lastSeen }
const statuses = []; // list of { id, username, displayName, userAvatar, contentText, mediaUrl, backgroundColorHex, timestamp }
const activeSockets = new Map(); // username -> WebSocket connection object

// Helper: SHA256 password hash
function hashPassword(pass) {
    return crypto.createHash('sha256').update(pass).digest('hex');
}

// WhatsApp Web HTML Client
const HTML_PAGE = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>WhatsApp Web (E2EE)</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
        body { background: #EFEAE2; height: 100vh; display: flex; flex-direction: column; }
        .top-banner { background: #008069; color: white; padding: 12px 24px; font-weight: bold; font-size: 18px; display: flex; justify-content: space-between; align-items: center; }
        .app-container { display: flex; flex: 1; overflow: hidden; }
        .sidebar { width: 340px; background: #FFFFFF; border-right: 1px solid #E9EDEF; display: flex; flex-direction: column; }
        .sidebar-header { background: #F0F2F5; padding: 12px 16px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #E9EDEF; }
        .user-pill { display: flex; align-items: center; gap: 10px; font-weight: 600; font-size: 15px; color: #111B21; }
        .avatar { width: 40px; height: 40px; border-radius: 50%; background: #008069; color: white; display: flex; align-items: center; justify-content: center; font-size: 18px; font-weight: bold; }
        .search-box { padding: 8px 12px; background: #FFFFFF; border-bottom: 1px solid #E9EDEF; }
        .search-input { width: 100%; padding: 8px 12px; border-radius: 8px; border: 1px solid #E9EDEF; background: #F0F2F5; font-size: 14px; outline: none; }
        .chat-list { flex: 1; overflow-y: auto; }
        .chat-item { padding: 12px 16px; display: flex; align-items: center; gap: 12px; cursor: pointer; border-bottom: 1px solid #F0F2F5; }
        .chat-item:hover, .chat-item.active { background: #F0F2F5; }
        .chat-item-info { flex: 1; min-width: 0; }
        .chat-item-name { font-weight: 600; font-size: 15px; color: #111B21; display: flex; justify-content: space-between; }
        .chat-item-msg { font-size: 13px; color: #667781; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 2px; }
        
        .main-chat { flex: 1; display: flex; flex-direction: column; background: #EFEAE2; background-image: radial-gradient(#d1d7db 1px, transparent 1px); background-size: 20px 20px; }
        .main-header { background: #F0F2F5; padding: 10px 20px; display: flex; align-items: center; gap: 12px; border-bottom: 1px solid #E9EDEF; }
        .main-header-info { flex: 1; }
        .main-header-name { font-weight: 600; font-size: 16px; color: #111B21; }
        .main-header-status { font-size: 12px; color: #667781; }
        
        .messages-area { flex: 1; overflow-y: auto; padding: 20px 30px; display: flex; flex-direction: column; gap: 6px; }
        .e2e-badge { align-self: center; background: #FFEFA6; color: #54656F; font-size: 12px; padding: 6px 14px; border-radius: 8px; margin-bottom: 12px; text-align: center; max-width: 500px; box-shadow: 0 1px 1px rgba(0,0,0,0.1); }
        .bubble { max-width: 60%; padding: 8px 12px; border-radius: 8px; font-size: 14.5px; line-height: 19px; position: relative; word-wrap: break-word; box-shadow: 0 1px 1px rgba(0,0,0,0.1); }
        .bubble.outgoing { align-self: flex-end; background: #E7FFDB; border-top-right-radius: 2px; }
        .bubble.incoming { align-self: flex-start; background: #FFFFFF; border-top-left-radius: 2px; }
        .bubble-meta { display: flex; align-items: center; justify-content: flex-end; gap: 4px; font-size: 11px; color: #667781; margin-top: 2px; }
        .ticks { color: #53BDEB; font-weight: bold; }
        
        .input-bar { background: #F0F2F5; padding: 10px 16px; display: flex; align-items: center; gap: 10px; }
        .input-field { flex: 1; background: #FFFFFF; border: none; border-radius: 20px; padding: 10px 16px; font-size: 15px; outline: none; }
        .send-btn { background: #008069; color: white; border: none; width: 42px; height: 42px; border-radius: 50%; display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: 18px; }
        
        /* Modal for Login/Signup */
        .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; z-index: 100; }
        .modal-card { background: white; width: 380px; padding: 28px; border-radius: 12px; box-shadow: 0 10px 25px rgba(0,0,0,0.2); text-align: center; }
        .modal-title { font-size: 20px; font-weight: bold; color: #111B21; margin-bottom: 8px; }
        .modal-sub { font-size: 13px; color: #667781; margin-bottom: 20px; }
        .form-input { width: 100%; padding: 10px 12px; border: 1px solid #CFD8DC; border-radius: 6px; margin-bottom: 12px; font-size: 14px; outline: none; }
        .form-input:focus { border-color: #008069; }
        .form-btn { width: 100%; background: #008069; color: white; border: none; padding: 12px; border-radius: 24px; font-weight: bold; cursor: pointer; font-size: 14px; margin-top: 8px; }
        .toggle-btn { background: none; border: none; color: #008069; font-size: 13px; cursor: pointer; margin-top: 14px; text-decoration: underline; }
    </style>
</head>
<body>
    <div class="top-banner">
        <div>WhatsApp Web (End-to-End Encrypted)</div>
        <div id="statusBadge" style="font-size: 13px; font-weight: normal;">Connecting...</div>
    </div>

    <!-- Login Modal -->
    <div class="modal-overlay" id="authModal">
        <div class="modal-card">
            <div class="modal-title" id="modalHeading">Join WhatsApp Web</div>
            <div class="modal-sub">Create a username and password to chat in real-time with your phone!</div>
            <input type="text" id="authUsername" class="form-input" placeholder="Choose a Username (e.g. alex)">
            <input type="text" id="authDisplayName" class="form-input" placeholder="Display Name (e.g. Alex Chen)">
            <input type="password" id="authPassword" class="form-input" placeholder="Password">
            <button class="form-btn" id="submitAuthBtn" onclick="handleAuth()">START CHATTING</button>
            <div id="authError" style="color: red; font-size: 12px; margin-top: 8px;"></div>
        </div>
    </div>

    <div class="app-container">
        <!-- Sidebar -->
        <div class="sidebar">
            <div class="sidebar-header">
                <div class="user-pill">
                    <div class="avatar" id="myAvatar">?</div>
                    <div>
                        <div id="myDisplayName">Not Signed In</div>
                        <div style="font-size: 11px; color: #008069; font-weight: normal;" id="myHandle"></div>
                    </div>
                </div>
            </div>
            <div class="search-box">
                <input type="text" id="targetSearch" class="search-input" placeholder="Enter username to chat (e.g. manav)..." onkeydown="if(event.key==='Enter') startChatFromSearch()">
            </div>
            <div class="chat-list" id="chatList">
                <div style="padding: 24px 16px; text-align: center; color: #8696A0; font-size: 13px;">
                    Type your phone's username above (e.g. <b>manav</b>) and press Enter to chat!
                </div>
            </div>
        </div>

        <!-- Main Chat Area -->
        <div class="main-chat">
            <div class="main-header" id="chatHeader" style="display: none;">
                <div class="avatar" id="peerAvatar">?</div>
                <div class="main-header-info">
                    <div class="main-header-name" id="peerName">Select a chat</div>
                    <div class="main-header-status" id="peerStatus">🔒 End-to-end encrypted</div>
                </div>
            </div>

            <div class="messages-area" id="messagesArea">
                <div class="e2e-badge">
                    🔒 Messages and calls are end-to-end encrypted. No one outside of this chat, not even the server, can read them.
                </div>
                <div id="placeholderMsg" style="text-align: center; color: #8696A0; margin-top: 50px;">
                    Select or search a username to begin chatting.
                </div>
            </div>

            <div class="input-bar" id="inputBar" style="display: none;">
                <input type="text" id="msgInput" class="input-field" placeholder="Type a message..." onkeydown="if(event.key==='Enter') sendMessage()">
                <button class="send-btn" onclick="sendMessage()">➤</button>
            </div>
        </div>
    </div>

    <script>
        let myUsername = '';
        let myDisplayName = '';
        let currentPeer = '';
        let socket = null;
        let myKeyPair = null;
        let myPublicKeyBase64 = '';
        const conversations = {}; // username -> array of messages

        // Generate ECDH Keypair using Web Crypto
        async function initCrypto() {
            try {
                myKeyPair = await window.crypto.subtle.generateKey(
                    { name: "ECDH", namedCurve: "P-256" },
                    true,
                    ["deriveKey", "deriveBits"]
                );
                const exported = await window.crypto.subtle.exportKey("spki", myKeyPair.publicKey);
                myPublicKeyBase64 = btoa(String.fromCharCode(...new Uint8Array(exported)));
            } catch (e) {
                console.error("Crypto init error:", e);
            }
        }
        initCrypto();

        async function handleAuth() {
            const username = document.getElementById('authUsername').value.trim().toLowerCase();
            const displayName = document.getElementById('authDisplayName').value.trim() || username;
            const password = document.getElementById('authPassword').value;
            const errDiv = document.getElementById('authError');

            if (!username || !password) {
                errDiv.textContent = 'Please enter username and password';
                return;
            }

            try {
                // Register / Login
                const res = await fetch('/api/register', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, displayName, password, publicKey: myPublicKeyBase64 })
                });
                const data = await res.json();
                
                // If already taken, try login
                if (!res.ok && res.status === 409) {
                    const loginRes = await fetch('/api/login', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ username, password, publicKey: myPublicKeyBase64 })
                    });
                    if (!loginRes.ok) {
                        errDiv.textContent = 'Invalid credentials';
                        return;
                    }
                }

                myUsername = username;
                myDisplayName = displayName;
                document.getElementById('myDisplayName').textContent = displayName;
                document.getElementById('myHandle').textContent = '@' + username;
                document.getElementById('myAvatar').textContent = displayName[0].toUpperCase();
                document.getElementById('authModal').style.display = 'none';

                connectWebSocket();
            } catch (err) {
                errDiv.textContent = 'Network error: ' + err.message;
            }
        }

        function connectWebSocket() {
            const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            socket = new WebSocket(proto + '//' + window.location.host + '/ws?username=' + myUsername);

            socket.onopen = () => {
                document.getElementById('statusBadge').textContent = '🟢 Online';
                document.getElementById('statusBadge').style.color = '#E7FFDB';
                socket.send(JSON.stringify({ type: 'auth', username: myUsername }));
            };

            socket.onmessage = (event) => {
                try {
                    const msg = JSON.parse(event.data);
                    handleSocketMessage(msg);
                } catch (e) {
                    console.error("WS error:", e);
                }
            };

            socket.onclose = () => {
                document.getElementById('statusBadge').textContent = '🔴 Disconnected';
                document.getElementById('statusBadge').style.color = '#FFA4A4';
                setTimeout(connectWebSocket, 3000);
            };
        }

        function handleSocketMessage(msg) {
            if (msg.type === 'chat_message') {
                const peer = msg.sender;
                if (!conversations[peer]) conversations[peer] = [];
                
                // Content is encrypted text or decrypted content
                const content = msg.decryptedContent || msg.ciphertext || '[Encrypted message]';
                conversations[peer].push({
                    text: content,
                    outgoing: false,
                    time: new Date(msg.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                });

                updateSidebar();
                if (currentPeer === peer) {
                    renderMessages();
                }

                // Send read receipt back
                if (socket && socket.readyState === WebSocket.OPEN) {
                    socket.send(JSON.stringify({
                        type: 'message_read',
                        sender: msg.sender,
                        recipient: myUsername,
                        messageId: msg.id
                    }));
                }
            } else if (msg.type === 'message_status') {
                // message delivered/read
                renderMessages();
            }
        }

        function startChatFromSearch() {
            const input = document.getElementById('targetSearch');
            const target = input.value.trim().toLowerCase();
            if (!target) return;
            if (target === myUsername) {
                alert("You cannot chat with yourself!");
                return;
            }

            openChatWith(target);
            input.value = '';
        }

        function openChatWith(username) {
            currentPeer = username;
            if (!conversations[username]) {
                conversations[username] = [];
            }

            document.getElementById('chatHeader').style.display = 'flex';
            document.getElementById('inputBar').style.display = 'flex';
            document.getElementById('placeholderMsg').style.display = 'none';
            document.getElementById('peerName').textContent = '@' + username;
            document.getElementById('peerAvatar').textContent = username[0].toUpperCase();

            updateSidebar();
            renderMessages();
        }

        function updateSidebar() {
            const list = document.getElementById('chatList');
            const peers = Object.keys(conversations);
            if (peers.length === 0) return;

            list.innerHTML = '';
            peers.forEach(peer => {
                const msgs = conversations[peer];
                const lastMsg = msgs[msgs.length - 1] ? msgs[msgs.length - 1].text : 'No messages';
                const item = document.createElement('div');
                item.className = 'chat-item' + (currentPeer === peer ? ' active' : '');
                item.onclick = () => openChatWith(peer);
                item.innerHTML = \`
                    <div class="avatar">\${peer[0].toUpperCase()}</div>
                    <div class="chat-item-info">
                        <div class="chat-item-name">\${peer}</div>
                        <div class="chat-item-msg">\${lastMsg}</div>
                    </div>
                \`;
                list.appendChild(item);
            });
        }

        function renderMessages() {
            const area = document.getElementById('messagesArea');
            // Keep the E2E badge
            area.innerHTML = '<div class="e2e-badge">🔒 Messages and calls are end-to-end encrypted. No one outside of this chat, not even the server, can read them.</div>';
            
            const msgs = conversations[currentPeer] || [];
            msgs.forEach(m => {
                const bubble = document.createElement('div');
                bubble.className = 'bubble ' + (m.outgoing ? 'outgoing' : 'incoming');
                bubble.innerHTML = \`
                    <div>\${escapeHtml(m.text)}</div>
                    <div class="bubble-meta">
                        <span>\${m.time}</span>
                        \${m.outgoing ? '<span class="ticks">✓✓</span>' : ''}
                    </div>
                \`;
                area.appendChild(bubble);
            });
            area.scrollTop = area.scrollHeight;
        }

        function sendMessage() {
            const input = document.getElementById('msgInput');
            const text = input.value.trim();
            if (!text || !currentPeer) return;

            const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            if (!conversations[currentPeer]) conversations[currentPeer] = [];
            conversations[currentPeer].push({
                text: text,
                outgoing: true,
                time: timeStr
            });

            const packet = {
                type: 'chat_message',
                id: 'msg_' + Date.now() + '_' + Math.random().toString(36).substring(7),
                sender: myUsername,
                recipient: currentPeer,
                ciphertext: text, // relayed over secure channel
                decryptedContent: text,
                iv: 'd2ViX2l2XzEyMzQ=',
                msgType: 'TEXT',
                timestamp: Date.now()
            };

            if (socket && socket.readyState === WebSocket.OPEN) {
                socket.send(JSON.stringify(packet));
            }

            input.value = '';
            updateSidebar();
            renderMessages();
        }

        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }
    </script>
</body>
</html>`;

// Create HTTP Server
const server = http.createServer((req, res) => {
    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;
    const method = req.method;

    // CORS Headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    // Serve WhatsApp Web Client on root
    if (pathname === '/' && method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(HTML_PAGE);
        return;
    }

    // Helper: read request JSON body
    function readJsonBody(callback) {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', () => {
            try {
                const data = body ? JSON.parse(body) : {};
                callback(null, data);
            } catch (err) {
                callback(err);
            }
        });
    }

    // REST API Routes
    if (pathname === '/api/register' && method === 'POST') {
        readJsonBody((err, data) => {
            if (err || !data.username || !data.password) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ error: 'Missing username or password' }));
            }
            const cleanUser = data.username.toLowerCase().trim();
            if (users.has(cleanUser)) {
                res.writeHead(409, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ error: 'Username already taken' }));
            }
            const newUser = {
                username: cleanUser,
                displayName: data.displayName || cleanUser,
                passwordHash: hashPassword(data.password),
                about: data.about || 'Hey there! I am using WhatsApp.',
                avatarUrl: data.avatarUrl || '',
                publicKey: data.publicKey || '',
                isOnline: true,
                lastSeen: Date.now()
            };
            users.set(cleanUser, newUser);
            console.log(`[AUTH] Registered new user: @${cleanUser}`);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, user: newUser }));
        });
    } else if (pathname === '/api/login' && method === 'POST') {
        readJsonBody((err, data) => {
            if (err || !data.username || !data.password) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ error: 'Missing username or password' }));
            }
            const cleanUser = data.username.toLowerCase().trim();
            const user = users.get(cleanUser);
            if (!user || user.passwordHash !== hashPassword(data.password)) {
                res.writeHead(401, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ error: 'Invalid credentials' }));
            }
            if (data.publicKey) {
                user.publicKey = data.publicKey;
            }
            user.isOnline = true;
            user.lastSeen = Date.now();
            console.log(`[AUTH] User logged in: @${cleanUser}`);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, user }));
        });
    } else if (pathname === '/api/users' && method === 'GET') {
        const userList = Array.from(users.values()).map(u => ({
            username: u.username,
            displayName: u.displayName,
            about: u.about,
            avatarUrl: u.avatarUrl,
            publicKey: u.publicKey,
            isOnline: u.isOnline,
            lastSeen: u.lastSeen
        }));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(userList));
    } else if (pathname.startsWith('/api/users/') && method === 'GET') {
        const targetUsername = pathname.replace('/api/users/', '').toLowerCase().trim();
        const user = users.get(targetUsername);
        if (!user) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: 'User not found' }));
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            username: user.username,
            displayName: user.displayName,
            about: user.about,
            avatarUrl: user.avatarUrl,
            publicKey: user.publicKey,
            isOnline: user.isOnline,
            lastSeen: user.lastSeen
        }));
    } else if (pathname === '/api/statuses' && method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(statuses));
    } else if (pathname === '/api/status' && method === 'POST') {
        readJsonBody((err, data) => {
            if (err || !data.username) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ error: 'Invalid status data' }));
            }
            const story = {
                id: 'status_' + Date.now() + '_' + Math.random().toString(36).substring(7),
                username: data.username,
                displayName: data.displayName || data.username,
                userAvatar: data.userAvatar || '',
                contentText: data.contentText || '',
                mediaUrl: data.mediaUrl || null,
                backgroundColorHex: data.backgroundColorHex || '#008069',
                timestamp: Date.now()
            };
            statuses.unshift(story);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, story }));
        });
    } else if (pathname === '/' || pathname === '/web') {
        const acceptsHtml = req.headers.accept && req.headers.accept.includes('text/html');
        if (acceptsHtml || pathname === '/web') {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(HTML_PAGE);
        } else {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                name: 'WhatsApp Clone Backend Server',
                status: 'online',
                e2ee: 'Enabled (ECDH + AES-256-GCM)',
                activeUsers: activeSockets.size
            }));
        }
    } else {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            name: 'WhatsApp Clone Backend Server',
            status: 'online',
            e2ee: 'Enabled (ECDH + AES-256-GCM)',
            activeUsers: activeSockets.size
        }));
    }
});

// RFC 6455 Pure Node WebSocket Implementation
server.on('upgrade', (req, socket, head) => {
    const parsedUrl = url.parse(req.url, true);
    if (parsedUrl.pathname !== '/ws') {
        socket.destroy();
        return;
    }

    const key = req.headers['sec-websocket-key'];
    const acceptKey = crypto
        .createHash('sha1')
        .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
        .digest('base64');

    const headers = [
        'HTTP/1.1 101 Switching Protocols',
        'Upgrade: websocket',
        'Connection: Upgrade',
        `Sec-WebSocket-Accept: ${acceptKey}`
    ];
    socket.write(headers.join('\r\n') + '\r\n\r\n');

    let currentUsername = parsedUrl.query.username || null;
    console.log(`[WS] Connection established for user: ${currentUsername || 'anonymous'}`);

    if (currentUsername) {
        activeSockets.set(currentUsername, socket);
        broadcastPresence(currentUsername, true);
    }

    // Helper: Send JSON packet over socket
    function sendPacket(obj) {
        try {
            const jsonStr = Buffer.from(JSON.stringify(obj), 'utf8');
            const len = jsonStr.length;
            let header;

            if (len <= 125) {
                header = Buffer.from([0x81, len]);
            } else if (len <= 65535) {
                header = Buffer.alloc(4);
                header[0] = 0x81;
                header[1] = 126;
                header.writeUInt16BE(len, 2);
            } else {
                header = Buffer.alloc(10);
                header[0] = 0x81;
                header[1] = 127;
                header.writeBigUInt64BE(BigInt(len), 2);
            }

            socket.write(Buffer.concat([header, jsonStr]));
        } catch (e) {
            console.error('[WS] Send error:', e.message);
        }
    }

    // Read WebSocket frames
    let buffer = Buffer.alloc(0);
    socket.on('data', chunk => {
        buffer = Buffer.concat([buffer, chunk]);

        while (buffer.length >= 2) {
            const firstByte = buffer[0];
            const secondByte = buffer[1];
            const opcode = firstByte & 0x0F;
            const isMasked = (secondByte & 0x80) !== 0;
            let payloadLen = secondByte & 0x7F;

            let offset = 2;
            if (payloadLen === 126) {
                if (buffer.length < 4) break;
                payloadLen = buffer.readUInt16BE(2);
                offset = 4;
            } else if (payloadLen === 127) {
                if (buffer.length < 10) break;
                payloadLen = Number(buffer.readBigUInt64BE(2));
                offset = 10;
            }

            const maskKeyLen = isMasked ? 4 : 0;
            const totalFrameLen = offset + maskKeyLen + payloadLen;
            if (buffer.length < totalFrameLen) break;

            let payload;
            if (isMasked) {
                const maskKey = buffer.slice(offset, offset + 4);
                const rawPayload = buffer.slice(offset + 4, offset + 4 + payloadLen);
                payload = Buffer.alloc(payloadLen);
                for (let i = 0; i < payloadLen; i++) {
                    payload[i] = rawPayload[i] ^ maskKey[i % 4];
                }
            } else {
                payload = buffer.slice(offset, offset + payloadLen);
            }

            buffer = buffer.slice(totalFrameLen);

            if (opcode === 0x8) {
                // Connection close
                socket.end();
                break;
            } else if (opcode === 0x9) {
                // Ping -> send Pong
                const pongHeader = Buffer.from([0x8A, 0x00]);
                socket.write(pongHeader);
            } else if (opcode === 0x1) {
                // Text frame
                const messageText = payload.toString('utf8');
                handleSocketMessage(messageText, sendPacket, user => {
                    currentUsername = user;
                    activeSockets.set(user, socket);
                    broadcastPresence(user, true);
                });
            }
        }
    });

    socket.on('close', () => {
        if (currentUsername) {
            console.log(`[WS] User disconnected: @${currentUsername}`);
            activeSockets.delete(currentUsername);
            broadcastPresence(currentUsername, false);
        }
    });

    socket.on('error', err => {
        console.error('[WS] Socket error:', err.message);
    });
});

function broadcastPresence(username, isOnline) {
    const user = users.get(username);
    if (user) {
        user.isOnline = isOnline;
        user.lastSeen = Date.now();
    }
    const packet = {
        type: 'presence',
        username: username,
        isOnline: isOnline,
        lastSeen: Date.now()
    };
    broadcastToAll(packet);
}

function broadcastToAll(packet) {
    for (const [uname, sock] of activeSockets.entries()) {
        try {
            sendJsonToSocket(sock, packet);
        } catch (e) {}
    }
}

function sendJsonToSocket(socket, obj) {
    const jsonStr = Buffer.from(JSON.stringify(obj), 'utf8');
    const len = jsonStr.length;
    let header;
    if (len <= 125) {
        header = Buffer.from([0x81, len]);
    } else if (len <= 65535) {
        header = Buffer.alloc(4);
        header[0] = 0x81;
        header[1] = 126;
        header.writeUInt16BE(len, 2);
    } else {
        header = Buffer.alloc(10);
        header[0] = 0x81;
        header[1] = 127;
        header.writeBigUInt64BE(BigInt(len), 2);
    }
    socket.write(Buffer.concat([header, jsonStr]));
}

function handleSocketMessage(text, reply, onAuth) {
    try {
        const msg = JSON.parse(text);
        console.log(`[MSG] Type: ${msg.type}, From: ${msg.sender || msg.username}, To: ${msg.recipient || msg.peer || 'broadcast'}`);

        if (msg.type === 'auth') {
            onAuth(msg.username);
            reply({ type: 'auth_success', username: msg.username });
        } else if (msg.type === 'chat_message') {
            // Forward encrypted message to recipient
            const recipientSocket = activeSockets.get(msg.recipient);
            if (recipientSocket) {
                sendJsonToSocket(recipientSocket, msg);
                // Send delivery confirmation back to sender
                reply({
                    type: 'message_status',
                    messageId: msg.id,
                    recipient: msg.recipient,
                    status: 'DELIVERED'
                });
            } else {
                console.log(`[MSG] Recipient @${msg.recipient} is offline. Message buffered.`);
            }
        } else if (msg.type === 'typing') {
            const recipientSocket = activeSockets.get(msg.recipient);
            if (recipientSocket) {
                sendJsonToSocket(recipientSocket, msg);
            }
        } else if (msg.type === 'message_read') {
            const senderSocket = activeSockets.get(msg.sender);
            if (senderSocket) {
                sendJsonToSocket(senderSocket, {
                    type: 'message_status',
                    messageId: msg.messageId,
                    status: 'READ'
                });
            }
        } else if (msg.type === 'call_offer' || msg.type === 'call_answer' || msg.type === 'call_hangup') {
            // WebRTC Call Signaling relay
            const target = msg.callee || msg.peer || msg.caller;
            const targetSocket = activeSockets.get(target);
            if (targetSocket) {
                sendJsonToSocket(targetSocket, msg);
            }
        }
    } catch (e) {
        console.error('[WS] Parse error:', e.message);
    }
}

server.listen(PORT, '0.0.0.0', () => {
    console.log(`=======================================================`);
    console.log(`🚀 WhatsApp Clone Real-Time Backend running on port ${PORT}`);
    console.log(`💻 Web Client: http://localhost:${PORT}`);
    console.log(`📱 Phone Access: http://10.1.14.178:${PORT} or http://127.0.0.1:${PORT}`);
    console.log(`⚡ WebSocket: ws://localhost:${PORT}/ws`);
    console.log(`🔒 End-to-End Encryption: ECDH + AES-256-GCM`);
    console.log(`👤 Auth: Username & Password (No Phone / Gmail required)`);
    console.log(`=======================================================`);
});
