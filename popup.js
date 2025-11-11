// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', async () => {
    await updateStats();
    await loadCardData();
    
    // 绑定事件监听器
    document.getElementById('fillFormBtn').addEventListener('click', fillCurrentPage);
    document.getElementById('resetUsedCardsBtn').addEventListener('click', resetUsedCards);
    document.getElementById('updateCardsBtn').addEventListener('click', updateCardData);
    document.getElementById('clearCardsBtn').addEventListener('click', clearAllCards);
    
    // 绑定标签页切换
    initTabSwitching();
    
    // 监听来自 background 的消息
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === 'fetchNodesWithPopupIframe') {
            fetchNodesWithPopupIframe(request.url, request.sourceTabId);
            sendResponse({ success: true });
        }
        return true;
    });
});

// 初始化标签页切换功能
function initTabSwitching() {
    const tabButtons = document.querySelectorAll('.tab-button');
    let tempmailLoaded = false;
    
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const tabName = button.getAttribute('data-tab');
            
            // 移除所有活动状态
            document.querySelectorAll('.tab-button').forEach(btn => {
                btn.classList.remove('active');
            });
            document.querySelectorAll('.tab-content').forEach(content => {
                content.classList.remove('active');
            });
            
            // 添加活动状态到当前标签
            button.classList.add('active');
            document.getElementById(tabName).classList.add('active');
            
            // 懒加载临时邮箱 iframe（只加载一次）
            if (tabName === 'tempmail' && !tempmailLoaded) {
                const iframe = document.querySelector('.tempmail-iframe');
                const src = iframe.getAttribute('data-src');
                if (src) {
                    iframe.src = src;
                    tempmailLoaded = true;
                }
            }
        });
    });
}

// 填写当前页面
async function fillCurrentPage() {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        
        // 首先检查content script是否已加载
        const pingResponse = await checkContentScriptReady(tab.id);
        
        if (!pingResponse) {
            // 尝试注入content script
            await injectContentScript(tab.id);
            await new Promise(resolve => setTimeout(resolve, 1000)); // 等待1秒
        }
        
        // 发送填写指令
        const response = await chrome.tabs.sendMessage(tab.id, { action: 'fillPaymentForm' });
        
        if (response && response.success) {
            window.close(); // 关闭popup
        } else {
            alert(response ? response.message : '填写失败');
        }
        
    } catch (error) {
        console.error('发送消息失败:', error);
        
        // 提供更详细的错误信息
        if (error.message.includes('Could not establish connection')) {
            alert('无法连接到页面。这可能是因为：\n\n1. 页面还在加载中，请稍后再试\n2. 某些页面（如Chrome系统页面）不支持扩展\n3. 页面使用了特殊的安全机制\n\n解决方法：\n• 刷新页面后重试\n• 确保在支持的网站上使用\n• 使用快捷键 Ctrl+Shift+F');
        } else {
            alert('操作失败: ' + error.message);
        }
    }
}

// 检查content script是否准备就绪
async function checkContentScriptReady(tabId) {
    try {
        const response = await chrome.tabs.sendMessage(tabId, { action: 'ping' });
        return response && response.ready;
    } catch (error) {
        return false;
    }
}

// 注入content script
async function injectContentScript(tabId) {
    try {
        await chrome.scripting.executeScript({
            target: { tabId: tabId },
            files: ['content.js']
        });
        console.log('Content script已注入');
    } catch (error) {
        console.error('注入content script失败:', error);
        throw error;
    }
}

// 重置已使用的银行卡
async function resetUsedCards() {
    if (confirm('确定要重置所有已使用的银行卡吗？这将使所有银行卡重新可用。')) {
        await chrome.storage.local.set({ usedCards: [] });
        await updateStats();
        alert('已重置所有银行卡状态');
    }
}

// 更新银行卡数据
async function updateCardData() {
    const cardDataText = document.getElementById('cardDataInput').value.trim();
    if (!cardDataText) {
        alert('请输入银行卡数据');
        return;
    }
    
    const cardLines = cardDataText.split('\n').filter(line => line.trim());
    const validCards = [];
    const invalidCards = [];
    
    // 验证每行数据格式
    cardLines.forEach((line, index) => {
        let trimmedLine = line.trim();
        
        // 过滤掉序号前缀（如 "1." "2." 等）
        const numberPrefixMatch = trimmedLine.match(/^\d+\.\s*/);
        if (numberPrefixMatch) {
            trimmedLine = trimmedLine.substring(numberPrefixMatch[0].length);
        }
        
        let parts = trimmedLine.split('|');
        let isSlashFormat = false;
        
        // 如果不是竖线格式，尝试斜杠格式
        if (parts.length === 1) {
            parts = trimmedLine.split('/');
            isSlashFormat = true;
        }
        
        if (parts.length === 4) {
            // 格式1: 卡号|月|年|CVC 或 卡号/月/年/CVC
            const [number, month, year, cvc] = parts;
            if (number && month && year && cvc) {
                // 统一转换为竖线格式存储
                validCards.push(`${number.trim()}|${month.trim()}|${year.trim()}|${cvc.trim()}`);
            } else {
                invalidCards.push(index + 1);
            }
        } else if (parts.length === 3 && !isSlashFormat) {
            // 格式2: 卡号|月/年|CVC
            const [number, dateStr, cvc] = parts;
            if (number && dateStr && cvc) {
                // 尝试解析 月/年 格式
                const dateParts = dateStr.trim().split('/');
                if (dateParts.length === 2) {
                    const month = dateParts[0].trim();
                    const year = dateParts[1].trim();
                    if (month && year) {
                        // 转换为统一的4段格式存储
                        validCards.push(`${number.trim()}|${month}|${year}|${cvc.trim()}`);
                    } else {
                        invalidCards.push(index + 1);
                    }
                } else {
                    invalidCards.push(index + 1);
                }
            } else {
                invalidCards.push(index + 1);
            }
        } else {
            invalidCards.push(index + 1);
        }
    });
    
    if (invalidCards.length > 0) {
        alert(`第 ${invalidCards.join(', ')} 行数据格式错误。\n\n支持的格式：\n1. 卡号|月|年|CVC\n2. 卡号|月/年|CVC\n3. 卡号/月/年/CVC`);
        return;
    }
    
    if (validCards.length > 100) {
        alert('最多只能添加100张银行卡');
        return;
    }
    
    // 保存数据并重置使用状态
    await chrome.storage.local.set({ 
        cardData: validCards,
        usedCards: []
    });
    
    await updateStats();
    await loadCardData(); // 重新加载并显示已保存的数据
    alert(`成功更新 ${validCards.length} 张银行卡数据`);
}

// 更新统计信息
async function updateStats() {
    try {
        const result = await chrome.storage.local.get(['cardData', 'usedCards']);
        const cardData = result.cardData || [];
        const usedCards = result.usedCards || [];
        
        const totalCards = cardData.length;
        const usedCount = usedCards.length;
        const remainingCount = totalCards - usedCount;
        
        document.getElementById('totalCards').textContent = totalCards;
        document.getElementById('usedCards').textContent = usedCount;
        document.getElementById('remainingCards').textContent = remainingCount;
        
        // 如果没有剩余卡片，显示警告
        if (remainingCount === 0 && totalCards > 0) {
            document.getElementById('remainingCards').style.color = '#dc3545';
        } else {
            document.getElementById('remainingCards').style.color = '#28a745';
        }
    } catch (error) {
        console.error('更新统计信息失败:', error);
    }
}

// 加载现有的银行卡数据到文本框
async function loadCardData() {
    try {
        const result = await chrome.storage.local.get(['cardData']);
        const cardData = result.cardData || [];
        
        if (cardData.length > 0 && false) {
            // 将已保存的卡片数据显示在文本框中
            document.getElementById('cardDataInput').value = cardData.join('\n');
            document.getElementById('cardDataInput').placeholder = 
                `当前有 ${cardData.length} 张银行卡`;
        } else {
            document.getElementById('cardDataInput').value = '';
            document.getElementById('cardDataInput').placeholder = 
                '在此输入银行卡数据，支持格式：\n1. 卡号|月|年|CVC\n2. 卡号|月/年|CVC\n3. 卡号/月/年/CVC';
        }
    } catch (error) {
        console.error('加载银行卡数据失败:', error);
    }
}

// 清空所有银行卡数据
async function clearAllCards() {
    const result = await chrome.storage.local.get(['cardData']);
    const cardData = result.cardData || [];
    
    if (cardData.length === 0) {
        alert('当前没有银行卡数据');
        return;
    }
    
    if (confirm(`确定要清空所有银行卡数据吗？\n\n当前共有 ${cardData.length} 张银行卡，此操作无法撤销。`)) {
        await chrome.storage.local.set({ 
            cardData: [],
            usedCards: []
        });
        
        await updateStats();
        await loadCardData(); // 重新加载并清空文本框显示
        alert('已成功清空所有银行卡数据');
    }
}

// 使用 popup 中的 iframe 获取节点（避免跨域问题）
async function fetchNodesWithPopupIframe(url, sourceTabId) {
    const iframe = document.getElementById('nodeFetcherIframe');
    
    try {
        console.log('使用 popup iframe 获取节点:', url);
        
        // 通知源标签页显示加载提示
        await chrome.tabs.sendMessage(sourceTabId, {
            action: 'showLoadingNotification',
            message: '正在获取节点信息...'
        });
        
        // 等待 iframe 加载完成
        await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('iframe加载超时（30秒）'));
            }, 30000);
            
            iframe.onload = () => {
                clearTimeout(timeout);
                console.log('popup iframe 加载完成');
                resolve();
            };
            
            iframe.onerror = () => {
                clearTimeout(timeout);
                reject(new Error('iframe加载失败'));
            };
            
            iframe.src = url;
        });
        
        // 等待动态内容渲染
        console.log('等待动态内容渲染...');
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // 从 iframe 中提取 DOM
        const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
        
        if (!iframeDoc) {
            throw new Error('无法访问iframe文档');
        }
        
        console.log('开始从 popup iframe 提取节点...');
        
        // 查找所有 id 为 LC1 的元素
        const elements = iframeDoc.querySelectorAll('[id="LC1"]');
        console.log(`找到 ${elements.length} 个 id="LC1" 的元素`);
        
        if (elements.length === 0) {
            // 调试：显示所有ID
            const allElementsWithId = iframeDoc.querySelectorAll('[id]');
            console.log('iframe中所有带ID的元素:', Array.from(allElementsWithId).map(el => ({
                id: el.id,
                tag: el.tagName,
                text: el.textContent.substring(0, 50)
            })));
            
            throw new Error('未找到 id="LC1" 的元素');
        }
        
        // 收集所有文本内容
        const textContents = [];
        elements.forEach((element, index) => {
            const text = element.textContent.trim();
            if (text) {
                textContents.push(text);
                console.log(`元素 ${index + 1} 的文本:`, text);
            }
        });
        
        if (textContents.length === 0) {
            throw new Error('元素中没有找到文本内容');
        }
        
        // 将所有文本用换行符连接
        const allText = textContents.join('\n');
        
        console.log(`成功获取 ${textContents.length} 个节点信息`);
        
        // 通知源标签页复制到剪贴板并显示成功提示
        await chrome.tabs.sendMessage(sourceTabId, {
            action: 'copyAndShowSuccess',
            text: allText,
            count: textContents.length
        });
        
    } catch (error) {
        console.error('popup iframe获取节点失败:', error);
        
        // 通知源标签页显示错误提示
        try {
            await chrome.tabs.sendMessage(sourceTabId, {
                action: 'showErrorNotification',
                message: error.message
            });
        } catch (e) {
            console.error('无法发送错误通知:', e);
        }
    } finally {
        // 清理 iframe
        iframe.src = 'about:blank';
    }
}
