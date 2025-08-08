const video = document.getElementById("video");
const channelList = document.getElementById("channelList");
const searchInput = document.getElementById("search");
const categoryFilter = document.getElementById("categoryFilter");
const qualitySelector = document.getElementById("qualitySelector");
const listViewBtn = document.getElementById("listViewBtn");
const gridViewBtn = document.getElementById("gridViewBtn");
const sortSelector = document.getElementById("sortSelector"); // নতুন সর্ট মেনু

let allChannels = [];
let hls;

const CHANNELS_PER_LOAD = 20;
let currentFilteredChannels = [];
let pageToLoad = 1;
let isLoading = false;
let currentChannelIndex = -1;

function setView(view) {
    channelList.className = view === 'grid' ? 'grid-view' : 'list-view';
    gridViewBtn.classList.toggle('active', view === 'grid');
    listViewBtn.classList.toggle('active', view !== 'grid');
    localStorage.setItem('preferredView', view);
}

listViewBtn.addEventListener('click', () => setView('list'));
gridViewBtn.addEventListener('click', () => setView('grid'));

document.addEventListener('DOMContentLoaded', () => {
    const preferredView = localStorage.getItem('preferredView') || 'list';
    setView(preferredView);
    loadPlaylist();
});

async function loadPlaylist() {
  try {
    const res = await fetch("index.m3u");
    if (!res.ok) throw new Error(`Failed to load playlist`);
    const text = await res.text();
    allChannels = parseM3U(text);
    populateCategories();
    setupInitialView();
  } catch (error) {
    channelList.innerHTML = `<div style="padding: 20px;">Error loading playlist.</div>`;
  }
}

function parseM3U(data) {
  const lines = data.split("\n");
  const channels = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith("#EXTINF")) {
      const meta = lines[i];
      const url = lines[i + 1];
      const nameMatch = meta.match(/,(.*)$/);
      const logoMatch = meta.match(/tvg-logo="(.*?)"/);
      const groupMatch = meta.match(/group-title="(.*?)"/);
      const name = nameMatch ? nameMatch[1].trim() : "Unnamed";
      const logo = logoMatch ? logoMatch[1] : "";
      const group = groupMatch ? groupMatch[1] : "Others";
      if (url && name) channels.push({ name, logo, url, group });
    }
  }
  return channels;
}

function populateCategories() {
  const groups = new Set(allChannels.map(ch => ch.group));
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

// --- setupInitialView ফাংশনে সর্টিং লজিক যোগ করা হয়েছে ---
function setupInitialView() {
    let channelsToSort = [];
    const selectedGroup = categoryFilter.value;

    // ক্যাটাগরি অনুযায়ী ফিল্টার
    if (selectedGroup === "Favorites") {
        channelsToSort = getFavorites();
    } else {
        channelsToSort = allChannels.filter(ch => selectedGroup === "" || ch.group === selectedGroup);
    }
    
    // সর্টিং প্রয়োগ
    const sortOrder = sortSelector.value;
    if (sortOrder === 'az') {
        channelsToSort.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortOrder === 'za') {
        channelsToSort.sort((a, b) => b.name.localeCompare(a.name));
    }

    // সার্চ টেক্সট প্রয়োগ
    const search = searchInput.value.toLowerCase();
    currentFilteredChannels = channelsToSort.filter(ch => ch.name.toLowerCase().includes(search));
    
    // ভিউ রিসেট এবং লোড
    channelList.innerHTML = "";
    pageToLoad = 1;
    loadMoreChannels();
}


function loadMoreChannels() {
    if (isLoading) return;
    isLoading = true;
    const startIndex = (pageToLoad - 1) * CHANNELS_PER_LOAD;
    const channelsToRender = currentFilteredChannels.slice(startIndex, startIndex + CHANNELS_PER_LOAD);
    if (channelsToRender.length === 0 && pageToLoad === 1) {
        channelList.innerHTML = `<div style="padding: 20px;">Not found.</div>`;
    }
    channelsToRender.forEach((ch, localIndex) => {
        const globalIndex = allChannels.findIndex(c => c.name === ch.name && c.url === ch.url); // Use a more reliable index
        const div = document.createElement("div");
        div.className = "channel";
        div.dataset.index = globalIndex;
        div.onclick = () => playStream(ch, globalIndex);

        const img = document.createElement("img");
        img.src = ch.logo || "https://via.placeholder.com/50";
        img.onerror = () => { img.src = "https://via.placeholder.com/50"; };

        const nameSpan = document.createElement("span");
        nameSpan.className = "channel-name";
        nameSpan.textContent = ch.name;
        
        const favoriteBtn = document.createElement("span");
        favoriteBtn.className = "favorite-btn";
        favoriteBtn.innerHTML = "&#9733;";
        if (getFavorites().some(fav => fav.name === ch.name && fav.url === ch.url)) {
            favoriteBtn.classList.add('favorited');
        }
        favoriteBtn.onclick = (event) => toggleFavorite(event, ch, favoriteBtn);
        
        div.appendChild(img);
        div.appendChild(nameSpan);
        div.appendChild(favoriteBtn);
        channelList.appendChild(div);
    });
    pageToLoad++;
    isLoading = false;
}

channelList.addEventListener('scroll', () => {
    if (channelList.scrollTop + channelList.clientHeight >= channelList.scrollHeight - 100) {
        loadMoreChannels();
    }
});


function playStream(channel, index) {
  currentChannelIndex = index;
  document.querySelectorAll('.channel').forEach(d => d.classList.remove('active'));
  const activeElement = document.querySelector(`.channel[data-index="${index}"]`);
  if (activeElement) activeElement.classList.add('active');
  if (hls) hls.destroy();
  const url = channel.url;
  if (url.endsWith('.m3u8')) {
    if (Hls.isSupported()) {
      hls = new Hls();
      hls.loadSource(url);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, function (event, data) {
        video.play();
        qualitySelector.innerHTML = "";
        const autoBtn = document.createElement("button");
        autoBtn.textContent = "Auto";
        autoBtn.onclick = () => { hls.currentLevel = -1; };
        qualitySelector.appendChild(autoBtn);
        data.levels.forEach((level, i) => {
          const btn = document.createElement("button");
          btn.textContent = `${level.height}p`;
          btn.onclick = () => { hls.currentLevel = i; };
          qualitySelector.appendChild(btn);
        });
      });
    }
  } else {
    video.src = url;
    video.play();
    qualitySelector.innerHTML = "";
  }
}

// Favorite and Autoplay functions remain the same
function getFavorites() { return JSON.parse(localStorage.getItem('myFavoriteChannels')) || []; }
function saveFavorites(favorites) { localStorage.setItem('myFavoriteChannels', JSON.stringify(favorites)); }
function toggleFavorite(event, channel, starIcon) {
    event.stopPropagation();
    let favorites = getFavorites();
    const index = favorites.findIndex(fav => fav.name === channel.name && fav.url === channel.url);
    if (index > -1) {
        favorites.splice(index, 1);
        starIcon.classList.remove('favorited');
    } else {
        favorites.push(channel);
        starIcon.classList.add('favorited');
    }
    saveFavorites(favorites);
    if (categoryFilter.value === 'Favorites') setupInitialView();
}
function playNextVideo() {
  if (currentFilteredChannels.length === 0 || currentChannelIndex === -1) return;
  // This logic needs to be smarter - find index in currentFilteredChannels
  const currentChannel = allChannels[currentChannelIndex];
  const currentFilteredIndex = currentFilteredChannels.findIndex(c => c.url === currentChannel.url);
  const nextFilteredIndex = (currentFilteredIndex + 1) % currentFilteredChannels.length;
  const nextChannel = currentFilteredChannels[nextFilteredIndex];
  const nextGlobalIndex = allChannels.findIndex(c => c.url === nextChannel.url);
  
  if (!document.querySelector(`.channel[data-index="${nextGlobalIndex}"]`)) {
    loadMoreChannels();
  }
  playStream(nextChannel, nextGlobalIndex);
}

video.addEventListener('ended', playNextVideo);
searchInput.addEventListener("input", setupInitialView);
categoryFilter.addEventListener("change", setupInitialView);
sortSelector.addEventListener("change", setupInitialView); // Event listener for sort
