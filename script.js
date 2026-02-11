// --- Elements ---
const audioInput = document.getElementById('audioInput');
const btnImport = document.getElementById('btnImport');
const btnPlayPause = document.getElementById('btnPlayPause');
const btnStop = document.getElementById('btnStop');
const btnAddMarker = document.getElementById('btnAddMarker');
const btnAutoMarker = document.getElementById('btnAutoMarker');
const btnClearMarkers = document.getElementById('btnClearMarkers');
const thresholdInput = document.getElementById('thresholdInput');

const canvas = document.getElementById('waveformCanvas');
const ctx = canvas.getContext('2d');
const playhead = document.getElementById('playhead');
const markersLayer = document.getElementById('markers-layer');
const timelineContainer = document.getElementById('timeline-container');

const txtTimestamps = document.getElementById('txtTimestamps');
const txtMarkerNames = document.getElementById('txtMarkerNames');

// Modal Elements
const modal = document.getElementById('markerModal');
const markerNameInput = document.getElementById('markerNameInput');
const btnOkModal = document.getElementById('btnOkModal');
const btnCancelModal = document.getElementById('btnCancelModal');

// --- State ---
let audioContext = null;
let audioBuffer = null;
let audioSource = null;
let startTime = 0;
let pauseTime = 0;
let isPlaying = false;
let markers = []; 
let animationId;
let isDragging = false;
let draggedMarker = null;
let editingMarker = null; // Track which marker is being renamed

// --- Event Listeners ---

btnImport.addEventListener('click', () => audioInput.click());

audioInput.addEventListener('change', async (e) => {
    if (e.target.files.length === 0) return;
    if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const file = e.target.files[0];
    const arrayBuffer = await file.arrayBuffer();
    audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    stopAudio();
    drawWaveform();
    enableControls();
});

btnPlayPause.addEventListener('click', togglePlay);
btnStop.addEventListener('click', stopAudio);
btnAddMarker.addEventListener('click', () => {
    editingMarker = null; 
    openModal();
});
btnAutoMarker.addEventListener('click', runAutoPlaceMarkers);
btnClearMarkers.addEventListener('click', () => {
    if(confirm("Clear all markers?")) {
        markers = [];
        updateMarkerUI();
    }
});

// --- Draggable & Rename Logic ---

timelineContainer.addEventListener('mousedown', (e) => {
    const rect = timelineContainer.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const clickTime = (x / rect.width) * audioBuffer.duration;

    // Check if we clicked near a marker (5px tolerance)
    const hitTolerance = (5 / rect.width) * audioBuffer.duration;
    draggedMarker = markers.find(m => Math.abs(m.time - clickTime) < hitTolerance);

    if (draggedMarker) {
        isDragging = true;
    } else {
        // Just seek if not dragging
        pauseTime = clickTime;
        if(isPlaying) { stopAudio(); playAudio(); } 
        else { updatePlayheadPosition(); }
    }
});

window.addEventListener('mousemove', (e) => {
    if (!isDragging || !draggedMarker) return;
    const rect = timelineContainer.getBoundingClientRect();
    let x = e.clientX - rect.left;
    x = Math.max(0, Math.min(x, rect.width)); // Clamp to timeline
    
    draggedMarker.time = (x / rect.width) * audioBuffer.duration;
    updateMarkerUI();
});

window.addEventListener('mouseup', () => {
    if(isDragging) {
        markers.sort((a, b) => a.time - b.time);
        updateMarkerUI();
    }
    isDragging = false;
    draggedMarker = null;
});

// Double click to rename
timelineContainer.addEventListener('dblclick', (e) => {
    const rect = timelineContainer.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const clickTime = (x / rect.width) * audioBuffer.duration;
    const hitTolerance = (8 / rect.width) * audioBuffer.duration;
    
    const markerToEdit = markers.find(m => Math.abs(m.time - clickTime) < hitTolerance);
    if (markerToEdit) {
        editingMarker = markerToEdit;
        openModal(markerToEdit.name);
    }
});

// --- Modal Logic ---

function openModal(existingName = "") {
    markerNameInput.value = existingName || `Marker ${markers.length + 1}`;
    modal.style.display = 'block';
    markerNameInput.focus();
}

btnOkModal.addEventListener('click', () => {
    const name = markerNameInput.value || "Untitled";
    if (editingMarker) {
        editingMarker.name = name;
    } else {
        addMarker(getCurrentTime(), name);
    }
    closeModal();
    updateMarkerUI();
});

function closeModal() { modal.style.display = 'none'; editingMarker = null; }
btnCancelModal.addEventListener('click', closeModal);

// --- Core Logic ---

function addMarker(time, name) {
    markers.push({ time, name });
    markers.sort((a, b) => a.time - b.time);
    updateMarkerUI();
}

function updateMarkerUI() {
    // Update Textareas
    txtTimestamps.value = markers.map(m => m.time.toFixed(3)).join('\n');
    txtMarkerNames.value = markers.map(m => m.name).join('\n');
    
    // Update Visuals
    markersLayer.innerHTML = '';
    if (!audioBuffer) return;
    const width = timelineContainer.offsetWidth;
    
    markers.forEach(m => {
        const left = (m.time / audioBuffer.duration) * width;
        const line = document.createElement('div');
        line.className = 'marker-line';
        line.style.left = `${left}px`;
        const label = document.createElement('div');
        label.className = 'marker-label';
        label.innerText = m.name;
        label.style.left = `${left}px`;
        markersLayer.appendChild(line);
        markersLayer.appendChild(label);
    });
}

function runAutoPlaceMarkers() {
    if (!audioBuffer) return;
    const data = audioBuffer.getChannelData(0);
    const threshold = parseFloat(thresholdInput.value);
    const minDistance = 0.3; 
    let lastMarkerTime = -minDistance; 

    for (let i = 0; i < data.length; i += 200) {
        const currentTime = i / audioBuffer.sampleRate;
        if (Math.abs(data[i]) > threshold && (currentTime - lastMarkerTime > minDistance)) {
            markers.push({ time: currentTime, name: `Auto-${markers.length + 1}` });
            lastMarkerTime = currentTime;
        }
    }
    markers.sort((a, b) => a.time - b.time);
    updateMarkerUI();
}

// (Remaining audio/waveform functions from previous code stay the same...)
function togglePlay() { if (isPlaying) pauseAudio(); else playAudio(); }
function playAudio() {
    if (isPlaying) return;
    audioSource = audioContext.createBufferSource();
    audioSource.buffer = audioBuffer;
    audioSource.connect(audioContext.destination);
    startTime = audioContext.currentTime - pauseTime;
    audioSource.start(0, pauseTime);
    isPlaying = true;
    btnPlayPause.textContent = "Pause";
    animate();
}
function pauseAudio() {
    if (!isPlaying) return;
    audioSource.stop();
    pauseTime = audioContext.currentTime - startTime;
    isPlaying = false;
    btnPlayPause.textContent = "Play";
    cancelAnimationFrame(animationId);
}
function stopAudio() {
    if (isPlaying) audioSource.stop();
    isPlaying = false;
    pauseTime = 0;
    btnPlayPause.textContent = "Play";
    updatePlayheadPosition();
}
function getCurrentTime() {
    if (!isPlaying) return pauseTime;
    let curr = audioContext.currentTime - startTime;
    if (curr > audioBuffer.duration) { stopAudio(); return audioBuffer.duration; }
    return curr;
}
function updatePlayheadPosition() {
    if (!audioBuffer) return;
    const pos = (getCurrentTime() / audioBuffer.duration) * timelineContainer.offsetWidth;
    playhead.style.transform = `translateX(${pos}px)`;
}
function animate() { updatePlayheadPosition(); if (isPlaying) animationId = requestAnimationFrame(animate); }
function drawWaveform() {
    const width = canvas.width = timelineContainer.offsetWidth;
    const height = canvas.height = timelineContainer.offsetHeight;
    const data = audioBuffer.getChannelData(0);
    const step = Math.ceil(data.length / width);
    ctx.fillStyle = '#555';
    for (let i = 0; i < width; i++) {
        let min = 1, max = -1;
        for (let j = 0; j < step; j++) {
            const datum = data[(i * step) + j];
            if (datum < min) min = datum; if (datum > max) max = datum;
        }
        ctx.fillRect(i, (1 + min) * (height/2), 1, Math.max(1, (max - min) * (height/2)));
    }
}
function enableControls() {
    [btnPlayPause, btnStop, btnAddMarker, btnAutoMarker, btnClearMarkers].forEach(b => b.disabled = false);
}