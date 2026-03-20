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
