(() => {
  const EVENT_TYPE = "XHS_ADGROUP_CAPTURE_V1";
  const DIRECT_REQUEST = "XHS_ADGROUP_DIRECT_FETCH_REQUEST_V2";
  const DIRECT_PROGRESS = "XHS_ADGROUP_DIRECT_FETCH_PROGRESS_V2";
  const MAX_DEPTH = 10;
  let lastListRequest = null;
  let lastListMeta = null;

  function normalizeRecord(value) {
    if (!value || typeof value !== "object") return null;
    const id = value.campaignGroupId ?? value.campaign_group_id;
    const name = value.campaignGroupName ?? value.campaign_group_name;
    if (id === undefined || id === null || name === undefined || name === null) return null;
    const cleanId = String(id).trim();
    const cleanName = String(name).trim();
    if (!cleanId || !cleanName) return null;
    const namedStatus = [
      value.campaignGroupStatusName,
      value.groupStatusName,
      value.statusName,
      value.enableStatusName,
      value.stateName
    ].find(item => typeof item === "string" && item.trim() && !/^\d+$/.test(item.trim()));
    let campaignGroupStatus = namedStatus ? namedStatus.trim() : "";
    if (!campaignGroupStatus && (value.enable === 0 || value.enable === false)) campaignGroupStatus = "暂停";
    if (!campaignGroupStatus && (value.enable === 1 || value.enable === true)) campaignGroupStatus = "有效";
    if (!campaignGroupStatus && value.enable === undefined && (value.state === 0 || value.state === false)) campaignGroupStatus = "暂停";
    if (!campaignGroupStatus && value.enable === undefined && (value.state === 1 || value.state === true)) campaignGroupStatus = "有效";
    return { campaignGroupName: cleanName, campaignGroupId: cleanId, campaignGroupStatus };
  }

  function inspectJson(root, url, emit = true) {
    const records = [];
    const seenIds = new Set();
    let totalCount = null;
    let totalPage = null;
    let currentPage = null;

    function walk(value, depth) {
      if (depth > MAX_DEPTH || value === null || value === undefined) return;
      if (Array.isArray(value)) {
        for (const item of value) walk(item, depth + 1);
        return;
      }
      if (typeof value !== "object") return;
      const record = normalizeRecord(value);
      if (record && !seenIds.has(record.campaignGroupId)) {
        seenIds.add(record.campaignGroupId);
        records.push(record);
      }
      if (totalCount === null && Number.isFinite(Number(value.totalCount))) totalCount = Number(value.totalCount);
      if (totalPage === null && Number.isFinite(Number(value.totalPage))) totalPage = Number(value.totalPage);
      const pageCandidate = value.currentPage ?? value.pageNum ?? value.pageNo ?? value.pageIndex ?? value.page;
      if (currentPage === null && Number.isFinite(Number(pageCandidate))) currentPage = Number(pageCandidate);
      for (const child of Object.values(value)) walk(child, depth + 1);
    }

    walk(root, 0);
    if (!records.length) return null;
    const summary = { records, totalCount, totalPage, currentPage, url: String(url || "") };
    if (emit) window.postMessage({ type: EVENT_TYPE, payload: summary }, "*");
    return summary;
  }

  async function describeFetch(args) {
    const request = new Request(args[0], args[1]);
    const method = String(request.method || "GET").toUpperCase();
    const headers = {};
    request.headers.forEach((value, key) => { headers[key] = value; });
    const body = method === "GET" || method === "HEAD" ? null : await request.clone().text();
    return { url: request.url, method, headers, body };
  }

  function mutateObjectPage(value, pageNumber) {
    let found = false;
    if (!value || typeof value !== "object") return found;
    for (const key of Object.keys(value)) {
      const normalized = key.replace(/[_-]/g, "").toLowerCase();
      if (["page", "pageno", "pagenum", "pageindex", "currentpage"].includes(normalized) && (value[key] === null || typeof value[key] !== "object")) {
        value[key] = pageNumber;
        found = true;
      } else if (value[key] && typeof value[key] === "object") {
        found = mutateObjectPage(value[key], pageNumber) || found;
      }
    }
    return found;
  }

  function requestForPage(template, pageNumber) {
    const request = {
      url: template.url,
      method: template.method,
      headers: { ...template.headers },
      body: template.body
    };
    let found = false;
    try {
      const url = new URL(request.url, location.href);
      for (const key of [...url.searchParams.keys()]) {
        const normalized = key.replace(/[_-]/g, "").toLowerCase();
        if (["page", "pageno", "pagenum", "pageindex", "currentpage"].includes(normalized)) {
          url.searchParams.set(key, String(pageNumber));
          found = true;
        }
      }
      request.url = url.href;
    } catch (_) {}

    if (typeof request.body === "string" && request.body) {
      try {
        const json = JSON.parse(request.body);
        if (mutateObjectPage(json, pageNumber)) {
          request.body = JSON.stringify(json);
          found = true;
        }
      } catch (_) {
        try {
          const params = new URLSearchParams(request.body);
          let changed = false;
          for (const key of [...params.keys()]) {
            const normalized = key.replace(/[_-]/g, "").toLowerCase();
            if (["page", "pageno", "pagenum", "pageindex", "currentpage"].includes(normalized)) {
              params.set(key, String(pageNumber));
              changed = true;
            }
          }
          if (changed) {
            request.body = params.toString();
            found = true;
          }
        } catch (_) {}
      }
    }
    return { request, found };
  }

  const originalFetch = window.fetch;
  if (typeof originalFetch === "function") {
    window.fetch = async function (...args) {
      const descriptorPromise = describeFetch(args).catch(() => null);
      const response = await originalFetch.apply(this, args);
      try {
        const clone = response.clone();
        clone.json().then(async data => {
          const summary = inspectJson(data, clone.url, true);
          if (summary) {
            const descriptor = await descriptorPromise;
            if (descriptor) {
              lastListRequest = descriptor;
              lastListMeta = summary;
            }
          }
        }).catch(() => {});
      } catch (_) {}
      return response;
    };
  }

  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;
  const originalSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this.__xhsCaptureMethod = String(method || "GET").toUpperCase();
    this.__xhsCaptureUrl = String(url || "");
    this.__xhsCaptureHeaders = {};
    return originalOpen.call(this, method, url, ...rest);
  };
  XMLHttpRequest.prototype.setRequestHeader = function (name, value) {
    this.__xhsCaptureHeaders ||= {};
    this.__xhsCaptureHeaders[name] = value;
    return originalSetRequestHeader.call(this, name, value);
  };
  XMLHttpRequest.prototype.send = function (...args) {
    const body = args[0] == null ? null : String(args[0]);
    this.addEventListener("load", () => {
      try {
        const contentType = this.getResponseHeader("content-type") || "";
        let data;
        if (this.responseType === "json") data = this.response;
        else if (!this.responseType || this.responseType === "text") {
          if (!contentType.includes("json") && !String(this.responseText || "").trim().startsWith("{")) return;
          data = JSON.parse(this.responseText);
        }
        const summary = data ? inspectJson(data, this.responseURL || this.__xhsCaptureUrl, true) : null;
        if (summary) {
          lastListRequest = {
            url: this.responseURL || new URL(this.__xhsCaptureUrl, location.href).href,
            method: this.__xhsCaptureMethod || "GET",
            headers: { ...(this.__xhsCaptureHeaders || {}) },
            body
          };
          lastListMeta = summary;
        }
      } catch (_) {}
    }, { once: true });
    return originalSend.apply(this, args);
  };

  async function directFetchAll(requestId) {
    if (!lastListRequest || !lastListMeta) throw new Error("尚未捕获广告组列表请求，请刷新页面并等待第一页出现后重试。");
    const totalPages = Number(lastListMeta.totalPage || 1);
    const totalCount = Number(lastListMeta.totalCount || 0);
    const allRecords = new Map();
    for (let pageNumber = 1; pageNumber <= totalPages; pageNumber += 1) {
      const { request, found } = requestForPage(lastListRequest, pageNumber);
      if (totalPages > 1 && !found) throw new Error("未识别到接口分页参数，请导出分页诊断信息后提供给开发者。");
      const response = await originalFetch.call(window, request.url, {
        method: request.method,
        headers: request.headers,
        body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
        credentials: "include",
        cache: "no-store"
      });
      if (!response.ok) throw new Error(`第 ${pageNumber} 页接口请求失败（HTTP ${response.status}）`);
      const data = await response.json();
      const summary = inspectJson(data, response.url, false);
      if (!summary?.records?.length) throw new Error(`第 ${pageNumber} 页接口未返回广告组数据`);
      for (const record of summary.records) allRecords.set(record.campaignGroupId, record);
      window.postMessage({
        type: DIRECT_PROGRESS,
        payload: { requestId, pageNumber, totalPages, totalCount, records: summary.records, done: false }
      }, "*");
    }
    window.postMessage({
      type: DIRECT_PROGRESS,
      payload: { requestId, pageNumber: totalPages, totalPages, totalCount, records: [...allRecords.values()], done: true }
    }, "*");
  }

  window.addEventListener("message", event => {
    if (event.source !== window || event.data?.type !== DIRECT_REQUEST) return;
    const requestId = String(event.data.requestId || "");
    directFetchAll(requestId).catch(error => {
      window.postMessage({ type: DIRECT_PROGRESS, payload: { requestId, done: true, error: error.message } }, "*");
    });
  });
})();
