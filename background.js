// 美国常见姓名数据
const AMERICAN_NAMES = {
  firstNames: [
    'James', 'Robert', 'John', 'Michael', 'William', 'David', 'Richard', 'Joseph', 'Thomas', 'Christopher',
    'Charles', 'Daniel', 'Matthew', 'Anthony', 'Mark', 'Donald', 'Steven', 'Andrew', 'Kenneth', 'Joshua',
    'Kevin', 'Brian', 'George', 'Timothy', 'Ronald', 'Jason', 'Edward', 'Jeffrey', 'Ryan', 'Jacob',
    'Mary', 'Patricia', 'Jennifer', 'Linda', 'Elizabeth', 'Barbara', 'Susan', 'Jessica', 'Sarah', 'Karen',
    'Nancy', 'Lisa', 'Betty', 'Dorothy', 'Sandra', 'Ashley', 'Kimberly', 'Donna', 'Emily', 'Michelle'
  ],
  lastNames: [
    'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez',
    'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson', 'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin',
    'Lee', 'Perez', 'Thompson', 'White', 'Harris', 'Sanchez', 'Clark', 'Ramirez', 'Lewis', 'Robinson',
    'Walker', 'Young', 'Allen', 'King', 'Wright', 'Scott', 'Torres', 'Nguyen', 'Hill', 'Flores'
  ]
};

// 美国真实地址数据
const US_ADDRESSES = [
  { street: '123 Main St', city: 'New York', state: 'NY', zip: '10001' },
  { street: '456 Oak Ave', city: 'Los Angeles', state: 'CA', zip: '90210' },
  { street: '789 Pine Rd', city: 'Chicago', state: 'IL', zip: '60601' },
  { street: '321 Elm St', city: 'Houston', state: 'TX', zip: '77001' },
  { street: '654 Maple Dr', city: 'Phoenix', state: 'AZ', zip: '85001' },
  { street: '987 Cedar Ln', city: 'Philadelphia', state: 'PA', zip: '19101' },
  { street: '147 Birch Way', city: 'San Antonio', state: 'TX', zip: '78201' },
  { street: '258 Spruce Ct', city: 'San Diego', state: 'CA', zip: '92101' },
  { street: '369 Willow St', city: 'Dallas', state: 'TX', zip: '75201' },
  { street: '741 Poplar Ave', city: 'San Jose', state: 'CA', zip: '95101' },
  { street: '852 Cherry Blvd', city: 'Austin', state: 'TX', zip: '73301' },
  { street: '963 Hickory Pl', city: 'Jacksonville', state: 'FL', zip: '32099' },
  { street: '159 Walnut St', city: 'Fort Worth', state: 'TX', zip: '76101' },
  { street: '357 Chestnut Dr', city: 'Columbus', state: 'OH', zip: '43085' },
  { street: '486 Sycamore Ln', city: 'Charlotte', state: 'NC', zip: '28202' },
  { street: '792 Magnolia Way', city: 'San Francisco', state: 'CA', zip: '94102' },
  { street: '135 Redwood Ct', city: 'Indianapolis', state: 'IN', zip: '46201' },
  { street: '246 Aspen Ave', city: 'Seattle', state: 'WA', zip: '98101' },
  { street: '468 Dogwood St', city: 'Denver', state: 'CO', zip: '80202' },
  { street: '579 Cypress Dr', city: 'Washington', state: 'DC', zip: '20001' },
  { street: '681 Hemlock Rd', city: 'Boston', state: 'MA', zip: '02101' },
  { street: '793 Juniper Blvd', city: 'El Paso', state: 'TX', zip: '79901' },
  { street: '124 Laurel Pl', city: 'Detroit', state: 'MI', zip: '48201' },
  { street: '235 Mulberry St', city: 'Nashville', state: 'TN', zip: '37201' },
  { street: '346 Peach Ave', city: 'Portland', state: 'OR', zip: '97201' },
  { street: '457 Plum Ln', city: 'Oklahoma City', state: 'OK', zip: '73101' },
  { street: '568 Apple Way', city: 'Las Vegas', state: 'NV', zip: '89101' },
  { street: '679 Pear Ct', city: 'Louisville', state: 'KY', zip: '40201' },
  { street: '780 Orange Dr', city: 'Baltimore', state: 'MD', zip: '21201' },
  { street: '891 Lemon St', city: 'Milwaukee', state: 'WI', zip: '53201' }
];

// 扩展启动时创建右键菜单
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'fillPaymentForm',
    title: '一键填写支付信息',
    contexts: ['page']
  });
  
  chrome.contextMenus.create({
    id: 'fetchNodes',
    title: '一键获取节点',
    contexts: ['page']
  });
  
  // 初始化默认银行卡数据
  initializeCardData();
});

// 右键菜单点击事件
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'fillPaymentForm') {
    try {
      // 首先检查content script是否已加载
      let response;
      try {
        response = await chrome.tabs.sendMessage(tab.id, { action: 'ping' });
      } catch (error) {
        response = null;
      }
      
      if (!response || !response.ready) {
        // 动态注入content script
        try {
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['content.js']
          });
          
          // 等待脚本初始化
          await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (error) {
          console.error('注入content script失败:', error);
        }
      }
      
      // 发送填写指令
      await chrome.tabs.sendMessage(tab.id, { action: 'fillPaymentForm' });
      
    } catch (error) {
      console.error('右键菜单执行失败:', error);
      
      // 在当前标签页显示错误通知
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: (errorMsg) => {
            alert('智能表单填写助手:\n\n' + errorMsg + '\n\n建议解决方法:\n1. 刷新页面后重试\n2. 检查是否在支持的网站上\n3. 尝试使用快捷键 Ctrl+Shift+F');
          },
          args: [error.message]
        });
      } catch (notificationError) {
        console.error('无法显示错误通知:', notificationError);
      }
    }
  } else if (info.menuItemId === 'fetchNodes') {
    try {
      // 确保content script已加载
      let response;
      try {
        response = await chrome.tabs.sendMessage(tab.id, { action: 'ping' });
      } catch (error) {
        response = null;
      }
      
      if (!response || !response.ready) {
        // 动态注入content script
        try {
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['content.js']
          });
          
          // 等待脚本初始化
          await new Promise(resolve => setTimeout(resolve, 500));
        } catch (error) {
          console.error('注入content script失败:', error);
        }
      }
      
      // 使用 GitLab API 直接获取数据
      const apiUrl = 'https://gitlab.com/api/v4/projects/56175930/wikis/v2ray%E5%85%8D%E8%B4%B9%E8%B4%A6%E5%8F%B7';
      
      console.log('正在从 API 获取节点信息...');
      
      // 显示加载提示
      await chrome.tabs.sendMessage(tab.id, {
        action: 'showLoadingNotification',
        message: '正在获取节点信息...'
      });
      
      try {
        // 调用 API
        const response = await fetch(apiUrl);
        if (!response.ok) {
          throw new Error(`API 请求失败: ${response.status}`);
        }
        
        const data = await response.json();
        const content = data.content;
        
        if (!content) {
          throw new Error('API 返回的内容为空');
        }
        
        console.log('成功获取 API 数据，开始提取节点...');
        
        // 提取所有代码块中的节点链接
        const codeBlockRegex = /```bash\s*([\s\S]*?)\s*```/g;
        const nodes = [];
        let match;
        
        while ((match = codeBlockRegex.exec(content)) !== null) {
          const codeContent = match[1].trim();
          // 提取以协议开头的链接（hysteria2://, vmess://, vless://, ss://, trojan:// 等）
          const lines = codeContent.split('\n');
          for (const line of lines) {
            const trimmedLine = line.trim();
            if (trimmedLine && 
                (trimmedLine.startsWith('hysteria2://') || 
                 trimmedLine.startsWith('vmess://') || 
                 trimmedLine.startsWith('vless://') ||
                 trimmedLine.startsWith('ss://') ||
                 trimmedLine.startsWith('trojan://') ||
                 trimmedLine.startsWith('hy2://'))) {
              nodes.push(trimmedLine);
            }
          }
        }
        
        if (nodes.length === 0) {
          throw new Error('未找到任何节点信息');
        }
        
        console.log(`成功提取 ${nodes.length} 个节点`);
        
        // 将节点信息用换行符连接
        const allNodes = nodes.join('\n');
        
        // 发送给 content script 处理复制和显示
        await chrome.tabs.sendMessage(tab.id, {
          action: 'copyAndShowSuccess',
          text: allNodes,
          count: nodes.length
        });
        
      } catch (fetchError) {
        console.error('API 获取失败:', fetchError);
        
        // 显示错误提示
        try {
          await chrome.tabs.sendMessage(tab.id, {
            action: 'showErrorNotification',
            message: fetchError.message
          });
        } catch (e) {
          console.error('无法发送错误通知:', e);
          alert('获取节点失败: ' + fetchError.message);
        }
      }
      
    } catch (error) {
      console.error('获取节点失败:', error);
      
      // 显示错误提示
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (errorMsg) => {
          alert('获取节点失败:\n\n' + errorMsg);
        },
        args: [error.message]
      });
    }
  }
});

// 初始化银行卡数据
async function initializeCardData() {
  const result = await chrome.storage.local.get(['cardData', 'hasInitialized']);
  
  // 只在首次安装时初始化空数组，不添加任何默认数据
  if (!result.hasInitialized) {
    await chrome.storage.local.set({ 
      cardData: [],
      usedCards: [],
      hasInitialized: true
    });
  }
}

// 生成随机美国姓名
function generateAmericanName() {
  const firstName = AMERICAN_NAMES.firstNames[Math.floor(Math.random() * AMERICAN_NAMES.firstNames.length)];
  const lastName = AMERICAN_NAMES.lastNames[Math.floor(Math.random() * AMERICAN_NAMES.lastNames.length)];
  return `${firstName} ${lastName}`;
}

// 生成随机美国地址
function generateAmericanAddress() {
  const address = US_ADDRESSES[Math.floor(Math.random() * US_ADDRESSES.length)];
  return {
    street1: address.street,
    street2: `Apt ${Math.floor(Math.random() * 999) + 1}`,
    city: address.city,
    state: address.state,
    zip: address.zip
  };
}

// 获取下一张可用的银行卡
async function getNextAvailableCard() {
  const result = await chrome.storage.local.get(['cardData', 'usedCards']);
  const cardData = result.cardData || [];
  const usedCards = result.usedCards || [];
  
  // 找到第一张未使用的卡
  for (let i = 0; i < cardData.length; i++) {
    if (!usedCards.includes(i)) {
      const cardInfo = cardData[i].split('|');
      return {
        index: i,
        number: cardInfo[0],
        month: cardInfo[1],
        year: cardInfo[2],
        cvc: cardInfo[3]
      };
    }
  }
  
  return null; // 没有可用的卡
}

// 标记银行卡为已使用
async function markCardAsUsed(cardIndex) {
  const result = await chrome.storage.local.get(['usedCards']);
  const usedCards = result.usedCards || [];
  usedCards.push(cardIndex);
  await chrome.storage.local.set({ usedCards });
}

// 处理来自content script的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getPaymentData') {
    (async () => {
      const card = await getNextAvailableCard();
      if (card) {
        const paymentData = {
          card: card,
          name: generateAmericanName(),
          address: generateAmericanAddress()
        };
        sendResponse(paymentData);
      } else {
        sendResponse({ error: '没有可用的银行卡数据' });
      }
    })();
    return true; // 异步响应
  } else if (request.action === 'markCardUsed') {
    markCardAsUsed(request.cardIndex);
    sendResponse({ success: true });
  }
});
