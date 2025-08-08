// --- Element References ---
const video = document.getElementById("video");
const channelList = document.getElementById("channelList");
const searchInput = document.getElementById("search");
const categoryFilter = document.getElementById("categoryFilter");
const qualitySelector = document.getElementById("qualitySelector");
const listViewBtn = document.getElementById("listViewBtn");
const gridViewBtn = document.getElementById("gridViewBtn");
const sortSelector = document.getElementById("sortSelector");
const toastNotification = document.getElementById("toastNotification");
const loadingSpinner = document.getElementById("loadingSpinner");

// --- App State ---
const appState = {
    allChannels: [],
    currentFilteredChannels: [],
    pageToLoad: 1,
    isLoading: false,
    currentChannelIndex: -1,
    hls: null,
    pressTimer: null,
    isLongPress: false,
    CHANNELS_PER_LOAD: 20
};

const playlistUrls = [ "index.m3u" "videos.m3u" ];

// --- Lazy Loading Images ---
const lazyImageObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            const img = entry.target;
            if (img.dataset.src) img.src = img.dataset.src;
            img.classList.remove("lazy");
            observer.unobserve(img);
        }
    });
});

// --- Core Functions ---
async function loadAllPlaylists() {
    channelList.innerHTML = '⏳ Loading...';
    try {
        const responses = await Promise.all(playlistUrls.map(url => fetch(url).catch(e => console.error(`Failed to fetch ${url}`, e))));
        const textPromises = responses.map(res => (res && res.ok) ? res.text() : Promise.resolve(""));
        const allTexts = await Promise.all(textPromises);
        let combinedChannels = [];
        allTexts.forEach(text => {
            if (text) combinedChannels = combinedChannels.concat(parseM3U(text));
        });
        appState.allChannels = combinedChannels;
        populateCategories();
        setupInitialView();
    } catch (error) {
        channelList.innerHTML = `<div style="color: red; padding: 20px;">Error loading playlists.</div>`;
    }
}

function parseM3U(data) {
    const lines = data.split("\n");
    const channels = [];
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].startsWith("#EXTINF")) {
            const meta = lines[i];
            const url = lines[i + 1];
            if (!url || url.trim() === '') continue;
            const nameMatch = meta.match(/,(.*)$/);
            const logoMatch = meta.match(/tvg-logo="(.*?)"/);
            const groupMatch = meta.match(/group-title="(.*?)"/);
            channels.push({
                name: nameMatch ? nameMatch[1].trim() : "Unnamed",
                logo: logoMatch ? logoMatch[1] : "",
                group: groupMatch ? groupMatch[1] : "Others",
                url: url.trim()
            });
        }
    }
    return channels;
}

function setupInitialView() {
    let channelsToSort = [];
    const selectedGroup = categoryFilter.value;
    if (selectedGroup === "Favorites") {
        channelsToSort = getFavorites();
    } else {
        channelsToSort = [...appState.allChannels];
    }
    
    // --- সর্টিং লজিক পরিবর্তন করা হলো ---
    const sortOrder = sortSelector.value;
    if (sortOrder === 'newest') {
        channelsToSort.reverse(); // Newest (reverse of original)
    } else if (sortOrder === 'az') {
        channelsToSort.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortOrder === 'za') {
        channelsToSort.sort((a, b) => b.name.localeCompare(a.name));
    }
    // "default" অপশনের জন্য কোনো কিছু করার দরকার নেই, কারণ এটিই স্বাভাবিক ক্রম
    // ------------------------------------

    const search = searchInput.value.toLowerCase();
    appState.currentFilteredChannels = channelsToSort.filter(ch => ch.name.toLowerCase().includes(search));
    
    channelList.innerHTML = "";
    appState.pageToLoad = 1;
    loadMoreChannels();
}


function loadMoreChannels() {
    if (appState.isLoading) return;
    appState.isLoading = true;
    loadingSpinner.classList.remove('hidden');

    const startIndex = (appState.pageToLoad - 1) * appState.CHANNELS_PER_LOAD;
    const channelsToRender = appState.currentFilteredChannels.slice(startIndex, startIndex + appState.CHANNELS_PER_LOAD);
    
    if (channelsToRender.length === 0 && appState.pageToLoad === 1) {
        channelList.innerHTML = `<div style="padding: 20px;">Not found.</div>`;
    }

    channelsToRender.forEach(ch => {
        const div = document.createElement("div");
        div.className = "channel";
        const globalIndex = appState.allChannels.findIndex(c => c.name === ch.name && c.url === ch.url);
        div.dataset.index = globalIndex;

        const img = document.createElement("img");
        img.dataset.src = ch.logo || "https://via.placeholder.com/50";
        img.classList.add("lazy");
        img.onerror = () => { img.src = "https://via.placeholder.com/50"; };
        lazyImageObserver.observe(img);

        const nameSpan = document.createElement("span");
        nameSpan.className = "channel-name";
        nameSpan.textContent = ch.name;
        
        div.appendChild(img);
        div.appendChild(nameSpan);
        channelList.appendChild(div);
    });

    appState.pageToLoad++;
    appState.isLoading = false;
    loadingSpinner.classList.add('hidden');
}

function playStream(channel, index) {
    appState.currentChannelIndex = index;
    document.querySelectorAll('.channel').forEach(d => d.classList.remove('active'));
    const activeElement = document.querySelector(`.channel[data-index="${index}"]`);
    if (activeElement) activeElement.classList.add('active');
    if (appState.hls) appState.hls.destroy();
    const url = channel.url;
    if (url.endsWith('.m3u8')) {
        if (Hls.isSupported()) {
            appState.hls = new Hls();
            appState.hls.loadSource(url);
            appState.hls.attachMedia(video);
            appState.hls.on(Hls.Events.MANIFEST_PARSED, (event, data) => renderQualitySelector(data.levels));
        }
    } else {
        video.src = url;
        video.play();
        qualitySelector.innerHTML = "";
    }
}

// --- UI & Helper Functions ---
function renderQualitySelector(levels) {
    qualitySelector.innerHTML = "";
    if (!levels || levels.length === 0) return;
    const autoBtn = document.createElement("button");
    autoBtn.textContent = "Auto";
    autoBtn.onclick = () => { appState.hls.currentLevel = -1; };
    qualitySelector.appendChild(autoBtn);
    levels.forEach((level, i) => {
        const btn = document.createElement("button");
        btn.textContent = `${level.height}p`;
        btn.onclick = () => { appState.hls.currentLevel = i; };
        qualitySelector.appendChild(btn);
    });
}

function populateCategories() {
    const groups = new Set(appState.allChannels.map(ch => ch.group));
    categoryFilter.innerHTML = `<option value="">All Categories</option>`;
    const favOpt = document.createElement("option");
    favOpt.value = "Favorites";
    favOpt.textContent = "⭐ Favorites";
    categoryFilter.appendChild(favOpt);
    groups.forEach(group => {
        const opt = document.createElement("option");
        opt.value = group;
        opt.textContent = group;
        categoryFilter.appendChild(opt);
    });
}

function setView(view) {
    channelList.className = view === 'grid' ? 'grid-view' : 'list-view';
    gridViewBtn.classList.toggle('active', view === 'grid');
    listViewBtn.classList.toggle('active', view !== 'grid');
    localStorage.setItem('preferredView', view);
}

function showToast(message) {
    toastNotification.textContent = message;
    toastNotification.classList.add('show');
    setTimeout(() => toastNotification.classList.remove('show'), 2500);
}

// --- Favorite System ---
function getFavorites() { return JSON.parse(localStorage.getItem('myFavoriteChannels')) || []; }
function saveFavorites(favorites) { localStorage.setItem('myFavoriteChannels', JSON.stringify(favorites)); }
function toggleFavorite(channel) {
    let favorites = getFavorites();
    const index = favorites.findIndex(fav => fav.name === channel.name && fav.url === channel.url);
    if (index > -1) {
        favorites.splice(index, 1);
        showToast(`'${channel.name}' removed from Favorites`);
    } else {
        favorites.push(channel);
        showToast(`'${channel.name}' added to Favorites!`);
    }
    saveFavorites(favorites);
    if (categoryFilter.value === 'Favorites') setupInitialView();
}

// --- Autoplay Next ---
function playNextVideo() {
    if (appState.currentFilteredChannels.length < 2) return;
    const currentItem = appState.allChannels[appState.currentChannelIndex];
    if (!currentItem) return;
    const currentIndexInFiltered = appState.currentFilteredChannels.findIndex(c => c.url === currentItem.url);
    if (currentIndexInFiltered === -1) return;
    const nextIndexInFiltered = (currentIndexInFiltered + 1) % appState.currentFilteredChannels.length;
    const nextChannel = appState.currentFilteredChannels[nextIndexInFiltered];
    if (!nextChannel) return;
    const nextGlobalIndex = appState.allChannels.findIndex(c => c.url === nextChannel.url);
    if (!document.querySelector(`.channel[data-index="${nextGlobalIndex}"]`)) loadMoreChannels();
    playStream(nextChannel, nextGlobalIndex);
}

// --- Event Listeners ---
const startPress = (event) => {
    const channelDiv = event.target.closest('.channel');
    if (!channelDiv) return;
    appState.isLongPress = false;
    appState.pressTimer = setTimeout(() => {
        appState.isLongPress = true;
        const channel = appState.allChannels[channelDiv.dataset.index];
        if (channel) toggleFavorite(channel);
    }, 1500);
};
const cancelPress = () => clearTimeout(appState.pressTimer);
const handleClick = (event) => {
    const channelDiv = event.target.closest('.channel');
    if (channelDiv && !appState.isLongPress) {
        const channel = appState.allChannels[channelDiv.dataset.index];
        if (channel) playStream(channel, parseInt(channelDiv.dataset.index));
    }
};

channelList.addEventListener('mousedown', startPress);
channelList.addEventListener('mouseup', cancelPress);
channelList.addEventListener('mouseleave', cancelPress);
channelList.addEventListener('click', handleClick);
channelList.addEventListener('touchstart', startPress);
channelList.addEventListener('touchend', cancelPress);
channelList.addEventListener('touchmove', cancelPress);

channelList.addEventListener('scroll', () => {
    if (channelList.scrollTop + channelList.clientHeight >= channelList.scrollHeight - 200) {
        loadMoreChannels();
    }
});

video.addEventListener('ended', playNextVideo);
searchInput.addEventListener("input", setupInitialView);
categoryFilter.addEventListener("change", setupInitialView);
sortSelector.addEventListener("change", setupInitialView);
listViewBtn.addEventListener('click', () => setView('list'));
gridViewBtn.addEventListener('click', () => setView('grid'));

document.addEventListener('DOMContentLoaded', () => {
    const preferredView = localStorage.getItem('preferredView') || 'list';
    setView(preferredView);
    loadAllPlaylists();
});
