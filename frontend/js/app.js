document.addEventListener('DOMContentLoaded', () => {
    // UI Elements
    const deviceGrid = document.getElementById('device-grid');
    const fileInput = document.getElementById('file-input');
    const folderInput = document.getElementById('folder-input');
    const qrBtn = document.getElementById('qr-btn');
    const qrModal = document.getElementById('qr-modal');
    const qrClose = document.querySelector('.close');
    const copyLinkBtn = document.getElementById('copy-link');
    const transferOverlay = document.getElementById('transfer-overlay');
    const progressBar = document.getElementById('progress-bar');
    const progressText = document.getElementById('transfer-progress');
    const speedText = document.getElementById('transfer-speed');
    const transferStatus = document.getElementById('transfer-status');
    const transferFilename = document.getElementById('transfer-filename');
    const transferIconEl = document.getElementById('transfer-icon-el');
    const cryptoStatusEl = document.getElementById('crypto-status');
    const cancelTransferBtn = document.getElementById('cancel-transfer');

    // Cinematic HUD Management
    const hudTooltip = document.getElementById('hud-tooltip');
    const hudAvatar = document.getElementById('hud-avatar');
    const hudName = document.getElementById('hud-name');

    let mouseX = 0, mouseY = 0;
    let hudX = 0, hudY = 0;
    const lerpAmount = 0.12; // Lower = more "magnetic" lag feel

    document.addEventListener('mousemove', (e) => {
        mouseX = e.clientX;
        mouseY = e.clientY;
    });

    function animateHUD() {
        // Smooth interpolation
        hudX += (mouseX - hudX) * lerpAmount;
        hudY += (mouseY - hudY) * lerpAmount;

        const offsetX = 30;
        const offsetY = 30;

        // Boundary checks to keep HUD on screen
        const rect = hudTooltip.getBoundingClientRect();
        let targetX = hudX + offsetX;
        let targetY = hudY + offsetY;

        if (targetX + rect.width > window.innerWidth) targetX = hudX - rect.width - offsetX;
        if (targetY + rect.height > window.innerHeight) targetY = hudY - rect.height - offsetY;
        
        // GPU accelerated movement
        hudTooltip.style.transform = `translate3d(${targetX}px, ${targetY}px, 0)`;
        requestAnimationFrame(animateHUD);
    }
    animateHUD();

    // Inbox
    const inboxBtn = document.getElementById('inbox-btn');
    const inboxBadge = document.getElementById('inbox-badge');
    const inboxModal = document.getElementById('inbox-modal');
    const inboxList = document.getElementById('inbox-list');
    const closeInbox = document.querySelector('.close-inbox');
    const clearInboxBtn = document.getElementById('clear-inbox');
    const batchUploadBtn = document.getElementById('batch-upload-btn');

    // Offer Modal
    const offerModal = document.getElementById('offer-modal');
    const offerSender = document.getElementById('offer-sender');
    const offerFilename = document.getElementById('offer-filename');
    const offerAcceptBtn = document.getElementById('offer-accept');
    const offerDeclineBtn = document.getElementById('offer-decline');

    let selectedTargetId = null;
    let pendingFiles = {};
    let inboxFiles = JSON.parse(localStorage.getItem('skyshare_inbox') || '[]');
    let encryptionKeys = {};
    let offerQueue = [];
    let offerActive = false;

    updateInboxUI();

    socketManager.connect();

    socketManager.onDeviceListUpdate = (devices, myInfo) => {
        updateDeviceGrid(devices);
        if (myInfo) {
            document.getElementById('my-info-display').innerHTML = `You are <strong>${myInfo.name}</strong>.`;
            document.title = `KageDrop | ${myInfo.name}`;
        }
    };

    // Offer flow
    socketManager.onFileOffer = (data) => {
        offerQueue.push(data);
        if (!offerActive) processNextOffer();
    };

    function processNextOffer() {
        if (offerQueue.length === 0) { offerActive = false; return; }
        offerActive = true;
        const data = offerQueue.shift();
        const { from, file_info, transfer_id, encryption_key } = data;

        offerSender.textContent = `${from.name} wants to send you a file`;
        offerFilename.textContent = `"${file_info.name}" (${transferManager.formatSize(file_info.size)})`;
        offerModal.style.display = 'flex';

        const originalTitle = document.title;
        const flash = setInterval(() => {
            document.title = document.title === '📁 Incoming File!' ? originalTitle : '📁 Incoming File!';
        }, 800);

        offerAcceptBtn.onclick = () => {
            clearInterval(flash);
            document.title = originalTitle;
            offerModal.style.display = 'none';
            if (encryption_key) encryptionKeys[transfer_id] = encryption_key;
            showToast(`Accepting from ${from.name}...`);
            socketManager.acceptTransfer(from.id, transfer_id);
            showTransferOverlay('Receiving File...', file_info.name, 'receive');
            processNextOffer();
        };

        offerDeclineBtn.onclick = () => {
            clearInterval(flash);
            document.title = originalTitle;
            offerModal.style.display = 'none';
            showToast(`Declined from ${from.name}`);
            processNextOffer();
        };
    }

    socketManager.onTransferAccepted = async (data) => {
        const { transfer_id } = data;
        const transfer = pendingFiles[transfer_id];
        if (!transfer) return;

        const { file, targetId } = transfer;
        const key = encryptionKeys[transfer_id];

        showTransferOverlay('Sending File...', file.name, 'send');

        try {
            await transferManager.uploadFile(file, targetId, transfer_id, key,
                (progress, speed) => updateProgress(progress, speed),
                (phase) => setCryptoStatus(phase)
            );
            hideTransferOverlay();
            showToast(`Sent: ${file.name}`, 'success');
        } catch (err) {
            hideTransferOverlay();
            showToast(`Failed: ${file.name}`, 'error');
        }

        delete pendingFiles[transfer_id];
        delete encryptionKeys[transfer_id];
    };

    socketManager.onFileReady = async (data) => {
        const { file_url, filename, transfer_id } = data;
        updateProgress(100, 0);
        const key = encryptionKeys[transfer_id];

        setCryptoStatus('decrypting');

        const newFile = { id: transfer_id, name: filename, url: file_url, key, time: new Date().toLocaleTimeString() };
        inboxFiles.unshift(newFile);
        localStorage.setItem('skyshare_inbox', JSON.stringify(inboxFiles));
        updateInboxUI();

        showToast(
            `Received: ${filename} <button onclick="window.downloadFromInbox('${transfer_id}')" style="margin-left:10px;padding:2px 8px;font-size:12px;background:white;color:black;border:none;border-radius:4px;cursor:pointer;">Download</button>`,
            'success', true
        );

        try {
            await transferManager.downloadFile(file_url, filename, key,
                (phase) => setCryptoStatus(phase)
            );
        } catch (err) {
            console.error('Auto-download failed:', err);
        }

        setTimeout(() => hideTransferOverlay(), 800);
    };

    // ✅ Crypto status helper
    function setCryptoStatus(phase) {
        cryptoStatusEl.className = 'crypto-status-line ' + phase;
        const messages = {
            encrypting: '🔐 Encrypting with AES-256-GCM...',
            uploading:  '📤 Uploading encrypted data...',
            decrypting: '🔓 Decrypting received data...',
            done:       '✅ Transfer complete'
        };
        cryptoStatusEl.textContent = messages[phase] || '';
    }

    function showTransferOverlay(status, filename, mode) {
        transferStatus.textContent = status;
        transferFilename.textContent = filename;
        progressBar.style.width = '0%';
        progressText.textContent = '0%';
        speedText.textContent = '0 KB/s';
        cryptoStatusEl.textContent = '';
        cryptoStatusEl.className = 'crypto-status-line';

        // icon changes based on send vs receive
        if (mode === 'send') {
            transferIconEl.className = 'fas fa-lock animate-pulse-icon';
            transferIconEl.style.color = 'var(--accent-primary)';
        } else {
            transferIconEl.className = 'fas fa-lock-open animate-pulse-icon';
            transferIconEl.style.color = '#a78bfa';
        }

        transferOverlay.style.display = 'flex';
    }

    function updateProgress(percent, speed) {
        progressBar.style.width = `${percent}%`;
        progressText.textContent = `${Math.round(percent)}%`;
        if (speed > 0) speedText.textContent = transferManager.formatSpeed(speed);
    }

    function hideTransferOverlay() {
        transferOverlay.style.display = 'none';
    }

    // ✅ Folder handling — zip all files into one .zip before sending
    async function handleFolder(files) {
        if (files.length === 0) return;
        if (!selectedTargetId) {
            showToast('Please select a device first', 'error');
            return;
        }

        showToast(`Zipping ${files.length} file(s) in folder...`);

        try {
            const { blob, folderName } = await transferManager.zipFolder(files);
            const zipFile = new File([blob], folderName, { type: 'application/zip' });
            await sendSingleFile(zipFile);
        } catch (err) {
            showToast('Failed to zip folder: ' + err.message, 'error');
        }
    }

    async function handleFiles(files) {
        if (!selectedTargetId) {
            showToast('Please select a device first', 'error');
            return;
        }
        showToast(`Sending ${files.length} file(s)...`);
        for (let i = 0; i < files.length; i++) {
            await sendSingleFile(files[i], i);
        }
    }

    async function sendSingleFile(file, index = 0) {
        const transferId = Math.random().toString(36).substring(2, 9) + index;
        const key = await transferManager.generateKey();
        pendingFiles[transferId] = { file, targetId: selectedTargetId };
        encryptionKeys[transferId] = key;
        socketManager.offerFile(selectedTargetId, {
            name: file.name,
            size: file.size,
            type: file.type
        }, transferId, key);
    }

    // UI helpers
    window.downloadFromInbox = (id) => {
        const file = inboxFiles.find(f => f.id === id);
        if (file) transferManager.downloadFile(file.url, file.name, file.key, () => {});
    };

    function updateInboxUI() {
        if (inboxFiles.length > 0) {
            inboxBadge.textContent = inboxFiles.length;
            inboxBadge.style.display = 'block';
            inboxList.innerHTML = '';
            inboxFiles.forEach(file => {
                const item = document.createElement('div');
                item.className = 'inbox-item';
                item.innerHTML = `
                    <div class="inbox-item-info">
                        <span class="inbox-item-name">${file.name}</span>
                        <span class="inbox-item-meta">${file.time}${file.key ? ' • Encrypted' : ''}</span>
                    </div>
                    <button class="inbox-item-action" onclick="window.downloadFromInbox('${file.id}')">
                        <i class="fas fa-download"></i>
                    </button>`;
                inboxList.appendChild(item);
            });
        } else {
            inboxBadge.style.display = 'none';
            inboxList.innerHTML = '<p class="empty-inbox">No files received yet</p>';
        }
    }

    function updateDeviceGrid(devices) {
        if (devices.length === 0) {
            deviceGrid.innerHTML = `
                <div class="searching-loader">
                    <div class="ripple"></div>
                    <p>Looking for devices...</p>
                </div>`;
            selectedTargetId = null; 
            hudTooltip.classList.remove('active');
            return;
        }
        deviceGrid.innerHTML = '';
        devices.forEach(device => {
            const card = document.createElement('div');
            card.className = `device-card ${selectedTargetId === device.id ? 'selected' : ''}`;
            card.innerHTML = `
                <div class="device-id-badge">#${device.id.substring(0, 4)}</div>
                <img src="${device.icon}" alt="${device.name}" class="device-avatar">
                <h3>${device.name}</h3>`;

            // HUD Trigger on Hover
            card.onmouseenter = () => {
                hudAvatar.src = device.icon;
                hudName.textContent = device.name;
                hudTooltip.classList.add('active');
            };

            card.onmouseleave = () => {
                if (selectedTargetId !== device.id) {
                    hudTooltip.classList.remove('active');
                }
            };

            card.onclick = () => {
                if (selectedTargetId === device.id) {
                    // DESELECT logic
                    selectedTargetId = null;
                    card.classList.remove('selected');
                    hudTooltip.classList.remove('active');
                    showToast('Target Released');
                } else {
                    // SELECT logic
                    document.querySelectorAll('.device-card').forEach(c => c.classList.remove('selected'));
                    card.classList.add('selected');
                    
                    selectedTargetId = device.id;
                    showToast(`Target Locked: <strong>${device.name}</strong>`);
                    
                    // Lock HUD to selection
                    hudAvatar.src = device.icon;
                    hudName.textContent = device.name;
                    hudTooltip.classList.add('active');
                    
                    // Optional: Automatically open file picker for convenience
                    fileInput.click();
                }
            };
            
            card.ondragover = (e) => { e.preventDefault(); card.classList.add('drag-over'); };
            card.ondragleave = () => card.classList.remove('drag-over');
            card.ondrop = (e) => {
                e.preventDefault();
                card.classList.remove('drag-over');
                if (e.dataTransfer.files.length > 0) {
                    selectedTargetId = device.id;
                    handleFiles(e.dataTransfer.files);
                }
            };
            deviceGrid.appendChild(card);
        });
    }

    function showToast(text, type = 'info', persist = false) {
        Toastify({
            text, duration: persist ? 10000 : 3000,
            gravity: "bottom", position: "center", escapeMarkup: false,
            style: {
                background: type === 'success' ? "#10b981" : (type === 'error' ? "#ef4444" : "#3b82f6"),
                borderRadius: "10px", backdropFilter: "blur(10px)"
            }
        }).showToast();
    }

    // Event Listeners
    inboxBtn.onclick = () => inboxModal.style.display = 'flex';
    closeInbox.onclick = () => inboxModal.style.display = 'none';
    clearInboxBtn.onclick = () => {
        inboxFiles = [];
        localStorage.removeItem('skyshare_inbox');
        updateInboxUI();
    };

    fileInput.onchange = (e) => { if (e.target.files.length > 0) handleFiles(e.target.files); };

    folderInput.onchange = (e) => {
        if (e.target.files.length > 0) {
            // ✅ Check if it actually has a folder structure
            const hasFolder = e.target.files[0].webkitRelativePath && e.target.files[0].webkitRelativePath.includes('/');
            if (hasFolder) {
                handleFolder(e.target.files);
            } else {
                handleFiles(e.target.files);
            }
        }
    };

    qrBtn.onclick = () => {
        const qrContainer = document.getElementById('qrcode');
        qrContainer.innerHTML = '';
        new QRCode(qrContainer, { text: window.location.href, width: 200, height: 200, colorDark: "#000000", colorLight: "#ffffff" });
        qrModal.style.display = 'flex';
    };

    qrClose.onclick = () => qrModal.style.display = 'none';
    window.onclick = (e) => {
        if (e.target == qrModal) qrModal.style.display = 'none';
        if (e.target == inboxModal) inboxModal.style.display = 'none';
    };

    copyLinkBtn.onclick = () => {
        navigator.clipboard.writeText(window.location.href);
        showToast('Link copied!', 'success');
    };

    batchUploadBtn.onclick = () => {
        if (!selectedTargetId) {
            showToast('Please select a device first', 'error');
            return;
        }
        folderInput.click();
    };

    cancelTransferBtn.onclick = () => {
        transferManager.cancelTransfer();
        hideTransferOverlay();
        showToast('Transfer cancelled');
    };

    window.addEventListener("dragover", (e) => e.preventDefault(), false);
    window.addEventListener("drop", (e) => e.preventDefault(), false);
});
