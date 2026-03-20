// ==UserScript==
// @name         Hanime1 [fetch + blob] Download + 管理清單(暫時只顯示圖示)
// @namespace    http://tampermonkey.net/
// @version      1.67
// @updateURL    https://github.com/taste-latte/Hanime1-fetch-blob-Download/raw/refs/heads/main/Hanime1%20%5Bfetch%20+%20blob%5D%20Download.meta.js
// @downloadURL  https://github.com/taste-latte/Hanime1-fetch-blob-Download/raw/refs/heads/main/Hanime1%20%5Bfetch%20+%20blob%5D%20Download.user.js
// @description  (功能簡介)下載Hanime1影片並自動命名同時記錄到清單中且標註已下載，能將下載紀錄匯出匯入
// @description  (更新)將關注清單排版弄成與下載紀錄清單一樣 原先在搜尋作者旁邊加入記錄按鈕現在旁邊也有關注按鈕 觀看紀錄清單從原先的下載圖示改成關注圖示 原先下載紀錄與觀看紀錄的全部記錄刪除已經改到設定清單裡面 新增下載關注清單全部影片按鈕
// @description  (待修正)下載清單暫時只有圖示(加上文字會使影片縮圖變小)，下載紀錄單獨刪除紀錄時會跳到最上面而不是保持目前位置，有時候離開清單預覽照片依然會跟著鼠標(有更改代碼但不知是否已經修正)，預覽照片有時會先錯誤照片後才顯示正確照片(有更改代碼但不知是否已經修正)
// @description  (待修正)重新整理後一開始打開下載紀錄並做任何動作清單頁面會縮小一點，當啟用滾動換頁會遇到當在最後一個或第一個預覽照片時滾動換頁預覽照片會一直顯示並且屬標離開清單也會跟著必須在預覽其他照片才會消失，目前網頁更新後首頁影片縮圖以下載失效
// @match        *://hanime1.me/*
// @grant        none
// ==/UserScript==
/*(整體功能)
1.在影片縮圖放置下載圖示並且下載影片會自動改名
2.下載影片會記錄到下載記錄清單中以及在影片縮圖顯示已下載圖示
3.下載紀錄清單內部可以刪除單筆紀錄或是全部刪除以及匯出或匯入紀錄
4.匯入紀錄時若清單擁有此紀錄影片名稱會變紅
5.清單擁有頁碼跳頁與滾動換頁
6.圖釘功能可以選擇是否使用滾動頁面
7.在搜尋欄輸入搜尋關鍵字會從清單中找尋擁有關鍵字的影片名稱同時凸顯搜尋文字
8.下載紀錄清單點擊影片圖示以及觀看紀錄清單點擊影片名稱會跳轉到該影片觀看網頁
9.鼠標移動到下載紀錄的觀看影片圖示與觀看紀錄的影片名稱上面會出現預覽照片*/
(function () {
	'use strict';
	//全域變數--------------------------------------------------------------------------------------------------------------------
	const WATCH_KEY = 'WATCH_HISTORY_KEY';
	const STORAGE_KEY = 'hanime1_downloaded_v2';
	const FOLLOW_KEY = 'hanime1_Followed_List';
	const SCROLL_PIN_KEY = 'hanimeSettings';

	let currentSearchTerm = '';
	let currentPage = 1;

	let currentWatchPage = 1;
	let totalWatchPages = 1;
	let currentWatchSearchTerm = '';

	let scrollStateDownload = 1; // 1=正常，2=停留等待，3=允許換頁
	let scrollStayTimeoutDownload = null;
	let scrollTimeoutDownload = null;
	let scrollToBottomAfterUpdateDownload = false;

	let scrollState_Follow = 1; // 1=正常，2=停留等待，3=允許換頁
	let Follow_Page = 1;
	let Follow_SearchTerm = '';
	let scrollStayTimeout_Follow = null;
	let scrollTimeout_Follow = null;
	let scrollToBottomAfterUpdate_Follow = false;

	const downloadingIds = new Set();
	let scrollStateWatch = 1; // 1: 普通滾動  2: 到底等待停留  3: 停留到底允許換頁
	let scrollStayTimeoutWatch = null;
	let pageSwitchTimeoutWatch = null;
	let scrollToBottomAfterUpdateWatch = false;

	const delayForTrigger = 300; // 停留到底部等待時間(ms)

	// 以下儲存初始設定，用於初始化按鈕恢復
	const defaultSettings = {
		listHeight: 300, //設定清單高度
		listWidth: 320, //設定清單寬度
		itemsPerPage: 10, //設定清單分頁顯示筆數
		watchMaxRecords: 100, //設定觀看紀錄最大紀錄筆數
		scrollPagingEnabled: false, //設定滾動換頁初始狀態
		pageSwitchdelay: 800,
	};
	let scrollPaging_Enabled = false;
	let pageSwitch_Delay = 800
	let currentTab = 'download'; // 預設頁面為下載紀錄(為了防止一開始未切換頁面時儲存或初始化數據誤加觀看紀錄的上下頁按鈕)
	//---------------------------------------------------------------------------------------------------------------------------

	//取得下載紀錄清單
	function getDownloadedList() {
		return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
	}
	//---------------------------------------------------------------------------------------------------------------------------

	//取得觀看紀錄清單
	function getWatchList() {
		const raw = localStorage.getItem(WATCH_KEY);
		if (!raw) return [];
		try {
			return JSON.parse(raw);
		} catch (e) {
			console.error('解析觀看紀錄失敗', e);
			return [];
		}
	}
	//---------------------------------------------------------------------------------------------------------------------------

	//取得關注紀錄清單
	function getFollowedList(){return JSON.parse(localStorage.getItem(FOLLOW_KEY) || '[]');}
	//---------------------------------------------------------------------------------------------------------------------------

	//儲存下載影片至下載紀錄清單
	function saveDownloaded(videoId, filename) {
		const list = getDownloadedList();
		if (!list.find(item => item.id === videoId)) {
			list.push({ id: videoId, name: filename });
			localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
		}
	}
	//---------------------------------------------------------------------------------------------------------------------------

	//將關注的影片加入到關注紀錄清單
	function saveFollowed(videoId, filename) {
		const list = getFollowedList();
		if (!list.find(item => item.id === videoId)) {
			list.push({ id: videoId, name: filename });
			localStorage.setItem(FOLLOW_KEY, JSON.stringify(list));
		}
	}
	//---------------------------------------------------------------------------------------------------------------------------

	//刪除下載影片紀錄
	function deleteDownloaded(videoId) {
		const list = getDownloadedList().filter(item => item.id !== videoId);
		localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
		updatedownloadList();
	}
	//---------------------------------------------------------------------------------------------------------------------------

	//刪除關注紀錄
	function deleteFollowed(videoId) {
		const list = getFollowedList().filter(item => item.id !== videoId);
		localStorage.setItem(FOLLOW_KEY, JSON.stringify(list));
		update_Follow_List();
	}
	//---------------------------------------------------------------------------------------------------------------------------
	function isDownloaded(videoId) {
		return getDownloadedList().some(item => item.id === videoId);
	}

	function isFollowed(videoId) {
		return getFollowedList().some(item => item.id === videoId);
	}
	//---------------------------------------------------------------------------------------------------------------------------
	function parseHTML(html) {
		return new DOMParser().parseFromString(html, 'text/html');
	}
	//---------------------------------------------------------------------------------------------------------------------------

	//獲得影片名稱
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
	//---------------------------------------------------------------------------------------------------------------------------
	async function downloadByBlob(url, filename, onProgress) {
		const res = await fetch(url);
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		const contentLength = res.headers.get('content-length');
		if (!contentLength) throw new Error('無法取得檔案大小');

		const total = parseInt(contentLength, 10);
		let loaded = 0;

		const reader = res.body.getReader();
		const chunks = [];

		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			chunks.push(value);
			loaded += value.length;
			if (onProgress) onProgress(loaded / total); // 回傳百分比
		}

		const blob = new Blob(chunks);
		const blobUrl = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = blobUrl;
		a.download = filename;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(blobUrl);
	}
	//---------------------------------------------------------------------------------------------------------------------------
	function showDownloadingTip(type = 'loading', msg = '', progress = null, current = null, total = null) {
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
				backgroundColor: 'rgba(0,0,0,0.8)',
				maxWidth: 'calc(100vw - 20px)',
				display: 'flex',
				flexDirection: 'column',
				alignItems: 'flex-end', // 右對齊
			});
			document.body.appendChild(tip);
		}

		clearTimeout(tip._hideTimer);

		if (type === 'loading') {
			tip.style.backgroundColor = 'rgba(0,0,0,0.8)';
			if (msg && progress != null) {
				tip.innerHTML = `<span style="align-self: flex-start;">${msg}</span>
                             <span>下載進度:${Math.floor(progress * 100)}% ${current != null && total != null ? `（${current}/${total}）` : ''}</span>`;
			} else if (msg) {
				tip.innerHTML = `<span style="align-self: flex-start;">${msg}</span>`;
			} else if (progress != null) {
				tip.innerHTML = `<span style="align-self: flex-start;"></span>
                             <span>下載進度:${Math.floor(progress * 100)}%</span>`;
			} else {
				tip.innerHTML = `<span style="align-self: flex-start;"></span>
                             <span>下載中，請稍候...</span>`;
		}
			tip.style.display = 'flex';
			tip._hideTimer = setTimeout(() => tip.style.display = 'none', 30000);
		}
		else if (type === 'success') {
			tip.style.backgroundColor = 'rgba(0,128,0,0.85)';
			tip.innerHTML = `<span>${msg}</span>`;
			tip.style.display = 'flex';
			tip._hideTimer = setTimeout(() => tip.style.display = 'none', 5000);
		}
		else if (type === 'error') {
			tip.style.backgroundColor = 'rgba(200,0,0,0.85)';
			tip.innerHTML = `<span>${msg}</span>`;
			tip.style.display = 'flex';
			tip._hideTimer = setTimeout(() => tip.style.display = 'none', 5000);
		}
		else {
			tip.style.display = 'none';
		}
	}
	//---------------------------------------------------------------------------------------------------------------------------

	//顯示預覽照片
	function bindPreviewOnHoverWithFetch(element, videoId) {
		if (!element || !videoId) return;

		let previewBox = document.getElementById('video-preview-box');
		if (!previewBox) {
			previewBox = document.createElement('div');
			previewBox.id = 'video-preview-box';
			Object.assign(previewBox.style, {
				position: 'fixed',
				width: '240px',
				height: '135px',
				backgroundColor: '#000',
				backgroundSize: 'cover',
				backgroundPosition: 'center',
				border: '2px solid #4caf50',
				borderRadius: '6px',
				boxShadow: '0 0 10px rgba(0,255,0,0.7)',
				pointerEvents: 'none',
				opacity: '0',
				transition: 'opacity 0.2s',
				zIndex: '999999',
			});
			document.body.appendChild(previewBox);
		}

		const cache = new Map();

		const fetchPreviewImageUrl = async (id) => {
			if (cache.has(id)) return cache.get(id);

			// 1. 先抓影片頁 HTML，試著找 poster 或 data-poster 中的 .jpg?secure=...
			try {
				const res = await fetch(`https://hanime1.me/watch?v=${id}`);
				const html = await res.text();
				const match = html.match(/(?:poster|data-poster)="([^"]+\.jpg\?secure=[^"]+)"/);
				if (match && match[1]) {
					cache.set(id, match[1]);
					return match[1];
				}
			} catch (err) {
				console.warn('抓取 HTML 中圖片失敗:', err);
			}

			// 2. fallback 嘗試舊式路徑
			const fallbackUrl = `https://vdownload.hembed.com/image/thumbnail/${id}h.jpg`;
			try {
				const headRes = await fetch(fallbackUrl, { method: 'HEAD' });
				if (headRes.ok) {
					cache.set(id, fallbackUrl);
					return fallbackUrl;
				}
			} catch (err) {
				console.warn('HEAD 測試圖片失敗:', err);
			}

			return null;
		};

		let moveListener;
		let currentHoverId = null;
		let hideTimeout;
		element.addEventListener('mouseenter', async (e) => {
			let isCancelled = false;
			const currentEventId = Symbol();
			element._previewEventId = currentEventId;
			// 初始化狀態
			previewBox.style.opacity = '0';
			previewBox.style.backgroundImage = '';
			previewBox.style.backgroundColor = '#111'; // 加入 loading 背景
			//-------------------------------------
			const updatePosition = (ev) => {
				if (!previewBox || element._previewEventId !== currentEventId) return;
				const previewWidth = 240;
				const previewHeight = 135;

				const offsetX = -previewWidth - 20; // 滑鼠左邊一點
				const offsetY = -previewHeight / 2; // 垂直置中

				const left = ev.clientX + offsetX;
				const top = ev.clientY + offsetY;

				previewBox.style.left = `${Math.max(0, left)}px`;
				previewBox.style.top = `${Math.max(0, top)}px`;
			};
			updatePosition(e);
			moveListener = (ev) => updatePosition(ev);
			document.addEventListener('mousemove', moveListener);

			const url = await fetchPreviewImageUrl(videoId);
			if (url) {
				const img = new Image();
				img.onload = () => {
					if (isCancelled || element._previewEventId !== currentEventId) return;
					previewBox.style.backgroundImage = `url("${url}")`;
					previewBox.style.opacity = '1';
				};
				img.onerror = () => {
					if (isCancelled || element._previewEventId !== currentEventId) return;
					previewBox.style.backgroundColor = '#300';
				};
				img.src = url;
			} else {
				previewBox.style.backgroundColor = '#300'; // 無法取得圖片
			}

			// 如果滑鼠沒有移動，也強制讓預覽顯示出來（保底）
			setTimeout(() => {
				if (!isCancelled && element._previewEventId === currentEventId) {
					previewBox.style.opacity = '1';
				}
			}, 500);
		});
		element.addEventListener('mouseleave', () => {
			if (moveListener) {
				document.removeEventListener('mousemove', moveListener);
				moveListener = null;
			}

			// 隱藏預覽框，清除圖片與背景
			previewBox.style.opacity = '0';
			previewBox.style.backgroundImage = '';
			previewBox.style.backgroundColor = '#000';

			// 保險再重設位置（防止留下殘影）
			previewBox.style.left = '-9999px';
			previewBox.style.top = '-9999px';

			// 重設 preview 事件 ID 防止 race condition
			element._previewEventId = null;
		});
	}
	//---------------------------------------------------------------------------------------------------------------------------
	function decodeHTML(html) {
		const div = document.createElement('div');
		div.innerHTML = html;
		return div.textContent || div.innerText || '';
	}
	//---------------------------------------------------------------------------------------------------------------------------

	//去除下載影片名稱非真實名稱的部分
	function cleanFilename(name) {
		return name.replace(/-\(hanime1\.me\)-\d+p\.MP4$/i, '').trim();
	}
	//---------------------------------------------------------------------------------------------------------------------------

	//去除觀看影片名稱多於的部分
	function cleanDisplayName(name) {
		return name.replace(/\s*-\s*H動漫\/裏番\/線上看\s*-\s*Hanime1\.me\s*$/i, '').trim();
	}
	//---------------------------------------------------------------------------------------------------------------------------

	//更新觀看清單
	function updateWatchList() {
		const watchList = document.getElementById('tm-watch-list');
		const watchListContainer = watchList.parentElement; // 觀看清單的外層容器

		const raw = getWatchList();
		const downloaded = getDownloadedList(); // 取得下載清單
		const FollowedList = getFollowedList();
		const storedSettings = JSON.parse(localStorage.getItem('hanimeSettings') || '{}'); //取得設定數據
		scrollPaging_Enabled=storedSettings.scrollPagingEnabled;
		pageSwitch_Delay = storedSettings.pageSwitchdelay;
		const downloadedIds = new Set(downloaded.map(d => d.id));
		const FollowedIds = new Set(FollowedList.map(f => f.id));
		const filtered = currentWatchSearchTerm
		? raw.filter(item => item.name.toLowerCase().includes(currentWatchSearchTerm.toLowerCase()))
		: raw;

		filtered.sort((a, b) => new Date(b.watchedAt) - new Date(a.watchedAt));

		totalWatchPages = Math.ceil(filtered.length / Number(storedSettings.itemsPerPage)) || 1;
		currentWatchPage = Math.min(Math.max(1, currentWatchPage), totalWatchPages);
		const pageItems = filtered.slice((currentWatchPage - 1) * Number(storedSettings.itemsPerPage), currentWatchPage * Number(storedSettings.itemsPerPage));

		watchList.innerHTML = '';
		Object.assign(watchList.style, {
			height: `${Number(storedSettings.listHeight)}px`,
			overflowY: 'auto',
			border: '1px solid rgba(255,255,255,0.1)', //加上一個淡白色透明的邊框，讓區塊更明顯
			paddingRight: '4px',
			scrollBehavior: 'smooth',
		});

		pageItems.forEach(item => {
			const container = document.createElement('div');
			Object.assign(container.style, {
				display: 'flex',
				flexDirection: 'column', // 改成垂直排列，方便放多個橫排元素
				gap: '4px',
				padding: '4px',
				borderBottom: '1px solid rgba(255,255,255,0.1)'
			});

			// 影片標題
			const firstRow = document.createElement('div');
			firstRow.style.display = 'flex';
			firstRow.style.justifyContent = 'space-between';
			firstRow.style.alignItems = 'flex-star';

			// 影片名稱（左）
			const titleLink = document.createElement('a');
			const rawName = item.name || '';
			const displayName = cleanDisplayName(rawName);
			titleLink.href = `https://hanime1.me/watch?v=${item.id}`;
			titleLink.innerHTML = highlightDisplayName(displayName, currentWatchSearchTerm || '');
			titleLink.target = '_blank';
			Object.assign(titleLink.style, {
				/*這一段會讓影片名稱空出右半邊
				flexGrow: '1',  //這段會讓連結填滿影片名稱那行 刪除這段則會讓連結範圍限制在影片名稱
				maxWidth: '75%',
				pointerEvents: 'auto',
				display: 'inline-block',
				*/
				color: '#8cf',
				fontWeight: 'bold',
				fontSize: '15px',
				textDecoration: 'none',
				whiteSpace: 'normal',
				wordBreak: 'break-word',
				overflow: 'visible',
				textOverflow: 'unset',
				marginRight: '8px'
			});
			firstRow.appendChild(titleLink);
			bindPreviewOnHoverWithFetch(titleLink, item.id); // ✅ 加上預覽功能 若不想要此功能刪除這行即可

			const FollowBtn = document.createElement('span');
			const isFollowed = FollowedList.includes(item.id); // 判斷是否已關注
			FollowBtn.textContent = isFollowed ? '❤️' : '🤍';
			FollowBtn.style.cursor = 'pointer';
			FollowBtn.style.color = isFollowed ? 'red' : 'white';
			FollowBtn.title = isFollowed ? '取消關注' : '加入關注';
			if(FollowedIds.has(item.id)){
				FollowBtn.textContent = '❤️';
				FollowBtn.style.color = 'red';
			}
			FollowBtn.onclick = async (e) => {
				e.preventDefault();
				e.stopPropagation();
				const nowFollowed = FollowBtn.textContent === '❤️';
				console.log(nowFollowed);
				if (nowFollowed) {
					FollowBtn.textContent = '🤍';
					FollowBtn.style.color = 'white';
					deleteFollowed(item.id);
				} else {
					FollowBtn.textContent = '❤️';
					FollowBtn.style.color = 'red';
					const title = await fetchTitle(item.id);
					saveFollowed(item.id, title);
				}
				update_Follow_List();
			};

			firstRow.appendChild(FollowBtn);

			container.appendChild(firstRow);

			// 第二行：時間 (左) + 已下載標示 (右)
			const secondRow = document.createElement('div');
			secondRow.style.display = 'flex';
			secondRow.style.justifyContent = 'space-between';
			secondRow.style.alignItems = 'center';

			// 時間（左）
			const timeText = document.createElement('div');
			timeText.textContent = item.watchedAt ? new Date(item.watchedAt).toLocaleString() : '未知時間';
			Object.assign(timeText.style, {
				fontSize: '13px',
				color: '#aaa'
			});
			secondRow.appendChild(timeText);

			// 已下載標示（右，有才顯示）
			if (downloadedIds.has(item.id)) {
				const downloadedMark = document.createElement('span');
				downloadedMark.textContent = '✅ 已下載';
				downloadedMark.style.fontSize = '12px';
				downloadedMark.style.color = '#0f0';
				downloadedMark.style.opacity = '0.8';
				secondRow.appendChild(downloadedMark);
			}

			container.appendChild(secondRow);

			watchList.appendChild(container);
		});

		// ✅ 若不足 storedSettings.itemsPerPage，補空白欄位以保持高度一致-----------
		const missingCount = Number(storedSettings.itemsPerPage) - pageItems.length;
		for (let i = 0; i < missingCount; i++) {
			const placeholder = document.createElement('div');
			Object.assign(placeholder.style, {
				height: '50px', // 每列高度，依照你的項目實際高度調整
				opacity: '0', // 不可見但佔位
				pointerEvents: 'none'
			});
			watchList.appendChild(placeholder);
		}
		//-----------------------------------------------------------
		// 移除舊分頁（避免重複）
		const oldPagination = watchListContainer.querySelector('.watch-pagination');
		if (oldPagination) oldPagination.remove();

		// 建立分頁控制區
		const pagination = document.createElement('div');
		pagination.className = 'watch-pagination'; // watch 分頁專用 class
		pagination.style.textAlign = 'center';
		pagination.style.marginTop = '10px';
		pagination.style.display = 'flex';
		pagination.style.justifyContent = 'center';
		pagination.style.alignItems = 'center';
		pagination.style.gap = '8px';

		const buttonStyle = {
			padding: '6px 10px', //調整按鈕大小
			border: 'none', // ✅ 移除邊框
			borderRadius: '4px', //調整按鈕邊框圓角大小
			background: 'rgba(255, 255, 255, 0.1)', // ✅ 淡白透明背景
			color: '#fff',
			cursor: 'pointer',
			fontSize: '14px',
			backdropFilter: 'blur(2px)', // 可選的玻璃感
			transition: 'background 0.2s, opacity 0.2s'
		};

		const disabledStyle = {
			background: 'rgba(255, 255, 255, 0.1)', // ✅ 更淡
			color: '#aaa',
			cursor: 'not-allowed',
			opacity: '0.5'
		};
		// 只掛一次事件（用 flag 防止重複掛）
		if (!watchList._hasWheelListener) {
			watchList._hasWheelListener = true;

			watchList.addEventListener('scroll', () => {
				const { scrollTop, scrollHeight, clientHeight } = watchList;
				const atBottom = scrollTop + clientHeight >= scrollHeight - 2;
				const atTop = scrollTop <= 2;

				if (atBottom || atTop) {
					if (scrollStateWatch === 1) {
						scrollStateWatch = 2; // 第一次到底或頂部，開始等待
						if (scrollStayTimeoutWatch) clearTimeout(scrollStayTimeoutWatch);
						scrollStayTimeoutWatch = setTimeout(() => {
							scrollStateWatch = 3; // 允許換頁
							scrollStayTimeoutWatch = null;
						}, delayForTrigger);
					}
				} else {
					if (scrollStayTimeoutWatch) {
						clearTimeout(scrollStayTimeoutWatch);
						scrollStayTimeoutWatch = null;
					}
					scrollStateWatch = 1;
				}
			});

			watchList.addEventListener('wheel', (e) => {
				e.stopPropagation();
				const { scrollTop, scrollHeight, clientHeight } = watchList;
				const deltaY = e.deltaY;
				const atBottom = scrollTop + clientHeight >= scrollHeight - 2;
				const atTop = scrollTop <= 2;
				const canScrollDown = scrollHeight > clientHeight && !atBottom;
				const canScrollUp = scrollTop > 0;

				if (!scrollPaging_Enabled) {
					if ((deltaY > 0 && atBottom) || (deltaY < 0 && atTop)) {
						e.preventDefault(); // ✅ 禁止滑動滾出範圍
					}
					return; // ✅ 禁止滑動換頁
				}

				const canPageDown = atBottom && deltaY > 0 && currentWatchPage < totalWatchPages;
				const canPageUp = atTop && deltaY < 0 && currentWatchPage > 1;

				if ((canPageDown && scrollStateWatch === 3) || (canPageUp && scrollStateWatch === 3)) {
					e.preventDefault();

					if (!pageSwitchTimeoutWatch) {
						pageSwitchTimeoutWatch = setTimeout(() => {
							if (deltaY > 0 && currentWatchPage < totalWatchPages) {
								currentWatchPage++;
								scrollToBottomAfterUpdateWatch = false;
							} else if (deltaY < 0 && currentWatchPage > 1) {
								currentWatchPage--;
								scrollToBottomAfterUpdateWatch = true;
							}
							updateWatchList();
							pageSwitchTimeoutWatch = null;

							scrollStateWatch = 1;
							if (scrollStayTimeoutWatch) {
								clearTimeout(scrollStayTimeoutWatch);
								scrollStayTimeoutWatch = null;
							}
						}, Number(pageSwitch_Delay));
					}
				} else {
					if (pageSwitchTimeoutWatch) {
						clearTimeout(pageSwitchTimeoutWatch);
						pageSwitchTimeoutWatch = null;
					}

					if ((deltaY > 0 && !canScrollDown) || (deltaY < 0 && !canScrollUp)) {
						e.preventDefault();
					}
				}
			});
		}

		// 換頁後滾動設定
		if (scrollToBottomAfterUpdateWatch) {
			watchList.scrollTop = watchList.scrollHeight;
		} else {
			watchList.scrollTop = 0;
		}

		// 上一頁按鈕
		const prevBtn = document.createElement('button');
		prevBtn.textContent = '⬅️ 上一頁';
		Object.assign(prevBtn.style, buttonStyle);
		if (currentWatchPage === 1) {
			prevBtn.disabled = true;
			Object.assign(prevBtn.style, disabledStyle);
		}
		prevBtn.onclick = () => {
			if (currentWatchPage > 1) {
				currentWatchPage--;
				updateWatchList();
			}
		};

		// 下一頁按鈕
		const nextBtn = document.createElement('button');
		nextBtn.textContent = '下一頁 ➡️';
		Object.assign(nextBtn.style, buttonStyle);
		if (currentWatchPage === totalWatchPages) {
			nextBtn.disabled = true;
			Object.assign(nextBtn.style, disabledStyle);
		}
		nextBtn.onclick = () => {
			if (currentWatchPage < totalWatchPages) {
				currentWatchPage++;
				updateWatchList();
			}
		};

		// 頁碼輸入框
		const inputWrapper = document.createElement('div');
		inputWrapper.style.display = 'flex';
		inputWrapper.style.alignItems = 'center';
		inputWrapper.style.color = '#ccc';

		const prefix = document.createElement('span');
		prefix.textContent = '第';

		const pageInput = document.createElement('input');
		pageInput.type = 'number';
		pageInput.min = 1;
		pageInput.max = totalWatchPages;
		pageInput.value = currentWatchPage;
		Object.assign(pageInput.style, {
			width: '32px',
			textAlign: 'center',
			margin: '0 4px',
			border: 'none',
			borderBottom: '1px solid #ccc',
			background: 'transparent',
			color: '#fff',
			fontSize: '14px',
			appearance: 'textfield',
		});
		pageInput.onkeydown = (e) => {
			if (e.key === 'Enter') {
				const target = parseInt(pageInput.value);
				if (!isNaN(target) && target >= 1 && target <= totalWatchPages) {
					currentWatchPage = target;
					updateWatchList();
				}
			}
		};

		const suffix = document.createElement('span');
		suffix.textContent = ` / ${totalWatchPages}頁`;

		inputWrapper.appendChild(prefix);
		inputWrapper.appendChild(pageInput);
		inputWrapper.appendChild(suffix);

		pagination.appendChild(prevBtn);
		pagination.appendChild(inputWrapper);
		pagination.appendChild(nextBtn);

		watchListContainer.appendChild(pagination);
	}
	//---------------------------------------------------------------------------------------------------------------------------
	function addWatchRecord(id, name) {
		const list = getWatchList();
		const storedSettings = JSON.parse(localStorage.getItem('hanimeSettings') || '{}');
		const now = new Date().toISOString();
		const idx = list.findIndex(item => item.id === id);

		if (idx >= 0) {
			list[idx].watchedAt = now;
			list[idx].name = name;
		} else {
			list.push({ id, name, watchedAt: now });
		}

		// 按時間排序並限制最大筆數
		list.sort((a, b) => new Date(b.watchedAt) - new Date(a.watchedAt));
		if (list.length > Number(storedSettings.watchMaxRecords)) {
			list.length = Number(storedSettings.watchMaxRecords);
		}

		localStorage.setItem(WATCH_KEY, JSON.stringify(list));
	}
	//---------------------------------------------------------------------------------------------------------------------------

	//影片下載
	async function startDownload(videoId, showTitle = false, currentIndex = null, totalCount = null) {
		showDownloadingTip('loading'); // 這一行也可改成帶參數，或保留原樣

		const rawTitle = await fetchTitle(videoId);
		const dlHTML = await fetch(`https://hanime1.me/download?v=${videoId}`).then(r => r.text());
		const arr = [...dlHTML.matchAll(/data-url="([^"]+?\/(\d+)-(1080p|720p|480p)\.mp4[^"]*)".*?download="([^"]+)"/g)];

		if (!arr.length) {
			showDownloadingTip('error', `❌ 無法找到下載連結（ID: ${videoId}）`);
			return;
		}

		const sel = arr.find(m => m[3] === '1080p') || arr.find(m => m[3] === '720p') || arr[0];
		const quality = sel[3];
		const rawUrl = sel[1].replace(/&amp;/g, '&');
		let linkName = decodeHTML(sel[4] || '').replace(/[\\/:*?"<>|]/g, '').trim();
		if (/^\d+$/.test(linkName)) linkName = '';

		const hasHtmlEntities = /&(?:#\d+|[a-z]+);/i.test(rawTitle);
		const finalName = `${(hasHtmlEntities && linkName ? linkName : rawTitle)}-(hanime1.me)-${quality}.MP4`;

		if (isDownloaded(videoId)) {
			const re = confirm(`⚠️ 此影片已下載過：\n${finalName}\n\n是否重新下載？`);
			if (!re) {
				showDownloadingTip('error', '⏹️ 已取消下載');
				return;
			}
		}

		try {
			await downloadByBlob(rawUrl, finalName, (percent) => {
				if (showTitle) {
					showDownloadingTip('loading', `📥 ${finalName}`, percent, currentIndex, totalCount);
				} else {
					showDownloadingTip('loading', '', percent, currentIndex, totalCount);
				}
			});

			saveDownloaded(videoId, finalName);
			showDownloadingTip('success', `✅ 下載完成：${finalName}`);
			markDownloadedCardById(videoId);
			updatedownloadList();
		} catch (e) {
			console.error(e);
			showDownloadingTip('error', `❌ 下載失敗：${finalName}`);
		}
	}

	//---------------------------------------------------------------------------------------------------------------------------

	//添加已下載圖示
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
	//---------------------------------------------------------------------------------------------------------------------------

	//添加設定圖示----------------------------------------------------------------------------------------------------------------
	function add_settings_icon(searchBarid) {
		// ✅ 設定按鈕（加在搜尋欄左側）
		const searchBar = document.getElementById(searchBarid);
		if (searchBar) {
			let settingsBtn = document.getElementById('tm-settings-btn');
			//if (!settingsBtn) {
			settingsBtn = document.createElement('button');
			settingsBtn.id = 'tm-settings-btn';
			searchBar.insertBefore(settingsBtn, searchBar.firstChild);
			Object.assign(settingsBtn.style, {
				width: '28px',
				height: '28px',
				fontSize: '18px',
				border: 'none',
				borderRadius: '6px',
				cursor: 'pointer',
				background: 'transparent',
				color: '#fff',
				padding: '0',
			});
			// 這裡用 Unicode 齒輪符號，或用圖片都可以
			settingsBtn.textContent = '⚙️';

			settingsBtn.title = '設定';
			//searchBar.appendChild(settingsBtn); //這條代碼會將設定圖示放置在搜尋欄右邊  若要放在左邊則註解這行
			let panel = document.getElementById('tm-settings-panel');

			settingsBtn.onclick = () => {
				panel = document.getElementById('tm-settings-panel');
				if (!panel) {
					createSettingsPanel();
				}
				if (panel) {
					// 切換設定面板的顯示狀態
					panel.remove(); //確實關閉視窗 而不是隱藏
				}
			};
			//}
		}
	}
	//---------------------------------------------------------------------------------------------------------------------------
	function markDownloadedCardById(videoId) {
		document.querySelectorAll(`a.overlay[href*="watch?v=${videoId}"]`).forEach(link => {
			const container = link.closest('.multiple-link-wrapper') || link.parentElement || link;
			addDownloadedBadge(container);
		});
	}

	function markFollowedCardById(videoId) {
		document.querySelectorAll(`a.overlay[href*="watch?v=${videoId}"]`).forEach(link => {
			const container = link.closest('.multiple-link-wrapper') || link.parentElement || link;
		});
	}
	//---------------------------------------------------------------------------------------------------------------------------

	//將清單中與搜尋欄中搜尋文字相同的名稱高亮
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
	//---------------------------------------------------------------------------------------------------------------------------

	//更新下載清單
	function updatedownloadList() {
		const downloadList = document.getElementById('tm-download-list');
		const downloadListContainer = downloadList.parentElement; // 觀看清單的外層容器
		const storedSettings = JSON.parse(localStorage.getItem('hanimeSettings') || '{}');
		scrollPaging_Enabled=storedSettings.scrollPagingEnabled;
		pageSwitch_Delay = storedSettings.pageSwitchdelay;
		let downloaded = getDownloadedList();
		downloaded = downloaded.slice().reverse();//下載清單顯示反轉 早--->晚 變成 晚--->早
		const duplicateIds = JSON.parse(sessionStorage.getItem('tm-import-duplicates') || '[]');
		const watchData = JSON.parse(localStorage.getItem('WATCH_HISTORY_KEY') || '[]');

		Object.assign(downloadList.style, {
			height: `${Number(storedSettings.listHeight)}px`,
			overflowY: 'auto',
			border: '1px solid rgba(255,255,255,0.1)', //加上一個淡白色透明的邊框，讓區塊更明顯
			paddingRight: '4px',
			scrollBehavior: 'smooth',
		});

		// 搜尋邏輯：根據 currentSearchTerm 過濾所有記錄
		if (currentSearchTerm.trim()) {
			const keyword = currentSearchTerm.trim().toLowerCase();
			downloaded = downloaded.filter(item => cleanFilename(item.name).toLowerCase().includes(keyword));
		}

		const totalPages = Math.ceil(downloaded.length / Number(storedSettings.itemsPerPage));
		currentPage = Math.min(Math.max(1, currentPage), totalPages);
		const shouldPaginate = downloaded.length > Number(storedSettings.itemsPerPage);
		if (!shouldPaginate) currentPage = 1;
		if (currentPage > totalPages) currentPage = totalPages || 1;
		downloadList.innerHTML = '';



		// ✅ 建立清單區塊
		const startIndex = (currentPage - 1) * Number(storedSettings.itemsPerPage);

		const endIndex = startIndex + Number(storedSettings.itemsPerPage);
		const currentItems = downloaded.slice(startIndex, endIndex);

		// ➕ 初始化滾動狀態為 1
		scrollStateDownload = 1;

		// 根據滾動方向設定滾動位置
		if (scrollToBottomAfterUpdateDownload) {
			downloadList.scrollTop = downloadList.scrollHeight;
		} else {
			downloadList.scrollTop = 0;
		}

		// ✅ 這裡加入一點延遲後再觸發 scroll（避免 DOM 尚未渲染完全）
		setTimeout(() => {
			downloadList.dispatchEvent(new Event('scroll'));
		}, 50);

		downloadList.addEventListener('scroll', () => {
			const { scrollTop, scrollHeight, clientHeight } = downloadList;
			const atBottom = scrollTop + clientHeight >= scrollHeight - 2;
			const atTop = scrollTop <= 2;

			if (atBottom || atTop) {
				if (scrollStateDownload === 1) {
					scrollStateDownload = 2; // 第一次到底或頂，開始等待
					if (scrollStayTimeoutDownload) clearTimeout(scrollStayTimeoutDownload);
					scrollStayTimeoutDownload = setTimeout(() => {
						scrollStateDownload = 3; // 允許換頁
						scrollStayTimeoutDownload = null;
					}, delayForTrigger);
				}
			} else {
				if (scrollStayTimeoutDownload) {
					clearTimeout(scrollStayTimeoutDownload);
					scrollStayTimeoutDownload = null;
				}
				scrollStateDownload = 1;
			}
		});

		// 改寫 wheel 事件，加入停留等待換頁邏輯
		downloadList.addEventListener('wheel', (e) => {
			const { scrollTop, scrollHeight, clientHeight } = downloadList;
			const deltaY = e.deltaY;

			const atBottom = scrollTop + clientHeight >= scrollHeight - 2;
			const atTop = scrollTop <= 2;

			const canScrollDown = scrollHeight > clientHeight && !atBottom;
			const canScrollUp = scrollTop > 0;

			if (scrollPaging_Enabled) {
				const canPageDown = atBottom && deltaY > 0 && currentPage < totalPages;
				const canPageUp = atTop && deltaY < 0 && currentPage > 1;

				if ((canPageDown && scrollStateDownload === 3) || (canPageUp && scrollStateDownload === 3)) {
					e.preventDefault();

					if (!scrollTimeoutDownload) {
						scrollTimeoutDownload = setTimeout(() => {
							if (deltaY > 0 && currentPage < totalPages) {
								currentPage += 1;
								scrollToBottomAfterUpdateDownload = false;
							} else if (deltaY < 0 && currentPage > 1) {
								currentPage -= 1;
								scrollToBottomAfterUpdateDownload = true;
							}
							updatedownloadList();
							scrollTimeoutDownload = null;

							// 換頁後重置狀態
							scrollStateDownload = 1;
							if (scrollStayTimeoutDownload) {
								clearTimeout(scrollStayTimeoutDownload);
								scrollStayTimeoutDownload = null;
							}
						}, Number(pageSwitch_Delay));
					}
				} else {
					if (scrollTimeoutDownload) {
						clearTimeout(scrollTimeoutDownload);
						scrollTimeoutDownload = null;
					}

					if ((deltaY > 0 && !canScrollDown) || (deltaY < 0 && !canScrollUp)) {
						e.preventDefault();
					}
				}
			} else {
				if ((deltaY > 0 && atBottom) || (deltaY < 0 && atTop)) {
					e.preventDefault();
				}
			}
		}, { passive: false });

		currentItems.forEach(({ id, name }) => {
			const d = document.createElement('div');
			d.className = 'tm-download-item';

			// 影片圖示
			const videoIcon = document.createElement('a');
			videoIcon.textContent = '🎬'; // 影片小圖示，可以換成 <img> 等
			videoIcon.href = `https://hanime1.me/watch?v=${id}`;
			videoIcon.target = '_blank';
			videoIcon.rel = 'noopener noreferrer';
			Object.assign(videoIcon.style, {
				cursor: 'pointer',
				marginRight: '8px',
				fontSize: '16px',
				userSelect: 'none',
				flexShrink: 0,
				color: '#4caf50', // 綠色可自訂
				textDecoration: 'none'
			});
			videoIcon.title = '觀看影片';
			bindPreviewOnHoverWithFetch(videoIcon, id); //顯示預覽照片 若不想要此功能刪除這行即可
			videoIcon.addEventListener('click', (e) => {
				if (e.button === 0) {
					// 左鍵點擊：使用 window.open 並聚焦
					e.preventDefault();
					const win = window.open(videoIcon.href, '_blank');
					if (win) win.focus();
				}
				// 中鍵點擊不要處理，保留瀏覽器預設行為
			});

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

			downloadList.appendChild(d);
		});

		// ✅ 若不足 storedSettings.itemsPerPage，補空白欄位以保持高度一致---------------------
		const missingCount = Number(storedSettings.itemsPerPage) - currentItems.length;
		for (let i = 0; i < missingCount; i++) {
			const placeholder = document.createElement('div');
			Object.assign(placeholder.style, {
				height: '40px', // 每列高度（依你實際高度調整）
				opacity: '0', // 不可見但佔空間
				pointerEvents: 'none' // 避免誤點選
			});
			downloadList.appendChild(placeholder);
		}
		//-------------------------------------------------------------------

		downloadListContainer.appendChild(downloadList);
		if (scrollToBottomAfterUpdateDownload) {
			setTimeout(() => {
				downloadList.scrollTop = downloadList.scrollHeight;
				scrollToBottomAfterUpdateDownload = false;
			}, 0);
		}

		// 在 updatedownloadList() 開頭，先清除觀看列表的分頁區塊
		const oldPagination = downloadListContainer.querySelector('.download-pagination');
		if (oldPagination) oldPagination.remove();

		// ✅ 分頁控制器
		const pagination = document.createElement('div');
		pagination.className = 'download-pagination'; // download 分頁專用 class
		pagination.style.textAlign = 'center';
		pagination.style.marginTop = '10px';
		pagination.style.display = 'flex';
		pagination.style.justifyContent = 'center';
		pagination.style.alignItems = 'center';
		pagination.style.gap = '8px';

		const buttonStyle = {
			padding: '6px 10px', //調整按鈕大小
			border: 'none', // ✅ 移除邊框
			borderRadius: '4px', //調整按鈕邊框圓角大小
			background: 'rgba(255, 255, 255, 0.1)', // ✅ 淡白透明背景
			color: '#fff',
			cursor: 'pointer',
			fontSize: '14px',
			backdropFilter: 'blur(2px)', // 可選的玻璃感
			transition: 'background 0.2s, opacity 0.2s'
		};

		const disabledStyle = {
			background: 'rgba(255, 255, 255, 0.1)', // ✅ 更淡
			color: '#aaa',
			cursor: 'not-allowed',
			opacity: '0.5'
		};

		const prevBtn = document.createElement('button');
		prevBtn.textContent = '⬅️ 上一頁';
		Object.assign(prevBtn.style, buttonStyle);
		if (currentPage === 1) {
			prevBtn.disabled = true;
			Object.assign(prevBtn.style, disabledStyle);
		}
		prevBtn.onclick = () => {
			if (currentPage > 1) {
				currentPage--;
				updatedownloadList();
			}
		};

		const nextBtn = document.createElement('button');
		nextBtn.textContent = '下一頁 ➡️';
		Object.assign(nextBtn.style, buttonStyle);
		if (currentPage === totalPages) {
			nextBtn.disabled = true;
			Object.assign(nextBtn.style, disabledStyle);
		}
		nextBtn.onclick = () => {
			if (currentPage < totalPages) {
				currentPage++;
				updatedownloadList();
			}
		};
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
					updatedownloadList();
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
		downloadListContainer.appendChild(pagination);
	}
	//---------------------------------------------------------------------------------------------------------------------------

	//建立下載紀錄與觀看紀錄介面
	function createDownloadManager() {
		const navIcons = document.querySelectorAll('.nav-icon.pull-right');
		const storedSettings = JSON.parse(localStorage.getItem('hanimeSettings') || '{}');
		const btn = document.createElement('a');
		btn.href = '#';
		btn.className = 'nav-icon pull-right';
		btn.style.paddingLeft = '10px';
		btn.title = '下載紀錄';
		btn.innerHTML = `
  			<span class="material-icons-outlined" style="vertical-align: middle; font-size: 28px;">history</span>
		`;

		// ✅ 插入樣式
		if (!document.getElementById('tm-scroll-style')) {
			const style = document.createElement('style');
			style.id = 'tm-scroll-style';
			style.textContent = `
            #all-list button {
                background: rgba(255,255,255,0.1);
                color: #fff;
                border: none;
                padding: 6px 10px;
                font-weight: bold;
                cursor: pointer;
                border-radius: 4px;
                transition: background 0.2s;
            }

            #all-list button:hover:enabled {
                background: rgba(255,255,255,0.2);
            }

            #all-list button:disabled {
                opacity: 0.4;
                background: rgba(255,255,255,0.1);
                color: #fff;
                cursor: default;
            }


            input[type="number"]::-webkit-inner-spin-button,
            input[type="number"]::-webkit-outer-spin-button {
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

            .highlight {
                color: #f39c12;
                font-weight: bold;
                white-space: inherit;
            }
			#tm-download-list::-webkit-scrollbar {
                width: 8px;
            }
            #tm-download-list::-webkit-scrollbar-track {
                background: rgba(255, 255, 255, 0.05);
            }
            #tm-download-list::-webkit-scrollbar-thumb {
                background: rgba(255, 255, 255, 0.2);
                border-radius: 4px;
            }
            #tm-download-list::-webkit-scrollbar-thumb:hover {
                background: rgba(255, 255, 255, 0.4);
            }
						#tm-download-list {
			  scroll-behavior: auto !important;
			}
			#tm-watch-list::-webkit-scrollbar {
			  width: 8px;
			}
			#tm-watch-list::-webkit-scrollbar-track {
							background: rgba(255, 255, 255, 0.05);
						}
			#tm-watch-list::-webkit-scrollbar-thumb {
			   background: rgba(255, 255, 255, 0.2);
							border-radius: 4px;
			}
			#tm-watch-list::-webkit-scrollbar-thumb:hover {
							background: rgba(255, 255, 255, 0.4);
						}

			#tm-watch-list {
			  scroll-behavior: auto !important;
			}

			`;
			document.head.appendChild(style);
		}

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
			const Follow_panel = document.getElementById('Follow-panel');
			if(Follow_panel && Follow_panel.style.display === 'block')
			{Follow_panel.style.display= 'none';;}
			e.preventDefault();
			panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
			sessionStorage.removeItem('tm-import-duplicates');
			sessionStorage.removeItem('Follow-duplicates');
			updatedownloadList();
		};

		const panel = document.createElement('div');
		panel.id='windows-panel'
		Object.assign(panel.style, {
			position: 'fixed', top: '50px', right: '10px', width: `${Number(storedSettings.listWidth)}px`,
			background: 'rgba(0,0,0,0.85)',color: 'white', padding: '10px',
			borderRadius: '6px', display: 'none', zIndex: 99999
		});

		document.body.appendChild(panel);

		const topBar = document.createElement('div');
		topBar.style.display = 'flex';
		topBar.style.gap = '6px';
		topBar.style.marginBottom = '8px';
		const downloadSearch = document.createElement('input');
		downloadSearch.placeholder = '搜尋下載紀錄...';
		downloadSearch.type = 'search';
		Object.assign(downloadSearch.style, {
			flex: '1',
			padding: '6px',
			borderRadius: '4px',
			border: 'none',
			background: '#333',
			color: '#fff'
		});
		downloadSearch.oninput = () => {
			currentSearchTerm = downloadSearch.value;
			currentPage = 1;
			updatedownloadList();
		};
		const watchSearch = document.createElement('input');
		watchSearch.placeholder = '搜尋觀看紀錄...';
		watchSearch.type = 'search';
		Object.assign(watchSearch.style, {
			flex: '1',
			padding: '6px',
			borderRadius: '4px',
			border: 'none',
			background: '#333',
			color: '#fff',
			display: 'none' // 初始隱藏
		});
		watchSearch.oninput = () => {
			currentWatchSearchTerm = watchSearch.value;
			currentWatchPage = 1;
			updateWatchList();
		};

		topBar.appendChild(downloadSearch);
		topBar.appendChild(watchSearch);

		topBar.id = 'tm-search-bar';
		panel.appendChild(topBar);

		const list = document.createElement('div');
		list.id = 'all-list';
		panel.appendChild(list);

		const tabBar = document.createElement('div');
		tabBar.style.display = 'flex';
		tabBar.style.gap = '8px';
		tabBar.style.marginBottom = '8px';

		const tabDownload = document.createElement('button');
		tabDownload.textContent = '📥 下載紀錄';
		tabDownload.className = 'tm-tab-btn active-tab';

		const tabWatch = document.createElement('button');
		tabWatch.textContent = '👁️ 觀看紀錄';
		tabWatch.className = 'tm-tab-btn';

		[tabDownload, tabWatch].forEach(btn => {
			Object.assign(btn.style, {
				flex: '1',
				padding: '6px',
				borderRadius: '4px',
				border: 'none',
				background: '#222',
				color: '#fff',
				cursor: 'pointer',
				fontWeight: 'bold'
			});
			btn.onmouseenter = () => {
				btn.style.background = '#333';
			};
			btn.onmouseleave = () => {
				btn.style.background = btn.classList.contains('active-tab') ? '#444' : '#222';
			};
		});

		tabBar.appendChild(tabDownload);
		tabBar.appendChild(tabWatch);
		panel.insertBefore(tabBar, list); // 插入在搜尋欄與紀錄列表中間

		const DownloadListContainer = document.createElement('div');
		DownloadListContainer.style.display = 'flex';
		DownloadListContainer.style.flexDirection = 'column';
		DownloadListContainer.style.gap = '6px';

		const DownloadList = document.createElement('div');
		DownloadList.id = 'tm-download-list';
		//這段updateWatchList裡面有 或許可以刪除
		DownloadList.style.display = 'block';
		Object.assign(DownloadList.style, {
			height: `${Number(storedSettings.listHeight)}px`,
			overflowY: 'auto',
			border: '1px solid rgba(255,255,255,0.1)', //加上一個淡白色透明的邊框，讓區塊更明顯
			paddingRight: '4px',
			scrollBehavior: 'smooth',
		});

		DownloadListContainer.appendChild(DownloadList);
		panel.appendChild(DownloadListContainer)

		const watchListContainer = document.createElement('div');
		watchListContainer.style.display = 'flex';
		watchListContainer.style.flexDirection = 'column';
		watchListContainer.style.gap = '6px';

		// 建立觀看清單容器
		const watchList = document.createElement('div');
		watchList.id = 'tm-watch-list';
		//這段updateWatchList裡面有 或許可以刪除
		watchList.style.display = 'none';
		Object.assign(watchList.style, {
			height: `${Number(storedSettings.listHeight)}px`,
			overflowY: 'auto',
			border: '1px solid rgba(255,255,255,0.1)', //加上一個淡白色透明的邊框，讓區塊更明顯
			paddingRight: '4px',
			scrollBehavior: 'smooth',
		});

		// 把 watchList 放進 watchListContainer 裡
		watchListContainer.appendChild(watchList);

		// 再把 watchListContainer 插入到 panel 內合適位置
		// 假設 clearDownloadBtn 是 panel 內已存在的節點
		panel.appendChild(watchListContainer)



		// 切換邏輯
		tabDownload.onclick = () => {
			currentTab='download';
			tabDownload.classList.add('active-tab');
			tabWatch.classList.remove('active-tab');

			document.getElementById('tm-download-list').style.display = 'block';
			document.getElementById('tm-watch-list').style.display = 'none';
			downloadSearch.style.display = 'block';
			watchSearch.style.display = 'none';
			DownloadListContainer.style.display = 'block';
			watchListContainer.style.display = 'none';

			updatedownloadList();
		};

		tabWatch.onclick = () => {
			currentTab='watch';
			tabDownload.classList.remove('active-tab');
			tabWatch.classList.add('active-tab');
			document.getElementById('tm-download-list').style.display = 'none';
			document.getElementById('tm-watch-list').style.display = 'block';
			downloadSearch.style.display = 'none';
			watchSearch.style.display = 'block';
			DownloadListContainer.style.display = 'none';
			watchListContainer.style.display = 'block';

			sessionStorage.removeItem('tm-import-duplicates');

			// 清除所有紅色樣式（例如 .duplicate class）
			//document.querySelectorAll('.download-item.duplicate').forEach(el => {
			//el.classList.remove('duplicate');
			//});
			updateWatchList();
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
			const h1Title = document.querySelector('h1')?.textContent?.trim();
			const fallbackTitle = document.querySelector('title')?.textContent?.trim();
			const name = h1Title || fallbackTitle || '';
			if (name) {
				addWatchRecord(v, name);
			}
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
					flexShrink: 0,
					verticalAlign: 'middle', // 保證 label 文字垂直居中
				});
				sb.after(b);
				b.onclick = () => startDownload(v);
				if (isDownloaded(v)) markDownloadedCardById(v);
			}
		}
	});

	observer.observe(document.body, { childList: true, subtree: true });

	createDownloadManager();
	createFollowManager();
	add_settings_icon('tm-search-bar');
	add_settings_icon('Follow_Search-bar');
	//---------------------------------------------------------------------------------------------------------------------------

	//建立關注清單
	function createFollowManager() {

		const filtered = currentWatchSearchTerm
		const storedSettings = JSON.parse(localStorage.getItem('hanimeSettings') || '{}');
		// 創建「關注清單」按鈕
		const FollowBtn = document.createElement('a');
		FollowBtn.href = '#';
		FollowBtn.className = 'nav-icon pull-right';
		FollowBtn.paddingLeft = '10px';
		FollowBtn.title = '關注清單';
		FollowBtn.innerHTML = `
        <span class="material-icons-outlined" style="vertical-align: middle; font-size: 28px;">favorite_border</span>
    `;

		const style = document.createElement('style');
		style.id = 'tm-scroll-style';
		style.textContent = `
            #Follow-windows button {
                background: rgba(255,255,255,0.1);
                color: #fff;
                border: none;
                padding: 6px 10px;
                font-weight: bold;
                cursor: pointer;
                border-radius: 4px;
                transition: background 0.2s;
            }

            #Follow-windows button:hover:enabled {
                background: rgba(255,255,255,0.2);
            }

            #Follow-windows button:disabled {
                opacity: 0.4;
                background: rgba(255,255,255,0.1);
                color: #fff;
                cursor: default;
            }


            input[type="number"]::-webkit-inner-spin-button,
            input[type="number"]::-webkit-outer-spin-button {
                -webkit-appearance: none;
                margin: 0;
            }

            #Follow_Search-bar {
                display: flex;
                align-items: center;
                gap: 4px;
            }

            #Follow_Search-bar input[type="text"] {
                flex: 1;
                width: calc(100% - 40px);
            }

            .highlight {
                color: #f39c12;
                font-weight: bold;
                white-space: inherit;
            }
			#Follow-list::-webkit-scrollbar {
                width: 8px;
            }
            #Follow-list::-webkit-scrollbar-track {
                background: rgba(255, 255, 255, 0.05);
            }
            #Follow-list::-webkit-scrollbar-thumb {
                background: rgba(255, 255, 255, 0.2);
                border-radius: 4px;
            }
            #Follow-list::-webkit-scrollbar-thumb:hover {
                background: rgba(255, 255, 255, 0.4);
            }
			#Follow-list {
			  scroll-behavior: auto !important;
			}

			`;
		document.head.appendChild(style);



		/*const Follow_wrapper = document.createElement('div');
		Follow_wrapper.style.display = 'inline-block';
		Follow_wrapper.style.verticalAlign = 'middle';
		Follow_wrapper.style.marginLeft = '8px';
		Follow_wrapper.style.appendChild(followBtn);*/
		// 新增支援首頁與其他頁導覽列
		const Follow_navContainer =
			  document.getElementById('main-nav') ||
			  document.getElementById('main-nav-home') ||
			  document.body;
		//Follow_navContainer.appendChild(Follow_wrapper);

		// 插入 followWrapper 到容器中
		if (Follow_navContainer) Follow_navContainer.appendChild(FollowBtn);
		else document.body.appendChild(FollowBtn); // Fallback
		FollowBtn.onclick = (e) => {
			const Download_panel = document.getElementById('windows-panel');
			if(Download_panel && Download_panel.style.display === 'block')
			{Download_panel.style.display= 'none';}
			e.preventDefault();
			Follow_Panel.style.display = Follow_Panel.style.display === 'none' ? 'block' : 'none';
			sessionStorage.removeItem('tm-import-duplicates');
			sessionStorage.removeItem('Follow-duplicates');
			update_Follow_List();
		};

		// 創建關注面板
		const Follow_Panel = document.createElement('div');
		Follow_Panel.id = 'Follow-panel';
		Object.assign(Follow_Panel.style, {
			position: 'fixed',
			top: '50px',
			right: '10px',
			width: `${Number(storedSettings.listWidth)}px`,
			background: 'rgba(0,0,0,0.85)',
			color: 'white',
			padding: '10px',
			borderRadius: '6px',
			display: 'none',
			zIndex: 99999
		});

		document.body.appendChild(Follow_Panel);

		const topBar = document.createElement('div');
		topBar.style.display = 'flex';
		topBar.style.gap = '6px';
		topBar.style.marginBottom = '8px';
		const Follow_Search = document.createElement('input');
		Follow_Search.placeholder = '搜尋關注紀錄...';
		Follow_Search.type = 'search';
		Object.assign(Follow_Search.style, {
			flex: '1',
			padding: '6px',
			borderRadius: '4px',
			border: 'none',
			background: '#333',
			color: '#fff'
		});
		Follow_Search.oninput = () => {
			Follow_SearchTerm = Follow_Search.value;
			Follow_Page = 1;
			update_Follow_List();
		};

		topBar.appendChild(Follow_Search);
		topBar.id = 'Follow_Search-bar';
		Follow_Panel.appendChild(topBar);

		const Follow_download_icon= document.createElement('button');
		Follow_download_icon.id = 'Follow-download-icon';

		Object.assign(Follow_download_icon.style, {
			width: '28px',
			height: '28px',
			fontSize: '18px',
			border: 'none',
			borderRadius: '6px',
			cursor: 'pointer',
			background: 'transparent',
			color: '#fff',
			padding: '0',
		});

		Follow_download_icon.textContent = '⬇️';
		Follow_download_icon.title = '下載關注清單中全部影片';
		topBar.appendChild(Follow_download_icon);

		Follow_download_icon.onclick = async () => {
			const downloaded = getDownloadedList(); // 取得下載清單
			const FollowedList = getFollowedList();
			const downloadedIds = new Set(downloaded.map(d => d.id));
			const FollowedIds = FollowedList.map(item => item.id);
			const toDownload = FollowedIds.filter(id => !downloadedIds.has(id));
			const totalCount = toDownload.length;
			for (let i = 0; i < totalCount; i++) {
				await startDownload(toDownload[i], true, i + 1, totalCount);
			}
		};

		const Follow_Windows = document.createElement('div');
		Follow_Windows.id = 'Follow-windows';
		Follow_Panel.appendChild(Follow_Windows);

		const Follow_List_Container = document.createElement('div');
		Follow_List_Container.style.display = 'flex';
		Follow_List_Container.style.flexDirection = 'column';
		Follow_List_Container.style.gap = '6px';

		const Follow_List = document.createElement('div');
		Follow_List.id = 'Follow-list';
		//這段updateWatchList裡面有 或許可以刪除
		Follow_List.style.display = 'block';
		Object.assign(Follow_List.style, {
			height: `${Number(storedSettings.listHeight)}px`,
			overflowY: 'auto',
			border: '1px solid rgba(255,255,255,0.1)', //加上一個淡白色透明的邊框，讓區塊更明顯
			paddingRight: '4px',
			scrollBehavior: 'smooth',
		});

		Follow_List_Container.appendChild(Follow_List);
		Follow_Panel.appendChild(Follow_List_Container);
	}
	//---------------------------------------------------------------------------------------------------------------------------
	const Follow_observer = new MutationObserver(() => {

		document.querySelectorAll('a.overlay[href*="watch?v="]').forEach(link => {
			if (link.dataset.follow) return;

			const id = link.href.match(/v=(\d+)/)?.[1];
			if (!id) return;
			link.dataset.follow = '1';

			const Follow_container =
				  link.closest('.multiple-link-wrapper') ||
				  link.closest('.card-mobile-panel') ||
				  link.parentElement;

			if (!Follow_container) return;

			// 🛑 避免重複插入按鈕
			if (Follow_container.querySelector('.Follow-icon')) return;

			// ➕ 建立愛心按鈕
			const Follow_icon = document.createElement('button');
			Follow_icon.className = 'Follow-icon';

			// 🔎 根據是否已關注設定圖示與顏色
			const isFollowed = getFollowedList().some(item => item.id === id);
			Follow_icon.textContent = isFollowed ? '❤️' : '🤍';
			Follow_icon.style.color = isFollowed ? 'red' : 'white';

			Object.assign(Follow_icon.style, {
				position: 'absolute',
				top: '5px',
				left: '5px',
				zIndex: 999,
				background: 'none',
				padding: '3px 6px',
				borderRadius: '4px',
				fontSize: '14px',
				border: 'none',
				cursor: 'pointer'
			});

			// 📌 設定容器為相對定位以正確放置按鈕
			if (getComputedStyle(Follow_container).position === 'static') {
				Follow_container.style.position = 'relative';
			}

			Follow_container.appendChild(Follow_icon);

			// ✅ 點擊切換狀態與清單儲存
			Follow_icon.onclick =async e => {
				e.preventDefault();
				e.stopPropagation();
				const nowFollowed = Follow_icon.textContent === '❤️';

				if (nowFollowed) {
					Follow_icon.textContent = '🤍';
					Follow_icon.style.color = 'white';
					deleteFollowed(id);
					update_Follow_List();
					updateWatchList();
				} else {
					Follow_icon.textContent = '❤️';
					Follow_icon.style.color = 'red';
					const title = await fetchTitle(id);

					saveFollowed(id, title);
					update_Follow_List();
					updateWatchList();
				}
			};
		});
	});

	Follow_observer.observe(document.body, { childList: true, subtree: true });
	//---------------------------------------------------------------------------------------------------------------------------

	//關注清單更新
	function update_Follow_List() {
		const Follow_List = document.getElementById('Follow-list');
		const Follow_List_Container = Follow_List.parentElement; // 觀看清單的外層容器
		const storedSettings = JSON.parse(localStorage.getItem('hanimeSettings') || '{}');
		scrollPaging_Enabled=storedSettings.scrollPagingEnabled;
		pageSwitch_Delay = storedSettings.pageSwitchdelay;
		let Followed = getFollowedList();
		Followed = Followed.slice().reverse();//下載清單顯示反轉 早--->晚 變成 晚--->早
		const duplicateIds = JSON.parse(sessionStorage.getItem('Follow-duplicates') || '[]');

		Object.assign(Follow_List.style, {
			height: `${Number(storedSettings.listHeight)}px`,
			overflowY: 'auto',
			border: '1px solid rgba(255,255,255,0.1)', //加上一個淡白色透明的邊框，讓區塊更明顯
			paddingRight: '4px',
			scrollBehavior: 'smooth',
		});

		if (Follow_SearchTerm.trim()) {
			const keyword = Follow_SearchTerm.trim().toLowerCase();
			Followed = Followed.filter(item => cleanFilename(item.name).toLowerCase().includes(keyword));
		}

		const totalPages = Math.ceil(Followed.length / Number(storedSettings.itemsPerPage));
		Follow_Page = Math.min(Math.max(1, Follow_Page), totalPages);
		const shouldPaginate = Followed.length > Number(storedSettings.itemsPerPage);
		if (!shouldPaginate) Follow_Page = 1;
		if (Follow_Page > totalPages) Follow_Page = totalPages || 1;
		Follow_List.innerHTML = '';

		const startIndex = (Follow_Page - 1) * Number(storedSettings.itemsPerPage);

		const endIndex = startIndex + Number(storedSettings.itemsPerPage);
		const currentItems = Followed.slice(startIndex, endIndex);

		// ➕ 初始化滾動狀態為 1
		scrollState_Follow = 1;

		// 根據滾動方向設定滾動位置
		if (scrollToBottomAfterUpdate_Follow) {
			Follow_List.scrollTop = Follow_List.scrollHeight;
		} else {
			Follow_List.scrollTop = 0;
		}

		// ✅ 這裡加入一點延遲後再觸發 scroll（避免 DOM 尚未渲染完全）
		setTimeout(() => {
			Follow_List.dispatchEvent(new Event('scroll'));
		}, 50);

		Follow_List.addEventListener('scroll', () => {
			const { scrollTop, scrollHeight, clientHeight } = Follow_List;
			const atBottom = scrollTop + clientHeight >= scrollHeight - 2;
			const atTop = scrollTop <= 2;

			if (atBottom || atTop) {
				if (scrollState_Follow === 1) {
					scrollState_Follow = 2; // 第一次到底或頂，開始等待
					if (scrollStayTimeout_Follow) clearTimeout(scrollStayTimeout_Follow);
					scrollStayTimeout_Follow = setTimeout(() => {
						scrollState_Follow = 3; // 允許換頁
						scrollStayTimeout_Follow = null;
					}, delayForTrigger);
				}
			} else {
				if (scrollStayTimeout_Follow) {
					clearTimeout(scrollStayTimeout_Follow);
					scrollStayTimeout_Follow = null;
				}
				scrollState_Follow= 1;
			}
		});

		// 改寫 wheel 事件，加入停留等待換頁邏輯
		Follow_List.addEventListener('wheel', (e) => {
			const { scrollTop, scrollHeight, clientHeight } = Follow_List;
			const deltaY = e.deltaY;

			const atBottom = scrollTop + clientHeight >= scrollHeight - 2;
			const atTop = scrollTop <= 2;

			const canScrollDown = scrollHeight > clientHeight && !atBottom;
			const canScrollUp = scrollTop > 0;

			if (scrollPaging_Enabled) {
				const canPageDown = atBottom && deltaY > 0 && Follow_Page < totalPages;
				const canPageUp = atTop && deltaY < 0 && Follow_Page > 1;

				if ((canPageDown && scrollState_Follow === 3) || (canPageUp && scrollState_Follow === 3)) {
					e.preventDefault();

					if (!scrollTimeout_Follow) {
						scrollTimeout_Follow = setTimeout(() => {
							if (deltaY > 0 && Follow_Page < totalPages) {
								Follow_Page += 1;
								scrollToBottomAfterUpdate_Follow = false;
							} else if (deltaY < 0 && Follow_Page > 1) {
								Follow_Page -= 1;
								scrollToBottomAfterUpdate_Follow = true;
							}
							update_Follow_List();
							scrollTimeout_Follow = null;

							// 換頁後重置狀態
							scrollState_Follow = 1;
							if (scrollStayTimeout_Follow) {
								clearTimeout(scrollStayTimeout_Follow);
								scrollStayTimeout_Follow = null;
							}
						}, Number(pageSwitch_Delay));
					}
				} else {
					if (scrollTimeout_Follow) {
						clearTimeout(scrollTimeout_Follow);
						scrollTimeout_Follow = null;
					}

					if ((deltaY > 0 && !canScrollDown) || (deltaY < 0 && !canScrollUp)) {
						e.preventDefault();
					}
				}
			} else {
				if ((deltaY > 0 && atBottom) || (deltaY < 0 && atTop)) {
					e.preventDefault();
				}
			}
		}, { passive: false });

		currentItems.forEach(({ id, name }) => {
			const Follow_item = document.createElement('div');
			Follow_item.className = 'Follow-item';

			const Follow_videoIcon = document.createElement('a');
			Follow_videoIcon.textContent = '🎬'; // 影片小圖示，可以換成 <img> 等
			Follow_videoIcon.href = `https://hanime1.me/watch?v=${id}`;
			Follow_videoIcon.target = '_blank';
			Follow_videoIcon.rel = 'noopener noreferrer';
			Object.assign(Follow_videoIcon.style, {
				cursor: 'pointer',
				marginRight: '8px',
				fontSize: '16px',
				userSelect: 'none',
				flexShrink: 0,
				color: '#4caf50', // 綠色可自訂
				textDecoration: 'none'
			});
			Follow_videoIcon.title = '觀看影片';
			bindPreviewOnHoverWithFetch(Follow_videoIcon, id); //顯示預覽照片 若不想要此功能刪除這行即可
			Follow_videoIcon.addEventListener('click', (e) => {
				if (e.button === 0) {
					// 左鍵點擊：使用 window.open 並聚焦
					e.preventDefault();
					const win = window.open(Follow_videoIcon.href, '_blank');
					if (win) win.focus();
				}
				// 中鍵點擊不要處理，保留瀏覽器預設行為
			});

			const Follow_text_Wrapper = document.createElement('div');
			Follow_text_Wrapper.style.flex = '1';
			Follow_text_Wrapper.style.whiteSpace = 'normal';
			Follow_text_Wrapper.style.wordBreak = 'break-word';

			let displayName = cleanFilename(name);
			if (Follow_SearchTerm.trim()) {
				displayName = highlightDisplayName(displayName, Follow_SearchTerm);
			}
			Follow_text_Wrapper.innerHTML = displayName;

			if (duplicateIds.includes(id)) {
				Follow_text_Wrapper.style.color = 'red';
			}

			Object.assign(Follow_item.style, {
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
			del.onclick = () => deleteFollowed(id);
			Follow_item.appendChild(Follow_videoIcon);
			Follow_item.appendChild(Follow_text_Wrapper);
			Follow_item.appendChild(del);
			Follow_List.appendChild(Follow_item);
		});
		const missingCount = Number(storedSettings.itemsPerPage) - currentItems.length;
		for (let i = 0; i < missingCount; i++) {
			const Follow_placeholder = document.createElement('div');
			Object.assign(Follow_placeholder.style, {
				height: '40px', // 每列高度（依你實際高度調整）
				opacity: '0', // 不可見但佔空間
				pointerEvents: 'none' // 避免誤點選
			});
			Follow_List.appendChild(Follow_placeholder);
		}
		Follow_List_Container.appendChild(Follow_List);

		if (scrollToBottomAfterUpdate_Follow) {
			setTimeout(() => {
				Follow_List.scrollTop = Follow_List.scrollHeight;
				scrollToBottomAfterUpdate_Follow = false;
			}, 0);
		}

		// 在 updatedownloadList() 開頭，先清除觀看列表的分頁區塊
		const oldPagination = Follow_List_Container.querySelector('.Follow-pagination');
		if (oldPagination) oldPagination.remove();

		const Follow_pagination = document.createElement('div');
		Follow_pagination.className = 'Follow-pagination'; // download 分頁專用 class
		Follow_pagination.style.textAlign = 'center';
		Follow_pagination.style.marginTop = '10px';
		Follow_pagination.style.display = 'flex';
		Follow_pagination.style.justifyContent = 'center';
		Follow_pagination.style.alignItems = 'center';
		Follow_pagination.style.gap = '8px';

		const buttonStyle = {
			padding: '6px 10px', //調整按鈕大小
			border: 'none', // ✅ 移除邊框
			borderRadius: '4px', //調整按鈕邊框圓角大小
			background: 'rgba(255, 255, 255, 0.1)', // ✅ 淡白透明背景
			color: '#fff',
			cursor: 'pointer',
			fontSize: '14px',
			backdropFilter: 'blur(2px)', // 可選的玻璃感
			transition: 'background 0.2s, opacity 0.2s'
		};

		const disabledStyle = {
			background: 'rgba(255, 255, 255, 0.1)', // ✅ 更淡
			color: '#aaa',
			cursor: 'not-allowed',
			opacity: '0.5'
		};

		const Follow_prevBtn = document.createElement('button');
		Follow_prevBtn.textContent = '⬅️ 上一頁';
		Object.assign(Follow_prevBtn.style, buttonStyle);
		if (Follow_Page === 1) {
			Follow_prevBtn.disabled = true;
			Object.assign(Follow_prevBtn.style, disabledStyle);
		}
		Follow_prevBtn.onclick = () => {
			if (Follow_Page > 1) {
				Follow_Page--;
				update_Follow_List();
			}
		};

		const Follow_nextBtn = document.createElement('button');
		Follow_nextBtn.textContent = '下一頁 ➡️';
		Object.assign(Follow_nextBtn.style, buttonStyle);
		if (Follow_Page === totalPages) {
			Follow_nextBtn.disabled = true;
			Object.assign(Follow_nextBtn.style, disabledStyle);
		}
		Follow_nextBtn.onclick = () => {
			if (Follow_Page < totalPages) {
				Follow_Page++;
				update_Follow_List();
			}
		};

		const Follow_inputWrapper = document.createElement('div');
		Follow_inputWrapper.style.display = 'flex';
		Follow_inputWrapper.style.alignItems = 'center';
		Follow_inputWrapper.style.color = '#ccc';

		const Follow_prefix = document.createElement('span');
		Follow_prefix.textContent = '第';

		const Follow_pageInput = document.createElement('input');
		Follow_pageInput.type = 'number';
		Follow_pageInput.min = 1;
		Follow_pageInput.max = totalPages;
		Follow_pageInput.value = Follow_Page;
		Object.assign(Follow_pageInput.style, {
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
		Follow_pageInput.onkeydown = (e) => {
			if (e.key === 'Enter') {
				const target = parseInt(Follow_pageInput.value);
				if (!isNaN(target) && target >= 1 && target <= totalPages) {
					Follow_Page = target;
					update_Follow_List();
				}
			}
		};

		const Follow_suffix = document.createElement('span');
		Follow_suffix.textContent = ` / ${totalPages}頁`;

		Follow_inputWrapper.appendChild(Follow_prefix);
		Follow_inputWrapper.appendChild(Follow_pageInput);
		Follow_inputWrapper.appendChild(Follow_suffix);
		Follow_pagination.appendChild(Follow_prevBtn);
		Follow_pagination.appendChild(Follow_inputWrapper);
		Follow_pagination.appendChild(Follow_nextBtn);
		Follow_List_Container.appendChild(Follow_pagination);
	}
	//---------------------------------------------------------------------------------------------------------------------------

	//建立設定介面
	function createSettingsPanel() {
		const windows_panel = document.getElementById('windows-panel');
		const Follow_panel = document.getElementById('Follow-panel');
		const storedSettings = JSON.parse(localStorage.getItem('hanimeSettings') || '{}');
		const downloadList = document.getElementById('tm-download-list');
		const downloadListContainer = downloadList.parentElement; // 觀看清單的外層容器
		const watchList = document.getElementById('tm-watch-list');
		const watchListContainer = watchList.parentElement; // 觀看清單的外層容器
		let panel = document.getElementById('tm-settings-panel');


		if (!panel) {
			panel = document.createElement('div');
			panel.id = 'tm-settings-panel';

			Object.assign(panel.style, {
				position: 'fixed',
				top: '50%',
				left: '50%',
				transform: 'translate(-50%, -50%)',
				width: '360px',
				background: 'rgba(0,0,0,0.9)',
				color: 'white',
				padding: '20px 24px 24px',
				borderRadius: '8px',
				zIndex: 100000,
				boxSizing: 'border-box',
				boxShadow: '0 0 12px #000',
				display: 'flex',
				flexDirection: 'column',
				gap: '18px',
				fontSize: '14px',
				userSelect: 'none',
				fontFamily: 'Arial, sans-serif',
			});

			// 右上角關閉按鈕
			const closeBtn = document.createElement('button');
			closeBtn.textContent = '×';
			Object.assign(closeBtn.style, {
				position: 'absolute',
				top: '8px',
				right: '8px',
				background: 'transparent',
				border: 'none',
				color: 'red',
				fontSize: '26px',
				cursor: 'pointer',
				userSelect: 'none',
				lineHeight: '1',
				padding: '0',
				width: '32px',
				height: '32px',
				textAlign: 'center',
				zIndex: 101, // 确保 `x` 按钮在其他元素之上
			});
			closeBtn.title = '關閉設定';
			panel.appendChild(closeBtn);

			// 表單區塊
			const form = document.createElement('div');

			Object.assign(form.style, {
				display: 'flex',
				flexDirection: 'column',
				gap: '14px',
				paddingTop: '40px', //確保表單內容不會被遮擋
				paddingTop: '24px', //調整內邊距，確保表單內容與按鈕的距離合適
			});

			// --- 清單大小: 長 | 輸入框 | 寬 | 輸入框 ----------------------------------------------------
			const sizeContainer = document.createElement('div');

			Object.assign(sizeContainer.style, {
				display: 'flex',
				alignItems: 'center', // 垂直居中
				gap: '8px', // 文字與輸入框之間的間距
			});

			// 長的 label 設置
			const labelLength = document.createElement('label');
			labelLength.textContent = '清單大小: 長';

			Object.assign(labelLength.style, {
				minWidth: '80px',
				flexShrink: '0',
				textAlign: 'right', // 確保文字對齊右側
				margin: '0', // 防止 margin 引起偏移
				verticalAlign: 'middle', // 保證 label 文字垂直居中
			});

			// 長的輸入框
			const inputLength = document.createElement('input');
			inputLength.type = 'number';
			inputLength.min = 100;

			Object.assign(inputLength.style, {
				width: '90px',
				height: '28px', // 確保高度一致
				borderRadius: '4px',
				border: 'none',
				padding: '0 8px', // 保持內邊距一致
				backgroundColor: '#222',
				color: 'white',
				textAlign:'center',
			});

			// 寬的 label 設置
			const labelWidth = document.createElement('label');
			labelWidth.textContent = '寬';

			Object.assign(labelWidth.style, {
				minWidth: '24px',
				flexShrink: '0',
				textAlign: 'right', // 確保文字對齊右側
				margin: '0', // 防止 margin 引起偏移
				verticalAlign: 'middle', // 保證 label 文字垂直居中
			});

			// 寬的輸入框
			const inputWidth = document.createElement('input');
			inputWidth.type = 'number';
			inputWidth.min = 100;

			Object.assign(inputWidth.style, {
				width: '90px',
				height: '28px', // 確保高度一致
				borderRadius: '4px',
				border: 'none',
				padding: '0 8px', // 保持內邊距一致
				backgroundColor: '#222',
				color: 'white',
				textAlign:'center',
			});

			// 添加到容器
			sizeContainer.append(labelLength, inputLength, labelWidth, inputWidth);
			form.appendChild(sizeContainer);
			//----------------------------------------------------------------------------------------

			// 分頁顯示筆數（細底線輸入框）
			// 分頁顯示筆數（label + input 同行）
			const pageCountContainer = document.createElement('div');

			Object.assign(pageCountContainer.style, {
				display: 'flex',
				alignItems: 'center',
				marginBottom: '8px',
			});

			const labelPageCount = document.createElement('label');
			labelPageCount.textContent = '分頁顯示筆數:';

			Object.assign(labelPageCount.style, {
				marginRight: '10px',
				whiteSpace: 'nowrap',
				color: 'white',
				margin: '0', // 去掉 margin 讓它們不會被推開
				verticalAlign: 'middle' // 垂直居中對齊
			});

			const inputPageCount = document.createElement('input');
			inputPageCount.type = 'number';
			inputPageCount.min = 1;

			Object.assign(inputPageCount.style, {
				width: '60px',
				textAlign: 'center', // ✅ 數字置中
				border: 'none',
				borderBottom: '1px solid white',
				background: 'transparent',
				color: 'white',
				fontSize: '14px',
				padding:'2px 4px',
				appearance: 'textfield',
				outline: 'none'
			});

			pageCountContainer.append(labelPageCount, inputPageCount);
			form.appendChild(pageCountContainer);

			// 觀看紀錄最大筆數（label + input 同行）
			const watchCountContainer = document.createElement('div');

			Object.assign(watchCountContainer.style, {
				display: 'flex',
				alignItems: 'center',
				marginBottom: '8px',
			});

			const labelWatchCount = document.createElement('label');
			labelWatchCount.textContent = '觀看紀錄最大紀錄筆數:';

			Object.assign(labelWatchCount.style, {
				marginRight: '10px',
				whiteSpace: 'nowrap',
				color: 'white',
				margin: '0', // 去掉 margin 讓它們不會被推開
				verticalAlign: 'middle' // 垂直居中對齊
			});

			const inputWatchCount = document.createElement('input');
			inputWatchCount.type = 'number';
			inputWatchCount.min = 1;

			Object.assign(inputWatchCount.style, {
				width: '60px',
				textAlign: 'center', // ✅ 數字置中
				border: 'none',
				borderBottom: '1px solid white',
				background: 'transparent',
				color: 'white',
				fontSize: '14px',
				padding:'2px 4px',
				appearance: 'textfield',
				outline: 'none'
			});

			watchCountContainer.append(labelWatchCount, inputWatchCount);
			form.appendChild(watchCountContainer);

			// 滾動換頁 checkbox + 文字在同一行-------------------------------------------------------
			const scrollPagingContainer = document.createElement('div');

			Object.assign(scrollPagingContainer.style, {
				display: 'flex',
				alignItems: 'center', // 保證元素在同一條線上對齊
				gap: '6px',

			});

			const scrollPagingCheckbox = document.createElement('input');
			scrollPagingCheckbox.type = 'checkbox';
			scrollPagingCheckbox.id = 'scroll-paging-checkbox';

			Object.assign(scrollPagingCheckbox.style, {
				width: '18px',
				height: '18px',
				cursor: 'pointer', // 確保文字的 line-height 與 checkbox 一致
				margin: '0', // 去掉 margin 讓它們不會被推開
				verticalAlign: 'middle' // 垂直居中對齊
			});

			const scrollPagingLabel = document.createElement('label');
			scrollPagingLabel.htmlFor = 'scroll-paging-checkbox';
			scrollPagingLabel.textContent = '滾動換頁';

			Object.assign(scrollPagingLabel.style, {
				cursor: 'pointer',
				userSelect: 'none',
				lineHeight: '18px', // 確保文字的 line-height 與 checkbox 一致
				margin: '0', // 去掉 margin 讓它們不會被推開
				verticalAlign: 'middle' // 確保文字的垂直中心對齊 checkbox
			});

			scrollPagingContainer.append(scrollPagingLabel, scrollPagingCheckbox);
			form.appendChild(scrollPagingContainer);
			scrollPagingCheckbox.addEventListener('change', updateDelayUIState); //監聽checkbox狀態

			const pageSwitchDelayContainer = document.createElement('div');

			Object.assign(pageSwitchDelayContainer.style, {
				display: 'flex',
				alignItems: 'center',
				gap: '6px',
				marginLeft: '12px' // 與滾動換頁 checkbox 保持距離
			});

			const pageSwitchDelayLabel = document.createElement('label');
			pageSwitchDelayLabel.textContent = '延遲(ms)：';

			Object.assign(pageSwitchDelayLabel.style, {
				fontSize: '14px',
				margin: '0',
				verticalAlign: 'middle'
			});

			const pageSwitchDelayInput = document.createElement('input');
			pageSwitchDelayInput.type = 'number';
			pageSwitchDelayInput.min = 100;
			pageSwitchDelayInput.max = 5000;
			pageSwitchDelayInput.step = 100;

			Object.assign(pageSwitchDelayInput.style, {
				width: '60px',
				textAlign: 'center',
				border: 'none',
				borderBottom: '1px solid #ccc',
				background: 'transparent',
				color: '#fff',
				fontSize: '14px',
				appearance: 'textfield',
				outline: 'none'
			});

			pageSwitchDelayContainer.append(pageSwitchDelayLabel, pageSwitchDelayInput);

			// 👉 插入到 scrollPagingContainer 後面
			scrollPagingContainer.appendChild(pageSwitchDelayContainer);
			/*
			const savedScrollPagingEnabled = localStorage.getItem(SCROLL_PIN_KEY) !== 'false';
			scrollPagingCheckbox.checked = savedScrollPagingEnabled; // 初始化狀態

			// 儲存滾動換頁的選擇狀態
			scrollPagingCheckbox.onchange = () => {
				localStorage.setItem(SCROLL_PIN_KEY, scrollPagingCheckbox.checked ? 'true' : 'false');
			};*/

			//------------------------------------------------------------------------------------

			// 匯出、匯入按鈕區塊，用圖示加文字並置中，中間有分隔線
			// 匯出、匯入按鈕區塊（置中、上浮視覺效果）
			const exportImportContainer = document.createElement('div');
			Object.assign(exportImportContainer.style, {
				display: 'flex',
				justifyContent: 'center',
				alignItems: 'center',
				gap: '12px',
				margin: '5px auto 2px',
				padding: '10px 16px',
				borderRadius: '10px',
				boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
				width: 'fit-content',
				zIndex: '10',
				position: 'relative',
			});

			// 工具函式：建立圖示 + 文字按鈕（小型）
			function createStyledButton(iconText, labelText) {
				const btn = document.createElement('button');
				btn.title = labelText;
				Object.assign(btn.style, {
					display: 'flex',
					alignItems: 'center',
					gap: '6px',
					padding: '4px 10px',
					fontSize: '13px',
					borderRadius: '6px',
					border: '1px solid #ccc',
					background: '#f4f4f4',
					color: '#222',
					boxShadow: 'inset 0 0 1px rgba(0,0,0,0.1)',
					cursor: 'pointer',
					userSelect: 'none',
				});

				const icon = document.createElement('span');
				icon.textContent = iconText;
				icon.style.fontSize = '18px';
				btn.appendChild(icon);

				const label = document.createElement('span');
				label.textContent = labelText;
				btn.appendChild(label);

				return btn;
			}

			let exportBtn='';
			let importBtn='';

			if(windows_panel && windows_panel.style.display === 'block')
			{// 匯出按鈕
				exportBtn = createStyledButton('📤', '匯出下載紀錄');
				// 匯入按鈕
				importBtn = createStyledButton('📥', '匯入下載紀錄');
				exportImportContainer.append(exportBtn, importBtn);

				if (currentTab === 'download') {
					const clearDownloadBtn = document.createElement('button');
					clearDownloadBtn.textContent = '清除全部下載紀錄';

					Object.assign(clearDownloadBtn.style, {
						margin: '0px auto 5px', // 上方6px、水平置中、下方0
						width: 'fit-content', // 寬度根據內容自動調整
						padding: '8px 16px', // 擴大左右 padding 看起來更舒適
						fontWeight: 'bold',
						background: 'rgba(200,0,0,0.8)',
						border: 'none',
						borderRadius: '4px',
						color: 'white',
						cursor: 'pointer'
					});

					clearDownloadBtn.onclick = () => {
						if (confirm('確定清除所有下載紀錄？')) {
							currentPage = 1;
							localStorage.removeItem(STORAGE_KEY);
							updatedownloadList();
						}
					};
					form.appendChild(exportImportContainer);
					form.appendChild(clearDownloadBtn);
				} else {
					const clearWatchBtn = document.createElement('button');
					clearWatchBtn.textContent = '清除全部觀看紀錄';

					Object.assign(clearWatchBtn.style, {
						margin: '0px auto 5px', // 上方6px、水平置中、下方0
						width: 'fit-content', // 寬度根據內容自動調整
						padding: '8px 16px', // 擴大左右 padding 看起來更舒適
						fontWeight: 'bold',
						background: 'rgba(200,0,0,0.8)',
						border: 'none',
						borderRadius: '4px',
						color: 'white',
						cursor: 'pointer'
					});

					clearWatchBtn.onclick = () => {
						if (confirm('確定清除所有觀看紀錄？')) {
							currentWatchPage = 1;
							localStorage.removeItem(WATCH_KEY);
							updateWatchList();
						}
					};
					form.appendChild(exportImportContainer);
					form.appendChild(clearWatchBtn);
				}
			}

			if(Follow_panel && Follow_panel.style.display === 'block')
			{ exportBtn = createStyledButton('📤', '匯出關注紀錄');
			 importBtn = createStyledButton('📥', '匯入關注紀錄');
			 exportImportContainer.append(exportBtn, importBtn);

			 const clear_Follow_Btn = document.createElement('button');
			 clear_Follow_Btn.textContent = '清除全部關注紀錄';

			 Object.assign(clear_Follow_Btn.style, {
				 margin: '0px auto 5px', // 上方6px、水平置中、下方0
				 width: 'fit-content', // 寬度根據內容自動調整
				 padding: '8px 16px', // 擴大左右 padding 看起來更舒適
				 fontWeight: 'bold',
				 background: 'rgba(200,0,0,0.8)',
				 border: 'none',
				 borderRadius: '4px',
				 color: 'white',
				 cursor: 'pointer'
			 });

			 clear_Follow_Btn.onclick = () => {
				 if (confirm('確定清除所有關注紀錄？')) {
					 Follow_Page = 1;
					 localStorage.removeItem(FOLLOW_KEY);
					 update_Follow_List();
				 }
			 };
			 form.appendChild(exportImportContainer);
			 form.appendChild(clear_Follow_Btn);
			}
			// 加入容器



			// 初始化與儲存按鈕排在同一行
			const btnsContainer = document.createElement('div');
			btnsContainer.style.display = 'flex';
			btnsContainer.style.justifyContent = 'center';
			btnsContainer.style.gap = '20px';

			const initBtn = document.createElement('button');
			initBtn.textContent = '初始化';
			Object.assign(initBtn.style, {
				padding: '8px 20px',
				borderRadius: '4px',
				border: 'none',
				cursor: 'pointer',
				backgroundColor: '#b33',
				color: 'white',
				fontWeight: 'bold',
				minWidth: '100px',
			});

			const saveBtn = document.createElement('button');
			saveBtn.textContent = '儲存';
			Object.assign(saveBtn.style, {
				padding: '8px 24px',
				borderRadius: '4px',
				border: 'none',
				cursor: 'pointer',
				backgroundColor: '#28a745',
				color: 'white',
				fontWeight: 'bold',
				minWidth: '120px',
			});

			btnsContainer.append(initBtn, saveBtn);
			form.appendChild(btnsContainer);

			panel.appendChild(form);
			document.body.appendChild(panel);

			//點擊設定面板以外區域時，自動關閉這個面板------------------------------------------------------------
			//目前有點問題 當我在觀看紀錄清單並打開設定頁面點擊下載圖式並下載完成時設定頁面會被關閉
			setTimeout(() => {
				function handleOutsideClick(e) {
					const isInPanel = e.target.closest('#windows-panel');
					const watch_Pagination = e.target.closest('.watch-pagination'); // ✅ 新增允許例外
					const download_Pagination = e.target.closest('.download-pagination'); // ✅ 新增允許例外
					const downloadItem = e.target.closest('.tm-download-item');
					// 如果點擊的不是 panel 自身，且也不是它的子元素
					if (!panel.contains(e.target) && !isInPanel && !watch_Pagination && !download_Pagination && !downloadItem) {
						panel.remove(); // 移除面板
						document.removeEventListener('click', handleOutsideClick);
					}
				}
				document.addEventListener('click', handleOutsideClick);
			}, 0); // 防止點擊觸發一打開就自動關閉

			//------------------------------------------------------------------------------------------------

			// 輔助函數 - 將物件設定填入 input 欄位
			function fillInputs(settings) {
				inputLength.value = settings.listHeight || 300;
				inputWidth.value = settings.listWidth || 320;
				inputPageCount.value = settings.itemsPerPage || 10;
				inputWatchCount.value = settings.watchMaxRecords || 100;
				scrollPagingCheckbox.checked = settings.scrollPagingEnabled || false;
				pageSwitchDelayInput.value = settings.pageSwitchdelay || 800;
				updateDelayUIState(); //同步 UI 狀態
			}

			//---------------------------------------------------------------------------------------------------------------------------

			//當未啟用滾動換頁功能時將滾動換頁文字與延遲文字轉成灰色並且不能更改延遲時間
			function updateDelayUIState() {
				const enabled = scrollPagingCheckbox.checked;

				// 控制文字顏色
				scrollPagingLabel.style.color = enabled ? '#fff' : '#888';
				pageSwitchDelayLabel.style.color = enabled ? '#fff' : '#888';

				// 控制輸入框啟用狀態與樣式
				pageSwitchDelayInput.disabled = !enabled;
				pageSwitchDelayInput.style.opacity = enabled ? '1' : '0.5';
				pageSwitchDelayInput.style.pointerEvents = enabled ? 'auto' : 'none';
			}
			//--------------------------------------------------------------------------------------------------------
			closeBtn.onclick = () => {
				panel.remove(); //確實關閉視窗 而不是隱藏
			};

			// 點擊初始化
			initBtn.onclick = () => {
				scrollPaging_Enabled = defaultSettings.scrollPagingEnabled; //更新滾動換頁全域變數的狀態為初始狀態
				pageSwitch_Delay = defaultSettings.pageSwitchdelay;
				localStorage.setItem('hanimeSettings', JSON.stringify(defaultSettings));
				fillInputs(defaultSettings);
				if (currentTab === 'download') {
					downloadListContainer.style.display = 'block';
					watchListContainer.style.display = 'none';
				} else {
					downloadListContainer.style.display = 'none';
					watchListContainer.style.display = 'block';
				}
				windows_panel.style.width = `${Number(defaultSettings.listWidth)}px`;
				Follow_panel.style.width = `${Number(defaultSettings.listWidth)}px`;
				updateWatchList();
				updatedownloadList();
				update_Follow_List();
			};

			// 點擊儲存（不關閉面板）
			saveBtn.onclick = () => {
				scrollPaging_Enabled = scrollPagingCheckbox.checked; //更新滾動換頁全域變數的狀態為現在儲存的狀態
				pageSwitch_Delay = pageSwitchDelayInput.value;
				const settings = {
					listHeight:Number(inputLength.value),
					listWidth:Number(inputWidth.value),
					itemsPerPage: Number(inputPageCount.value),
					watchMaxRecords: Number(inputWatchCount.value),
					scrollPagingEnabled: scrollPaging_Enabled,
					pageSwitchdelay: pageSwitch_Delay
				};
				localStorage.setItem('hanimeSettings', JSON.stringify(settings));
				alert('✅ 設定已儲存');
				fillInputs(settings);
				if (currentTab === 'download') {
					downloadListContainer.style.display = 'block';
					watchListContainer.style.display = 'none';
				} else {
					downloadListContainer.style.display = 'none';
					watchListContainer.style.display = 'block';
				}
				windows_panel.style.width = `${Number(settings.listWidth)}px`;
				Follow_panel.style.width = `${Number(settings.listWidth)}px`;
				updateWatchList();
				updatedownloadList();
				update_Follow_List();
			};
			fillInputs(storedSettings);

			if(windows_panel && windows_panel.style.display === 'block'){
				// 匯出按鈕功能
				exportBtn.onclick = () => {
					const downloaded = getDownloadedList(); // 使用設定函數獲取下載紀錄
					const cleanData = downloaded.map(item => ({
						id: item.id,
						name: cleanFilename(item.name) // 使用設定函數處理檔案名稱
					}));
					const fullText = `Downloaded_list\n${JSON.stringify(cleanData, null, 2)}`;
					const blob = new Blob([fullText], { type: 'application/json' });
					const url = URL.createObjectURL(blob);
					const a = document.createElement('a');
					a.href = url;
					a.download = `hanime1_download_list.json`;
					a.click();
					URL.revokeObjectURL(url);
				};

				// 匯入按鈕功能
				importBtn.onclick = () => {
					const input = document.createElement('input');
					input.type = 'file';
					input.accept = '.json,.txt'; // 可接受 .json 或 .txt
					input.onchange = () => {
						const file = input.files[0];
						if (!file) return;

						const reader = new FileReader();
						reader.onload = () => {
							try {
								const content = reader.result.trim();
								const newlineIndex = content.indexOf('\n');

								// 若沒找到換行，代表檔案格式不對
								if (newlineIndex === -1) {
									alert('❌ 匯入失敗：缺少標記標頭');
									return;
								}

								const header = content.substring(0, newlineIndex).trim();
								const jsonPart = content.substring(newlineIndex + 1).trim();

								if (header !== 'Downloaded_list') {
									alert('❌ 匯入失敗：不是下載紀錄類型');
									return;
								}

								const imported = JSON.parse(jsonPart); // ← 只解析純 JSON 部分

								if (!Array.isArray(imported)) {
									alert('❌ 匯入失敗：資料格式錯誤');
									return;
								}

								const existing = getDownloadedList();
								const cleaned = imported.map(item => ({
									id: item.id,
									name: cleanFilename(item.name)
								}));

								const duplicateIds = cleaned
								.filter(item => item.id && existing.some(e => e.id === item.id))
								.map(item => item.id);

								sessionStorage.setItem('tm-import-duplicates', JSON.stringify(duplicateIds));

								const merged = [
									...existing,
									...cleaned.filter(item => item.id && !existing.some(e => e.id === item.id))
								];

								localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
								updatedownloadList();
								alert('✅ 匯入完成');
							} catch (e) {
								alert('❌ 匯入失敗：無法解析 JSON\n' + e.message);
							}
						};
						reader.readAsText(file);
					};
					input.click();
				};

			}

			if(Follow_panel && Follow_panel.style.display === 'block'){
				// 匯出按鈕功能
				exportBtn.onclick = () => {
					const Followed = getFollowedList(); // 使用設定函數獲取下載紀錄
					const cleanData = Followed.map(item => ({
						id: item.id,
						name: cleanFilename(item.name) // 使用設定函數處理檔案名稱
					}));
					const fullText = `Followed_list\n${JSON.stringify(cleanData, null, 2)}`;
					const blob = new Blob([fullText], { type: 'application/json' });
					const url = URL.createObjectURL(blob);
					const a = document.createElement('a');
					a.href = url;
					a.download = `hanime1_Followed_list.json`;
					a.click();
					URL.revokeObjectURL(url);
				};

				// 匯入按鈕功能
				importBtn.onclick = () => {
					const input = document.createElement('input');
					input.type = 'file';
					input.accept = '.json,.txt'; // 可接受 .json 或 .txt
					input.onchange = () => {
						const file = input.files[0];
						if (!file) return;

						const reader = new FileReader();
						reader.onload = () => {
							try {
								const content = reader.result.trim();
								const newlineIndex = content.indexOf('\n');

								// 若沒找到換行，代表檔案格式不對
								if (newlineIndex === -1) {
									alert('❌ 匯入失敗：缺少標記標頭');
									return;
								}

								const header = content.substring(0, newlineIndex).trim();
								const jsonPart = content.substring(newlineIndex + 1).trim();

								if (header !== 'Followed_list') {
									alert('❌ 匯入失敗：不是關注紀錄類型');
									return;
								}

								const imported = JSON.parse(jsonPart); // ← 只解析純 JSON 部分

								if (!Array.isArray(imported)) {
									alert('❌ 匯入失敗：資料格式錯誤');
									return;
								}

								const existing = getFollowedList();
								const cleaned = imported.map(item => ({
									id: item.id,
									name: cleanFilename(item.name)
								}));

								const duplicateIds = cleaned
								.filter(item => item.id && existing.some(e => e.id === item.id))
								.map(item => item.id);

								sessionStorage.setItem('Follow-duplicates', JSON.stringify(duplicateIds));

								const merged = [
									...existing,
									...cleaned.filter(item => item.id && !existing.some(e => e.id === item.id))
								];

								localStorage.setItem(FOLLOW_KEY, JSON.stringify(merged));
								update_Follow_List();
								alert('✅ 匯入完成');
							} catch (e) {
								alert('❌ 匯入失敗：無法解析 JSON\n' + e.message);
							}
						};
						reader.readAsText(file);
					};
					input.click();
				};

			}

		}

		// 顯示面板
		panel.style.display = 'flex';
	}
	//---------------------------------------------------------------------------------------------------------------------------
	function cloneDownloadButtonToStickyNav() {
		const stickyNav = document.querySelector('#search-nav-desktop');
		const mainNavBtn = document.querySelector('#main-nav a[title="下載紀錄"]');
		console.log('主按鈕存在？', document.querySelector('#main-nav a[title="下載紀錄"]'));
		console.log('sticky nav:', stickyNav);
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
			const panel = document.querySelector('#all-list')?.parentElement;
			const Follow_windows = document.querySelector('#Follow-windows')?.parentElement;
			if (panel) {
				Follow_windows.style.display = 'none' ;
				panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
				updatedownloadList();
			}
		});
	}

	function cloneFollowButtonToStickyNav() {
		const stickyNav = document.querySelector('#search-nav-desktop');
		const mainNavBtn = document.querySelector('#main-nav a[title="關注清單"]');
		console.log('主按鈕存在？', document.querySelector('#main-nav a[title="關注清單"]'));
		console.log('sticky nav:', stickyNav);
		if (!stickyNav || !mainNavBtn) return;

		if (stickyNav.querySelector('.Follow-sticky-btn')) return;

		const wrapper = document.createElement('div');
		wrapper.className = 'dropdown no-select search-nav-opacity hidden-xs hidden-sm Follow-sticky-wrapper';
		wrapper.style.cssText = 'display: inline-block; padding: 0; margin-left: 7px; margin-top: -15px;';

		const button = document.createElement('button');
		button.className = 'Follow-sticky-btn';
		button.title = '關注清單';
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
			">favorite_border</span>
		`;

		wrapper.appendChild(button);

			const authorBtns = stickyNav.querySelectorAll('.tm-sticky-download-wrapper');
		const authorBtn = authorBtns[authorBtns.length - 1];
		if (authorBtn && authorBtn.parentElement) {
			authorBtn.parentElement.insertBefore(wrapper, authorBtn);
		} else {
			stickyNav.appendChild(wrapper);
		}
		button.addEventListener('click', e => {
			e.preventDefault();
			const Follow_windows = document.querySelector('#Follow-windows')?.parentElement;
			const panel = document.querySelector('#all-list')?.parentElement;
			if (Follow_windows) {
				panel.style.display = 'none';
				Follow_windows.style.display = Follow_windows.style.display === 'none' ? 'block' : 'none';
				update_Follow_List();
			}
		});
	}
	//---------------------------------------------------------------------------------------------------------------------------
	function removeStickyDownloadButton() {
		const btn = document.querySelector('#search-nav-desktop .tm-sticky-download-btn');
		if (btn) btn.remove();
	}

	function removeStickyFollowButton() {
		const btn = document.querySelector('#search-nav-desktop .Follow-sticky-btn');
		if (btn) btn.remove();
	}
	//---------------------------------------------------------------------------------------------------------------------------
	(function recordOnWatchPage() {
		const urlParams = new URLSearchParams(window.location.search);
		const vid = urlParams.get('v');
		if (!vid) return;

		// 嘗試抓 DOM 中的影片標題
		let name = document.querySelector('h3#shareBtn-title')?.textContent
		|| document.querySelector('h1')?.textContent
		|| document.title;

		name = name.trim();

		addWatchRecord(vid, name);
	})();

	// 觀察 #main-nav 是否可見
	const mainNav = document.querySelector('#main-nav');
	if (mainNav) {
		const observer = new IntersectionObserver(entries => {
			const isVisible = entries[0].isIntersecting;
			if (!isVisible) {
				cloneDownloadButtonToStickyNav();
				cloneFollowButtonToStickyNav();
			} else {
				removeStickyDownloadButton();
				removeStickyFollowButton();
			}
		}, { root: null, threshold: 0 });

		observer.observe(mainNav);
	}

	window.addEventListener('beforeunload', () => {
		sessionStorage.removeItem('tm-import-duplicates');
		sessionStorage.removeItem('Follow-duplicates');
	});
})();
/*顯示預覽照片(原先代碼)
	function bindPreviewOnHoverWithFetch(element, videoId) {
		if (!element || !videoId) return;

		let previewBox = document.getElementById('video-preview-box');
		if (!previewBox) {
			previewBox = document.createElement('div');
			previewBox.id = 'video-preview-box';
			Object.assign(previewBox.style, {
				position: 'fixed',
				width: '240px',
				height: '135px',
				backgroundColor: '#000',
				backgroundSize: 'cover',
				backgroundPosition: 'center',
				border: '2px solid #4caf50',
				borderRadius: '6px',
				boxShadow: '0 0 10px rgba(0,255,0,0.7)',
				pointerEvents: 'none',
				opacity: '0',
				transition: 'opacity 0.2s',
				zIndex: '999999',
			});
			document.body.appendChild(previewBox);
		}

		const cache = new Map();

		const fetchPreviewImageUrl = async (id) => {
			if (cache.has(id)) return cache.get(id);

			// 1. 先抓影片頁 HTML，試著找 poster 或 data-poster 中的 .jpg?secure=...
			try {
				const res = await fetch(`https://hanime1.me/watch?v=${id}`);
				const html = await res.text();
				const match = html.match(/(?:poster|data-poster)="([^"]+\.jpg\?secure=[^"]+)"/);
				if (match && match[1]) {
					cache.set(id, match[1]);
					return match[1];
				}
			} catch (err) {
				console.warn('抓取 HTML 中圖片失敗:', err);
			}

			// 2. fallback 嘗試舊式路徑
			const fallbackUrl = `https://vdownload.hembed.com/image/thumbnail/${id}h.jpg`;
			try {
				const headRes = await fetch(fallbackUrl, { method: 'HEAD' });
				if (headRes.ok) {
					cache.set(id, fallbackUrl);
					return fallbackUrl;
				}
			} catch (err) {
				console.warn('HEAD 測試圖片失敗:', err);
			}

			return null;
		};

		let moveListener;

		element.addEventListener('mouseenter', async () => {
			// 清空舊圖-----------------------------
			previewBox.style.backgroundImage = '';
			previewBox.style.opacity = '0';
			//-------------------------------------
			const url = await fetchPreviewImageUrl(videoId);
			if (url) {
				const img = new Image();
				img.onload = () => {
					previewBox.style.backgroundImage = `url("${url}")`;
					previewBox.style.opacity = '1';
				};
				img.src = url;
			}

			moveListener = (e) => {
				const previewWidth = 240;
				const previewHeight = 135;

				const offsetX = -previewWidth - 20; // 滑鼠左邊一點
				const offsetY = -previewHeight / 2; // 垂直置中

				const left = e.clientX + offsetX;
				const top = e.clientY + offsetY;

				previewBox.style.left = `${Math.max(0, left)}px`;
				previewBox.style.top = `${Math.max(0, top)}px`;
			};

			document.addEventListener('mousemove', moveListener);
		});
		element.addEventListener('mouseleave', (e) => {
			const to = e.relatedTarget;
			if (!element.contains(to)) {
				previewBox.style.opacity = '0';
				previewBox.style.backgroundImage = '';
				document.removeEventListener('mousemove', moveListener);
			}
		});
	}
*/
