// ==UserScript==
// @name         Hanime1 [fetch + blob] Download
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  下載按鈕放訂閱旁，自動正確命名影片[使用(fetch + blob)強制命名]
// @match        *://hanime1.me/*
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  async function fetchTitle(videoId) {
    try {
      const html = await fetch(`https://hanime1.me/watch?v=${videoId}`).then(r => r.text());
      const cleanHtml = html.replace(/\n/g, ' ').replace(/\r/g, '');
      let t = cleanHtml.match(/<h3[^>]*id=["']shareBtn-title["'][^>]*>(.*?)<\/h3>/);
      if (t && t[1]) return t[1].replace(/[\\\/:*?"<>|]/g, '').trim();
      t = cleanHtml.match(/<title>(.*?)<\/title>/);
      if (t && t[1]) return t[1].replace(/[-|]\s*hanime1\.me\s*$/i, '').trim();
      return `video-${videoId}`;
    } catch (e) {
      console.error('fetchTitle error:', e);
      return `video-${videoId}`;
    }
  }

  async function downloadByBlob(url, filename) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP status ${res.status}`);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(blobUrl);
    } catch (err) {
      throw err;
    }
  }

  async function startDownload(videoId) {
    showDownloadingTip('loading');
    const rawTitle = await fetchTitle(videoId);
    const dlHTML = await fetch(`https://hanime1.me/download?v=${videoId}`).then(r => r.text());
    const arr = [...dlHTML.matchAll(/data-url="([^"]+?\/\d+-(1080p|720p|480p)\.mp4[^"]*)".*?download="([^"]+)"/g)];
    if (!arr.length) {
      alert('❌ 無法找到下載連結');
      showDownloadingTip('error', '❌ 無法找到下載連結');
      return;
    }

    const sel = arr.find(m => m[2] === '1080p') || arr.find(m => m[2] === '720p') || arr[0];
    const quality = sel[2];
    let linkName = sel[3]?.replace(/[\\\/:*?"<>|]/g, '').trim();
    if (/^\d+$/.test(linkName)) linkName = '';
    const finalName = `${linkName || rawTitle}-(hanime1.me)-${quality}.MP4`;

    try {
      await downloadByBlob(sel[1], finalName);
      showDownloadingTip('success', `✅ 下載完成：${finalName}`);
    } catch (e) {
      console.error(e);
      showDownloadingTip('error', `❌ 下載失敗：${finalName}`);
    }
  }

  function showDownloadingTip(type = 'loading', message = '') {
    let tip = document.getElementById('tm-download-tip');
    if (!tip) {
      tip = document.createElement('div');
      tip.id = 'tm-download-tip';
      Object.assign(tip.style, {
        position: 'fixed',
        top: '10px',
        right: '10px',
        padding: '10px 16px',
        color: 'white',
        fontWeight: 'bold',
        fontSize: '16px',
        borderRadius: '6px',
        zIndex: 99999,
        pointerEvents: 'none',
        userSelect: 'none',
        maxWidth: 'calc(100vw - 20px)',
        whiteSpace: 'nowrap',       // 不換行
        overflow: 'hidden',         // 超出隱藏
        textOverflow: 'ellipsis',   // 省略號
      });
      document.body.appendChild(tip);
    }

    if (type === 'loading') {
      tip.style.backgroundColor = 'rgba(0,0,0,0.8)';
      tip.textContent = '下載中，請稍候...';
      tip.style.display = 'block';
    } else if (type === 'success') {
      tip.style.backgroundColor = 'rgba(0,128,0,0.85)';
      tip.textContent = message;
      tip.style.display = 'block';
      clearTimeout(tip._hideTimer);
      tip._hideTimer = setTimeout(() => { tip.style.display = 'none'; }, 5000);
    } else if (type === 'error') {
      tip.style.backgroundColor = 'rgba(200,0,0,0.85)';
      tip.textContent = message;
      tip.style.display = 'block';
      clearTimeout(tip._hideTimer);
      tip._hideTimer = setTimeout(() => { tip.style.display = 'none'; }, 5000);
    } else {
      tip.style.display = 'none';
    }
  }

  function addCardBtn(link) {
    if (link.dataset.dl) return;
    link.dataset.dl = '1';
    const container = link.parentElement;
    const vid = link.href.match(/v=(\d+)/)?.[1];
    if (!vid) return;

    const btn = Object.assign(document.createElement('button'), {
      textContent: '⬇️',
      title: '下載最高畫質'
    });
    Object.assign(btn.style, {
      position: 'absolute', top: '5px', right: '5px',
      background: 'rgba(0,0,0,0.6)', color: 'white',
      border: 'none', padding: '3px 6px', borderRadius: '4px',
      cursor: 'pointer', zIndex: '999', fontSize: '14px'
    });
    container.style.position = 'relative';
    container.appendChild(btn);

    btn.addEventListener('click', e => {
      e.preventDefault(); e.stopPropagation();
      startDownload(vid);
    });
  }

  function addWatchPageBtn() {
    const urlV = new URL(location.href).searchParams.get('v');
    if (!urlV) return;
    if (document.querySelector('#tm-dl-btn')) return;

    let subscribeBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === '訂閱')
      || document.querySelector('button.btn-subscribe');

    if (!subscribeBtn) {
      console.log('[下載腳本] 找不到訂閱按鈕');
      return;
    }

    const btn = Object.assign(document.createElement('button'), {
      id: 'tm-dl-btn',
      textContent: '⬇️ 下載此影片',
      title: '最高畫質下載'
    });
    Object.assign(btn.style, {
      marginLeft: '8px',
      padding: '6px 14px',
      background: 'rgba(0,0,0,0.7)',
      color: 'white',
      border: 'none',
      borderRadius: '4px',
      cursor: 'pointer',
      fontWeight: 'bold',
      fontSize: '18px',
      verticalAlign: 'middle',
    });

    subscribeBtn.insertAdjacentElement('afterend', btn);
    btn.addEventListener('click', () => startDownload(urlV));
  }

  function initCards() {
    document.querySelectorAll('a.overlay[href*="watch?v="]').forEach(addCardBtn);
  }

  const observer = new MutationObserver(() => {
    initCards();
    addWatchPageBtn();
  });
  observer.observe(document.body, { childList: true, subtree: true });

  initCards();
  addWatchPageBtn();

})();