// background.js (v1.4 - 稳定版)

// 【关键优化1】使用 chrome.storage.session 在整个浏览器会话中持久化存储标签页ID
// 这能彻底解决因后台脚本休眠导致数据丢失的问题。
const STORAGE_KEY = 'selfCheckManagedTabIds';

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {

  // --- 处理“为自检打开URL”的请求 ---
  if (request.action === 'openUrlsForSelfCheck' && request.urls && request.urls.length > 0) {
    // 这是一个异步操作，必须返回 true
    (async () => {
        try {
            const senderWindow = await chrome.windows.get(sender.tab.windowId);
            const displays = await chrome.system.display.getInfo();
            const primaryDisplay = displays.find(d => d.isPrimary) || displays[0];

            const screenWidth = primaryDisplay.workArea.width;
            const screenHeight = primaryDisplay.workArea.height;
            const newWindowWidth = Math.round(screenWidth / 2);
            const newWindowHeight = screenHeight;
            const newWindowTop = primaryDisplay.workArea.top;

            let newWindowLeft = (senderWindow.left < screenWidth / 2) 
              ? (screenWidth - newWindowWidth) 
              : primaryDisplay.workArea.left;
            
            const newWindow = await chrome.windows.create({
                url: request.urls,
                left: newWindowLeft,
                top: newWindowTop,
                width: newWindowWidth,
                height: newWindowHeight,
                focused: false,
                state: "normal"
            });
            
            if (!newWindow || !newWindow.tabs) {
                throw new Error("创建新窗口失败。");
            }
            
            const selfCheckTabIds = newWindow.tabs.map(tab => tab.id);
            // 【关键优化2】将ID保存到 session storage，而不是不稳定的全局变量
            await chrome.storage.session.set({ [STORAGE_KEY]: selfCheckTabIds });

            console.log('自检窗口已打开，并持久化记录 IDs:', selfCheckTabIds);
            sendResponse({ status: 'completed', count: selfCheckTabIds.length });

        } catch (error) {
            console.error("创建自检窗口时发生错误:", error);
            sendResponse({ status: 'error', message: error.message });
        }
    })();
    
    return true; // 告诉Chrome我们将异步发送响应
  }

  // --- 处理“关闭自检URL”的请求 ---
  if (request.action === 'closeSelfCheckTabs') {
    (async () => {
        // 【关键优化3】从 session storage 读取ID，确保数据不会因脚本休眠而丢失
        const data = await chrome.storage.session.get(STORAGE_KEY);
        const idsToClose = data[STORAGE_KEY] || [];

        if (idsToClose.length === 0) {
            sendResponse({ status: 'no_tabs_to_close' });
            return;
        }

        let closedCount = 0;
        // 【关键优化4】逐个关闭标签页，避免因单个ID失效（已被手动关闭）导致整个操作失败
        for (const tabId of idsToClose) {
            try {
                await chrome.tabs.remove(tabId);
                closedCount++;
            } catch (error) {
                // 这个错误是预料之中的，静默处理，让循环继续
            }
        }

        // 清理存储
        await chrome.storage.session.remove(STORAGE_KEY);

        console.log(`关闭指令完成，成功关闭 ${closedCount} 个自检标签页。`);
        sendResponse({ status: 'closed', count: closedCount });
    })();
    
    return true; // 告诉Chrome我们将异步发送响应
  }
});