// ==UserScript==
// @name         Hanime1 [fetch + blob] Download + 管理清單(暫時只顯示圖示) (videoId 修正版)
// @namespace    http://tampermonkey.net/
// @version      1.51
// @description  使用 videoId 精準紀錄已下載影片，修復已下載圖示錯位問題，下載影片自動命名、顯示進度、管理清單，支援單筆刪除與固定清除按鈕。下載清單暫時只有圖示(加上文字會使影片縮圖變小)
// @match        *://hanime1.me/*
// @grant        none
// ==/UserScript==

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

    async function fetchTitle(videoId) {
        try {
            const html = await fetch(`https://hanime1.me/watch?v=${videoId}`).then(r => r.text());
            const clean = html.replace(/\n/g, ' ');
            let m = clean.match(/<h3[^>]*id=["']shareBtn-title["'][^>]*>(.*?)<\/h3>/);
            if (m && m[1]) return m[1].replace(/[\\/:*?"<>|]/g, '').trim();
            m = clean.match(/<title>(.*?)<\/title>/);
            if (m && m[1]) return m[1].replace(/[-|]\s*hanime1\.me\s*$/i, '').replace(/[\\/:*?"<>|]/g, '').trim();
            return `video-${videoId}`;
        } catch {
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

    function updateDownloadList() {
        const lc = document.getElementById('tm-download-list');
        if (!lc) return;
        const downloaded = getDownloadedList();
        lc.innerHTML = '';
        downloaded.forEach(({ id, name }) => {
            const d = document.createElement('div');
            d.className = 'tm-download-item';
            d.textContent = name;
            Object.assign(d.style, {
                padding: '6px 4px 6px 8px',
                borderBottom: '1px solid rgba(255,255,255,0.1)',
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
            });
            const del = document.createElement('span');
            del.textContent = '❌';
            Object.assign(del.style, {
                marginLeft: '6px', cursor: 'pointer', color: '#f66', flexShrink: 0
            });
            del.onclick = () => deleteDownloaded(id);
            d.appendChild(del);
            lc.appendChild(d);
        });
    }

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
            maxHeight: '400px', overflowY: 'auto', background: 'rgba(0,0,0,0.85)',
            color: 'white', padding: '10px', borderRadius: '6px', display: 'none', zIndex: 99999
        });
        document.body.appendChild(panel);

        const search = document.createElement('input');
        search.placeholder = '搜尋已下載...';
        search.type = 'search';
        Object.assign(search.style, {
            width: '100%', padding: '6px', marginBottom: '8px',
            borderRadius: '4px', border: 'none', background: '#333', color: '#fff'
        });
        panel.appendChild(search);

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
                localStorage.removeItem(STORAGE_KEY);
                updateDownloadList();
            }
        };
        panel.appendChild(clearBtn);

        search.oninput = () => {
            const kw = search.value.toLowerCase();
            document.querySelectorAll('.tm-download-item').forEach(div => {
                div.style.display = div.textContent.toLowerCase().includes(kw) ? 'flex' : 'none';
            });
        };

        btn.onclick = () => {
            panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
            updateDownloadList();
        };
    }

    const observer = new MutationObserver(() => {
        document.querySelectorAll('a[href*="watch?v="]').forEach(link => {
            if (!link.dataset.dl) {
                const id = link.href.match(/v=(\d+)/)?.[1];
                if (id) {
                    link.dataset.dl = '1';
                    const container = link.closest('.multiple-link-wrapper') || link.closest('.card-mobile-panel') || link.parentElement;
                    const btn = document.createElement('button');
                    btn.textContent = '⬇️';
                    Object.assign(btn.style, {
                        position: 'absolute', top: '5px', right: '5px', zIndex: 999,
                        background: 'rgba(0,0,0,0.6)', color: 'white',
                        padding: '3px 6px', borderRadius: '4px', fontSize: '14px', border: 'none', cursor: 'pointer'
                    });
                    if (getComputedStyle(container).position === 'static') container.style.position = 'relative';
                    container.appendChild(btn);
                    btn.onclick = e => { e.preventDefault(); e.stopPropagation(); startDownload(id); };
                    if (isDownloaded(id)) addDownloadedBadge(container);
                }
            }
        });
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
                    fontSize: 'clamp(10px, 1.4vw, 16px)', // 根據螢幕大小與容器寬度自動調整字體
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',       // 不允許換行
                    maxWidth: 'fit-content',    // 不設死寬度，只用內容寬度
                    overflow: 'hidden',         // 保險：超出隱藏
                    textOverflow: 'ellipsis',   // 保險：避免意外換行
                    flexShrink: 0               // 不允許按鈕被擠壓縮小
                });
                sb.after(b);
                b.onclick = () => startDownload(v);
                if (isDownloaded(v)) markDownloadedCardById(v);
            }
        }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    createDownloadManager();
})();
