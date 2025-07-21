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
