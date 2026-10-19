(() => {
  const EVENT_TYPE = "XHS_ADGROUP_CAPTURE_V1";
  const DIRECT_REQUEST = "XHS_ADGROUP_DIRECT_FETCH_REQUEST_V2";
  const DIRECT_PROGRESS = "XHS_ADGROUP_DIRECT_FETCH_PROGRESS_V2";
  const records = new Map();
  const meta = { totalCount: null, totalPage: null, currentPage: null, lastUrl: "" };
  let latestBatch = [];
  let latestBatchVersion = 0;
  let expectedTotal = null;
  let completed = false;
  let running = false;
  let status = "等待采集";
  let pageContextCache = { accountName: "", accountId: "" };
  let directRequestSequence = 0;
  const directWaiters = new Map();

  function notifyProgress() {
    try {
      const result = chrome.runtime.sendMessage?.({ type: "XHS_ADGROUP_PROGRESS", state: getState() });
      if (result?.catch) result.catch(() => {});
    } catch (_) {}
  }

  function setStatus(message) {
    status = message;
    notifyProgress();
  }

  function addRecords(items, preferStatus = false) {
    let added = 0;
    for (const item of items || []) {
      const id = String(item.campaignGroupId ?? "").trim();
      const name = String(item.campaignGroupName ?? "").trim();
      const incomingStatus = String(item.campaignGroupStatus ?? "").trim();
      if (!id || !name) continue;
      if (!records.has(id)) added += 1;
      const existing = records.get(id);
      records.set(id, {
        campaignGroupName: name,
        campaignGroupId: id,
        campaignGroupStatus: (preferStatus && incomingStatus) ? incomingStatus : (existing?.campaignGroupStatus || incomingStatus)
      });
    }
    if (expectedTotal && records.size === expectedTotal) completed = true;
    return added;
  }

  window.addEventListener("message", event => {
    if (event.source !== window) return;
    if (event.data?.type === DIRECT_PROGRESS) {
      const payload = event.data.payload || {};
      const waiter = directWaiters.get(String(payload.requestId || ""));
      if (!waiter) return;
      if (Array.isArray(payload.records)) addRecords(payload.records);
      if (Number.isFinite(payload.totalCount) && payload.totalCount > 0) expectedTotal = payload.totalCount;
      if (payload.pageNumber && payload.totalPages) setStatus(`接口直采第 ${payload.pageNumber} / ${payload.totalPages} 页，已采集 ${records.size} / ${expectedTotal} 条…`);
      if (payload.done) {
        directWaiters.delete(String(payload.requestId || ""));
        clearTimeout(waiter.timeoutId);
        if (payload.error) waiter.reject(new Error(payload.error));
        else waiter.resolve();
      }
      return;
    }
    if (event.data?.type !== EVENT_TYPE) return;
    const payload = event.data.payload || {};
    const added = addRecords(payload.records);
    if (Array.isArray(payload.records) && payload.records.length) {
      latestBatch = payload.records.map(item => ({
        campaignGroupName: String(item.campaignGroupName ?? "").trim(),
        campaignGroupId: String(item.campaignGroupId ?? "").trim(),
        campaignGroupStatus: String(item.campaignGroupStatus ?? "").trim()
      })).filter(item => item.campaignGroupName && item.campaignGroupId);
      latestBatchVersion += 1;
    }
    if (Number.isFinite(payload.totalCount)) meta.totalCount = payload.totalCount;
    if (Number.isFinite(payload.totalPage)) meta.totalPage = payload.totalPage;
    if (Number.isFinite(payload.currentPage)) meta.currentPage = payload.currentPage;
    if (payload.url) meta.lastUrl = payload.url;
    if (!expectedTotal && meta.totalCount) expectedTotal = meta.totalCount;
    if (added && !running) setStatus(`接口已捕获 ${records.size}${expectedTotal ? ` / ${expectedTotal}` : ""} 条`);
  });

  function collectThroughCapturedApi() {
    const requestId = `direct-${Date.now()}-${++directRequestSequence}`;
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        directWaiters.delete(requestId);
        reject(new Error("接口直采超时，请刷新页面后重试。"));
      }, 120000);
      directWaiters.set(requestId, { resolve, reject, timeoutId });
      window.postMessage({ type: DIRECT_REQUEST, requestId }, "*");
    });
  }

  function compactText(value) {
    return String(value || "").replace(/\s+/g, "").trim();
  }

  function readExpectedTotal() {
    const pageText = compactText(document.body?.innerText || document.body?.textContent || "");
    const match = pageText.match(/合计(\d+)条记录/);
    if (match) return Number(match[1]);
    return Number.isFinite(meta.totalCount) && meta.totalCount > 0 ? meta.totalCount : null;
  }

  function findTargetTable() {
    const tables = [...document.querySelectorAll("table")];
    for (const table of tables) {
      const headers = [...table.querySelectorAll("thead th")].map(th => compactText(th.innerText || th.textContent));
      const nameIndex = headers.findIndex(header => header.includes("广告组名称") || header === "广告组");
      const idIndex = headers.findIndex(header => header.includes("广告组ID"));
      const statusIndex = headers.findIndex(header => header.includes("广告组状态"));
      if (nameIndex >= 0 && idIndex >= 0) {
        const bodyTable = [...tables].sort((a, b) => b.querySelectorAll("tbody tr").length - a.querySelectorAll("tbody tr").length)
          .find(candidate => {
            const firstRow = candidate.querySelector("tbody tr");
            return firstRow && firstRow.querySelectorAll("td").length > Math.max(nameIndex, idIndex);
          }) || table;
        return { table, bodyTable, nameIndex, idIndex, statusIndex };
      }
    }
    return null;
  }

  function scrapeVisibleRows() {
    const target = findTargetTable();
    if (!target) throw new Error("未找到包含“广告组名称”和“广告组ID”的表格。请确认已进入标准投的广告组页。");
    const found = [];
    for (const row of target.bodyTable.querySelectorAll("tbody tr")) {
      const cells = [...row.querySelectorAll("td")];
      if (cells.length <= Math.max(target.nameIndex, target.idIndex)) continue;
      const name = (cells[target.nameIndex].innerText || cells[target.nameIndex].textContent || "").trim();
      const idText = (cells[target.idIndex].innerText || cells[target.idIndex].textContent || "").trim();
      const idMatch = idText.match(/\d+/);
      const status = target.statusIndex >= 0 && cells[target.statusIndex]
        ? (cells[target.statusIndex].innerText || cells[target.statusIndex].textContent || "").trim()
        : "";
      if (name && idMatch) found.push({ campaignGroupName: name, campaignGroupId: idMatch[0], campaignGroupStatus: status });
    }
    addRecords(found, true);
    return { count: found.length, signature: found.map(item => item.campaignGroupId).join("|") };
  }

  function isDisabled(element) {
    if (!element) return true;
    const owner = element.closest?.("button,li") || element;
    const cls = String(owner.className || "").toLowerCase();
    return Boolean(owner.disabled) || owner.getAttribute?.("aria-disabled") === "true" || cls.includes("disabled");
  }

  function findNextButton() {
    const selectors = [
      ".ant-pagination-next",
      ".el-pagination .btn-next",
      "button[aria-label='right']",
      "button[aria-label='next']",
      "button[aria-label*='下一页']",
      "[title='下一页']"
    ];
    for (const selector of selectors) {
      const candidates = [...document.querySelectorAll(selector)].filter(el => el.offsetParent !== null);
      if (candidates.length) return candidates[0];
    }
    return null;
  }

  function findFirstPageButton() {
    return findPageControl(1);
  }

  function readTotalPages() {
    const pageText = compactText(document.body?.innerText || document.body?.textContent || "");
    const match = pageText.match(/共\d+条[，,](\d+)页/);
    if (match) return Number(match[1]);
    return Number.isFinite(meta.totalPage) && meta.totalPage > 0 ? meta.totalPage : null;
  }

  function findPaginationRoot() {
    const totalPages = readTotalPages();
    if (!totalPages) return null;
    const exactSummary = new RegExp(`^共\\d+条[，,]${totalPages}页$`);
    const labels = [...document.querySelectorAll("body *")].filter(element => exactSummary.test(compactText(element.innerText || element.textContent)));
    for (const label of labels.sort((a, b) => compactText(a.innerText).length - compactText(b.innerText).length)) {
      let parent = label;
      for (let depth = 0; parent && depth < 8; depth += 1, parent = parent.parentElement) {
        const descendants = [...parent.querySelectorAll("button,a,li,[role='button'],div,span")];
        const pageNumbers = new Set(descendants.map(element => compactText(element.innerText || element.textContent))
          .filter(value => /^\d+$/.test(value) && Number(value) >= 1 && Number(value) <= totalPages));
        if (pageNumbers.size >= Math.min(2, totalPages)) return parent;
      }
    }
    const knownRoots = [...document.querySelectorAll(".ant-pagination,.el-pagination,[class*='pagination'],[class*='pager']")]
      .filter(element => element.offsetParent !== null);
    return knownRoots.sort((a, b) => (a.innerText || "").length - (b.innerText || "").length)[0] || null;
  }

  function isCurrentPageControl(element) {
    const owner = element?.closest?.("li") || element;
    const className = `${String(owner?.className || "")} ${String(owner?.parentElement?.className || "")}`.toLowerCase();
    return className.includes("active") || className.includes("current") || className.includes("selected") || owner?.getAttribute?.("aria-current") === "page";
  }

  function findPageControl(pageNumber) {
    const root = findPaginationRoot();
    const knownSelectors = [
      `.ant-pagination-item-${pageNumber}`,
      `.el-pager li.number:nth-child(${pageNumber})`,
      `[title='${pageNumber}'][class*='page']`,
      `[data-page='${pageNumber}']`
    ];
    for (const selector of knownSelectors) {
      const candidate = [...(root || document).querySelectorAll(selector)].find(el => el.offsetParent !== null);
      if (candidate) return candidate;
    }

    const totalPages = readTotalPages() || 1;
    const selector = "button,a,li,[role='button'],[class*='page'],[class*='Page'],div,span";
    const candidates = [...(root || document).querySelectorAll(selector)].filter(element => {
      if (element.offsetParent === null || compactText(element.innerText || element.textContent) !== String(pageNumber)) return false;
      const rect = element.getBoundingClientRect?.();
      return !rect || (rect.width <= 120 && rect.height <= 80 && rect.width > 0 && rect.height > 0);
    });
    if (!candidates.length) return null;

    const score = element => {
      const rect = element.getBoundingClientRect?.() || { top: 0 };
      const selfClass = String(element.className || "").toLowerCase();
      const parentClass = String(element.parentElement?.className || "").toLowerCase();
      const tag = String(element.tagName || "").toLowerCase();
      const parentText = compactText(element.parentElement?.innerText || element.parentElement?.textContent || "");
      let value = Math.max(0, rect.top) / 100;
      if (["button", "a", "li"].includes(tag) || element.getAttribute?.("role") === "button") value += 80;
      if (/page|pager|pagination/.test(`${selfClass} ${parentClass}`)) value += 160;
      let siblingPages = 0;
      for (let n = 1; n <= Math.min(totalPages, 20); n += 1) {
        if (parentText.includes(String(n))) siblingPages += 1;
      }
      value += siblingPages * 15;
      return value;
    };
    return candidates.sort((a, b) => score(b) - score(a))[0];
  }

  function clickControl(element) {
    if (!element) return;
    let clickable = element.querySelector?.("button,a,[role='button']") || element;
    while (clickable?.children?.length === 1 && compactText(clickable.children[0].innerText || clickable.children[0].textContent) === compactText(clickable.innerText || clickable.textContent)) {
      clickable = clickable.children[0];
    }
    clickable.scrollIntoView?.({ block: "center", inline: "center" });
    clickable.focus?.({ preventScroll: true });
    if (typeof MouseEvent === "function" && clickable.dispatchEvent) {
      for (const type of ["mouseover", "mousedown", "mouseup", "click"]) {
        clickable.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, composed: true, view: window, button: 0 }));
      }
    } else {
      clickable.click?.();
    }
  }

  async function scrollPageToBottom() {
    const pageScroller = document.scrollingElement || document.documentElement;
    const targetTop = Math.max(pageScroller?.scrollHeight || 0, document.body?.scrollHeight || 0);
    try { window.scrollTo({ top: targetTop, left: 0, behavior: "instant" }); } catch (_) { window.scrollTo?.(0, targetTop); }
    if (pageScroller) pageScroller.scrollTop = targetTop;
    try { pageScroller?.dispatchEvent(new Event("scroll", { bubbles: true })); } catch (_) {}
    await sleep(800);
  }

  async function ensureFirstPage() {
    await scrollPageToBottom();
    const first = findFirstPageButton();
    if (!first) return;
    if (isCurrentPageControl(first)) return;
    const versionBefore = latestBatchVersion;
    clickControl(first);
    const started = Date.now();
    while (Date.now() - started < 12000) {
      await sleep(300);
      if (latestBatchVersion > versionBefore) return;
    }
  }

  async function goToNumberedPage(pageNumber) {
    await scrollPageToBottom();
    const control = findPageControl(pageNumber);
    if (!control) return false;
    if (isCurrentPageControl(control)) {
      try { scrapeVisibleRows(); } catch (_) {}
      return true;
    }

    const versionBefore = latestBatchVersion;
    let signatureBefore = "";
    try { signatureBefore = scrapeVisibleRows().signature; } catch (_) {}
    clickControl(control);
    const started = Date.now();
    while (Date.now() - started < 15000) {
      await sleep(300);
      if (latestBatchVersion > versionBefore) {
        try { scrapeVisibleRows(); } catch (_) {}
        return true;
      }
      try {
        const current = scrapeVisibleRows().signature;
        if (current && current !== signatureBefore) return true;
      } catch (_) {}
    }
    return false;
  }

  async function collectNumberedPages() {
    const totalPages = readTotalPages();
    if (!totalPages || totalPages <= 1) return false;
    for (let pageNumber = 2; pageNumber <= totalPages; pageNumber += 1) {
      await scrollPageToBottom();
      setStatus(`正在采集第 ${pageNumber} / ${totalPages} 页，当前 ${records.size} / ${expectedTotal} 条…`);
      if (!await goToNumberedPage(pageNumber)) return false;
      await sleep(350);
      try { scrapeVisibleRows(); } catch (_) {}
      if (records.size === expectedTotal) return true;
    }
    return records.size === expectedTotal;
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function isScrollable(element) {
    if (!element) return false;
    if (element === document.scrollingElement || element === document.documentElement) {
      return element.scrollHeight > element.clientHeight + 20;
    }
    const style = getComputedStyle(element);
    return /(auto|scroll|overlay)/.test(style.overflowY) && element.scrollHeight > element.clientHeight + 20;
  }

  function findScrollContainers(table) {
    const candidates = [];
    const add = element => {
      if (element && !candidates.includes(element) && isScrollable(element)) candidates.push(element);
    };
    for (const selector of [
      ".ant-table-body",
      ".ant-table-content",
      ".rc-virtual-list-holder",
      "[class*='virtual-list']",
      "[class*='table-body']"
    ]) {
      for (const element of document.querySelectorAll(selector)) add(element);
    }
    let parent = table.parentElement;
    for (let i = 0; parent && i < 8; i += 1, parent = parent.parentElement) add(parent);
    add(document.scrollingElement || document.documentElement);
    return candidates;
  }

  function setScrollTop(element, value) {
    element.scrollTop = value;
    try { element.dispatchEvent(new Event("scroll", { bubbles: true })); } catch (_) {}
  }

  async function scanScrollContainer(container, label) {
    const max = Math.max(0, container.scrollHeight - container.clientHeight);
    const step = Math.max(240, Math.floor(container.clientHeight * 0.7));
    setScrollTop(container, 0);
    await sleep(350);
    scrapeVisibleRows();
    if (max <= 0) return;

    let position = 0;
    let safety = 0;
    while (position < max && safety < 300) {
      safety += 1;
      position = Math.min(max, position + step);
      setScrollTop(container, position);
      await sleep(450);
      scrapeVisibleRows();
      setStatus(`${label}：已采集 ${records.size}${expectedTotal ? ` / ${expectedTotal}` : ""} 条`);
      if (expectedTotal && records.size >= expectedTotal) return;
    }
    setScrollTop(container, max);
    await sleep(700);
    scrapeVisibleRows();
  }

  async function scanCurrentSurface(roundLabel) {
    const target = findTargetTable();
    if (!target) throw new Error("未找到广告组表格，请确认当前处于“标准投 → 广告组”。");
    scrapeVisibleRows();
    const containers = findScrollContainers(target.bodyTable || target.table);
    if (!containers.length) {
      window.scrollTo?.(0, document.documentElement.scrollHeight);
      await sleep(700);
      scrapeVisibleRows();
      return;
    }
    for (let i = 0; i < containers.length; i += 1) {
      await scanScrollContainer(containers[i], `${roundLabel}，滚动区域 ${i + 1}/${containers.length}`);
      if (expectedTotal && records.size >= expectedTotal) return;
    }
  }

  async function waitForPageChange(previousSignature, previousCount, timeoutMs = 15000) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      await sleep(350);
      try {
        const page = scrapeVisibleRows();
        if ((page.signature && page.signature !== previousSignature) || records.size > previousCount) return true;
      } catch (_) {}
    }
    return false;
  }

  async function collectAll() {
    if (running) throw new Error("采集正在进行中，请稍候。");
    running = true;
    completed = false;
    expectedTotal = readExpectedTotal();
    try {
      if (!expectedTotal) {
        throw new Error("无法读取页面中的总记录数。请刷新聚光页面后重试，以便进行完整性校验。");
      }
      records.clear();
      setStatus(`开始接口直采，目标 ${expectedTotal} 条…`);
      await collectThroughCapturedApi();

      if (records.size !== expectedTotal) {
        completed = false;
        setStatus(`采集未完成：${records.size} / ${expectedTotal} 条，未生成 Excel`);
        return { ...getState(), ok: false, error: `接口返回应有 ${expectedTotal} 条，但只采集到 ${records.size} 条。已阻止导出不完整文件。请刷新聚光页面后重试。` };
      }

      completed = true;
      setStatus(`完整性校验通过：${records.size} / ${expectedTotal} 条`);
      return getState();
    } finally {
      running = false;
    }
  }

  function getState() {
    return {
      ok: true,
      running,
      completed,
      expectedTotal,
      status,
      context: getPageContext(),
      meta: { ...meta },
      records: [...records.values()]
    };
  }

  function findAccountNameElement() {
    const visibleTopNodes = [...document.querySelectorAll("body *")].filter(element => {
      if (element.offsetParent === null) return false;
      const rect = element.getBoundingClientRect?.();
      if (!rect || rect.top < 0 || rect.top > 130 || rect.left < window.innerWidth * 0.55) return false;
      const value = (element.innerText || element.textContent || "").trim();
      return value.length >= 2 && value.length <= 60 && !value.includes("\n");
    });
    const excluded = /新建广告|完成更新|聚光是什么|竞价推广|品牌推广|概览|数据|资产|工具|财务|^\d{4}-\d{2}-\d{2}$|^\d+\+?$/;
    const candidates = visibleTopNodes.filter(element => {
      const value = (element.innerText || element.textContent || "").trim();
      return !excluded.test(value) && (/[_]/.test(value) || /FEEDS|SEM/i.test(value));
    });
    return candidates.sort((a, b) => {
      const av = (a.innerText || a.textContent || "").trim();
      const bv = (b.innerText || b.textContent || "").trim();
      const as = (/_/.test(av) ? 200 : 0) + (/FEEDS|SEM/i.test(av) ? 100 : 0) - av.length;
      const bs = (/_/.test(bv) ? 200 : 0) + (/FEEDS|SEM/i.test(bv) ? 100 : 0) - bv.length;
      return bs - as;
    })[0] || null;
  }

  function readAccountContextFromPage() {
    const bodyText = String(document.body?.innerText || document.body?.textContent || "");
    const idMatch = bodyText.match(/投放账号ID\s*[:：]?\s*(\d+)/);
    const accountElement = findAccountNameElement();
    const accountName = (accountElement?.innerText || accountElement?.textContent || "").trim();
    return { accountName, accountId: idMatch?.[1] || "", accountElement };
  }

  async function ensureAccountContext() {
    let context = readAccountContextFromPage();
    if (context.accountName) pageContextCache.accountName = context.accountName;
    if (context.accountId) pageContextCache.accountId = context.accountId;
    if (!pageContextCache.accountId && context.accountElement) {
      const opener = context.accountElement;
      clickControl(opener);
      await sleep(500);
      context = readAccountContextFromPage();
      if (context.accountName) pageContextCache.accountName = context.accountName;
      if (context.accountId) pageContextCache.accountId = context.accountId;
      clickControl(opener);
      await sleep(200);
    }
    return { ...pageContextCache };
  }

  function getPageContext() {
    const visible = readAccountContextFromPage();
    if (visible.accountName) pageContextCache.accountName = visible.accountName;
    if (visible.accountId) pageContextCache.accountId = visible.accountId;
    return { ...pageContextCache };
  }

  function getDiagnostics() {
    const root = findPaginationRoot();
    const controls = [];
    const totalPages = readTotalPages() || 0;
    for (let pageNumber = 1; pageNumber <= totalPages; pageNumber += 1) {
      const control = findPageControl(pageNumber);
      controls.push({
        pageNumber,
        found: Boolean(control),
        tag: control?.tagName || "",
        className: String(control?.className || ""),
        text: compactText(control?.innerText || control?.textContent || ""),
        current: Boolean(control && isCurrentPageControl(control)),
        html: String(control?.outerHTML || "").slice(0, 1200)
      });
    }
    return {
      generatedAt: new Date().toISOString(),
      pageUrl: location.href,
      expectedTotal: readExpectedTotal(),
      totalPages,
      capturedRecords: records.size,
      latestBatchSize: latestBatch.length,
      latestBatchVersion,
      lastApiUrl: meta.lastUrl,
      controls,
      paginationHtml: String(root?.outerHTML || "").slice(0, 12000)
    };
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "GET_STATE") {
      if (!expectedTotal) expectedTotal = readExpectedTotal();
      sendResponse(getState());
      return;
    }
    if (message?.type === "SCRAPE_CURRENT") {
      try {
        expectedTotal = readExpectedTotal();
        scrapeVisibleRows();
        completed = Boolean(expectedTotal && records.size === expectedTotal);
        setStatus(`当前累计 ${records.size}${expectedTotal ? ` / ${expectedTotal}` : ""} 条`);
        sendResponse(getState());
      } catch (error) {
        sendResponse({ ...getState(), ok: false, error: error.message });
      }
      return;
    }
    if (message?.type === "CLEAR") {
      records.clear();
      completed = false;
      expectedTotal = readExpectedTotal();
      setStatus("已清空");
      sendResponse(getState());
      return;
    }
    if (message?.type === "GET_DIAGNOSTICS") {
      sendResponse({ ok: true, diagnostics: getDiagnostics() });
      return;
    }
    if (message?.type === "COLLECT_ALL") {
      collectAll().then(sendResponse).catch(error => sendResponse({ ...getState(), ok: false, error: error.message }));
      return true;
    }
  });
})();
