const socket = io();

// State Management
let localStream = null;
let peerConnections = {}; // viewerId -> RTCPeerConnection
let roomId = null;
let isHost = false;

const iceServers = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

// DOM Elements
const views = {
    setup: document.getElementById('setup-view'),
    host: document.getElementById('host-view'),
    viewer: document.getElementById('viewer-view')
};

const btns = {
    host: document.getElementById('btn-host'),
    viewer: document.getElementById('btn-viewer').querySelector('button'),
    stop: document.getElementById('stop-broadcast'),
    leave: document.getElementById('leave-stream'),
    copy: document.getElementById('copy-room')
};

// --- Initialization ---

btns.host.onclick = async () => {
    try {
        roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
        isHost = true;
        
        // Capture Screen with Optimized Constraints for Low Latency
        localStream = await navigator.mediaDevices.getDisplayMedia({
            video: {
                width: { ideal: 1280 },
                height: { ideal: 720 },
                frameRate: { ideal: 60, max: 60 },
                cursor: "always"
            },
            audio: false // Audio often adds jitter, disabled by default for screen share
        });

        // Setup UI
        document.getElementById('display-room-id').innerText = roomId;
        document.getElementById('local-preview').srcObject = localStream;
        switchView('host');
        
        socket.emit('create_room', { room: roomId });
        showToast("Broadcasting initialized");

        // Handle stream stop (user clicks "Stop sharing" in browser UI)
        localStream.getTracks()[0].onended = stopBroadcasting;

        // Monitor FPS
        startFpsMonitor(localStream.getVideoTracks()[0], 'fps-stat');

    } catch (err) {
        console.error("Screen capture failed:", err);
        showToast("Error: Permission denied or failed to capture.");
    }
};

btns.viewer.onclick = () => {
    const inputId = document.getElementById('room-input').value.trim().toUpperCase();
    if (!inputId) return showToast("Enter a Room ID");
    
    roomId = inputId;
    isHost = false;
    socket.emit('join_room', { room: roomId });
};

btns.stop.onclick = stopBroadcasting;
btns.leave.onclick = () => location.reload();

btns.copy.onclick = () => {
    navigator.clipboard.writeText(roomId);
    showToast("Room ID copied to clipboard!");
};

// --- Signaling Logic ---

socket.on('viewer_joined', async (data) => {
    const viewerId = data.viewer_id;
    console.log("New viewer joined:", viewerId);
    
    // Create new peer connection for this viewer
    const pc = createPeerConnection(viewerId);
    peerConnections[viewerId] = pc;
    
    // Add local tracks to this connection
    localStream.getTracks().forEach(track => {
        const sender = pc.addTrack(track, localStream);
        
        // Apply Bitrate and Quality Constraints
        if (track.kind === 'video') {
            applyConstraints(sender);
        }
    });
    
    // Create Offer
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    
    socket.emit('signal', {
        room: roomId,
        target: viewerId,
        payload: { type: 'offer', sdp: pc.localDescription }
    });
    
    updateViewerCount();
});

socket.on('signal', async (data) => {
    const { sender, payload } = data;
    
    if (payload.type === 'offer') {
        // Viewer receives offer from Host
        console.log("Received offer from host");
        const pc = createPeerConnection(sender);
        peerConnections[sender] = pc;
        
        await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        
        socket.emit('signal', {
            room: roomId,
            target: sender,
            payload: { type: 'answer', sdp: pc.localDescription }
        });
        
        switchView('viewer');
        document.getElementById('viewer-overlay').classList.add('hidden');
        
    } else if (payload.type === 'answer') {
        // Host receives answer from Viewer
        console.log("Received answer from viewer:", sender);
        const pc = peerConnections[sender];
        if (pc) {
            await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
        }
    } else if (payload.type === 'candidate') {
        // Handle ICE candidates
        const pc = peerConnections[sender];
        if (pc) {
            await pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
        }
    }
});

socket.on('viewer_left', (data) => {
    const { viewer_id } = data;
    if (peerConnections[viewer_id]) {
        peerConnections[viewer_id].close();
        delete peerConnections[viewer_id];
        updateViewerCount();
    }
});

socket.on('room_closed', () => {
    showToast("Host ended the stream");
    setTimeout(() => location.reload(), 2000);
});

socket.on('error', (data) => showToast(data.message));

// --- Peer Connection Helpers ---

async function applyConstraints(sender) {
    try {
        const parameters = sender.getParameters();
        if (!parameters.encodings) {
            parameters.encodings = [{}];
        }
        
        // Cap bitrate at 2.5 Mbps (2500000 bps)
        parameters.encodings[0].maxBitrate = 2500000;
        
        // Prioritize smoothness (frame rate) over resolution
        parameters.encodings[0].degradationPreference = 'maintain-framerate';
        
        await sender.setParameters(parameters);
        console.log("Performance constraints applied: 2.5Mbps limit, FPS priority.");
    } catch (err) {
        console.warn("Could not apply bitrate constraints:", err);
    }
}

function createPeerConnection(peerId) {
    const pc = new RTCPeerConnection(iceServers);
    
    pc.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('signal', {
                room: roomId,
                target: peerId,
                payload: { type: 'candidate', candidate: event.candidate }
            });
        }
    };
    
    pc.ontrack = (event) => {
        if (!isHost) {
            const video = document.getElementById('remote-video');
            if (video.srcObject !== event.streams[0]) {
                video.srcObject = event.streams[0];
                console.log("Received remote stream");
            }
        }
    };
    
    pc.onconnectionstatechange = () => {
        console.log(`Connection state with ${peerId}: ${pc.connectionState}`);
        if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
            handlePeerDisconnect(peerId);
        }
    };

    return pc;
}

// --- Utilities ---

function switchView(viewName) {
    Object.values(views).forEach(v => v.classList.add('hidden'));
    views[viewName].classList.remove('hidden');
    document.getElementById('app-status').innerHTML = `<span class="dot" style="background:${viewName === 'setup' ? '#10b981' : '#f59e0b'}"></span> ${viewName.toUpperCase()}`;
}

function stopBroadcasting() {
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
    }
    location.reload();
}

function handlePeerDisconnect(peerId) {
    if (peerConnections[peerId]) {
        peerConnections[peerId].close();
        delete peerConnections[peerId];
        updateViewerCount();
    }
}

function updateViewerCount() {
    const countEl = document.getElementById('viewer-count');
    if (countEl) countEl.innerText = Object.keys(peerConnections).length;
}

function showToast(msg) {
    const toast = document.getElementById('toast');
    toast.innerText = msg;
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 3000);
}

function startFpsMonitor(track, elementId) {
    const el = document.getElementById(elementId);
    const checkFps = () => {
        if (!track || track.readyState === 'ended') return;
        const settings = track.getSettings();
        if (settings.frameRate) {
            el.innerText = Math.round(settings.frameRate);
        }
        requestAnimationFrame(checkFps);
    };
    requestAnimationFrame(checkFps);
}

// Fullscreen toggle
document.getElementById('toggle-fullscreen')?.addEventListener('click', () => {
    const video = document.getElementById('remote-video');
    if (!document.fullscreenElement) {
        video.parentElement.requestFullscreen();
    } else {
        document.exitFullscreen();
    }
});
