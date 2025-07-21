// ==UserScript==
// @name         Hanime1 [fetch + blob] Download + 管理清單(暫時只顯示圖示)
// @namespace    http://tampermonkey.net/
// @version      1.56
// @updateURL    https://github.com/taste-latte/Hanime1-fetch-blob-Download/raw/refs/heads/main/Hanime1%20%5Bfetch%20+%20blob%5D%20Download.meta.js
// @downloadURL  https://github.com/taste-latte/Hanime1-fetch-blob-Download/raw/refs/heads/main/Hanime1%20%5Bfetch%20+%20blob%5D%20Download.user.js
// @description  (功能)使用 videoId 精準紀錄已下載影片，下載影片自動命名，管理清單支援單筆刪除與固定清除按鈕以及匯出與匯入紀錄。
// @description  (更新)下載紀錄清單搜尋時會凸顯搜尋文字，搜尋時會從整個清單中找尋影片名稱，下載紀錄清單新增影片圖示可以跳轉到該影片觀看網頁
// @description  (待修正)下載清單暫時只有圖示(加上文字會使影片縮圖變小)
// @match        *://hanime1.me/*
// @grant        none
// ==/UserScript==
/*(整體功能)
1.在影片縮圖放置下載圖示並且下載影片會自動改名
2.下載影片會記錄到下載記錄清單中以及在影片縮圖顯示已下載圖示
3.清單內部可以刪除單筆紀錄或是全部刪除以及匯出或匯入紀錄
4.匯入紀錄時若清單擁有此紀錄影片名稱會變紅
5.下載清單擁有頁碼跳頁與滾動換頁
6.圖釘功能可以選擇是否使用滾動頁面
7.下載記錄搜尋時會從整個清單中找尋擁有關鍵字的影片名稱同時凸顯搜尋文字
8.下載紀錄清單點擊影片圖示會跳轉到該影片觀看網頁*/
(function () {
    'use strict';

    const STORAGE_KEY = 'hanime1_downloaded_v2';

    function getDownloadedList() {
        return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    }

    function saveDownloaded(videoId, filename) {
        const list = getDownloadedList();
        if (!list.find(item => item.id === videoId)) {
            list.push({ id: videoId, name: filename });
            localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
        }
    }

    function deleteDownloaded(videoId) {
        const list = getDownloadedList().filter(item => item.id !== videoId);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
        updateDownloadList();
    }

    function isDownloaded(videoId) {
        return getDownloadedList().some(item => item.id === videoId);
    }

    function parseHTML(html) {
        return new DOMParser().parseFromString(html, 'text/html');
    }

    async function fetchTitle(videoId) {
        try {
            const html = await fetch(`https://hanime1.me/watch?v=${videoId}`).then(r => r.text());
            const doc = parseHTML(html);

            // 先抓 <h3 id="shareBtn-title">
            let title = doc.querySelector('h3#shareBtn-title')?.textContent?.trim();

            // fallback: <title>
            if (!title) {
                title = doc.querySelector('title')?.textContent
                    ?.replace(/[-|]\s*hanime1\.me\s*$/i, '')
                    ?.trim();
            }

            // fallback: default title
            if (!title) return `video-${videoId}`;

            // 移除非法檔名字元
            return title.replace(/[\\/:*?"<>|]/g, '');
        } catch (e) {
            console.error('fetchTitle failed', e);
            return `video-${videoId}`;
        }
    }

    async function downloadByBlob(url, filename) {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(blobUrl);
    }

    function showDownloadingTip(type = 'loading', msg = '') {
        let tip = document.getElementById('tm-download-tip');
        if (!tip) {
            tip = document.createElement('div');
            tip.id = 'tm-download-tip';
            Object.assign(tip.style, {
                position: 'fixed', top: '10px', right: '10px',
                padding: '10px 16px', color: 'white',
                fontWeight: 'bold', fontSize: '16px',
                borderRadius: '6px', zIndex: 99999,
                pointerEvents: 'none', userSelect: 'none',
                maxWidth: 'calc(100vw - 20px)', whiteSpace: 'nowrap',
                overflow: 'hidden', textOverflow: 'ellipsis'
            });
            document.body.appendChild(tip);
        }
        clearTimeout(tip._hideTimer);
        if (type === 'loading') {
            tip.style.backgroundColor = 'rgba(0,0,0,0.8)';
            tip.textContent = '下載中，請稍候...';
            tip.style.display = 'block';
        } else if (type === 'success') {
            tip.style.backgroundColor = 'rgba(0,128,0,0.85)';
            tip.textContent = msg;
            tip.style.display = 'block';
            tip._hideTimer = setTimeout(() => tip.style.display = 'none', 5000);
        } else if (type === 'error') {
            tip.style.backgroundColor = 'rgba(200,0,0,0.85)';
            tip.textContent = msg;
            tip.style.display = 'block';
            tip._hideTimer = setTimeout(() => tip.style.display = 'none', 5000);
        } else {
            tip.style.display = 'none';
        }
    }

    function decodeHTML(html) {
        const div = document.createElement('div');
        div.innerHTML = html;
        return div.textContent || div.innerText || '';
    }

    function cleanFilename(name) {
        return name.replace(/-\(hanime1\.me\)-\d+p\.MP4$/i, '').trim();
    }

    async function startDownload(videoId) {
        showDownloadingTip('loading');
        const rawTitle = await fetchTitle(videoId);
        const dlHTML = await fetch(`https://hanime1.me/download?v=${videoId}`).then(r => r.text());
        const arr = [...dlHTML.matchAll(/data-url="([^"]+?\/(\d+)-(1080p|720p|480p)\.mp4[^"]*)".*?download="([^"]+)"/g)];
        if (!arr.length) {
            showDownloadingTip('error', '❌ 無法找到下載連結');
            return;
        }
        const sel = arr.find(m => m[3] === '1080p') || arr.find(m => m[3] === '720p') || arr[0];
        const quality = sel[3];
        const rawUrl = sel[1].replace(/&amp;/g, '&');
        let linkName = decodeHTML(sel[4] || '').replace(/[\\/:*?"<>|]/g, '').trim();
        if (/^\d+$/.test(linkName)) linkName = '';

        // 處理 rawTitle 的 fallback 判斷
        const hasHtmlEntities = /&(?:#\d+|[a-z]+);/i.test(rawTitle);  // 檢查是否含有 HTML 實體
        const finalName = `${(hasHtmlEntities && linkName ? linkName : rawTitle)}-(hanime1.me)-${quality}.MP4`;
        if (isDownloaded(videoId)) {
            const re = confirm(`⚠️ 此影片已下載過：\n${finalName}\n\n是否重新下載？`);
            if (!re) { showDownloadingTip('error', '⏹️ 已取消下載'); return; }
        }

        try {
            await downloadByBlob(rawUrl, finalName);
            saveDownloaded(videoId, finalName);
            showDownloadingTip('success', `✅ 下載完成：${finalName}`);
            markDownloadedCardById(videoId);
            updateDownloadList();
        } catch (e) {
            console.error(e);
            showDownloadingTip('error', `❌ 下載失敗：${finalName}`);
        }
    }

    function addDownloadedBadge(container) {
        if (container.querySelector('.tm-downloaded-badge')) return;
        if (getComputedStyle(container).position === 'static') {
            container.style.position = 'relative';
        }
        const badge = document.createElement('div');
        badge.className = 'tm-downloaded-badge';
        badge.textContent = '✅ 已下載';
        Object.assign(badge.style, {
            position: 'absolute', bottom: '4px', right: '5px',
            backgroundColor: 'rgba(0,128,0,0.85)', color: '#fff',
            padding: '2px 6px', borderRadius: '4px', fontSize: '12px',
            fontWeight: 'bold', zIndex: 9999, pointerEvents: 'none',
            userSelect: 'none', boxShadow: '0 0 2px black'
        });
        container.appendChild(badge);
    }

    function markDownloadedCardById(videoId) {
        document.querySelectorAll(`a.overlay[href*="watch?v=${videoId}"]`).forEach(link => {
            const container = link.closest('.multiple-link-wrapper') || link.parentElement || link;
            addDownloadedBadge(container);
        });
    }

    let currentSearchTerm = '';
    let currentPage = 1;
    const itemsPerPage = 10;
    let scrollPagingEnabled = true;
    let overScrollTimestamp = 0;
    let scrollTimeout = null;
    let scrollToBottomAfterUpdate = false;

    function highlightDisplayName(name, keyword) {
        const escapedKeyword = keyword.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`(${escapedKeyword})`, 'gi');
        const match = /^\[(.*?)\](.*)/.exec(name.trim());

        if (match) {
            const author = match[1];
            const title = match[2];
            const highlightedAuthor = author.replace(regex, m => `<span class="highlight">${m}</span>`);
            const highlightedTitle = title.replace(regex, m => `<span class="highlight">${m}</span>`);
            return `[${highlightedAuthor}]${highlightedTitle}`;
        } else {
            return name.replace(regex, m => `<span class="highlight">${m}</span>`);
        }
    }

    function updateDownloadList() {
        const lc = document.getElementById('tm-download-list');
        if (!lc) return;

        let downloaded = getDownloadedList();
        const duplicateIds = JSON.parse(sessionStorage.getItem('tm-import-duplicates') || '[]');

        // 搜尋邏輯：根據 currentSearchTerm 過濾所有記錄
        if (currentSearchTerm.trim()) {
            const keyword = currentSearchTerm.trim().toLowerCase();
            downloaded = downloaded.filter(item => cleanFilename(item.name).toLowerCase().includes(keyword));
        }

        const totalPages = Math.ceil(downloaded.length / itemsPerPage);
        const shouldPaginate = downloaded.length > itemsPerPage;
        if (!shouldPaginate) currentPage = 1;
        if (currentPage > totalPages) currentPage = totalPages || 1;
        lc.innerHTML = '';

        // ✅ 插入樣式
        if (!document.getElementById('tm-scroll-style')) {
            const style = document.createElement('style');
            style.id = 'tm-scroll-style';
            style.textContent = `
            #tm-download-list div::-webkit-scrollbar {
                width: 8px;
            }
            #tm-download-list div::-webkit-scrollbar-track {
                background: rgba(255, 255, 255, 0.05);
            }
            #tm-download-list div::-webkit-scrollbar-thumb {
                background: rgba(255, 255, 255, 0.2);
                border-radius: 4px;
            }
            #tm-download-list div::-webkit-scrollbar-thumb:hover {
                background: rgba(255, 255, 255, 0.4);
            }

            #tm-download-list button {
                background: rgba(255,255,255,0.1);
                color: #fff;
                border: none;
                padding: 6px 10px;
                font-weight: bold;
                cursor: pointer;
                border-radius: 4px;
                transition: background 0.2s;
            }

            #tm-download-list button:hover:enabled {
                background: rgba(255,255,255,0.2);
            }

            #tm-download-list button:disabled {
                opacity: 0.4;
                background: rgba(255,255,255,0.1);
                color: #fff;
                cursor: default;
            }

            #tm-download-list input[type="number"]::-webkit-inner-spin-button,
            #tm-download-list input[type="number"]::-webkit-outer-spin-button {
                -webkit-appearance: none;
                margin: 0;
            }

            #tm-search-bar {
                display: flex;
                align-items: center;
                gap: 4px;
            }

            #tm-search-bar input[type="text"] {
                flex: 1;
                width: calc(100% - 40px);
            }

            #tm-pin-btn {
                font-size: 18px;
                background: none;
                border: none;
                color: #fff;
                cursor: pointer;
                opacity: 1;
                transition: opacity 0.2s;
            }

            #tm-pin-btn.off {
                opacity: 0.4;
            }

            .highlight {
                color: #f39c12;
                font-weight: bold;
                white-space: inherit;
            }
        `;
            document.head.appendChild(style);
        }

        // ✅ 建立清單區塊
        const startIndex = (currentPage - 1) * itemsPerPage;
        const endIndex = startIndex + itemsPerPage;
        const currentItems = downloaded.slice(startIndex, endIndex);

        const listWrapper = document.createElement('div');
        listWrapper.style.maxHeight = '300px';
        listWrapper.style.overflowY = 'auto';
        listWrapper.style.border = '1px solid rgba(255,255,255,0.1)';
        listWrapper.style.paddingRight = '4px';
        listWrapper.style.marginBottom = '8px';

        listWrapper.addEventListener('wheel', (e) => {
            const { scrollTop, scrollHeight, clientHeight } = listWrapper;
            const deltaY = e.deltaY;

            const atBottom = scrollTop + clientHeight >= scrollHeight - 2;
            const atTop = scrollTop <= 2;

            const canScrollDown = scrollHeight > clientHeight && !atBottom;
            const canScrollUp = scrollTop > 0;

            if (scrollPagingEnabled) {
                // 原本的滾動換頁邏輯
                const canPageDown = atBottom && deltaY > 0 && currentPage < totalPages;
                const canPageUp = atTop && deltaY < 0 && currentPage > 1;

                if ((canPageDown || canPageUp)) {
                    e.preventDefault();
                    if (!scrollTimeout) {
                        scrollTimeout = setTimeout(() => {
                            if (deltaY > 0 && currentPage < totalPages) {
                                currentPage += 1;
                            } else if (deltaY < 0 && currentPage > 1) {
                                currentPage -= 1;
                                scrollToBottomAfterUpdate = true;
                            }
                            updateDownloadList();
                            scrollTimeout = null;
                        }, 800);
                    }
                } else {
                    if (scrollTimeout) {
                        clearTimeout(scrollTimeout);
                        scrollTimeout = null;
                    }

                    if ((deltaY > 0 && !canScrollDown) || (deltaY < 0 && !canScrollUp)) {
                        e.preventDefault();
                    }
                }
            } else {
                // 當滾動換頁關閉時
                // 在清單已經到頂或到底且繼續滾動時，阻止事件冒泡及預設行為，避免頁面滾動
                if ((deltaY > 0 && atBottom) || (deltaY < 0 && atTop)) {
                    e.preventDefault();
                }
                // 否則不阻止，讓清單正常滾動
            }
        }, { passive: false });

        currentItems.forEach(({ id, name }) => {
            const d = document.createElement('div');
            d.className = 'tm-download-item';

            // 影片圖示
            const videoIcon = document.createElement('span');
            videoIcon.textContent = '🎬';  // 影片小圖示，可以換成 <img> 等
            Object.assign(videoIcon.style, {
                cursor: 'pointer',
                marginRight: '8px',
                fontSize: '16px',
                userSelect: 'none',
                flexShrink: 0,
                color: '#4caf50'  // 綠色可自訂
            });
            videoIcon.title = '觀看影片';
            videoIcon.onclick = () => {
                window.open(`https://hanime1.me/watch?v=${id}`, '_blank');
            };

            // 文字容器，負責文字換行和高亮
            const textWrapper = document.createElement('div');
            textWrapper.style.flex = '1';
            textWrapper.style.whiteSpace = 'normal';
            textWrapper.style.wordBreak = 'break-word';

            let displayName = cleanFilename(name);
            if (currentSearchTerm.trim()) {
                displayName = highlightDisplayName(displayName, currentSearchTerm);
            }
            textWrapper.innerHTML = displayName;

            if (duplicateIds.includes(id)) {
                textWrapper.style.color = 'red';
            }

            Object.assign(d.style, {
                padding: '6px 4px 6px 8px',
                borderBottom: '1px solid rgba(255,255,255,0.1)',
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
            });

            const del = document.createElement('span');
            del.textContent = '❌';
            Object.assign(del.style, {
                marginLeft: '6px',
                cursor: 'pointer',
                color: '#f66',
                flexShrink: 0
            });
            del.onclick = () => deleteDownloaded(id);

            // 依次 append：影片圖示 → 文字 → 刪除按鈕
            d.appendChild(videoIcon);
            d.appendChild(textWrapper);
            d.appendChild(del);

            listWrapper.appendChild(d);
        });
        lc.appendChild(listWrapper);
        if (scrollToBottomAfterUpdate) {
            // 等待 DOM 渲染後再滾到底
            setTimeout(() => {
                listWrapper.scrollTop = listWrapper.scrollHeight;
                scrollToBottomAfterUpdate = false;
            }, 0);
        }
        // ✅ 圖釘按鈕（加在搜尋欄左側）
        const searchBar = document.getElementById('tm-search-bar');
        if (searchBar) {
            let pinBtn = document.getElementById('tm-pin-btn');
            if (!pinBtn) {
                pinBtn = document.createElement('button');
                pinBtn.id = 'tm-pin-btn';
                searchBar.insertBefore(pinBtn, searchBar.firstChild);

                // 統一樣式設定，避免排版抖動
                Object.assign(pinBtn.style, {
                    width: '28px',
                    height: '28px',
                    fontSize: '16px',
                    fontWeight: 'bold',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    transition: 'background 0.3s, opacity 0.3s',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#fff',
                    padding: '0',
                });

                pinBtn.onclick = () => {
                    scrollPagingEnabled = !scrollPagingEnabled;
                    updatePinButton();
                };
            }

            const updatePinButton = () => {
                const isOn = scrollPagingEnabled;
                pinBtn.textContent = isOn ? '📌' : '📍';
                pinBtn.title = isOn ? '滾動換頁已啟用，點擊停用' : '滾動換頁已停用，點擊啟用';
                pinBtn.style.backgroundColor = isOn ? '#28a745' : '#dc3545'; // 綠 / 紅
                pinBtn.style.opacity = isOn ? '1' : '0.9';
            };
            updatePinButton(); // 初始化顯示
        }

        // ✅ 分頁控制器
        const pagination = document.createElement('div');
        pagination.style.textAlign = 'center';
        pagination.style.marginTop = '10px';
        pagination.style.display = 'flex';
        pagination.style.justifyContent = 'center';
        pagination.style.alignItems = 'center';
        pagination.style.gap = '8px';
        const prevBtn = document.createElement('button');
        prevBtn.textContent = '⬅️ 上一頁';
        prevBtn.disabled = currentPage === 1;
        prevBtn.onclick = () => {
            if (currentPage > 1) {
                currentPage--;
                updateDownloadList();
            }
        };

        const nextBtn = document.createElement('button');
        nextBtn.textContent = '下一頁 ➡️';
        nextBtn.disabled = currentPage === totalPages;
        nextBtn.onclick = () => {
            if (currentPage < totalPages) {
                currentPage++;
                updateDownloadList();
            }
        };
        if (shouldPaginate) {
            const inputWrapper = document.createElement('div');
            inputWrapper.style.display = 'flex';
            inputWrapper.style.alignItems = 'center';
            inputWrapper.style.color = '#ccc';
            const prefix = document.createElement('span');
            prefix.textContent = '第';
            const pageInput = document.createElement('input');
            pageInput.type = 'number';
            pageInput.min = 1;
            pageInput.max = totalPages;
            pageInput.value = currentPage;
            Object.assign(pageInput.style, {
                width: '32px',
                textAlign: 'center',
                margin: '0 4px',
                border: 'none',
                borderBottom: '1px solid #ccc',
                background: 'transparent',
                color: '#fff',
                fontSize: '14px',
                appearance: 'textfield'
            });
            pageInput.onkeydown = (e) => {
                if (e.key === 'Enter') {
                    const target = parseInt(pageInput.value);
                    if (!isNaN(target) && target >= 1 && target <= totalPages) {
                        currentPage = target;
                        updateDownloadList();
                    }
                }
            };

            const suffix = document.createElement('span');
            suffix.textContent = ` / ${totalPages}頁`;
            inputWrapper.appendChild(prefix);
            inputWrapper.appendChild(pageInput);
            inputWrapper.appendChild(suffix);
            pagination.appendChild(prevBtn);
            pagination.appendChild(inputWrapper);
            pagination.appendChild(nextBtn);
            lc.appendChild(pagination);
        }}

    function createDownloadManager() {
        const navIcons = document.querySelectorAll('.nav-icon.pull-right');
        const btn = document.createElement('a');
        btn.href = '#';
        btn.className = 'nav-icon pull-right';
        btn.style.paddingLeft = '10px';
        btn.title = '下載紀錄';
        btn.innerHTML = `
  <span class="material-icons-outlined" style="vertical-align: middle; font-size: 28px;">history</span>
`;
        const wrapper = document.createElement('div');
        wrapper.style.display = 'inline-block';
        wrapper.style.verticalAlign = 'middle';
        wrapper.style.marginLeft = '8px';
        wrapper.appendChild(btn);
        // 新增支援首頁與其他頁導覽列
        const navContainer =
              document.getElementById('main-nav') ||
              document.getElementById('main-nav-home') ||
              document.body;
        navContainer.appendChild(wrapper);
        if (navContainer) navContainer.appendChild(btn);
        else document.body.appendChild(btn); // Fallback
        btn.onclick = (e) => {
            e.preventDefault();
            panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
            updateDownloadList();
        };

        const panel = document.createElement('div');
        Object.assign(panel.style, {
            position: 'fixed', top: '50px', right: '10px', width: '320px',
            background: 'rgba(0,0,0,0.85)',color: 'white', padding: '10px',
            borderRadius: '6px', display: 'none', zIndex: 99999
        });

        document.body.appendChild(panel);

        const topBar = document.createElement('div');
        topBar.style.display = 'flex';
        topBar.style.gap = '6px';
        topBar.style.marginBottom = '8px';
        const search = document.createElement('input');
        search.placeholder = '搜尋...';
        search.type = 'search';
        Object.assign(search.style, {
            flex: '1',
            padding: '6px',
            borderRadius: '4px',
            border: 'none',
            background: '#333',
            color: '#fff'
        });
        const exportBtn = document.createElement('button');
        exportBtn.textContent = '📤';
        exportBtn.title = '匯出下載紀錄';
        Object.assign(exportBtn.style, {
            background: '#444', color: '#fff',
            border: 'none', borderRadius: '4px',
            padding: '6px 8px', cursor: 'pointer'
        });
        exportBtn.onclick = () => {
            const cleanData = getDownloadedList().map(item => ({
                id: item.id,
                name: cleanFilename(item.name)
            }));
            const blob = new Blob([JSON.stringify(cleanData, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `hanime1_download_list.json`;
            a.click();
            URL.revokeObjectURL(url);
        };

        const importBtn = document.createElement('button');
        importBtn.textContent = '📥';
        importBtn.title = '匯入下載紀錄';
        Object.assign(importBtn.style, {
            background: '#444', color: '#fff',
            border: 'none', borderRadius: '4px',
            padding: '6px 8px', cursor: 'pointer'
        });
        importBtn.onclick = () => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'application/json';
            input.onchange = () => {
                const file = input.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = () => {
                    try {
                        const imported = JSON.parse(reader.result);
                        if (Array.isArray(imported)) {
                            const existing = getDownloadedList();
                            const cleaned = imported.map(item => ({
                                id: item.id,
                                name: cleanFilename(item.name)
                            }));

                            // 🔴 找出重複的項目
                            const duplicateIds = cleaned
                            .filter(item => item.id && existing.some(e => e.id === item.id))
                            .map(item => item.id);

                            // 存入 sessionStorage（只保留本次匯入階段）
                            sessionStorage.setItem('tm-import-duplicates', JSON.stringify(duplicateIds));

                            // 合併非重複項目
                            const merged = [
                                ...existing,
                                ...cleaned.filter(item => item.id && !existing.some(e => e.id === item.id))
                            ];

                            localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
                            updateDownloadList();
                            alert('✅ 匯入完成');
                        } else {
                            alert('❌ 匯入失敗：格式錯誤');
                        }
                    } catch (e) {
                        alert('❌ 匯入失敗：無法解析 JSON');
                    }
                };
                reader.readAsText(file);
            };
            input.click();
        };

        topBar.appendChild(search);
        topBar.appendChild(exportBtn);
        topBar.appendChild(importBtn);
        topBar.id = 'tm-search-bar';
        panel.appendChild(topBar);
        const list = document.createElement('div');
        list.id = 'tm-download-list';
        panel.appendChild(list);

        const clearBtn = document.createElement('button');
        clearBtn.textContent = '清除全部紀錄';
        Object.assign(clearBtn.style, {
            position: 'sticky', bottom: '0', marginTop: '10px',
            width: '100%', padding: '8px', fontWeight: 'bold',
            background: 'rgba(200,0,0,0.8)', border: 'none',
            borderRadius: '4px', color: 'white', cursor: 'pointer'
        });
        clearBtn.onclick = () => {
            if (confirm('確定清除所有下載紀錄？')) {
                currentPage = 1;
                localStorage.removeItem(STORAGE_KEY);
                updateDownloadList();
            }
        };

        panel.appendChild(clearBtn);
        search.oninput = () => {
            currentSearchTerm = search.value;
            currentPage = 1;
            updateDownloadList();
        };

    }

    const observer = new MutationObserver(() => {
        document.querySelectorAll('a.overlay[href*="watch?v="]').forEach(link => {
            if (!link.dataset.dl) {
                const id = link.href.match(/v=(\d+)/)?.[1];
                if (!id) return;
                link.dataset.dl = '1';
                const container =
                      link.closest('.multiple-link-wrapper') ||
                      link.closest('.card-mobile-panel') ||
                      link.parentElement;

                if (!container) return;

                // 🛑 若已有 ⬇️ 按鈕，避免重複插入
                if (container.querySelector('button')?.textContent.includes('⬇️')) return;

                // ➕ 插入下載按鈕
                const btn = document.createElement('button');
                btn.textContent = '⬇️';
                Object.assign(btn.style, {
                    position: 'absolute', top: '5px', right: '5px', zIndex: 999,
                    background: 'rgba(0,0,0,0.6)', color: 'white',
                    padding: '3px 6px', borderRadius: '4px', fontSize: '14px',
                    border: 'none', cursor: 'pointer'
                });

                if (getComputedStyle(container).position === 'static') {
                    container.style.position = 'relative';
                }

                container.appendChild(btn);
                btn.onclick = e => {
                    e.preventDefault();
                    e.stopPropagation();
                    startDownload(id);
                };

                // ➕ 插入 ✅ 已下載徽章（如果需要）
                if (isDownloaded(id)) {
                    addDownloadedBadge(container);
                }
            }
        });

        // ➕ 播放頁「⬇️ 下載此影片」按鈕處理
        const v = new URL(location.href).searchParams.get('v');
        if (v && !document.getElementById('tm-dl-btn')) {
            const sb = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('訂閱'));
            if (sb) {
                const b = document.createElement('button');
                b.id = 'tm-dl-btn';
                b.textContent = '⬇️ 下載此影片';
                Object.assign(b.style, {
                    marginLeft: '8px',
                    padding: '4px 10px',
                    background: 'rgba(0,0,0,0.7)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    fontSize: 'clamp(10px, 1.4vw, 16px)',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    maxWidth: 'fit-content',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    flexShrink: 0
                });
                sb.after(b);
                b.onclick = () => startDownload(v);
                if (isDownloaded(v)) markDownloadedCardById(v);
            }
        }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    createDownloadManager();

    function cloneDownloadButtonToStickyNav() {
        const stickyNav = document.querySelector('#search-nav-desktop');
        const mainNavBtn = document.querySelector('#main-nav a[title="下載紀錄"]');

        if (!stickyNav || !mainNavBtn) return;

        // 避免重複插入
        if (stickyNav.querySelector('.tm-sticky-download-btn')) return;

        // 創建 wrapper 跟搜尋作者一樣的按鈕結構
        const wrapper = document.createElement('div');
        wrapper.className = 'dropdown no-select search-nav-opacity hidden-xs hidden-sm tm-sticky-download-wrapper';
        wrapper.style.cssText = 'display: inline-block; padding: 0; margin-left: 7px; margin-top: -15px;';

        const button = document.createElement('button');
        button.className = 'tm-sticky-download-btn';
        button.title = '下載紀錄';
        button.type = 'button';
        button.style.cssText = `
    background: transparent;
    border: none;
    padding: 0;
    margin: 0 8px 0 0;
    display: flex;
    align-items: center;
    justify-content: center;
    outline: none;
    box-shadow: none;
    cursor: pointer;
`;
        button.innerHTML = `
        <span class="material-icons-outlined" style="
            font-size: 28px;
            color: white;
            filter: drop-shadow(0 0 1px black);
            font-weight: bold;
            vertical-align: middle;
        ">history</span>
    `;

        wrapper.appendChild(button);

        // 插入搜尋作者左側
        const authorBtns = stickyNav.querySelectorAll('.search-type-button');
        const authorBtn = authorBtns[authorBtns.length - 1];
        if (authorBtn && authorBtn.parentElement) {
            authorBtn.parentElement.insertBefore(wrapper, authorBtn);
        } else {
            stickyNav.appendChild(wrapper);
        }

        // 點擊事件與原按鈕同步
        button.addEventListener('click', e => {
            e.preventDefault();
            const panel = document.querySelector('#tm-download-list')?.parentElement;
            if (panel) {
                panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
                updateDownloadList();
            }
        });
    }

    function removeStickyDownloadButton() {
        const btn = document.querySelector('#search-nav-desktop .tm-sticky-download-btn');
        if (btn) btn.remove();
    }

    // 觀察 #main-nav 是否可見
    const mainNav = document.querySelector('#main-nav');
    if (mainNav) {
        const observer = new IntersectionObserver(entries => {
            const isVisible = entries[0].isIntersecting;
            if (!isVisible) {
                cloneDownloadButtonToStickyNav();
            } else {
                removeStickyDownloadButton();
            }
        }, { root: null, threshold: 0 });

        observer.observe(mainNav);
    }

    window.addEventListener('beforeunload', () => {
        sessionStorage.removeItem('tm-import-duplicates');
    });
})();
