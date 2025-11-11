// 等待页面加载完成
let isProcessing = false;
let contentScriptReady = false;

// 页面加载时初始化
function initializeContentScript() {
  contentScriptReady = true;
  console.log('智能表单填写助手已准备就绪');
  
  // 发送就绪状态给background
  try {
    chrome.runtime.sendMessage({ action: 'contentScriptReady' });
  } catch (error) {
    console.log('无法发送就绪状态，这是正常的');
  }
}

// 监听来自background script的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('收到消息:', request);
  
  if (request.action === 'fillPaymentForm') {
    if (!isProcessing) {
      fillPaymentForm();
      sendResponse({ success: true });
    } else {
      sendResponse({ success: false, message: '正在处理中...' });
    }
  } else if (request.action === 'ping') {
    sendResponse({ ready: contentScriptReady });
  } else if (request.action === 'extractNodes') {
    extractNodesFromHTML(request.html);
    sendResponse({ success: true });
  } else if (request.action === 'extractNodesFromCurrentPage') {
    extractNodesFromCurrentPage(request.silent);
    sendResponse({ success: true });
  } else if (request.action === 'fetchNodesWithIframe') {
    fetchNodesWithIframe(request.url);
    sendResponse({ success: true });
  } else if (request.action === 'showLoadingNotification') {
    showLoadingNotification(request.message);
    sendResponse({ success: true });
  } else if (request.action === 'copyAndShowSuccess') {
    copyAndShowSuccess(request.text, request.count);
    sendResponse({ success: true });
  } else if (request.action === 'showErrorNotification') {
    showErrorNotification(request.message);
    sendResponse({ success: true });
  }
  
  return true; // 保持消息通道开放
});

// 主要的填写函数
async function fillPaymentForm() {
  isProcessing = true;
  
  try {
    console.log('开始自动填写支付表单...');
    
    // 调试：显示页面上的所有输入字段
    if (window.location.hostname.includes('stripe') || window.location.href.includes('checkout')) {
      debugPageFields();
    }
    
    // 获取支付数据
    const paymentData = await getPaymentDataFromBackground();
    if (paymentData.error) {
      alert(paymentData.error);
      return;
    }
    
    console.log('获取到支付数据:', paymentData);
    
    // 1. 先选择银行卡支付方式
    await selectBankCardOption();
    
    // 等待表单元素加载
    await sleep(1000);
    
    // 2. 填写银行卡信息
    await fillCardInformation(paymentData.card);
    
    // 3. 填写持卡人姓名
    await fillCardholderName(paymentData.name);
    
    // 4. 填写账单地址
    await fillBillingAddress(paymentData.address);
    
    // 标记银行卡为已使用
    await markCardAsUsed(paymentData.card.index);
    
    console.log('支付表单填写完成！');
    alert('支付信息已自动填写完成！');
    
  } catch (error) {
    console.error('填写支付表单时出错:', error);
    alert('填写支付表单时出错: ' + error.message);
  } finally {
    isProcessing = false;
  }
}

// 调试函数：显示页面上的所有表单字段
function debugPageFields() {
  console.log('=== 页面表单字段调试信息 ===');
  
  // 显示所有输入框
  const inputs = document.querySelectorAll('input, select, textarea');
  console.log(`找到 ${inputs.length} 个表单字段:`);
  
  inputs.forEach((input, index) => {
    const info = {
      index: index,
      tag: input.tagName,
      type: input.type || 'text',
      name: input.name || '无',
      id: input.id || '无',
      placeholder: input.placeholder || '无',
      ariaLabel: input.getAttribute('aria-label') || '无',
      class: input.className || '无',
      visible: input.getBoundingClientRect().width > 0
    };
    console.log(`字段 ${index}:`, info);
  });
  
  // 显示所有iframe
  const iframes = document.querySelectorAll('iframe');
  console.log(`找到 ${iframes.length} 个iframe:`);
  
  iframes.forEach((iframe, index) => {
    console.log(`iframe ${index}:`, {
      src: iframe.src,
      name: iframe.name,
      title: iframe.title,
      id: iframe.id
    });
  });
  
  // 显示页面URL信息
  console.log('页面信息:', {
    url: window.location.href,
    hostname: window.location.hostname,
    pathname: window.location.pathname
  });
  
  console.log('=== 调试信息结束 ===');
}

// 从background script获取支付数据
function getPaymentDataFromBackground() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ action: 'getPaymentData' }, (response) => {
      resolve(response);
    });
  });
}

// 标记银行卡为已使用
function markCardAsUsed(cardIndex) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ 
      action: 'markCardUsed', 
      cardIndex: cardIndex 
    }, (response) => {
      resolve(response);
    });
  });
}

// 选择银行卡支付选项
async function selectBankCardOption() {
  console.log('正在选择银行卡支付选项...');
  
  // 常见的银行卡选项选择器
  const cardSelectors = [
    // 基础选择器
    'input[value="card"]',
    'input[type="radio"][value="card"]',
    'input[data-testid="card-tab"]',
    'input[aria-label*="卡"]',
    'input[aria-label*="Card"]',
    'input[aria-label*="银行卡"]',
    'label[for*="card"] input',
    '.payment-method input[value="card"]',
    '[data-payment-method="card"] input',
    // Stripe特有的选择器
    '.p-RadioGroup input[value="card"]',
    '.p-RadioGroup-radio[value="card"]',
    '[data-elements-stable-field-name="paymentMethod"] input[value="card"]',
    // 新增Stripe选择器
    'input[data-testid="payment-method-card"]',
    'input[aria-label*="Credit or debit card"]',
    'input[aria-label*="信用卡"]',
    'input[aria-label*="借记卡"]',
    '[data-qa="payment-method-card"] input',
    '.PaymentMethod input[value="card"]',
    '.PaymentMethodsContainer input[value="card"]',
    // 文本匹配选择器
    'input[type="radio"]'
  ];
  
  for (const selector of cardSelectors) {
    const element = document.querySelector(selector);
    if (element) {
      console.log('找到银行卡选项:', selector);
      element.click();
      await sleep(500);
      return;
    }
  }
  
  // 如果没找到radio按钮，尝试寻找可点击的标签或容器
  const labelSelectors = [
    'label[for*="card"]',
    '.payment-method[data-value="card"]',
    '.payment-option[data-value="card"]',
    '[data-testid="card-tab"]',
    '.p-RadioGroup-radio[data-value="card"]'
  ];
  
  for (const selector of labelSelectors) {
    const element = document.querySelector(selector);
    if (element) {
      console.log('找到银行卡标签:', selector);
      element.click();
      await sleep(500);
      return;
    }
  }
  
  console.log('未找到银行卡选项，可能已经默认选中');
}

// 填写银行卡信息
async function fillCardInformation(cardInfo) {
  console.log('正在填写银行卡信息...');
  
  // 银行卡号
  await fillCardNumber(cardInfo.number);
  
  // 到期时间
  await fillExpiryDate(cardInfo.month, cardInfo.year);
  
  // CVC
  await fillCVC(cardInfo.cvc);
}

// 填写银行卡号
async function fillCardNumber(cardNumber) {
  const cardNumberSelectors = [
    // 标准选择器
    'input[name*="card"]',
    'input[name*="number"]',
    'input[placeholder*="卡号"]',
    'input[placeholder*="Card number"]',
    'input[placeholder*="1234"]',
    'input[placeholder*="1111"]',
    'input[data-testid="card-number"]',
    'input[aria-label*="卡号"]',
    'input[aria-label*="Card number"]',
    '#card-number',
    '.card-number input',
    '[data-elements-stable-field-name="cardNumber"] input',
    // Stripe特有的选择器
    'input[data-testid="payment-input-card-number"]',
    'input[placeholder*="1234 1234 1234 1234"]',
    'input[autocomplete="cc-number"]',
    'input[name="cardnumber"]',
    'input[id*="cardnumber"]',
    'input[class*="cardnumber"]',
    // 通用信用卡字段
    'input[type="text"]:not([name*="name"]):not([name*="address"]):not([name*="city"]):not([name*="zip"])'
  ];
  
  console.log('尝试填写银行卡号:', cardNumber);
  
  // 首先尝试标准方法
  const filled = await fillField(cardNumberSelectors, cardNumber);
  
  if (!filled) {
    // 如果标准方法失败，尝试Stripe特殊处理
    await handleStripeCardNumber(cardNumber);
  }
}

// 处理Stripe特殊银行卡号字段
async function handleStripeCardNumber(cardNumber) {
  console.log('尝试Stripe特殊处理银行卡号');
  
  // 查找可能的Stripe iframe
  const iframes = document.querySelectorAll('iframe[src*="stripe"], iframe[name*="card"], iframe[title*="card"]');
  
  if (iframes.length > 0) {
    console.log('找到Stripe iframe，但无法直接访问内容');
    // 由于安全限制，无法直接访问iframe内容
    // 尝试通过父元素的事件模拟
  }
  
  // 尝试其他方法：寻找可能的输入框
  const allInputs = document.querySelectorAll('input[type="text"], input[type="tel"], input:not([type])');
  for (const input of allInputs) {
    const rect = input.getBoundingClientRect();
    // 检查是否是可见的输入框
    if (rect.width > 0 && rect.height > 0) {
      const placeholder = input.placeholder.toLowerCase();
      const ariaLabel = (input.getAttribute('aria-label') || '').toLowerCase();
      
      if (placeholder.includes('card') || placeholder.includes('1234') || 
          ariaLabel.includes('card') || ariaLabel.includes('number')) {
        console.log('找到可能的银行卡号字段:', input);
        
        // 尝试填写
        input.focus();
        input.click();
        await sleep(200);
        
        // 清空并输入新值
        input.value = '';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        
        // 逐个字符输入（模拟真实输入）
        for (let i = 0; i < cardNumber.length; i++) {
          input.value += cardNumber[i];
          input.dispatchEvent(new Event('input', { bubbles: true }));
          await sleep(50);
        }
        
        input.dispatchEvent(new Event('change', { bubbles: true }));
        input.dispatchEvent(new Event('blur', { bubbles: true }));
        
        return true;
      }
    }
  }
  
  return false;
}

// 填写到期时间
async function fillExpiryDate(month, year) {
  // 先尝试填写组合的到期时间字段
  const combinedSelectors = [
    'input[placeholder*="MM/YY"]',
    'input[placeholder*="MM/YYYY"]',
    'input[placeholder*="月/年"]',
    'input[name*="expiry"]',
    'input[data-testid="card-expiry"]',
    'input[aria-label*="到期"]',
    'input[aria-label*="Expiry"]',
    '[data-elements-stable-field-name="cardExpiry"] input'
  ];
  
  const expiryValue = `${month.padStart(2, '0')}/${year}`;
  
  if (await fillStripeField('cardExpiry', expiryValue, combinedSelectors)) {
    return;
  }
  
  // 如果没有组合字段，尝试分别填写月份和年份
  const monthSelectors = [
    'select[name*="month"]',
    'input[name*="month"]',
    'select[aria-label*="月"]',
    'select[aria-label*="Month"]'
  ];
  
  const yearSelectors = [
    'select[name*="year"]',
    'input[name*="year"]',
    'select[aria-label*="年"]',
    'select[aria-label*="Year"]'
  ];
  
  await fillField(monthSelectors, month);
  await fillField(yearSelectors, year);
}

// 填写CVC
async function fillCVC(cvc) {
  const cvcSelectors = [
    'input[name*="cvc"]',
    'input[name*="cvv"]',
    'input[placeholder*="CVC"]',
    'input[placeholder*="CVV"]',
    'input[placeholder*="123"]',
    'input[data-testid="card-cvc"]',
    'input[aria-label*="CVC"]',
    'input[aria-label*="CVV"]',
    '[data-elements-stable-field-name="cardCvc"] input'
  ];
  
  await fillStripeField('cardCvc', cvc, cvcSelectors);
}

// 填写持卡人姓名
async function fillCardholderName(name) {
  console.log('正在填写持卡人姓名...');
  
  const nameSelectors = [
    'input[name*="name"]',
    'input[placeholder*="姓名"]',
    'input[placeholder*="Name"]',
    'input[placeholder*="全名"]',
    'input[placeholder*="Full name"]',
    'input[data-testid="card-name"]',
    'input[aria-label*="姓名"]',
    'input[aria-label*="Name"]',
    '#cardholder-name',
    '.cardholder-name input'
  ];
  
  await fillField(nameSelectors, name);
}

// 填写账单地址
async function fillBillingAddress(address) {
  console.log('正在填写账单地址...');
  
  // 国家选择（美国）
  const countrySelectors = [
    'select[name*="country"]',
    'select[aria-label*="国家"]',
    'select[aria-label*="Country"]'
  ];
  await fillField(countrySelectors, 'US', true);
  
  // 地址第一行
  const address1Selectors = [
    'input[name*="address1"]',
    'input[name*="address_line_1"]',
    'input[placeholder*="地址"]',
    'input[placeholder*="Address"]',
    'input[aria-label*="地址第1行"]',
    'input[aria-label*="Address line 1"]'
  ];
  await fillField(address1Selectors, address.street1);
  
  // 地址第二行（可选）
  const address2Selectors = [
    'input[name*="address2"]',
    'input[name*="address_line_2"]',
    'input[placeholder*="公寓"]',
    'input[placeholder*="Apartment"]',
    'input[aria-label*="地址第2行"]',
    'input[aria-label*="Address line 2"]'
  ];
  await fillField(address2Selectors, address.street2);
  
  // 城市
  const citySelectors = [
    'input[name*="city"]',
    'input[placeholder*="城市"]',
    'input[placeholder*="City"]',
    'input[aria-label*="城市"]',
    'input[aria-label*="City"]'
  ];
  await fillField(citySelectors, address.city);
  
  // 邮编
  const zipSelectors = [
    'input[name*="zip"]',
    'input[name*="postal"]',
    'input[placeholder*="邮编"]',
    'input[placeholder*="ZIP"]',
    'input[placeholder*="Postal"]',
    'input[aria-label*="邮编"]',
    'input[aria-label*="ZIP"]',
    'input[aria-label*="Postal"]'
  ];
  await fillField(zipSelectors, address.zip);
  
  // 州/省
  const stateSelectors = [
    'select[name*="state"]',
    'input[name*="state"]',
    'select[aria-label*="州"]',
    'select[aria-label*="State"]',
    'input[aria-label*="州"]',
    'input[aria-label*="State"]'
  ];
  await fillField(stateSelectors, address.state, true);
}

// 通用填写函数
async function fillField(selectors, value, isSelect = false) {
  // 首先尝试精确匹配
  for (const selector of selectors) {
    const elements = document.querySelectorAll(selector);
    for (const element of elements) {
      // 检查元素是否可见和可交互
      const rect = element.getBoundingClientRect();
      const isVisible = rect.width > 0 && rect.height > 0 && 
                       getComputedStyle(element).visibility !== 'hidden' &&
                       getComputedStyle(element).display !== 'none';
      
      if (isVisible && !element.disabled && !element.readOnly) {
        console.log(`找到字段: ${selector}, 填写值: ${value}`);
        
        if (isSelect && element.tagName === 'SELECT') {
          // 处理下拉选择
          if (fillSelectOption(element, value)) {
            await sleep(300);
            return true;
          }
        } else {
          // 处理输入框
          if (await fillInputField(element, value)) {
            await sleep(300);
            return true;
          }
        }
      }
    }
  }
  
  console.log(`未找到可用字段: ${selectors.slice(0, 3).join(', ')}...`);
  return false;
}

// 填写输入框
async function fillInputField(element, value) {
  try {
    // 聚焦元素
    element.focus();
    element.click();
    await sleep(100);
    
    // 清空现有内容
    element.select();
    document.execCommand('delete');
    
    // 设置新值
    element.value = value;
    
    // 触发输入事件
    element.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
    element.dispatchEvent(new Event('keyup', { bubbles: true, cancelable: true }));
    element.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
    
    // 失去焦点
    element.blur();
    element.dispatchEvent(new Event('blur', { bubbles: true, cancelable: true }));
    
    return true;
  } catch (error) {
    console.error('填写输入框失败:', error);
    return false;
  }
}

// 填写下拉选择框
function fillSelectOption(selectElement, value) {
  try {
    // 尝试直接设置值
    selectElement.value = value;
    
    // 如果直接设置失败，尝试查找匹配的选项
    if (selectElement.value !== value) {
      const options = selectElement.querySelectorAll('option');
      for (const option of options) {
        if (option.value === value || 
            option.text === value || 
            option.value.includes(value) || 
            option.text.includes(value)) {
          selectElement.value = option.value;
          break;
        }
      }
    }
    
    // 触发change事件
    selectElement.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  } catch (error) {
    console.error('填写下拉选择框失败:', error);
    return false;
  }
}

// 特殊处理Stripe字段（可能在iframe中）
async function fillStripeField(fieldType, value, fallbackSelectors) {
  // 首先尝试常规选择器
  if (await fillField(fallbackSelectors, value)) {
    return true;
  }
  
  // 尝试Stripe的特殊处理
  // 这里可能需要特殊的Stripe元素处理逻辑
  const stripeElements = document.querySelectorAll('iframe[name*="stripe"], iframe[src*="stripe"]');
  for (const iframe of stripeElements) {
    if (iframe.name.includes(fieldType) || iframe.title.includes(fieldType)) {
      try {
        // 注意：由于安全限制，实际上无法直接访问iframe内容
        // 这里只是示例代码，实际可能需要其他方法
        console.log(`找到Stripe iframe: ${iframe.name}`);
      } catch (error) {
        console.log('无法访问Stripe iframe内容');
      }
    }
  }
  
  return false;
}

// 延时函数
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 显示加载通知
function showLoadingNotification(message) {
  // 移除旧的通知
  const oldNotification = document.getElementById('__node_fetcher_loading__');
  if (oldNotification) {
    oldNotification.remove();
  }
  
  // 创建加载提示
  const loadingDiv = document.createElement('div');
  loadingDiv.id = '__node_fetcher_loading__';
  loadingDiv.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: rgba(0, 0, 0, 0.85);
    color: white;
    padding: 15px 20px;
    border-radius: 8px;
    z-index: 999999;
    font-family: Arial, sans-serif;
    font-size: 14px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
  `;
  loadingDiv.innerHTML = `
    <div style="display: flex; align-items: center; gap: 10px;">
      <div style="
        width: 20px;
        height: 20px;
        border: 3px solid #fff;
        border-top-color: transparent;
        border-radius: 50%;
        animation: spin 1s linear infinite;
      "></div>
      <span>${message}</span>
    </div>
    <style>
      @keyframes spin {
        to { transform: rotate(360deg); }
      }
    </style>
  `;
  document.body.appendChild(loadingDiv);
}

// 复制到剪贴板并显示成功提示
async function copyAndShowSuccess(text, count) {
  const loadingDiv = document.getElementById('__node_fetcher_loading__');
  
  try {
    console.log(`准备复制 ${count} 个节点到剪贴板`);
    
    // 复制到剪贴板
    const success = await copyToClipboard(text);
    
    if (!success) {
      throw new Error('复制命令未成功执行');
    }
    
    // 更新通知为成功状态
    if (loadingDiv) {
      loadingDiv.innerHTML = `
        <div style="display: flex; align-items: center; gap: 10px;">
          <div style="color: #4CAF50; font-size: 20px;">✓</div>
          <span>成功获取 ${count} 个节点并复制到剪贴板！</span>
        </div>
      `;
      
      // 2秒后自动消失
      setTimeout(() => {
        loadingDiv.style.transition = 'opacity 0.3s';
        loadingDiv.style.opacity = '0';
        setTimeout(() => {
          if (loadingDiv && loadingDiv.parentNode) {
            loadingDiv.remove();
          }
        }, 300);
      }, 2000);
    }
  } catch (error) {
    console.error('复制失败:', error);
    
    // 即使复制失败，也显示获取成功的信息，并提示手动复制
    if (loadingDiv) {
      loadingDiv.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 8px;">
          <div style="display: flex; align-items: center; gap: 10px;">
            <div style="color: #ff9800; font-size: 20px;">⚠️</div>
            <span>已获取 ${count} 个节点，但自动复制失败</span>
          </div>
          <div style="font-size: 12px; color: #666;">
            请在控制台手动复制节点内容
          </div>
        </div>
      `;
      
      // 在控制台输出节点内容
      console.log('\n========== 节点内容 ==========');
      console.log(text);
      console.log('==============================\n');
      
      // 5秒后自动消失
      setTimeout(() => {
        loadingDiv.style.transition = 'opacity 0.3s';
        loadingDiv.style.opacity = '0';
        setTimeout(() => {
          if (loadingDiv && loadingDiv.parentNode) {
            loadingDiv.remove();
          }
        }, 300);
      }, 5000);
    }
  }
}

// 显示错误通知
function showErrorNotification(message) {
  const loadingDiv = document.getElementById('__node_fetcher_loading__');
  if (loadingDiv) {
    loadingDiv.innerHTML = `
      <div style="display: flex; align-items: center; gap: 10px;">
        <div style="color: #f44336; font-size: 20px;">✗</div>
        <span>获取失败: ${message}</span>
      </div>
    `;
    
    // 3秒后自动消失
    setTimeout(() => {
      loadingDiv.style.transition = 'opacity 0.3s';
      loadingDiv.style.opacity = '0';
      setTimeout(() => {
        if (loadingDiv && loadingDiv.parentNode) {
          loadingDiv.remove();
        }
      }, 300);
    }, 3000);
  } else {
    // 如果没有通知元素，直接 alert
    alert('获取节点失败: ' + message);
  }
}

// 使用iframe方式获取节点（完全隐藏，不创建新标签）
async function fetchNodesWithIframe(url) {
  let iframe = null;
  let loadingDiv = null;
  
  try {
    console.log('开始使用iframe方式获取节点:', url);
    
    // 创建加载提示
    loadingDiv = document.createElement('div');
    loadingDiv.id = '__node_fetcher_loading__';
    loadingDiv.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: rgba(0, 0, 0, 0.85);
      color: white;
      padding: 15px 20px;
      border-radius: 8px;
      z-index: 999999;
      font-family: Arial, sans-serif;
      font-size: 14px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    `;
    loadingDiv.innerHTML = `
      <div style="display: flex; align-items: center; gap: 10px;">
        <div style="
          width: 20px;
          height: 20px;
          border: 3px solid #fff;
          border-top-color: transparent;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        "></div>
        <span>正在获取节点信息...</span>
      </div>
      <style>
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      </style>
    `;
    document.body.appendChild(loadingDiv);
    
    // 创建隐藏的iframe
    iframe = document.createElement('iframe');
    iframe.style.cssText = `
      position: fixed;
      top: -9999px;
      left: -9999px;
      width: 1px;
      height: 1px;
      opacity: 0;
      pointer-events: none;
    `;
    document.body.appendChild(iframe);
    
    console.log('iframe已创建，开始加载页面...');
    
    // 等待iframe加载完成
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('iframe加载超时（30秒）'));
      }, 30000); // 30秒超时
      
      iframe.onload = () => {
        clearTimeout(timeout);
        console.log('iframe加载完成');
        resolve();
      };
      
      iframe.onerror = () => {
        clearTimeout(timeout);
        reject(new Error('iframe加载失败'));
      };
      
      // 设置src开始加载
      iframe.src = url;
    });
    
    // 等待动态内容渲染
    console.log('等待动态内容渲染...');
    await sleep(3000);
    
    // 从iframe中提取DOM
    const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
    
    if (!iframeDoc) {
      throw new Error('无法访问iframe文档（可能是跨域限制）');
    }
    
    console.log('开始从iframe提取节点...');
    
    // 查找所有id为LC1的元素
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
    
    // 复制到剪贴板
    await copyToClipboard(allText);
    
    console.log(`成功获取 ${textContents.length} 个节点信息并复制到剪贴板`);
    
    // 显示成功提示
    loadingDiv.innerHTML = `
      <div style="display: flex; align-items: center; gap: 10px;">
        <div style="color: #4CAF50; font-size: 20px;">✓</div>
        <span>节点信息已复制到剪贴板！</span>
      </div>
    `;
    
    // 2秒后自动消失
    setTimeout(() => {
      loadingDiv.style.transition = 'opacity 0.3s';
      loadingDiv.style.opacity = '0';
      setTimeout(() => {
        if (loadingDiv && loadingDiv.parentNode) {
          loadingDiv.remove();
        }
      }, 300);
    }, 2000);
    
  } catch (error) {
    console.error('iframe方式获取节点失败:', error);
    
    // 显示错误提示
    if (loadingDiv && loadingDiv.parentNode) {
      loadingDiv.innerHTML = `
        <div style="display: flex; align-items: center; gap: 10px;">
          <div style="color: #f44336; font-size: 20px;">✗</div>
          <span>获取失败: ${error.message}</span>
        </div>
      `;
      
      // 3秒后自动消失
      setTimeout(() => {
        loadingDiv.style.transition = 'opacity 0.3s';
        loadingDiv.style.opacity = '0';
        setTimeout(() => {
          if (loadingDiv && loadingDiv.parentNode) {
            loadingDiv.remove();
          }
        }, 300);
      }, 3000);
    }
  } finally {
    // 清理iframe
    if (iframe && iframe.parentNode) {
      console.log('清理iframe...');
      iframe.remove();
    }
  }
}

// 从当前页面提取所有id为LC1的元素文本
async function extractNodesFromCurrentPage(silent = false) {
  try {
    console.log('开始从当前页面提取节点信息...');
    console.log('当前页面URL:', window.location.href);
    console.log('静默模式:', silent);
    
    // 查找所有id为LC1的元素（直接从当前页面DOM）
    const elements = document.querySelectorAll('[id="LC1"]');
    console.log(`找到 ${elements.length} 个 id="LC1" 的元素`);
    
    // 如果没找到，尝试其他可能的选择器
    if (elements.length === 0) {
      console.log('尝试查找其他可能的元素...');
      
      // 调试：显示页面上所有的ID
      const allElementsWithId = document.querySelectorAll('[id]');
      console.log('页面上所有带ID的元素:', Array.from(allElementsWithId).map(el => ({
        id: el.id,
        tag: el.tagName,
        text: el.textContent.substring(0, 50)
      })));
      
      if (!silent) {
        alert('未找到 id="LC1" 的元素\n\n请查看控制台了解页面上所有可用的ID');
      }
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
      if (!silent) {
        alert('元素中没有找到文本内容');
      }
      throw new Error('元素中没有找到文本内容');
    }
    
    // 将所有文本用换行符连接
    const allText = textContents.join('\n');
    
    // 复制到剪贴板
    await copyToClipboard(allText);
    
    console.log(`成功获取 ${textContents.length} 个节点信息并复制到剪贴板`);
    
    // 显示成功消息（仅在非静默模式）
    if (!silent) {
      alert(`成功获取 ${textContents.length} 个节点信息并复制到剪贴板！\n\n预览:\n${allText.substring(0, 200)}${allText.length > 200 ? '...' : ''}`);
    }
    
    return true;
    
  } catch (error) {
    console.error('提取节点失败:', error);
    if (!silent) {
      alert('提取节点失败: ' + error.message);
    }
    throw error;
  }
}

// 从HTML字符串中提取所有id为LC1的元素文本（备用方法）
async function extractNodesFromHTML(html) {
  try {
    console.log('开始提取节点信息...');
    
    // 创建一个临时DOM来解析HTML
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    // 查找所有id为LC1的元素
    const elements = doc.querySelectorAll('[id="LC1"]');
    console.log(`找到 ${elements.length} 个 id="LC1" 的元素`);
    
    if (elements.length === 0) {
      alert('未找到 id="LC1" 的元素');
      return;
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
      alert('元素中没有找到文本内容');
      return;
    }
    
    // 将所有文本用换行符连接
    const allText = textContents.join('\n');
    
    // 复制到剪贴板
    await copyToClipboard(allText);
    
    // 显示成功消息
    alert(`成功获取 ${textContents.length} 个节点信息并复制到剪贴板！\n\n预览:\n${allText.substring(0, 200)}${allText.length > 200 ? '...' : ''}`);
    
  } catch (error) {
    console.error('提取节点失败:', error);
    alert('提取节点失败: ' + error.message);
  }
}

// 复制文本到剪贴板
async function copyToClipboard(text) {
  // 优先使用 execCommand，因为它对焦点要求更低
  console.log('开始复制到剪贴板，文本长度:', text.length);
  
  // 方法1: execCommand (优先，因为更可靠)
  try {
    const success = copyToClipboardFallback(text);
    if (success) {
      console.log('成功复制到剪贴板 (execCommand)');
      return true;
    }
  } catch (err) {
    console.error('execCommand 失败:', err);
  }
  
  // 方法2: Clipboard API (备用)
  if (navigator.clipboard && navigator.clipboard.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      console.log('成功复制到剪贴板 (Clipboard API)');
      return true;
    } catch (err) {
      console.error('Clipboard API 也失败:', err);
    }
  }
  
  throw new Error('所有复制方法都失败了');
}

// 复制到剪贴板的备用方法
function copyToClipboardFallback(text) {
  let textarea = null;
  
  try {
    textarea = document.createElement('textarea');
    textarea.value = text;
    
    // 设置样式，使其几乎不可见但可以被选择
    // 关键：不能用 opacity: 0 或 display: none，否则无法选择
    textarea.style.position = 'fixed';
    textarea.style.top = '-9999px';
    textarea.style.left = '-9999px';
    textarea.style.width = '1px';
    textarea.style.height = '1px';
    textarea.style.padding = '0';
    textarea.style.border = 'none';
    textarea.style.outline = 'none';
    textarea.style.boxShadow = 'none';
    textarea.style.background = 'transparent';
    textarea.style.fontSize = '12px';
    textarea.style.zIndex = '9999';
    // 不设置 opacity，保持可见性
    
    // 禁用只读，确保可以选择
    textarea.readOnly = false;
    textarea.contentEditable = true;
    
    document.body.appendChild(textarea);
    
    // 聚焦并选择文本
    textarea.focus();
    textarea.select();
    
    // 兼容 iOS 和旧版浏览器
    if (textarea.setSelectionRange) {
      textarea.setSelectionRange(0, text.length);
    }
    
    // 执行复制命令
    let successful = false;
    try {
      successful = document.execCommand('copy');
      console.log('execCommand 执行结果:', successful);
    } catch (err) {
      console.error('execCommand 抛出异常:', err);
      successful = false;
    }
    
    if (successful) {
      console.log('✓ 成功复制到剪贴板 (execCommand)');
      return true;
    } else {
      console.error('✗ execCommand 返回 false');
      return false;
    }
  } catch (error) {
    console.error('✗ 复制方法执行失败:', error);
    return false;
  } finally {
    // 延迟清理，确保复制完成
    setTimeout(() => {
      if (textarea && textarea.parentNode) {
        document.body.removeChild(textarea);
      }
    }, 100);
  }
}

// 页面初始化
function init() {
  initializeContentScript();
  
  // 添加键盘快捷键 Ctrl+Shift+F
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && e.key === 'F') {
      e.preventDefault();
      if (!isProcessing) {
        fillPaymentForm();
      }
    }
  });
  
  console.log('智能表单填写助手已加载，使用右键菜单或按 Ctrl+Shift+F 触发自动填写');
}

// 等待页面加载
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// 监听页面的动态变化（对于单页应用）
const observer = new MutationObserver((mutations) => {
  if (!contentScriptReady) {
    initializeContentScript();
  }
});

observer.observe(document.body, {
  childList: true,
  subtree: true
});

