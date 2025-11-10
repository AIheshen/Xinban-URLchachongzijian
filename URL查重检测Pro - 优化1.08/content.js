(function() {
    'use strict';

    // =================================================================
    // 配置选项
    // =================================================================
    const CONFIG = {
        checkDelay: 500,
        highlightColor: '#ff6b6b',
        hashHighlightColor: '#ffc0cb',
        questionMarkHighlightColor: '#ffeb3b',
        normalColor: '',
        showNotification: true,
        checkOnSubmit: true,
        caseSensitive: true,
        urlInputWidthThreshold: 150
    };

    // =================================================================
    // 全局变量
    // =================================================================
    let inputHistory = new Set();
    let checkTimeout;
    let panel;
    let isMouseDown = false, isDragging = false, startX, startY, initialLeft, initialTop, currentX, currentY, animationFrameId = null;
    const dragThreshold = 5;
    let batchUrlList = [], batchIndex = 0;
    let selfCheckData = [];
    const STORAGE_KEYS = {
        position: 'duplicateCheckerPanelPosition',
        minimized: 'duplicateCheckerPanelMinimized'
    };
    const remarks = [
        "URL无法访问或打开", "内容全为空白/乱码", "登录后页面无有效内容/内容过少",
        "主站为电商网站", "主站为AI搜索引擎", "主站为娱乐网站", "显示域名过期",
        "显示站点关闭", "显示网站建设中", "报错403错误", "报错404错误", "报错500错误"
    ];

    // =================================================================
    // 辅助函数 (存储, 通知) - 无改动
    // =================================================================
    function saveMinimizedState(isMinimized) { localStorage.setItem(STORAGE_KEYS.minimized, isMinimized); }
    function getMinimizedState() { return localStorage.getItem(STORAGE_KEYS.minimized) === 'true'; }
    function savePanelPosition(left, top) { localStorage.setItem(STORAGE_KEYS.position, JSON.stringify({ left, top })); }
    function getPanelPosition() { const stored = localStorage.getItem(STORAGE_KEYS.position); return stored ? JSON.parse(stored) : { left: window.innerWidth - 170, top: window.innerHeight - 450 }; }
    function createNotification() { const notification = document.createElement('div'); notification.id = 'duplicate-notification'; notification.style.cssText = 'position:fixed;top:20px;right:20px;background:#1E8449;color:white;padding:8px 12px;border-radius:4px;z-index:10050;transition:opacity 0.3s;font-size:14px;font-weight:bold;'; document.body.appendChild(notification); return notification; }
    function showNotification(message) { if (!CONFIG.showNotification) return; let notification = document.getElementById('duplicate-notification'); if (!notification) { notification = createNotification(); } notification.textContent = message; notification.style.opacity = '1'; setTimeout(() => { notification.style.opacity = '0'; }, 2000); }
    
    // =================================================================
    // 核心功能逻辑 - (经典提醒模式)
    // =================================================================
    function checkForDuplicates(inputElement) {
        if (inputElement.offsetWidth <= CONFIG.urlInputWidthThreshold) {
            inputElement.style.backgroundColor = CONFIG.normalColor;
            return false;
        }

        const value = CONFIG.caseSensitive ? inputElement.value : inputElement.value.toLowerCase();

        if (!value.trim()) {
            inputElement.style.backgroundColor = CONFIG.normalColor;
            return false;
        }

        if (inputHistory.has(value)) {
            inputElement.style.backgroundColor = CONFIG.highlightColor;
            showNotification(`检测到重复内容: "${inputElement.value}"`);
            return true;
        } else {
            inputHistory.add(value);

            if (value.includes('?')) {
                inputElement.style.backgroundColor = CONFIG.questionMarkHighlightColor;
                showNotification('检查网页？号及其后内容。');
            } else if (value.includes('#')) {
                inputElement.style.backgroundColor = CONFIG.hashHighlightColor;
                showNotification('此行可能为同层导航链接。');
            } else {
                inputElement.style.backgroundColor = CONFIG.normalColor;
            }
            return false;
        }
    }

    function updateLevelByURL(urlInput) {
        if (!urlInput || urlInput.offsetWidth <= CONFIG.urlInputWidthThreshold) return;
        const row = urlInput.closest('tr');
        if (!row) return;
        const allInputs = Array.from(row.querySelectorAll('textarea.ct-ant-input,input[type="text"],input[type="email"]'));
        const urlInputs = allInputs.filter(ta => ta.offsetWidth > CONFIG.urlInputWidthThreshold && !ta.placeholder.includes('格式'));
        const levelInputs = allInputs.filter(ta => ta.placeholder && ta.placeholder.includes('格式：1、2、3'));
        if (urlInputs.length === 0 || levelInputs.length === 0) return;
        const url = urlInput.value.trim();
        if (!url) {
            levelInputs[0].value = '';
            return;
        }
        let path = url.replace(/^https?:\/\//, '').replace(/\/$/, '');
        const level = (path.match(/\//g) || []).length;
        const levelInput = levelInputs[0];
        levelInput.value = level;
        levelInput.dispatchEvent(new Event('input', { bubbles: true }));
        const originalColor = levelInput.style.backgroundColor;
        levelInput.style.backgroundColor = '#d4f7d4';
        setTimeout(() => {
            levelInput.style.backgroundColor = originalColor || '';
        }, 500);
    }

    function handleInput(event) { const inputElement = event.target; clearTimeout(checkTimeout); checkTimeout = setTimeout(() => { checkForDuplicates(inputElement); updateLevelByURL(inputElement); }, CONFIG.checkDelay); }
    function handleSubmit(event) { if (!CONFIG.checkOnSubmit) return; const inputs = event.target.querySelectorAll('input[type="text"], input[type="email"], textarea'); let hasDuplicates = false; const currentValues = new Set(); inputs.forEach(input => { if (input.offsetWidth > CONFIG.urlInputWidthThreshold) { const value = CONFIG.caseSensitive ? input.value : input.value.toLowerCase(); if (value.trim() && currentValues.has(value)) { hasDuplicates = true; input.style.backgroundColor = CONFIG.highlightColor; } else { currentValues.add(value); } } else { input.style.backgroundColor = CONFIG.normalColor; } }); if (hasDuplicates) { event.preventDefault(); showNotification('表单中包含重复内容，请检查！'); return false; } }
    function addInputListeners() { const observer = new MutationObserver(mutations => { mutations.forEach(m => { if (m.addedNodes.length) { document.querySelectorAll('input[type="text"], input[type="email"], textarea').forEach(input => { if (!input.dataset.listenerAdded) { input.addEventListener('input', handleInput); input.dataset.listenerAdded = 'true'; } }); } }); }); observer.observe(document.body, { childList: true, subtree: true }); document.querySelectorAll('input[type="text"], input[type="email"], textarea').forEach(input => { if (!input.dataset.listenerAdded) { input.addEventListener('input', handleInput); input.dataset.listenerAdded = 'true'; } }); document.addEventListener('submit', e => { if (e.target.tagName === 'FORM') { handleSubmit(e); } }, true); }
    
    // =================================================================
    // 自检功能逻辑 - 无改动
    // =================================================================
    function extractUrlsForSelfCheck() { const selector = 'textarea.ct-ant-input'; const urlInputs = document.querySelectorAll(selector); const allData = []; urlInputs.forEach(input => { if (input.offsetWidth <= CONFIG.urlInputWidthThreshold) return; const row = input.closest('tr'); if (!row) return; const seqTd = row.querySelector('td:first-child'); const seq = seqTd ? seqTd.textContent.trim() : 'N/A'; const url = input.value.trim(); if (url && (url.startsWith('http://') || url.startsWith('https://'))) { allData.push({ seq, url }); } }); selfCheckData = allData; updateSelfCheckUI(); if (selfCheckData.length > 0) { showNotification(`自检提取成功！共发现 ${selfCheckData.length} 个链接。`); } else { showNotification('未找到可供自检的链接。', true); } }
    function updateSelfCheckUI() { const counter = document.getElementById('sc-url-counter'); const urlList = document.getElementById('sc-url-list'); const startBtn = document.getElementById('start-self-check'); if (!counter || !urlList || !startBtn) return; counter.textContent = `已提取 ${selfCheckData.length} 个链接`; urlList.innerHTML = ''; if (selfCheckData.length > 0) { selfCheckData.forEach(item => { const li = document.createElement('li'); li.innerHTML = `<span class="sc-url-seq">${item.seq}</span><span class="sc-url-text" title="${item.url}">${item.url}</span>`; urlList.appendChild(li); }); startBtn.disabled = false; } else { urlList.innerHTML = '<li class="empty-list">暂无链接</li>'; startBtn.disabled = true; } }
    function startSelfCheck() { if (selfCheckData.length === 0) return; const urls = selfCheckData.map(item => item.url); showNotification('正在打开自检窗口...'); chrome.runtime.sendMessage({ action: 'openUrlsForSelfCheck', urls }, response => { if (chrome.runtime.lastError) { showNotification(`通信错误: ${chrome.runtime.lastError.message}`, true); } else if (response && response.status === 'completed') { showNotification(`已打开 ${response.count} 个链接用于自检。`); } else { showNotification(`打开链接时发生错误: ${response ? response.message : '未知'}`, true); } }); }
    function endSelfCheck() { showNotification('正在关闭自检窗口...'); chrome.runtime.sendMessage({ action: 'closeSelfCheckTabs' }, response => { if (chrome.runtime.lastError) { showNotification(`通信错误: ${chrome.runtime.lastError.message}`, true); } else if (response && response.status === 'closed') { showNotification(`操作成功！已关闭 ${response.count} 个自检标签页。`); } else if (response && response.status === 'no_tabs_to_close') { showNotification('没有需要关闭的自检标签页。', true); } }); panel.classList.remove('self-check-active'); }
    function toggleSelfCheckPanel() { const isActive = panel.classList.toggle('self-check-active'); if (isActive) { extractUrlsForSelfCheck(); } }

    // =================================================================
    // UI 创建与事件绑定 - 【拖动逻辑修复】
    // =================================================================
    function addControlPanel() {
        const storedPosition = getPanelPosition();
        const isMinimized = getMinimizedState();
        panel = document.createElement('div');
        panel.id = 'duplicate-checker-panel';
        panel.className = 'plugin-popup-box';
        panel.style.cssText = `position:fixed; z-index:10001; left: ${storedPosition.left}px; top: ${storedPosition.top}px;`;
        panel.innerHTML = `
            <div id="dc-main-content">
                <div id="dc-panel-header">
                    <span id="dc-panel-icon">🔍</span>
                    <span id="dc-panel-title">内容检查器</span>
                </div>
                <div><label><input type="checkbox" id="case-sensitive" checked> 区分大小写</label></div>
                <div><label><input type="checkbox" id="check-submit" checked> 提交时检查</label></div>
                <div><label><input type="checkbox" id="show-notification" checked> 显示通知</label></div>
                <button id="clear-history">清除历史记录</button>
                <button id="add-ten-rows">添加10行</button>
                <button id="batch-fill">批量URL填入</button>
                <button id="continue-batch">继续下一页</button>
                <button id="show-remarks">废弃备注</button>
                <button id="toggle-self-check" class="self-check-toggle-btn">自检功能</button>
            </div>
            <div id="self-check-container">
                <strong id="sc-url-counter"></strong>
                <ul id="sc-url-list"></ul>
                <div class="sc-controls">
                    <button id="start-self-check">开始自检</button>
                    <button id="end-self-check">结束自检</button>
                </div>
            </div>
        `;
        if (isMinimized) { panel.classList.add('minimized'); }
        document.body.appendChild(panel);

        const header = panel.querySelector('#dc-panel-header');
        const updatePosition = () => { panel.style.transform = `translate3d(${currentX - initialLeft}px, ${currentY - initialTop}px, 0)`; animationFrameId = null; };
        header.addEventListener('click', () => { if (isDragging) return; panel.classList.toggle('minimized'); saveMinimizedState(panel.classList.contains('minimized')); });
        header.addEventListener('mousedown', e => {
            isMouseDown = true;
            isDragging = false;
            const rect = panel.getBoundingClientRect();
            initialLeft = rect.left;
            initialTop = rect.top;
            startX = e.clientX;
            startY = e.clientY;
            panel.style.transition = 'none';
        });
        document.addEventListener('mousemove', e => {
            if (!isMouseDown) return;
            // 【关键修复】将 startY 修改为 startX
            currentX = initialLeft + (e.clientX - startX);
            currentY = initialTop + (e.clientY - startY);
            if (!isDragging && (Math.abs(e.clientX - startX) > dragThreshold || Math.abs(e.clientY - startY) > dragThreshold)) {
                isDragging = true;
                document.body.style.userSelect = 'none';
            }
            if (isDragging) {
                if (!animationFrameId) {
                    animationFrameId = requestAnimationFrame(updatePosition);
                }
            }
        });
        document.addEventListener('mouseup', () => {
            if (!isMouseDown) return;
            isMouseDown = false;
            document.body.style.userSelect = '';
            panel.style.transition = '';
            if (isDragging) {
                if (animationFrameId) {
                    cancelAnimationFrame(animationFrameId);
                    animationFrameId = null;
                }
                const finalLeft = currentX;
                const finalTop = currentY;
                panel.style.transform = '';
                panel.style.left = finalLeft + 'px';
                panel.style.top = finalTop + 'px';
                savePanelPosition(finalLeft, finalTop);
            }
            setTimeout(() => { isDragging = false; }, 0);
        });

        // --- 其他事件绑定保持不变 ---
        document.getElementById('case-sensitive').addEventListener('change', function() { CONFIG.caseSensitive = this.checked; inputHistory.clear(); });
        document.getElementById('check-submit').addEventListener('change', function() { CONFIG.checkOnSubmit = this.checked; });
        document.getElementById('show-notification').addEventListener('change', function() { CONFIG.showNotification = this.checked; });
        document.getElementById('clear-history').addEventListener('click', function() { inputHistory.clear(); document.querySelectorAll('input, textarea').forEach(el => el.style.backgroundColor = CONFIG.normalColor); showNotification('历史记录已清除'); });
        document.getElementById('add-ten-rows').addEventListener('click', function() { const addBtn = Array.from(document.querySelectorAll('button')).find(b => b.querySelector('svg') && /加标|添加标注/.test(b.textContent)); if (addBtn) { for (let i = 0; i < 10; i++) { addBtn.click(); } } });
        document.getElementById('batch-fill').addEventListener('click', openBatchInputPopup);
        document.getElementById('continue-batch').addEventListener('click', fillBatch);
        document.getElementById('show-remarks').addEventListener('click', openRemarksPopup);
        document.getElementById('toggle-self-check').addEventListener('click', toggleSelfCheckPanel);
        document.getElementById('start-self-check').addEventListener('click', startSelfCheck);
        document.getElementById('end-self-check').addEventListener('click', endSelfCheck);
    }
    
    function openBatchInputPopup() { if (document.querySelector('.plugin-popup-overlay')) return; const overlay = document.createElement('div'); overlay.className = 'plugin-popup-overlay'; const popup = document.createElement('div'); popup.id = 'batch-url-popup'; popup.className = 'plugin-popup-box'; popup.innerHTML = `<div><strong>批量URL输入</strong><button id="close-popup">✖</button></div><textarea id="batch-url-textarea"></textarea><button id="batch-submit">确认填入</button>`; overlay.appendChild(popup); document.body.appendChild(overlay); const textarea = document.getElementById('batch-url-textarea'); textarea.addEventListener('paste', function(event) { event.preventDefault(); const pastedText = (event.clipboardData || window.clipboardData).getData('text'); if (this.value.length > 0 && !this.value.endsWith('\n')) { this.value += '\n' + pastedText; } else { this.value += pastedText; } }); overlay.addEventListener('click', e => { if (e.target === overlay || e.target.id === 'close-popup') { overlay.remove(); } }); document.getElementById('batch-submit').addEventListener('click', () => { const urls = textarea.value; if (urls) { batchUrlList = urls.split('\n').map(u => u.trim()).filter(u => u); batchIndex = 0; fillBatch(); overlay.remove(); } }); }
    function openRemarksPopup() { if (document.querySelector('.plugin-popup-overlay')) return; const overlay = document.createElement('div'); overlay.className = 'plugin-popup-overlay'; const box = document.createElement('div'); box.id = 'remarks-box'; box.className = 'plugin-popup-box'; let buttonsHTML = ''; remarks.forEach(remark => { buttonsHTML += `<button class="remark-option">${remark}</button>`; }); box.innerHTML = `<h3>选择废弃备注</h3><div id="remarks-list">${buttonsHTML}</div>`; overlay.appendChild(box); document.body.appendChild(overlay); overlay.addEventListener('click', (e) => { if (e.target.classList.contains('remark-option')) { const textToCopy = e.target.textContent; navigator.clipboard.writeText(textToCopy).then(() => { showNotification(`已复制: "${textToCopy}"`); overlay.remove(); }).catch(err => { console.error('复制失败: ', err); showNotification('复制失败，请检查浏览器权限'); }); } else if (e.target === overlay) { overlay.remove(); } }); }
    function fillBatch() {
        if (batchUrlList.length === 0) return;
        const urlInputs = Array.from(document.querySelectorAll('textarea.ct-ant-input')).filter(ta => {
            if (ta.style.minHeight !== '50px') return false;
            const label = ta.closest('.ct-ant-formily-item')?.querySelector('.ct-ant-formily-item-label label')?.textContent;
            return label !== '备注' && !(ta.getAttribute('placeholder') || '').includes('格式：1、2、3');
        });
        let filled = 0;
        while (batchIndex < batchUrlList.length) {
            let found = false;
            for (let i = 0; i < urlInputs.length; i++) {
                if (!urlInputs[i].value.trim()) {
                    urlInputs[i].value = batchUrlList[batchIndex];
                    urlInputs[i].dispatchEvent(new Event('input', { bubbles: true }));
                    updateLevelByURL(urlInputs[i]);
                    batchIndex++;
                    filled++;
                    found = true;
                    break;
                }
            }
            if (!found) break;
        }
        if (batchIndex < batchUrlList.length) {
            showNotification('未全部复制，请打开下一页再点击“继续下一页”');
        } else {
            showNotification(`已填入全部 ${filled} 条 URL`);
        }
    }
    
    // =================================================================
    // 初始化
    // =================================================================
    function init() {
        console.log('📝 重复内容检查器已启动 (v1.6r - 拖动修复)');
        addInputListeners();
        addControlPanel();
    }
    if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', init); } 
    else { init(); }
})();