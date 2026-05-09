class TransferManager {
    constructor() {
        this.currentTransfer = null;
    }

    async generateKey() {
        const key = await window.crypto.subtle.generateKey(
            { name: "AES-GCM", length: 256 },
            true,
            ["encrypt", "decrypt"]
        );
        const exported = await window.crypto.subtle.exportKey("raw", key);
        return btoa(String.fromCharCode(...new Uint8Array(exported)));
    }

    async importKey(keyB64) {
        const raw = Uint8Array.from(atob(keyB64), c => c.charCodeAt(0));
        return await window.crypto.subtle.importKey(
            "raw", raw, "AES-GCM", true, ["encrypt", "decrypt"]
        );
    }

    async encryptFile(file, keyB64) {
        const key = await this.importKey(keyB64);
        const iv = window.crypto.getRandomValues(new Uint8Array(12));
        const data = await file.arrayBuffer();
        const encrypted = await window.crypto.subtle.encrypt(
            { name: "AES-GCM", iv }, key, data
        );
        const combined = new Uint8Array(iv.length + encrypted.byteLength);
        combined.set(iv);
        combined.set(new Uint8Array(encrypted), iv.length);
        return new Blob([combined]);
    }

    async decryptFile(blob, keyB64) {
        const key = await this.importKey(keyB64);
        const data = await blob.arrayBuffer();
        const iv = data.slice(0, 12);
        const encrypted = data.slice(12);
        const decrypted = await window.crypto.subtle.decrypt(
            { name: "AES-GCM", iv: new Uint8Array(iv) }, key, encrypted
        );
        return new Blob([decrypted]);
    }

    // ✅ Zip a folder (FileList from webkitdirectory) into a single Blob
    async zipFolder(files) {
        const zip = new JSZip();
        // files[0].webkitRelativePath = "FolderName/sub/file.txt"
        // Use the top-level folder name as the zip name
        const folderName = files[0].webkitRelativePath.split('/')[0];
        for (const file of files) {
            const relativePath = file.webkitRelativePath;
            const content = await file.arrayBuffer();
            zip.file(relativePath, content);
        }
        const blob = await zip.generateAsync({
            type: 'blob',
            compression: 'DEFLATE',
            compressionOptions: { level: 6 }
        });
        return { blob, folderName: folderName + '.zip' };
    }

    async uploadFile(file, targetId, transferId, keyB64, onProgress, onCryptoStatus) {
        let uploadBlob = file;

        if (keyB64) {
            if (onCryptoStatus) onCryptoStatus('encrypting');
            uploadBlob = await this.encryptFile(file, keyB64);
        }

        if (onCryptoStatus) onCryptoStatus('uploading');

        const formData = new FormData();
        formData.append('file', uploadBlob, file.name);
        formData.append('target_id', targetId);
        formData.append('transfer_id', transferId);

        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            this.currentTransfer = xhr;
            const startTime = Date.now(); // ✅ fixed position

            xhr.open('POST', '/upload', true);

            xhr.upload.onprogress = (e) => {
                if (e.lengthComputable) {
                    const percentComplete = (e.loaded / e.total) * 100;
                    const speed = e.loaded / ((Date.now() - startTime) / 1000);
                    onProgress(percentComplete, speed);
                }
            };

            xhr.onload = () => {
                if (xhr.status === 200) {
                    resolve(JSON.parse(xhr.responseText));
                } else {
                    reject(new Error('Upload failed'));
                }
                this.currentTransfer = null;
            };

            xhr.onerror = () => {
                reject(new Error('Network error'));
                this.currentTransfer = null;
            };

            xhr.send(formData);
        });
    }

    async downloadFile(url, filename, keyB64, onCryptoStatus) {
        const response = await fetch(url);
        let blob = await response.blob();

        if (keyB64) {
            if (onCryptoStatus) onCryptoStatus('decrypting');
            blob = await this.decryptFile(blob, keyB64);
        }

        if (onCryptoStatus) onCryptoStatus('done');

        const downloadUrl = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(downloadUrl);
        document.body.removeChild(a);
    }

    cancelTransfer() {
        if (this.currentTransfer) {
            this.currentTransfer.abort();
            this.currentTransfer = null;
        }
    }

    formatSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    formatSpeed(bytesPerSecond) {
        if (bytesPerSecond < 1024) return bytesPerSecond.toFixed(0) + ' B/s';
        if (bytesPerSecond < 1024 * 1024) return (bytesPerSecond / 1024).toFixed(1) + ' KB/s';
        return (bytesPerSecond / (1024 * 1024)).toFixed(1) + ' MB/s';
    }
}

const transferManager = new TransferManager();
